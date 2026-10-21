"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { devSignIn, requireUser, sendLoginEmail, signOut, verifyEmailCode } from "@/lib/auth";
import { cancelSubscription, devMakeDue, resumeSubscription, runBillingScheduler, type ActionResult } from "@/lib/billing";
import { createJob } from "@/lib/generation";
import { devLoginAllowed, isTestMode } from "@/lib/toss";

function back(path: string, r: ActionResult): never {
  const q = r.ok ? `msg=${encodeURIComponent(r.message ?? "완료되었습니다.")}` : `err=${encodeURIComponent(r.message)}`;
  redirect(`${path}?${q}`);
}

// 코드 입력 단계에서 쓸 이메일. URL에 개인정보를 남기지 않도록 짧게 쿠키에 보관한다.
const LOGIN_EMAIL_COOKIE = "login_email";

const safeNext = (v: FormDataEntryValue | null) => {
  const next = String(v ?? "");
  return next.startsWith("/") && !next.startsWith("//") ? next : "/generate";
};

const loginErr = (message: string): never => redirect("/login?err=" + encodeURIComponent(message));

export async function loginAction(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) loginErr("올바른 이메일을 입력해 주세요.");
  const next = safeNext(formData.get("next"));

  if (formData.get("mode") === "dev") {
    if (!devLoginAllowed()) loginErr("테스트 로그인은 개발 환경에서만 사용할 수 있습니다.");
    const error = await devSignIn(email);
    if (error) loginErr(`로그인에 실패했습니다: ${error.message}`);
    redirect(next);
  }

  const h = await headers();
  const origin = h.get("origin") ?? `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`;
  const error = await sendLoginEmail(email, `${origin}/auth/confirm?next=${encodeURIComponent(next)}`);
  if (error) loginErr(error.status === 429 ? "잠시 후 다시 시도해 주세요. (메일 발송 한도 초과)" : `메일 발송에 실패했습니다: ${error.message}`);
  (await cookies()).set(LOGIN_EMAIL_COOKIE, email, { httpOnly: true, sameSite: "lax", path: "/login", maxAge: 3600 });
  redirect(`/login?sent=1&next=${encodeURIComponent(next)}`);
}

export async function verifyCodeAction(formData: FormData) {
  const email = (await cookies()).get(LOGIN_EMAIL_COOKIE)?.value;
  if (!email) loginErr("이메일을 다시 입력해 주세요.");
  const code = String(formData.get("code") ?? "").replace(/\s/g, "");
  const next = safeNext(formData.get("next"));
  if (!/^\d{6,10}$/.test(code)) redirect(`/login?sent=1&next=${encodeURIComponent(next)}&err=${encodeURIComponent("메일로 받은 숫자 코드를 입력해 주세요.")}`);
  const error = await verifyEmailCode(email!, code);
  if (error) redirect(`/login?sent=1&next=${encodeURIComponent(next)}&err=${encodeURIComponent("코드가 올바르지 않거나 만료되었습니다.")}`);
  (await cookies()).delete({ name: LOGIN_EMAIL_COOKIE, path: "/login" });
  redirect(next);
}

export async function logoutAction() {
  await signOut();
  redirect("/");
}

export async function cancelAction() {
  const user = await requireUser();
  back("/subscription", await cancelSubscription(user.id));
}

export async function resumeAction() {
  const user = await requireUser();
  back("/subscription", await resumeSubscription(user.id));
}

export async function createJobAction(formData: FormData) {
  const user = await requireUser();
  const r = await createJob(user, {
    prompt: String(formData.get("prompt") ?? ""),
    aspectRatio: String(formData.get("aspectRatio") ?? ""),
    duration: Number(formData.get("duration")),
    idempotencyKey: String(formData.get("idempotencyKey") ?? ""),
  });
  if (!r.ok) redirect("/generate?err=" + encodeURIComponent(r.message));
  redirect("/videos?msg=" + encodeURIComponent("생성 요청이 접수되었습니다."));
}

// ---- 테스트 도구 (테스트 키일 때만 동작) ----

async function requireTestMode() {
  if (!isTestMode()) redirect("/dev?err=" + encodeURIComponent("테스트 키 환경에서만 사용할 수 있습니다."));
  return requireUser();
}

export async function devMakeDueAction() {
  const user = await requireTestMode();
  back("/dev", await devMakeDue(user.id));
}

export async function devRunSchedulerAction() {
  await requireTestMode();
  const r = await runBillingScheduler();
  const failed = r.failed.map((f) => (f.ok ? "" : `${f.code}: ${f.message}`)).join(", ");
  back("/dev", {
    ok: true,
    message: `스케줄러 실행 완료 — 결제 성공 ${r.charged}건, 실패 ${r.failed.length}건, 해지 처리 ${r.canceled}건${failed ? ` (${failed})` : ""}`,
  });
}
