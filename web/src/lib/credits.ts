import "server-only";
import { db, newId, nowIso } from "./db";

// 크레딧은 잔액을 덮어쓰지 않고 원장(ledger)에 거래를 쌓는다(PRD 7.6).
// 잔액 = 모든 거래 amount의 합. consume은 예약을 사용으로 확정했다는 기록이라 amount가 0이다.
export type LedgerType = "grant" | "reserve" | "release" | "consume" | "expire" | "adjust";

export const LEDGER_LABEL: Record<LedgerType, string> = {
  grant: "지급",
  reserve: "예약",
  release: "예약 해제",
  consume: "사용 확정",
  expire: "만료",
  adjust: "관리자 조정",
};

export function addLedger(entry: {
  userId: string;
  type: LedgerType;
  amount: number;
  subscriptionId?: string | null;
  jobId?: string | null;
  reason?: string | null;
}) {
  db.prepare(
    `INSERT INTO credit_ledger (id, user_id, type, amount, subscription_id, job_id, reason, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    newId(),
    entry.userId,
    entry.type,
    entry.amount,
    entry.subscriptionId ?? null,
    entry.jobId ?? null,
    entry.reason ?? null,
    nowIso(),
  );
}

export function getBalance(userId: string): number {
  const row = db.prepare("SELECT COALESCE(SUM(amount), 0) AS balance FROM credit_ledger WHERE user_id = ?").get(userId) as {
    balance: number;
  };
  return row.balance;
}

/** 이번 주기 지급량: 가장 최근 grant 금액 */
export function getCurrentGrant(userId: string): number {
  const row = db
    .prepare("SELECT amount FROM credit_ledger WHERE user_id = ? AND type = 'grant' ORDER BY created_at DESC LIMIT 1")
    .get(userId) as { amount: number } | undefined;
  return row?.amount ?? 0;
}

export function listLedger(userId: string, limit = 30) {
  return db
    .prepare(
      `SELECT type, amount, reason, created_at FROM credit_ledger
       WHERE user_id = ? ORDER BY created_at DESC LIMIT ?`,
    )
    .all(userId, limit) as { type: LedgerType; amount: number; reason: string | null; created_at: string }[];
}

/** 새 결제 주기 시작: 미사용 크레딧을 만료시키고 새 크레딧을 지급한다(기본 정책: 이월 없음). */
export function renewCredits(userId: string, subscriptionId: string, credits: number, cycle: number) {
  expireRemaining(userId, subscriptionId, cycle > 1 ? `${cycle - 1}회차 미사용 크레딧 만료` : "이전 구독 잔여 크레딧 만료");
  addLedger({ userId, type: "grant", amount: credits, subscriptionId, reason: `${cycle}회차 구독 크레딧 지급` });
}

/** 남은 크레딧을 만료시킨다. 진행 중인 생성 작업의 예약분은 남겨 둔다. */
export function expireRemaining(userId: string, subscriptionId: string, reason: string) {
  const expirable = getBalance(userId) - getPendingReserved(userId);
  if (expirable > 0) addLedger({ userId, type: "expire", amount: -expirable, subscriptionId, reason });
}

function getPendingReserved(userId: string): number {
  const row = db
    .prepare(
      `SELECT COALESCE(SUM(credits), 0) AS reserved FROM generation_jobs
       WHERE user_id = ? AND status IN ('queued', 'processing')`,
    )
    .get(userId) as { reserved: number };
  return row.reserved;
}
