import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

// 시크릿 키(service_role) 클라이언트. RLS를 우회하므로 서버에서만, 사용자 ID를 직접 조건으로 걸어 쓴다.
// 결제·빌링키·크레딧 쓰기는 모두 이 클라이언트로만 한다(PRD 7.7).
let client: SupabaseClient<Database> | undefined;

export function admin(): SupabaseClient<Database> {
  if (client) return client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!url || !secret) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL 또는 SUPABASE_SECRET_KEY 환경변수가 없습니다. web/.env.local을 확인하세요.");
  }
  client = createClient<Database>(url, secret, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  return client;
}

type Result = { data: unknown; error: { message: string } | null };

/** supabase-js 응답에서 오류면 예외를 던지고 데이터만 돌려준다. */
export function unwrap<R extends Result>(res: R, what: string): NonNullable<R["data"]> {
  if (res.error) throw new Error(`[db] ${what} 실패: ${res.error.message}`);
  return res.data as NonNullable<R["data"]>;
}

/** maybeSingle()처럼 행이 없을 수 있는 조회용. */
export function unwrapMaybe<R extends Result>(res: R, what: string): NonNullable<R["data"]> | null {
  return unwrap(res, what) ?? null;
}
