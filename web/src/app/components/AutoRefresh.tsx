"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

// 진행 중인 작업이 있을 때 일정 간격으로 서버 컴포넌트를 다시 불러온다.
export function AutoRefresh({ active, intervalMs = 2000 }: { active: boolean; intervalMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => router.refresh(), intervalMs);
    return () => clearInterval(id);
  }, [active, intervalMs, router]);
  return null;
}
