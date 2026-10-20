import "server-only";
import { db, newId, nowIso, transaction, type Payment, type Plan, type Subscription, type SubscriptionStatus, type User } from "./db";
import { decrypt, encrypt } from "./crypto";
import { expireRemaining, renewCredits } from "./credits";
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
const LOCK_MS = 2 * 60_000;
const TERMINAL: SubscriptionStatus[] = ["canceled", "expired"];

function addMonth(iso: string): string {
  const d = new Date(iso);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + 1);
  const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, lastDay));
  return d.toISOString();
}

const addDays = (iso: string, days: number) => new Date(new Date(iso).getTime() + days * 86400_000).toISOString();

export function getPlans(): Plan[] {
  return db.prepare("SELECT * FROM plans WHERE active = 1 ORDER BY sort").all() as Plan[];
}

export function getPlan(id: string): Plan | undefined {
  return db.prepare("SELECT * FROM plans WHERE id = ?").get(id) as Plan | undefined;
}

/** 해지·만료되지 않은 현재 구독(없으면 가장 최근 구독) */
export function getCurrentSubscription(userId: string): Subscription | undefined {
  return db
    .prepare(
      `SELECT * FROM subscriptions WHERE user_id = ?
       ORDER BY CASE WHEN status IN ('canceled', 'expired') THEN 1 ELSE 0 END, created_at DESC LIMIT 1`,
    )
    .get(userId) as Subscription | undefined;
}

export function listPayments(userId: string): Payment[] {
  return db.prepare("SELECT * FROM payments WHERE user_id = ? ORDER BY created_at DESC LIMIT 50").all(userId) as Payment[];
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
  const current = getCurrentSubscription(user.id);
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
    db.prepare(
      `UPDATE subscriptions SET billing_key_enc = ?, card_company = ?, card_number = ?, updated_at = ? WHERE id = ?`,
    ).run(enc, card.company, card.number, nowIso(), current.id);
    await safeDeleteBillingKey(oldEnc);
    if (current.status === "past_due") {
      const r = await chargeSubscription(current.id);
      if (!r.ok) return r;
      return { ok: true, message: "결제 수단을 변경하고 미납 요금을 결제했습니다." };
    }
    return { ok: true, message: "결제 수단을 변경했습니다." };
  }

  const plan = params.planId ? getPlan(params.planId) : undefined;
  if (!plan) {
    await deleteBillingKey(issued.billingKey).catch(() => {});
    return { ok: false, code: "INVALID_PLAN", message: "요금제를 찾을 수 없습니다." };
  }

  const subId = newId();
  const now = nowIso();
  db.prepare(
    `INSERT INTO subscriptions (id, user_id, plan_id, status, billing_cycle, next_billing_at,
       billing_key_enc, card_company, card_number, created_at, updated_at)
     VALUES (?, ?, ?, 'pending', 0, ?, ?, ?, ?, ?, ?)`,
  ).run(subId, user.id, plan.id, now, enc, card.company, card.number, now, now);

  const result = await chargeSubscription(subId);
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
 * - (구독, 회차)당 DONE 결제는 하나만 허용하며(유니크 인덱스)
 * - 결과를 모르는 네트워크 오류는 같은 orderId(=멱등키)로 재시도한다.
 */
export async function chargeSubscription(subscriptionId: string): Promise<ActionResult> {
  const now = nowIso();
  const locked = db
    .prepare(
      `UPDATE subscriptions SET billing_lock_until = ?
       WHERE id = ? AND (billing_lock_until IS NULL OR billing_lock_until < ?)`,
    )
    .run(new Date(Date.now() + LOCK_MS).toISOString(), subscriptionId, now);
  if (locked.changes === 0) return { ok: false, code: "LOCKED", message: "이미 결제가 진행 중입니다." };

  try {
    const sub = db.prepare("SELECT * FROM subscriptions WHERE id = ?").get(subscriptionId) as Subscription;
    const plan = getPlan(sub.plan_id)!;
    const user = db.prepare("SELECT * FROM users WHERE id = ?").get(sub.user_id) as User;
    if (!sub.billing_key_enc) return { ok: false, code: "NO_BILLING_KEY", message: "등록된 결제 수단이 없습니다." };

    const cycle = sub.billing_cycle + 1;
    const done = db
      .prepare("SELECT 1 FROM payments WHERE subscription_id = ? AND billing_cycle = ? AND status = 'DONE'")
      .get(sub.id, cycle);
    if (done) return { ok: true, message: "이미 결제된 회차입니다." };

    // 결과를 모르는 이전 시도가 있으면 같은 orderId로 재요청한다(토스 멱등키로 중복 결제 방지).
    const unknown = db
      .prepare("SELECT * FROM payments WHERE subscription_id = ? AND billing_cycle = ? AND status = 'UNKNOWN' LIMIT 1")
      .get(sub.id, cycle) as Payment | undefined;
    let payment: Payment;
    if (unknown) {
      payment = unknown;
    } else {
      const attempt =
        (
          db.prepare("SELECT COUNT(*) AS n FROM payments WHERE subscription_id = ? AND billing_cycle = ?").get(sub.id, cycle) as {
            n: number;
          }
        ).n + 1;
      const orderId = `sub_${sub.id.replaceAll("-", "")}_c${cycle}_a${attempt}`;
      const orderName = `AI 비디오 ${plan.name} 구독 ${cycle}회차`;
      const id = newId();
      db.prepare(
        `INSERT INTO payments (id, user_id, subscription_id, billing_cycle, order_id, order_name, amount, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'IN_PROGRESS', ?)`,
      ).run(id, user.id, sub.id, cycle, orderId, orderName, plan.price, now);
      payment = db.prepare("SELECT * FROM payments WHERE id = ?").get(id) as Payment;
    }

    try {
      const res = await approveBilling(decrypt(sub.billing_key_enc), {
        customerKey: user.customer_key,
        amount: payment.amount,
        orderId: payment.order_id,
        orderName: payment.order_name,
        customerEmail: user.email,
      });
      if (res.status !== "DONE") {
        throw new TossError("NOT_DONE", `결제 상태가 완료가 아닙니다: ${res.status}`, 200);
      }
      transaction(() => {
        db.prepare(
          `UPDATE payments SET status = 'DONE', payment_key = ?, receipt_url = ?, approved_at = ?, error_code = NULL, error_message = NULL
           WHERE id = ?`,
        ).run(res.paymentKey, res.receipt?.url ?? null, res.approvedAt ?? nowIso(), payment.id);
        const periodStart = sub.period_end && sub.period_end < nowIso() && cycle > 1 ? sub.period_end : nowIso();
        const periodEnd = addMonth(periodStart);
        db.prepare(
          `UPDATE subscriptions SET status = 'active', billing_cycle = ?, period_start = ?, period_end = ?,
             next_billing_at = ?, retry_count = 0, updated_at = ? WHERE id = ?`,
        ).run(cycle, periodStart, periodEnd, periodEnd, nowIso(), sub.id);
        renewCredits(user.id, sub.id, plan.monthly_credits, cycle);
      });
      return { ok: true };
    } catch (e) {
      const err = e instanceof TossError ? e : new TossError("UNKNOWN_ERROR", (e as Error).message, 0);
      // 네트워크 오류·타임아웃은 실제 결제 여부를 알 수 없으므로 UNKNOWN으로 두고 같은 orderId로 재시도한다.
      const unknownResult = err.code === "NETWORK_ERROR" || err.status >= 500;
      db.prepare("UPDATE payments SET status = ?, error_code = ?, error_message = ? WHERE id = ?").run(
        unknownResult ? "UNKNOWN" : "FAILED",
        err.code,
        err.message,
        payment.id,
      );
      if (cycle > 1) markPaymentFailure(sub);
      else if (!unknownResult) await expireUnpaidSubscription(sub); // 첫 결제 실패: 구독을 활성화하지 않는다(PRD 4.2)
      return { ok: false, code: err.code, message: err.message, unknown: unknownResult };
    }
  } finally {
    db.prepare("UPDATE subscriptions SET billing_lock_until = NULL WHERE id = ?").run(subscriptionId);
  }
}

async function expireUnpaidSubscription(sub: Subscription) {
  db.prepare(
    `UPDATE subscriptions SET status = 'expired', ended_at = ?, next_billing_at = NULL, billing_key_enc = NULL, updated_at = ? WHERE id = ?`,
  ).run(nowIso(), nowIso(), sub.id);
  expireRemaining(sub.user_id, sub.id, "구독 만료로 잔여 크레딧 만료");
  await safeDeleteBillingKey(sub.billing_key_enc);
}

function markPaymentFailure(sub: Subscription) {
  const retry = sub.retry_count + 1;
  if (retry > RETRY_DELAYS_DAYS.length) {
    db.prepare(
      `UPDATE subscriptions SET status = 'expired', retry_count = ?, next_billing_at = NULL, ended_at = ?, updated_at = ? WHERE id = ?`,
    ).run(retry, nowIso(), nowIso(), sub.id);
    void expireUnpaidSubscription(sub);
    return;
  }
  db.prepare(
    `UPDATE subscriptions SET status = 'past_due', retry_count = ?, next_billing_at = ?, updated_at = ? WHERE id = ?`,
  ).run(retry, addDays(nowIso(), RETRY_DELAYS_DAYS[retry - 1]), nowIso(), sub.id);
}

/** 정기결제 스케줄러: 기간 종료된 해지 예정 구독을 정리하고, 결제일이 된 구독을 결제한다. */
export async function runBillingScheduler() {
  const now = nowIso();
  const ending = db
    .prepare("SELECT * FROM subscriptions WHERE status = 'cancel_at_period_end' AND period_end <= ?")
    .all(now) as Subscription[];
  for (const sub of ending) {
    db.prepare(
      `UPDATE subscriptions SET status = 'canceled', ended_at = ?, next_billing_at = NULL, billing_key_enc = NULL, updated_at = ? WHERE id = ?`,
    ).run(now, now, sub.id);
    expireRemaining(sub.user_id, sub.id, "구독 해지로 잔여 크레딧 만료");
    await safeDeleteBillingKey(sub.billing_key_enc);
  }

  const due = db
    .prepare("SELECT id FROM subscriptions WHERE status IN ('pending', 'active', 'past_due') AND next_billing_at <= ?")
    .all(now) as { id: string }[];
  const results = [];
  for (const { id } of due) {
    results.push({ id, ...(await chargeSubscription(id)) });
  }
  return { canceled: ending.length, charged: results.filter((r) => r.ok).length, failed: results.filter((r) => !r.ok) };
}

export async function cancelSubscription(userId: string): Promise<ActionResult> {
  const sub = getCurrentSubscription(userId);
  if (!sub || TERMINAL.includes(sub.status)) return { ok: false, code: "NO_SUBSCRIPTION", message: "해지할 구독이 없습니다." };
  const now = nowIso();
  if (sub.status === "active") {
    db.prepare(
      `UPDATE subscriptions SET status = 'cancel_at_period_end', cancel_requested_at = ?, updated_at = ? WHERE id = ?`,
    ).run(now, now, sub.id);
    return { ok: true, message: "해지 예약되었습니다. 현재 기간 종료일까지 이용할 수 있습니다." };
  }
  // 미납·대기 상태는 남은 이용 기간이 없으므로 즉시 해지한다.
  db.prepare(
    `UPDATE subscriptions SET status = 'canceled', cancel_requested_at = ?, ended_at = ?, next_billing_at = NULL,
       billing_key_enc = NULL, updated_at = ? WHERE id = ?`,
  ).run(now, now, now, sub.id);
  expireRemaining(userId, sub.id, "구독 해지로 잔여 크레딧 만료");
  await safeDeleteBillingKey(sub.billing_key_enc);
  return { ok: true, message: "구독이 해지되었습니다." };
}

export function resumeSubscription(userId: string): ActionResult {
  const sub = getCurrentSubscription(userId);
  if (!sub || sub.status !== "cancel_at_period_end") return { ok: false, code: "NOT_CANCELING", message: "해지 예정인 구독이 없습니다." };
  db.prepare(
    `UPDATE subscriptions SET status = 'active', cancel_requested_at = NULL, updated_at = ? WHERE id = ?`,
  ).run(nowIso(), sub.id);
  return { ok: true, message: "구독을 계속 이용합니다." };
}

/** 테스트 전용: 다음 결제일(해지 예정이면 기간 종료일)을 지금으로 당긴다. */
export function devMakeDue(userId: string): ActionResult {
  const sub = getCurrentSubscription(userId);
  if (!sub || TERMINAL.includes(sub.status)) return { ok: false, code: "NO_SUBSCRIPTION", message: "구독이 없습니다." };
  const past = new Date(Date.now() - 1000).toISOString();
  if (sub.status === "cancel_at_period_end") {
    db.prepare("UPDATE subscriptions SET period_end = ?, next_billing_at = ? WHERE id = ?").run(past, past, sub.id);
  } else {
    db.prepare("UPDATE subscriptions SET next_billing_at = ?, period_end = ? WHERE id = ?").run(past, past, sub.id);
  }
  return { ok: true, message: "결제일을 현재 시각으로 당겼습니다." };
}
