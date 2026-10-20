import "server-only";
import { nowIso, type Job, type User } from "./db";
import { admin, unwrap } from "./supabase/admin";
import { canGenerate, getCurrentSubscription, getPlan } from "./billing";

// 테스트 환경용 모의(mock) AI 제공자. 실제 제공자 연동 시 이 모듈의 처리 부분만 교체한다(PRD 10.3).
export const ASPECT_RATIOS = ["16:9", "9:16", "1:1"] as const;
export const DURATIONS = [5, 10] as const;
const QUEUE_MS = 2_000;
const PROCESS_MS = 8_000;
export const FAIL_TRIGGER = "[실패]"; // 프롬프트에 포함하면 실패를 시뮬레이션한다.

export const creditCost = (duration: number) => duration * 2;

export type CreateJobResult = { ok: true; jobId: string } | { ok: false; message: string };

export async function createJob(
  user: User,
  input: { prompt: string; aspectRatio: string; duration: number; idempotencyKey: string },
): Promise<CreateJobResult> {
  const prompt = input.prompt.trim();
  if (!prompt) return { ok: false, message: "프롬프트를 입력해 주세요." };
  if (prompt.length > 1000) return { ok: false, message: "프롬프트는 1,000자 이하로 입력해 주세요." };
  if (!ASPECT_RATIOS.includes(input.aspectRatio as (typeof ASPECT_RATIOS)[number])) {
    return { ok: false, message: "지원하지 않는 화면 비율입니다." };
  }
  if (!DURATIONS.includes(input.duration as (typeof DURATIONS)[number])) {
    return { ok: false, message: "지원하지 않는 영상 길이입니다." };
  }
  if (!input.idempotencyKey) return { ok: false, message: "잘못된 요청입니다." };

  // 구독 상태와 잔여 크레딧은 서버에서 검증한다(PRD 3.3).
  const sub = await getCurrentSubscription(user.id);
  if (!sub || !canGenerate(sub.status)) return { ok: false, message: "이용 중인 구독이 없습니다. 요금제를 먼저 선택해 주세요." };
  const plan = (await getPlan(sub.plan_id))!;
  if (input.duration > plan.max_duration) {
    return { ok: false, message: `${plan.name} 요금제는 최대 ${plan.max_duration}초까지 생성할 수 있습니다.` };
  }

  // 중복 요청 키 확인 → 잔액 확인 → 작업 생성 → 크레딧 예약을 DB 함수 하나에서 원자적으로 처리한다.
  const r = unwrap(
    await admin().rpc("create_generation_job", {
      p_user_id: user.id,
      p_idempotency_key: input.idempotencyKey,
      p_prompt: prompt,
      p_aspect_ratio: input.aspectRatio,
      p_duration: input.duration,
      p_credits: creditCost(input.duration),
      p_provider: "mock",
    }),
    "생성 요청",
  ) as { ok: boolean; job_id?: string; message?: string };
  return r.ok ? { ok: true, jobId: r.job_id! } : { ok: false, message: r.message ?? "잘못된 요청입니다." };
}

/** 모의 제공자의 진행 상황을 시간 경과에 따라 갱신한다. 실제 제공자는 폴링·웹훅으로 대체된다. */
export async function advanceMockJobs(userId: string) {
  const now = Date.now();
  const jobs = unwrap(
    await admin()
      .from("generation_jobs")
      .select("id, prompt, status, created_at, started_at")
      .eq("user_id", userId)
      .in("status", ["queued", "processing"]),
    "진행 중 작업 조회",
  );
  for (const job of jobs) {
    if (job.status === "queued" && now - Date.parse(job.created_at) >= QUEUE_MS) {
      unwrap(
        await admin()
          .from("generation_jobs")
          .update({ status: "processing", started_at: nowIso() })
          .eq("id", job.id)
          .eq("status", "queued"),
        "작업 시작",
      );
    } else if (job.status === "processing" && now - Date.parse(job.started_at!) >= PROCESS_MS) {
      const fail = job.prompt.includes(FAIL_TRIGGER);
      // 상태 변경과 크레딧 확정·복구를 함께 처리한다. 시스템 오류로 인한 실패는 예약한 크레딧을 되돌린다(PRD 3.4).
      unwrap(
        await admin().rpc("complete_generation_job", {
          p_job_id: job.id,
          p_success: !fail,
          p_failure_reason: fail ? "AI 제공자 오류(모의)" : null,
        }),
        "작업 완료 처리",
      );
    }
  }
}

export async function listJobs(userId: string): Promise<Job[]> {
  const rows = unwrap(
    await admin()
      .from("generation_jobs")
      .select("id, prompt, aspect_ratio, duration, credits, status, failure_reason, created_at, started_at, completed_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(50),
    "작업 목록 조회",
  );
  return rows as Job[];
}

export const JOB_STATUS_LABEL: Record<Job["status"], string> = {
  queued: "대기 중",
  processing: "생성 중",
  completed: "완료",
  failed: "실패",
  canceled: "취소됨",
};
