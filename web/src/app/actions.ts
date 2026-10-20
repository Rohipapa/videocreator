"use server";

import { redirect } from "next/navigation";
import { requireUser, signIn, signOut } from "@/lib/auth";
import { cancelSubscription, devMakeDue, resumeSubscription, runBillingScheduler, type ActionResult } from "@/lib/billing";
import { createJob } from "@/lib/generation";
import { isTestMode } from "@/lib/toss";

function back(path: string, r: ActionResult): never {
  const q = r.ok ? `msg=${encodeURIComponent(r.message ?? "완료되었습니다.")}` : `err=${encodeURIComponent(r.message)}`;
  redirect(`${path}?${q}`);
}

export async function loginAction(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) redirect("/login?err=" + encodeURIComponent("올바른 이메일을 입력해 주세요."));
  await signIn(email);
  const next = String(formData.get("next") ?? "");
  redirect(next.startsWith("/") && !next.startsWith("//") ? next : "/subscription");
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
  back("/subscription", resumeSubscription(user.id));
}

export async function createJobAction(formData: FormData) {
  const user = await requireUser();
  const r = createJob(user, {
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
  back("/dev", devMakeDue(user.id));
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
