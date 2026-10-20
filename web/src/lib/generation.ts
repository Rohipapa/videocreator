import "server-only";
import { db, newId, nowIso, transaction, type Job, type User } from "./db";
import { addLedger, getBalance } from "./credits";
import { canGenerate, getCurrentSubscription, getPlan } from "./billing";

// 테스트 환경용 모의(mock) AI 제공자. 실제 제공자 연동 시 이 모듈의 처리 부분만 교체한다(PRD 10.3).
export const ASPECT_RATIOS = ["16:9", "9:16", "1:1"] as const;
export const DURATIONS = [5, 10] as const;
const QUEUE_MS = 2_000;
const PROCESS_MS = 8_000;
export const FAIL_TRIGGER = "[실패]"; // 프롬프트에 포함하면 실패를 시뮬레이션한다.

export const creditCost = (duration: number) => duration * 2;

export type CreateJobResult = { ok: true; jobId: string } | { ok: false; message: string };

export function createJob(
  user: User,
  input: { prompt: string; aspectRatio: string; duration: number; idempotencyKey: string },
): CreateJobResult {
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
  const sub = getCurrentSubscription(user.id);
  if (!sub || !canGenerate(sub.status)) return { ok: false, message: "이용 중인 구독이 없습니다. 요금제를 먼저 선택해 주세요." };
  const plan = getPlan(sub.plan_id)!;
  if (input.duration > plan.max_duration) {
    return { ok: false, message: `${plan.name} 요금제는 최대 ${plan.max_duration}초까지 생성할 수 있습니다.` };
  }
  const cost = creditCost(input.duration);

  return transaction(() => {
    // 같은 요청이 두 번 들어와도(버튼 연타 등) 작업과 차감은 한 번만 일어난다.
    const existing = db.prepare("SELECT id, user_id FROM generation_jobs WHERE idempotency_key = ?").get(input.idempotencyKey) as
      | { id: string; user_id: string }
      | undefined;
    if (existing) {
      return existing.user_id === user.id ? { ok: true as const, jobId: existing.id } : { ok: false as const, message: "잘못된 요청입니다." };
    }
    if (getBalance(user.id) < cost) {
      return { ok: false as const, message: `크레딧이 부족합니다. (필요 ${cost}, 잔여 ${getBalance(user.id)})` };
    }
    const jobId = newId();
    db.prepare(
      `INSERT INTO generation_jobs (id, user_id, idempotency_key, prompt, aspect_ratio, duration, credits, status, provider, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'queued', 'mock', ?)`,
    ).run(jobId, user.id, input.idempotencyKey, prompt, input.aspectRatio, input.duration, cost, nowIso());
    addLedger({ userId: user.id, type: "reserve", amount: -cost, jobId, reason: "동영상 생성 예약" });
    return { ok: true as const, jobId };
  });
}

/** 모의 제공자의 진행 상황을 시간 경과에 따라 갱신한다. 실제 제공자는 폴링·웹훅으로 대체된다. */
export function advanceMockJobs(userId: string) {
  const now = Date.now();
  const jobs = db
    .prepare("SELECT * FROM generation_jobs WHERE user_id = ? AND status IN ('queued', 'processing')")
    .all(userId) as (Job & { user_id: string })[];
  for (const job of jobs) {
    if (job.status === "queued" && now - Date.parse(job.created_at) >= QUEUE_MS) {
      db.prepare("UPDATE generation_jobs SET status = 'processing', started_at = ? WHERE id = ? AND status = 'queued'").run(nowIso(), job.id);
    } else if (job.status === "processing" && now - Date.parse(job.started_at!) >= PROCESS_MS) {
      const fail = job.prompt.includes(FAIL_TRIGGER);
      transaction(() => {
        const changed = db
          .prepare("UPDATE generation_jobs SET status = ?, completed_at = ?, failure_reason = ? WHERE id = ? AND status = 'processing'")
          .run(fail ? "failed" : "completed", nowIso(), fail ? "AI 제공자 오류(모의)" : null, job.id);
        if (changed.changes === 0) return;
        if (fail) {
          // 시스템 오류로 인한 실패는 예약한 크레딧을 되돌린다(PRD 3.4).
          addLedger({ userId, type: "release", amount: job.credits, jobId: job.id, reason: "생성 실패로 크레딧 복구" });
        } else {
          addLedger({ userId, type: "consume", amount: 0, jobId: job.id, reason: `동영상 생성 완료 (${job.credits} 크레딧 사용)` });
        }
      });
    }
  }
}

export function listJobs(userId: string): Job[] {
  return db.prepare("SELECT * FROM generation_jobs WHERE user_id = ? ORDER BY created_at DESC LIMIT 50").all(userId) as Job[];
}

export const JOB_STATUS_LABEL: Record<Job["status"], string> = {
  queued: "대기 중",
  processing: "생성 중",
  completed: "완료",
  failed: "실패",
  canceled: "취소됨",
};
