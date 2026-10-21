"use client";

import { loadTossPayments } from "@tosspayments/tosspayments-sdk";
import { useRouter } from "next/navigation";
import { useState } from "react";

// 토스페이먼츠 자동결제(빌링) 등록창을 띄운다. 브라우저에서는 클라이언트 키만 사용한다.
const CLIENT_KEY = process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY ?? "";

type Props = {
  customerKey: string;
  customerEmail: string;
  planId?: string;
  label: string;
  className?: string;
  /** 가상 결제 모드(토스 키 없음): 토스 결제창 대신 내부 가상 결제창으로 보낸다. */
  mock?: boolean;
};

export function BillingButton({ customerKey, customerEmail, planId, label, className = "button", mock = false }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onClick() {
    if (mock) {
      setBusy(true);
      router.push(planId ? `/billing/mock?planId=${encodeURIComponent(planId)}` : "/billing/mock");
      return;
    }
    if (!CLIENT_KEY) {
      setError("NEXT_PUBLIC_TOSS_CLIENT_KEY가 설정되지 않았습니다. .env.local을 확인하세요.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const tossPayments = await loadTossPayments(CLIENT_KEY);
      const payment = tossPayments.payment({ customerKey });
      const success = new URL("/billing/success", window.location.origin);
      if (planId) success.searchParams.set("planId", planId);
      await payment.requestBillingAuth({
        method: "CARD",
        successUrl: success.toString(),
        failUrl: window.location.origin + "/billing/fail",
        customerEmail,
      });
    } catch (e) {
      // 사용자가 창을 닫는 등 SDK 단계에서 끝난 경우
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <div>
      <button type="button" className={className} onClick={onClick} disabled={busy}>
        {busy ? "결제창 여는 중…" : label}
      </button>
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
