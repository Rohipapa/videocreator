import type { Metadata } from "next";
import { Suspense } from "react";
import { Loading } from "../components/Loading";
import { requireUser } from "@/lib/auth";
import { getCurrentSubscription, STATUS_LABEL } from "@/lib/billing";
import { isTestMode } from "@/lib/toss";
import { devMakeDueAction, devRunSchedulerAction } from "../actions";
import { Flash } from "../components/Flash";
import { dateTime } from "../components/format";
import { SubmitButton } from "../components/SubmitButton";

export const metadata: Metadata = { title: "테스트 도구", robots: { index: false, follow: false } };

async function DevPageContent({ searchParams }: PageProps<"/dev">) {
  const { msg, err } = await searchParams;
  const user = await requireUser();
  const sub = await getCurrentSubscription(user.id);
  const testMode = isTestMode();

  return (
    <main className="narrow">
      <h1>테스트 도구</h1>
      <p className="muted">
        한 달을 기다리지 않고 정기결제·해지 흐름을 확인하기 위한 도구입니다. 테스트 키(<code>test_sk_</code>)일 때만 동작합니다.
      </p>
      <Flash msg={msg} err={err} />

      <section className="card">
        <h2>환경 상태</h2>
        <dl className="kv">
          <dt>시크릿 키</dt>
          <dd>{process.env.TOSS_SECRET_KEY ? (testMode ? "테스트 키 설정됨" : "라이브 키 (테스트 도구 비활성)") : "미설정"}</dd>
          <dt>클라이언트 키</dt>
          <dd>{process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY ? "설정됨" : "미설정"}</dd>
          <dt>빌링키 암호화 키</dt>
          <dd>{process.env.BILLING_KEY_SECRET ? "설정됨" : "미설정"}</dd>
          <dt>내 구독</dt>
          <dd>
            {sub ? `${STATUS_LABEL[sub.status]} · ${sub.billing_cycle}회차 · 다음 결제 ${dateTime(sub.next_billing_at)}` : "없음"}
          </dd>
        </dl>
      </section>

      <section className="card stack">
        <h2>정기결제 시뮬레이션</h2>
        <ol className="muted">
          <li>
            <strong>결제일 당기기</strong>: 내 구독의 다음 결제일(해지 예정이면 이용 종료일)을 지금으로 바꿉니다.
          </li>
          <li>
            <strong>스케줄러 실행</strong>: 운영에서 매일 cron이 호출할 <code>POST /api/cron/billing</code>과 같은 작업을 즉시 실행합니다.
          </li>
        </ol>
        <div className="row">
          <form action={devMakeDueAction}>
            <SubmitButton label="1. 결제일 당기기" pendingLabel="처리 중…" className="button secondary" />
          </form>
          <form action={devRunSchedulerAction}>
            <SubmitButton label="2. 스케줄러 실행" pendingLabel="결제 중…" />
          </form>
        </div>
        <p className="muted small">
          예상 결과: 이용 중이면 다음 회차가 결제되고 크레딧이 갱신됩니다. 해지 예정이면 결제 없이 해지 완료로 바뀌고 빌링키가 삭제됩니다.
        </p>
      </section>
    </main>
  );
}

export default function DevPage(props: PageProps<"/dev">) {
  return (
    <Suspense fallback={<Loading />}>
      <DevPageContent {...props} />
    </Suspense>
  );
}
