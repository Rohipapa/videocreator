import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { handleBillingAuthSuccess } from "@/lib/billing";

// 토스페이먼츠 자동결제 등록창의 successUrl.
// 리다이렉트만으로 결제를 확정하지 않고, 서버에서 빌링키 발급과 결제 승인을 직접 확인한다.
export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const to = (path: string) => NextResponse.redirect(new URL(path, request.url));

  const user = await getCurrentUser();
  if (!user) return to("/login?err=" + encodeURIComponent("로그인이 필요합니다."));

  const authKey = url.searchParams.get("authKey");
  const customerKey = url.searchParams.get("customerKey");
  if (!authKey || !customerKey) return to("/subscription?err=" + encodeURIComponent("잘못된 접근입니다."));

  const result = await handleBillingAuthSuccess(user, {
    authKey,
    customerKey,
    planId: url.searchParams.get("planId"),
  });
  // authKey는 일회성이므로 처리 후 바로 다른 페이지로 보내 새로고침 시 재요청을 막는다.
  return to(
    "/subscription?" +
      (result.ok ? `msg=${encodeURIComponent(result.message ?? "완료되었습니다.")}` : `err=${encodeURIComponent(`[${result.code}] ${result.message}`)}`),
  );
}
