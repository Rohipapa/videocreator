import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { getCurrentUser } from "@/lib/auth";
import { SITE_DESCRIPTION, SITE_KEYWORDS, SITE_NAME, SITE_TITLE, SITE_URL, SITE_VERIFICATION } from "@/lib/site";
import { isMockPayment, isTestMode } from "@/lib/toss";
import "./globals.css";

// 페이지별 canonical은 각 페이지에서 지정한다(레이아웃에 두면 모든 페이지가 첫 화면을 가리킨다).
export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: SITE_TITLE, template: `%s | ${SITE_NAME}` },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  keywords: SITE_KEYWORDS,
  openGraph: {
    type: "website",
    locale: "ko_KR",
    siteName: SITE_NAME,
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
  },
  twitter: { card: "summary_large_image", title: SITE_TITLE, description: SITE_DESCRIPTION },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1, "max-video-preview": -1 },
  },
  formatDetection: { telephone: false, email: false, address: false },
  verification: {
    google: SITE_VERIFICATION.google || undefined,
    other: SITE_VERIFICATION.naver ? { "naver-site-verification": SITE_VERIFICATION.naver } : undefined,
  },
};

export const viewport: Viewport = {
  themeColor: "#08080c",
  colorScheme: "dark",
};

// 세션을 읽는 부분만 Suspense 안에서 요청 시점에 렌더링한다(Cache Components).
async function UserNav() {
  const user = await getCurrentUser();
  if (!user)
    return (
      <>
        <Link href="/login">로그인</Link>
        <Link href="/generate" className="nav-cta">
          무료로 시작
        </Link>
      </>
    );
  return (
    <>
      <Link href="/videos">내 영상</Link>
      <Link href="/subscription">내 계정</Link>
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
            {isMockPayment()
              ? "테스트 환경입니다. 가상 결제 모드라 카드 등록·결제가 모두 모의로 처리되고 실제 결제는 발생하지 않습니다."
              : "테스트 환경입니다. 토스페이먼츠 테스트 키를 사용하므로 실제 결제가 발생하지 않습니다."}
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
