import { NextResponse, type NextRequest } from "next/server";
import { runBillingScheduler } from "@/lib/billing";

// 정기결제 스케줄러 엔드포인트. 외부 cron(예: 매일 09:00)이 호출한다.
// Authorization: Bearer {CRON_SECRET}
export async function POST(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const result = await runBillingScheduler();
  return NextResponse.json(result);
}
