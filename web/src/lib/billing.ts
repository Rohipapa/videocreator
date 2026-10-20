import "server-only";
import { nowIso, type Payment, type Plan, type Subscription, type SubscriptionStatus, type User } from "./db";
import { decrypt, encrypt } from "./crypto";
import { admin, unwrap, unwrapMaybe } from "./supabase/admin";
import { approveBilling, deleteBillingKey, issueBillingKey, TossError } from "./toss";

export const STATUS_LABEL: Record<SubscriptionStatus, string> = {
  pending: "결제 확인 대기",
  active: "이용 중",
  past_due: "결제 실패(미납)",
  cancel_at_period_end: "해지 예정",
  canceled: "해지됨",
  expired: "만료됨",
  suspended: "일시 중지",
};

// PRD 4.3 상태별 허용 기준
export function canGenerate(status: SubscriptionStatus | undefined): boolean {
  return status === "active" || status === "cancel_at_period_end";
}

const RETRY_DELAYS_DAYS = [1, 3]; // 결제 실패 시 1일, 3일 뒤 재시도
const LOCK_SECONDS = 120;
const TERMINAL: SubscriptionStatus[] = ["canceled", "expired"];

const addDays = (iso: string, days: number) => new Date(new Date(iso).getTime() + days * 86400_000).toISOString();

export async function getPlans(): Promise<Plan[]> {
  return unwrap(
    await admin()
      .from("plans")
      .select("id, name, price, monthly_credits, max_duration, description")
      .eq("active", true)
      .order("sort"),
    "요금제 조회",
  );
}

export async function getPlan(id: string): Promise<Plan | undefined> {
  const row = unwrapMaybe(
    await admin().from("plans").select("id, name, price, monthly_credits, max_duration, description").eq("id", id).maybeSingle(),
    "요금제 조회",
  );
  return row ?? undefined;
}

async function getSubscription(id: string): Promise<Subscription> {
  return unwrap(await admin().from("subscriptions").select("*").eq("id", id).single(), "구독 조회") as Subscription;
}

/** 해지·만료되지 않은 현재 구독(없으면 가장 최근 구독) */
export async function getCurrentSubscription(userId: string): Promise<Subscription | undefined> {
  const rows = unwrap(
    await admin().from("subscriptions").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(20),
    "구독 조회",
  ) as Subscription[];
  return rows.find((s) => !TERMINAL.includes(s.status)) ?? rows[0];
}

export async function listPayments(userId: string): Promise<Payment[]> {
  return unwrap(
    await admin()
      .from("payments")
      .select("id, order_id, order_name, amount, status, billing_cycle, receipt_url, error_code, error_message, approved_at, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(50),
    "결제 내역 조회",
  );
}

async function updateSubscription(id: string, values: Partial<Omit<Subscription, "id">>, what: string) {
  unwrap(await admin().from("subscriptions").update({ ...values, updated_at: nowIso() }).eq("id", id), what);
}

/** 구독을 해지·만료 상태로 끝낸다: 상태 변경·잔여 크레딧 만료(DB 함수) 후 빌링키를 삭제한다. */
async function endSubscription(sub: Subscription, status: "canceled" | "expired", reason: string, cancelRequested = false) {
  const enc = unwrap(
    await admin().rpc("end_subscription", {
      p_subscription_id: sub.id,
      p_status: status,
      p_reason: reason,
      p_cancel_requested: cancelRequested,
    }),
    "구독 종료",
  );
  await safeDeleteBillingKey(enc);
}

async function safeDeleteBillingKey(enc: string | null) {
  if (!enc) return;
  try {
    await deleteBillingKey(decrypt(enc));
  } catch (e) {
    // 삭제 실패는 결제 흐름을 막지 않는다. 운영에서는 알림 대상.
    console.error("[billing] 빌링키 삭제 실패", (e as Error).message);
  }
}

function cardInfo(r: Awaited<ReturnType<typeof issueBillingKey>>) {
  return { company: r.cardCompany ?? null, number: r.cardNumber ?? r.card?.number ?? null };
}

export type ActionResult =
  | { ok: true; message?: string }
  | { ok: false; code: string; message: string; unknown?: boolean };

/**
 * 결제창 인증(authKey) 이후: 빌링키 발급 → 구독 생성 → 첫 달 결제.
 * 이미 이용 중인 구독이 있으면 결제 수단 변경으로 처리한다.
 */
export async function handleBillingAuthSuccess(
  user: User,
  params: { authKey: string; customerKey: string; planId: string | null },
): Promise<ActionResult> {
  if (params.customerKey !== user.customer_key) {
    return { ok: false, code: "CUSTOMER_KEY_MISMATCH", message: "로그인한 사용자와 결제 정보가 일치하지 않습니다." };
  }
  const current = await getCurrentSubscription(user.id);
  const hasLive = current && !TERMINAL.includes(current.status) && current.status !== "pending";

  let issued;
  try {
    issued = await issueBillingKey(params.authKey, params.customerKey);
  } catch (e) {
    const err = e as TossError;
    return { ok: false, code: err.code ?? "ISSUE_FAILED", message: err.message };
  }
  const card = cardInfo(issued);
  const enc = encrypt(issued.billingKey);

  if (hasLive && current) {
    // 결제 수단 변경: 새 빌링키로 교체하고 이전 빌링키는 삭제한다.
    const oldEnc = current.billing_key_enc;
    await updateSubscription(
      current.id,
      { billing_key_enc: enc, card_company: card.company, card_number: card.number },
      "결제 수단 변경",
    );
    await safeDeleteBillingKey(oldEnc);
    if (current.status === "past_due") {
      const r = await chargeSubscription(current.id);
      if (!r.ok) return r;
      return { ok: true, message: "결제 수단을 변경하고 미납 요금을 결제했습니다." };
    }
    return { ok: true, message: "결제 수단을 변경했습니다." };
  }

  const plan = params.planId ? await getPlan(params.planId) : undefined;
  if (!plan) {
    await deleteBillingKey(issued.billingKey).catch(() => {});
    return { ok: false, code: "INVALID_PLAN", message: "요금제를 찾을 수 없습니다." };
  }

  const created = unwrap(
    await admin()
      .from("subscriptions")
      .insert({
        user_id: user.id,
        plan_id: plan.id,
        status: "pending",
        billing_cycle: 0,
        next_billing_at: nowIso(),
        billing_key_enc: enc,
        card_company: card.company,
        card_number: card.number,
      })
      .select("id")
      .single(),
    "구독 생성",
  );

  const result = await chargeSubscription(created.id);
  if (!result.ok && result.unknown) {
    // 결제 결과를 알 수 없음: 빌링키를 유지하고 pending으로 둔다. 스케줄러가 같은 orderId로 재확인한다.
    return { ok: false, code: result.code, message: "결제 결과를 확인하는 중입니다. 잠시 후 구독 관리에서 상태를 확인해 주세요." };
  }
  if (!result.ok) return result;
  return { ok: true, message: `${plan.name} 구독이 시작되었습니다.` };
}

/**
 * 다음 회차 요금을 결제한다. 스케줄러와 첫 결제가 함께 사용한다.
 * - DB 잠금으로 동시 실행을 막고
 * - (구독, 회차)당 DONE 결제는 하나만 허용하며(부분 유니크 인덱스)
 * - 결과를 모르는 결제는 같은 orderId(=멱등키)로 재시도한다.
 */
export async function chargeSubscription(subscriptionId: string): Promise<ActionResult> {
  const locked = unwrap(
    await admin().rpc("acquire_billing_lock", { p_subscription_id: subscriptionId, p_seconds: LOCK_SECONDS }),
    "결제 잠금",
  );
  if (!locked) return { ok: false, code: "LOCKED", message: "이미 결제가 진행 중입니다." };

  try {
    const sub = await getSubscription(subscriptionId);
    const plan = (await getPlan(sub.plan_id))!;
    const user = unwrap(
      await admin().from("profiles").select("id, email, customer_key").eq("id", sub.user_id).single(),
      "사용자 조회",
    );
    if (!sub.billing_key_enc) return { ok: false, code: "NO_BILLING_KEY", message: "등록된 결제 수단이 없습니다." };

    const cycle = sub.billing_cycle + 1;
    const attempts = unwrap(
      await admin()
        .from("payments")
        .select("id, order_id, order_name, amount, status")
        .eq("subscription_id", sub.id)
        .eq("billing_cycle", cycle)
        .order("created_at"),
      "결제 시도 조회",
    );
    if (attempts.some((p) => p.status === "DONE")) return { ok: true, message: "이미 결제된 회차입니다." };

    // 결과를 모르는 이전 시도(응답 유실, 처리 중 중단)가 있으면 같은 orderId로 재요청한다(토스 멱등키로 중복 결제 방지).
    let payment = attempts.find((p) => p.status === "UNKNOWN" || p.status === "IN_PROGRESS");
    if (!payment) {
      const orderId = `sub_${sub.id.replaceAll("-", "")}_c${cycle}_a${attempts.length + 1}`;
      payment = unwrap(
        await admin()
          .from("payments")
          .insert({
            user_id: user.id,
            subscription_id: sub.id,
            billing_cycle: cycle,
            order_id: orderId,
            order_name: `AI 비디오 ${plan.name} 구독 ${cycle}회차`,
            amount: plan.price,
            status: "IN_PROGRESS",
          })
          .select("id, order_id, order_name, amount, status")
          .single(),
        "결제 기록 생성",
      );
    }

    let res;
    try {
      res = await approveBilling(decrypt(sub.billing_key_enc), {
        customerKey: user.customer_key,
        amount: payment.amount,
        orderId: payment.order_id,
        orderName: payment.order_name,
        customerEmail: user.email,
      });
      if (res.status !== "DONE") {
        throw new TossError("NOT_DONE", `결제 상태가 완료가 아닙니다: ${res.status}`, 200);
      }
    } catch (e) {
      const err = e instanceof TossError ? e : new TossError("UNKNOWN_ERROR", (e as Error).message, 0);
      // 네트워크 오류·타임아웃은 실제 결제 여부를 알 수 없으므로 UNKNOWN으로 두고 같은 orderId로 재시도한다.
      const unknownResult = err.code === "NETWORK_ERROR" || err.status >= 500;
      unwrap(
        await admin()
          .from("payments")
          .update({ status: unknownResult ? "UNKNOWN" : "FAILED", error_code: err.code, error_message: err.message })
          .eq("id", payment.id),
        "결제 실패 기록",
      );
      if (cycle > 1) await markPaymentFailure(sub);
      else if (!unknownResult) await endSubscription(sub, "expired", "구독 만료로 잔여 크레딧 만료"); // 첫 결제 실패: 구독을 활성화하지 않는다(PRD 4.2)
      return { ok: false, code: err.code, message: err.message, unknown: unknownResult };
    }

    // 결제 상태·구독 기간·크레딧 갱신을 DB 함수 하나에서 원자적으로 반영한다.
    const applied = await admin().rpc("apply_payment_success", {
      p_payment_id: payment.id,
      p_payment_key: res.paymentKey,
      p_receipt_url: res.receipt?.url ?? null,
      p_approved_at: res.approvedAt ?? null,
    });
    if (applied.error) {
      // 승인은 됐지만 반영에 실패: UNKNOWN으로 두면 다음 실행 때 같은 orderId로 재요청해 결과를 다시 받아 반영한다.
      await admin()
        .from("payments")
        .update({ status: "UNKNOWN", error_code: "APPLY_FAILED", error_message: applied.error.message })
        .eq("id", payment.id);
      console.error("[billing] 결제 반영 실패", applied.error.message);
      return { ok: false, code: "APPLY_FAILED", message: "결제는 승인되었지만 반영에 실패했습니다. 잠시 후 다시 확인합니다.", unknown: true };
    }
    return { ok: true };
  } finally {
    await admin().rpc("release_billing_lock", { p_subscription_id: subscriptionId });
  }
}

async function markPaymentFailure(sub: Subscription) {
  const retry = sub.retry_count + 1;
  if (retry > RETRY_DELAYS_DAYS.length) {
    await updateSubscription(sub.id, { retry_count: retry }, "재시도 횟수 기록");
    await endSubscription(sub, "expired", "구독 만료로 잔여 크레딧 만료");
    return;
  }
  await updateSubscription(
    sub.id,
    { status: "past_due", retry_count: retry, next_billing_at: addDays(nowIso(), RETRY_DELAYS_DAYS[retry - 1]) },
    "미납 전환",
  );
}

/** 정기결제 스케줄러: 기간 종료된 해지 예정 구독을 정리하고, 결제일이 된 구독을 결제한다. */
export async function runBillingScheduler() {
  const now = nowIso();
  const ending = unwrap(
    await admin().from("subscriptions").select("*").eq("status", "cancel_at_period_end").lte("period_end", now),
    "해지 예정 구독 조회",
  ) as Subscription[];
  for (const sub of ending) {
    await endSubscription(sub, "canceled", "구독 해지로 잔여 크레딧 만료");
  }

  const due = unwrap(
    await admin()
      .from("subscriptions")
      .select("id")
      .in("status", ["pending", "active", "past_due"])
      .lte("next_billing_at", now),
    "결제 대상 조회",
  );
  const results = [];
  for (const { id } of due) {
    results.push({ id, ...(await chargeSubscription(id)) });
  }
  return { canceled: ending.length, charged: results.filter((r) => r.ok).length, failed: results.filter((r) => !r.ok) };
}

export async function cancelSubscription(userId: string): Promise<ActionResult> {
  const sub = await getCurrentSubscription(userId);
  if (!sub || TERMINAL.includes(sub.status)) return { ok: false, code: "NO_SUBSCRIPTION", message: "해지할 구독이 없습니다." };
  if (sub.status === "active") {
    unwrap(
      await admin()
        .from("subscriptions")
        .update({ status: "cancel_at_period_end", cancel_requested_at: nowIso(), updated_at: nowIso() })
        .eq("id", sub.id)
        .eq("status", "active"),
      "해지 예약",
    );
    return { ok: true, message: "해지 예약되었습니다. 현재 기간 종료일까지 이용할 수 있습니다." };
  }
  // 미납·대기 상태는 남은 이용 기간이 없으므로 즉시 해지한다.
  await endSubscription(sub, "canceled", "구독 해지로 잔여 크레딧 만료", true);
  return { ok: true, message: "구독이 해지되었습니다." };
}

export async function resumeSubscription(userId: string): Promise<ActionResult> {
  const sub = await getCurrentSubscription(userId);
  if (!sub || sub.status !== "cancel_at_period_end") return { ok: false, code: "NOT_CANCELING", message: "해지 예정인 구독이 없습니다." };
  await updateSubscription(sub.id, { status: "active", cancel_requested_at: null }, "구독 재개");
  return { ok: true, message: "구독을 계속 이용합니다." };
}

/** 테스트 전용: 다음 결제일(해지 예정이면 기간 종료일)을 지금으로 당긴다. */
export async function devMakeDue(userId: string): Promise<ActionResult> {
  const sub = await getCurrentSubscription(userId);
  if (!sub || TERMINAL.includes(sub.status)) return { ok: false, code: "NO_SUBSCRIPTION", message: "구독이 없습니다." };
  const past = new Date(Date.now() - 1000).toISOString();
  await updateSubscription(sub.id, { next_billing_at: past, period_end: past }, "결제일 당기기");
  return { ok: true, message: "결제일을 현재 시각으로 당겼습니다." };
}
