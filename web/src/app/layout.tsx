import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { getCurrentUser } from "@/lib/auth";
import { isTestMode } from "@/lib/toss";
import { logoutAction } from "./actions";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI 비디오 스튜디오",
  description: "텍스트로 설명하면 AI가 동영상을 만들어 주는 구독 서비스",
};

// 세션을 읽는 부분만 Suspense 안에서 요청 시점에 렌더링한다(Cache Components).
async function UserNav() {
  const user = await getCurrentUser();
  if (!user) return <Link href="/login">로그인</Link>;
  return (
    <>
      <Link href="/generate">만들기</Link>
      <Link href="/videos">내 영상</Link>
      <Link href="/subscription">구독 관리</Link>
      <Link href="/dev">테스트 도구</Link>
      <form action={logoutAction}>
        <button type="submit" className="link-button">
          로그아웃
        </button>
      </form>
    </>
  );
}

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko">
      <body>
        {isTestMode() && (
          <div className="test-banner" role="note">
            테스트 환경입니다. 토스페이먼츠 테스트 키를 사용하므로 실제 결제가 발생하지 않습니다.
          </div>
        )}
        <header className="site-header">
          <Link href="/" className="brand">
            AI 비디오 스튜디오
          </Link>
          <nav>
            <Link href="/plans">요금제</Link>
            <Suspense fallback={null}>
              <UserNav />
            </Suspense>
          </nav>
        </header>
        {children}
      </body>
    </html>
  );
}
