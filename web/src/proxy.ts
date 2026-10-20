import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  // 정적 파일·영상·cron 엔드포인트는 세션 갱신이 필요 없다.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|videos/|api/cron/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|mp4)$).*)"],
};
