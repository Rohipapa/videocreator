import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getPlan } from "@/lib/billing";
import { isMockPayment } from "@/lib/toss";
import { Loading } from "../../components/Loading";
import { won } from "../../components/format";

export const metadata: Metadata = { title: "가상 결제창", robots: { index: false, follow: false } };

// 가상 결제 모드 전용 결제창. 토스 결제창처럼 카드 등록 후 successUrl(/billing/success)로 authKey를 넘긴다.
// 실제 카드 정보는 받지 않고, 고른 카드 종류만 authKey에 담는다(lib/toss.ts의 모의 응답 참고).
async function MockBillingPageContent({ searchParams }: PageProps<"/billing/mock">) {
  const { planId } = await searchParams;
  const user = await requireUser();
  if (!isMockPayment()) redirect("/plans");
  const plan = typeof planId === "string" ? await getPlan(planId) : undefined;
  const nonce = crypto.randomUUID();

  return (
    <main className="narrow">
      <h1>가상 결제창</h1>
      <div className="alert success" role="note">
        테스트 환경의 가상 결제입니다. 실제 카드 정보를 입력하지 않으며, 돈이 결제되지 않습니다.
      </div>

      <form action="/billing/success" method="get" className="stack card">
        <dl className="kv">
          <dt>내용</dt>
          <dd>{plan ? `${plan.name} 구독 · 첫 달 결제` : "결제 카드 변경"}</dd>
          {plan && (
            <>
              <dt>결제 금액</dt>
              <dd>{won(plan.price)} (이후 매월 같은 날 자동결제)</dd>
            </>
          )}
          <dt>계정</dt>
          <dd>{user.email}</dd>
        </dl>

        <fieldset className="choice-group">
          <legend>등록할 가상 카드</legend>
          <label className="choice">
            <input type="radio" name="authKey" value={`mock_auth_ok_${nonce}`} defaultChecked />
            정상 카드 (4330-12**-****-123*) — 결제가 승인됩니다
          </label>
          <label className="choice">
            <input type="radio" name="authKey" value={`mock_auth_fail_${nonce}`} />
            결제 실패 카드 (4000-00**-****-999*) — 잔액 부족으로 거절됩니다
          </label>
        </fieldset>

        <input type="hidden" name="customerKey" value={user.customer_key} />
        {plan && <input type="hidden" name="planId" value={plan.id} />}
        <div className="row">
          <button type="submit" className="button">
            {plan ? `카드 등록하고 ${won(plan.price)} 결제` : "카드 등록"}
          </button>
          <Link className="button secondary" href="/billing/fail?code=PAY_PROCESS_CANCELED">
            취소
          </Link>
        </div>
      </form>
    </main>
  );
}

export default function MockBillingPage(props: PageProps<"/billing/mock">) {
  return (
    <Suspense fallback={<Loading />}>
      <MockBillingPageContent {...props} />
    </Suspense>
  );
}
