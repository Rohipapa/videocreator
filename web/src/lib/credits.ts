import "server-only";
import { admin, unwrap, unwrapMaybe } from "./supabase/admin";

// 크레딧은 잔액을 덮어쓰지 않고 원장(ledger)에 거래를 쌓는다(PRD 7.6).
// 잔액 = 모든 거래 amount의 합. consume은 예약을 사용으로 확정했다는 기록이라 amount가 0이다.
// 여러 거래를 함께 쓰는 작업(예약, 결제 반영, 만료)은 Postgres 함수(RPC)가 원자적으로 처리한다.
export type LedgerType = "grant" | "reserve" | "release" | "consume" | "expire" | "adjust";

export const LEDGER_LABEL: Record<LedgerType, string> = {
  grant: "지급",
  reserve: "예약",
  release: "예약 해제",
  consume: "사용 확정",
  expire: "만료",
  adjust: "관리자 조정",
};

export async function getBalance(userId: string): Promise<number> {
  return unwrap(await admin().rpc("credit_balance", { p_user_id: userId }), "잔액 조회");
}

/** 이번 주기 지급량: 가장 최근 grant 금액 */
export async function getCurrentGrant(userId: string): Promise<number> {
  const row = unwrapMaybe(
    await admin()
      .from("credit_ledger")
      .select("amount")
      .eq("user_id", userId)
      .eq("type", "grant")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    "지급량 조회",
  );
  return row?.amount ?? 0;
}

export async function listLedger(userId: string, limit = 30) {
  const rows = unwrap(
    await admin()
      .from("credit_ledger")
      .select("type, amount, reason, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(limit),
    "크레딧 내역 조회",
  );
  return rows as { type: LedgerType; amount: number; reason: string | null; created_at: string }[];
}
