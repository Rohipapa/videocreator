import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { getCurrentUser } from "@/lib/auth";
import { isTestMode } from "@/lib/toss";
import { logoutAction } from "./actions";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI 비디오 스튜디오 — 글로 쓰면 영상이 되는 AI 영상 생성기",
  description: "텍스트 프롬프트만으로 쇼츠·광고·상품 소개 영상을 만드는 AI 영상 생성 구독 서비스",
};

// 세션을 읽는 부분만 Suspense 안에서 요청 시점에 렌더링한다(Cache Components).
async function UserNav() {
  const user = await getCurrentUser();
  if (!user)
    return (
      <>
        <Link href="/login">로그인</Link>
        <Link href="/generate" className="nav-cta">
          영상 만들기
        </Link>
      </>
    );
  return (
    <>
      <Link href="/videos">내 영상</Link>
      <Link href="/subscription">구독 관리</Link>
      <Link href="/dev">테스트 도구</Link>
      <form action={logoutAction}>
        <button type="submit" className="link-button">
          로그아웃
        </button>
      </form>
      <Link href="/generate" className="nav-cta">
        영상 만들기
      </Link>
    </>
  );
}

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko">
      <head>
        {/* 한글 본문 글꼴(Pretendard) */}
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/npm/pretendard@1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css"
        />
      </head>
      <body>
        {isTestMode() && (
          <div className="test-banner" role="note">
            테스트 환경입니다. 토스페이먼츠 테스트 키를 사용하므로 실제 결제가 발생하지 않습니다.
          </div>
        )}
        <header className="site-header">
          <Link href="/" className="brand">
            <span className="brand-mark">
              <svg viewBox="0 0 10 12" aria-hidden="true">
                <path d="M0 0 L10 6 L0 12 Z" />
              </svg>
            </span>
            <span className="brand-name">AI 비디오 스튜디오</span>
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
