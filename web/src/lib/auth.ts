import "server-only";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { type User } from "./db";
import { admin, unwrapMaybe } from "./supabase/admin";
import { createSupabaseServerClient } from "./supabase/server";

// Supabase Auth의 비밀번호 없는 이메일 로그인(매직링크·OTP, PRD 3.2).
// 프로필과 토스페이먼츠 customerKey는 auth.users 생성 트리거가 만든다.

export async function getCurrentUser(): Promise<User | null> {
  // 이후 DB·시간 로직이 요청 시점에 실행되도록 고정한다(Cache Components).
  await connection();
  const supabase = await createSupabaseServerClient();
  // 권한 판단에는 getSession()이 아니라 토큰 서명을 검증하는 getClaims()를 쓴다.
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId) return null;
  const profile = unwrapMaybe(
    await admin().from("profiles").select("id, email, customer_key, role, status").eq("id", userId).maybeSingle(),
    "프로필 조회",
  );
  if (!profile || profile.status !== "active") return null;
  return { id: profile.id, email: profile.email, customer_key: profile.customer_key, role: profile.role };
}

export async function requireUser(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

/** 로그인 메일(매직링크, 템플릿에 따라 6자리 코드 포함)을 보낸다. 처음 쓰는 이메일이면 계정이 만들어진다. */
export async function sendLoginEmail(email: string, redirectTo: string) {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: true, emailRedirectTo: redirectTo },
  });
  return error;
}

/** 메일의 6자리 코드로 로그인한다. */
export async function verifyEmailCode(email: string, token: string) {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.verifyOtp({ email, token, type: "email" });
  return error;
}

/**
 * 테스트 전용: 메일 없이 바로 로그인한다. 관리자 API로 로그인 링크 토큰을 만들어 서버에서 곧바로 검증한다.
 * 호출하는 쪽에서 테스트 환경인지 반드시 확인한다.
 */
export async function devSignIn(email: string) {
  const { data, error } = await admin().auth.admin.generateLink({ type: "magiclink", email });
  if (error) return error;
  const supabase = await createSupabaseServerClient();
  const res = await supabase.auth.verifyOtp({ type: "magiclink", token_hash: data.properties.hashed_token });
  return res.error;
}

export async function signOut() {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
}
