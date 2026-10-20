import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// 로그인 메일 링크의 도착 주소.
// - 메일 템플릿을 {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email 로 바꾸면 token_hash로 검증한다(PRD 8.4).
// - 기본 템플릿이면 Supabase 검증 후 ?code= 로 돌아오므로 세션으로 교환한다(같은 브라우저에서 열어야 함).
export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const next = url.searchParams.get("next") ?? "/subscription";
  const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/subscription";
  const to = (path: string) => NextResponse.redirect(new URL(path, request.url));

  const supabase = await createSupabaseServerClient();
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;
  const code = url.searchParams.get("code");

  let error: { message: string } | null = null;
  if (tokenHash && type) {
    ({ error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash }));
  } else if (code) {
    ({ error } = await supabase.auth.exchangeCodeForSession(code));
  } else {
    error = { message: "missing token" };
  }

  if (error) {
    return to("/login?err=" + encodeURIComponent("로그인 링크가 올바르지 않거나 만료되었습니다. 다시 요청해 주세요."));
  }
  return to(safeNext);
}
