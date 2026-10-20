import type { Metadata } from "next";
import { Suspense } from "react";
import { Loading } from "../../components/Loading";
import Link from "next/link";

const MESSAGES: Record<string, string> = {
  PAY_PROCESS_CANCELED: "카드 등록을 취소했습니다.",
  PAY_PROCESS_ABORTED: "카드 등록 중 오류가 발생했습니다.",
  REJECT_CARD_COMPANY: "카드사에서 등록을 거절했습니다. 카드 정보를 확인해 주세요.",
  NOT_SUPPORTED_METHOD: "자동결제 계약이 되어 있지 않은 키입니다. API 개별 연동 키를 사용했는지 확인해 주세요.",
};

export const metadata: Metadata = { title: "카드 등록 실패", robots: { index: false, follow: false } };

async function BillingFailPageContent({ searchParams }: PageProps<"/billing/fail">) {
  const { code, message } = await searchParams;
  const c = typeof code === "string" ? code : "UNKNOWN";
  return (
    <main className="narrow">
      <h1>카드 등록에 실패했습니다</h1>
      <div className="alert error" role="alert">
        <strong>{MESSAGES[c] ?? "카드 등록을 완료하지 못했습니다."}</strong>
        <p className="muted">
          코드: {c}
          {typeof message === "string" && <> · {message}</>}
        </p>
      </div>
      <p>구독은 활성화되지 않았고 결제도 발생하지 않았습니다.</p>
      <Link className="button" href="/plans">
        요금제로 돌아가기
      </Link>
    </main>
  );
}

export default function BillingFailPage(props: PageProps<"/billing/fail">) {
  return (
    <Suspense fallback={<Loading />}>
      <BillingFailPageContent {...props} />
    </Suspense>
  );
}
