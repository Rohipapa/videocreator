import type { Metadata } from "next";
import { Suspense } from "react";
import { Loading } from "../components/Loading";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { getCurrentSubscription, getPlans } from "@/lib/billing";
import { creditCost, TRIAL_CREDITS } from "@/lib/generation";
import { isMockPayment } from "@/lib/toss";
import { BillingButton } from "../components/BillingButton";
import { won } from "../components/format";

export const metadata: Metadata = {
  title: "요금제",
  description: "AI 비디오 스튜디오 요금제: 베이직 월 9,900원(10초 영상 20편), 프로 월 29,900원(10초 영상 65편). 가입하면 10초 영상 2편 무료, 카드 자동결제, 언제든 해지.",
  alternates: { canonical: "/plans" },
  openGraph: { url: "/plans" },
};

async function PlansPageContent() {
  const user = await getCurrentUser();
  const plans = await getPlans();
  const sub = user ? await getCurrentSubscription(user.id) : undefined;
  const subscribed = sub && !["canceled", "expired"].includes(sub.status);

  return (
    <main>
      <div className="page-head">
        <h1>
          만들고 싶은 만큼, <span className="grad-text">요금제를 고르세요</span>
        </h1>
        <p className="muted">
          매월 같은 날 등록한 카드로 자동 결제되고, 결제할 때마다 크레딧이 새로 지급됩니다. 미사용 크레딧은 다음 달로 이월되지 않습니다.
        </p>
      </div>
      {!subscribed && (
        <div className="trial-note row between">
          <span>
            <strong>먼저 무료로 써 보세요.</strong> 가입하면 10초 영상 {TRIAL_CREDITS / creditCost(10)}편을 프로 요금제와 같은 조건으로 만들 수
            있어요. 카드 등록은 필요 없어요.
          </span>
          <Link className="button" href="/generate">
            무료로 만들어 보기
          </Link>
        </div>
      )}
      <div className="grid">
        {plans.map((plan) => (
          <div
            key={plan.id}
            className={`card plan ${plan.id === "pro" ? "featured" : ""} ${sub?.plan_id === plan.id && subscribed ? "current" : ""}`}
          >
            {plan.id === "pro" && <span className="plan-tag">추천</span>}
            <h2>{plan.name}</h2>
            <p className="price">
              {won(plan.price)}
              <span className="muted"> / 월</span>
            </p>
            <ul>
              <li>월 {plan.monthly_credits.toLocaleString("ko-KR")} 크레딧</li>
              <li>10초 영상 {Math.floor(plan.monthly_credits / creditCost(10))}편</li>
              <li>최대 {plan.max_duration}초 · 화면 비율 3종</li>
              <li>편당 약 {won(Math.round(plan.price / Math.floor(plan.monthly_credits / creditCost(10))))}</li>
            </ul>
            {!user ? (
              <Link className="button" href="/login?next=/plans">
                로그인하고 시작하기
              </Link>
            ) : subscribed ? (
              <p className="muted">{sub.plan_id === plan.id ? "현재 이용 중인 요금제" : "요금제 변경은 추후 지원 예정"}</p>
            ) : (
              <BillingButton
                mock={isMockPayment()}
                customerKey={user.customer_key}
                customerEmail={user.email}
                planId={plan.id}
                label="카드 등록하고 구독 시작"
              />
            )}
          </div>
        ))}
      </div>
      <p className="muted small">
        카드 정보는 토스페이먼츠 결제창에서만 입력되며 이 서비스에는 저장되지 않습니다. 국내 발급 카드만 사용할 수 있습니다.
      </p>
    </main>
  );
}

export default function PlansPage() {
  return (
    <Suspense fallback={<Loading />}>
      <PlansPageContent />
    </Suspense>
  );
}
