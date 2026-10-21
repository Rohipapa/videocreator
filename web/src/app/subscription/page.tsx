import type { Metadata } from "next";
import { Suspense } from "react";
import { Loading } from "../components/Loading";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { getCurrentSubscription, getPlan, listPayments, STATUS_LABEL } from "@/lib/billing";
import { getBalance, getCurrentGrant, LEDGER_LABEL, listLedger } from "@/lib/credits";
import { cancelAction, resumeAction } from "../actions";
import { isMockPayment } from "@/lib/toss";
import { BillingButton } from "../components/BillingButton";
import { Flash } from "../components/Flash";
import { date, dateTime, won } from "../components/format";

const PAYMENT_STATUS: Record<string, string> = {
  DONE: "결제 완료",
  FAILED: "결제 실패",
  IN_PROGRESS: "처리 중",
  UNKNOWN: "결과 확인 중",
};

export const metadata: Metadata = { title: "구독 관리", robots: { index: false, follow: false } };

async function SubscriptionPageContent({ searchParams }: PageProps<"/subscription">) {
  const { msg, err } = await searchParams;
  const user = await requireUser();
  const sub = await getCurrentSubscription(user.id);
  const plan = sub ? await getPlan(sub.plan_id) : undefined;
  const live = sub && !["canceled", "expired"].includes(sub.status);
  const balance = await getBalance(user.id);
  const granted = await getCurrentGrant(user.id);
  const payments = await listPayments(user.id);
  const ledger = await listLedger(user.id, 15);

  return (
    <main>
      <h1>구독 관리</h1>
      <Flash msg={msg} err={err} />

      {!sub || !live ? (
        <div className="card">
          <p>{sub ? `이전 구독이 ${STATUS_LABEL[sub.status]} 상태입니다.` : "이용 중인 구독이 없습니다."}</p>
          <Link className="button" href="/plans">
            요금제 선택하기
          </Link>
        </div>
      ) : (
        <div className="grid">
          <section className="card">
            <h2>현재 구독</h2>
            <dl className="kv">
              <dt>요금제</dt>
              <dd>
                {plan?.name} ({won(plan?.price ?? 0)}/월)
              </dd>
              <dt>상태</dt>
              <dd>
                <span className={`badge ${sub.status}`}>{STATUS_LABEL[sub.status]}</span>
              </dd>
              <dt>이번 결제 기간</dt>
              <dd>
                {date(sub.period_start)} ~ {date(sub.period_end)}
              </dd>
              {sub.status === "cancel_at_period_end" ? (
                <>
                  <dt>이용 종료일</dt>
                  <dd>{dateTime(sub.period_end)}</dd>
                </>
              ) : (
                <>
                  <dt>{sub.status === "past_due" ? "다음 재시도" : "다음 결제 예정"}</dt>
                  <dd>
                    {dateTime(sub.next_billing_at)} · {won(plan?.price ?? 0)}
                  </dd>
                </>
              )}
              <dt>결제 카드</dt>
              <dd>
                {sub.card_company ?? "카드"} {sub.card_number ?? ""}
              </dd>
            </dl>

            {sub.status === "past_due" && (
              <div className="alert error" role="alert">
                결제에 실패했습니다({sub.retry_count}회). 카드를 변경하면 즉시 다시 결제를 시도합니다. 재시도가 모두 실패하면 구독이 만료됩니다.
              </div>
            )}

            <div className="row">
              <BillingButton
                mock={isMockPayment()}
                customerKey={user.customer_key}
                customerEmail={user.email}
                label="결제 카드 변경"
                className="button secondary"
              />
              {sub.status === "cancel_at_period_end" ? (
                <form action={resumeAction}>
                  <button className="button">해지 취소하고 계속 이용</button>
                </form>
              ) : (
                <form action={cancelAction}>
                  <button className="button danger">구독 해지</button>
                </form>
              )}
            </div>
            <p className="muted small">
              {sub.status === "active"
                ? "해지해도 이번 결제 기간이 끝날 때까지 이용할 수 있고, 다음 결제는 진행되지 않습니다."
                : null}
            </p>
          </section>

          <section className="card">
            <h2>이번 주기 크레딧</h2>
            <p className="big-number">
              {balance.toLocaleString("ko-KR")}
              <span className="muted"> / {granted.toLocaleString("ko-KR")}</span>
            </p>
            <meter min={0} max={Math.max(granted, 1)} value={balance} aria-label="남은 크레딧" />
            <p className="muted small">
              사용 {Math.max(granted - balance, 0).toLocaleString("ko-KR")} · 잔여 {balance.toLocaleString("ko-KR")} · 지급{" "}
              {granted.toLocaleString("ko-KR")}
            </p>
            <h3>최근 크레딧 내역</h3>
            <table>
              <tbody>
                {ledger.map((l, i) => (
                  <tr key={i}>
                    <td className="nowrap">{dateTime(l.created_at)}</td>
                    <td className="nowrap">{LEDGER_LABEL[l.type]}</td>
                    <td className="num">{l.amount > 0 ? `+${l.amount}` : l.amount}</td>
                    <td className="muted">{l.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </div>
      )}

      <section className="card">
        <h2>결제 내역</h2>
        {payments.length === 0 ? (
          <p className="muted">결제 내역이 없습니다.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>일시</th>
                <th>내용</th>
                <th className="num">금액</th>
                <th>상태</th>
                <th>영수증</th>
              </tr>
            </thead>
            <tbody>
              {payments.map((p) => (
                <tr key={p.id}>
                  <td>{dateTime(p.approved_at ?? p.created_at)}</td>
                  <td>{p.order_name}</td>
                  <td className="num">{won(p.amount)}</td>
                  <td>
                    {PAYMENT_STATUS[p.status] ?? p.status}
                    {p.error_message && <div className="muted small">{p.error_message}</div>}
                  </td>
                  <td>
                    {p.receipt_url ? (
                      <a href={p.receipt_url} target="_blank" rel="noreferrer">
                        보기
                      </a>
                    ) : (
                      "-"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </main>
  );
}

export default function SubscriptionPage(props: PageProps<"/subscription">) {
  return (
    <Suspense fallback={<Loading />}>
      <SubscriptionPageContent {...props} />
    </Suspense>
  );
}
