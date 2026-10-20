import type { Metadata } from "next";
import { Suspense } from "react";
import { Loading } from "../components/Loading";
import { devLoginAllowed } from "@/lib/toss";
import { loginAction, verifyCodeAction } from "../actions";
import { Flash } from "../components/Flash";
import { SubmitButton } from "../components/SubmitButton";

export const metadata: Metadata = { title: "로그인", robots: { index: false, follow: false } };

async function LoginPageContent({ searchParams }: PageProps<"/login">) {
  const { err, next, sent } = await searchParams;
  const nextPath = typeof next === "string" ? next : "";

  if (sent === "1") {
    return (
      <main className="narrow">
        <h1>메일을 확인해 주세요</h1>
        <p className="muted">
          로그인 링크를 보냈습니다. 메일의 링크를 이 브라우저에서 열면 바로 로그인됩니다. 메일에 숫자 코드가 있다면 아래에 입력해도 됩니다.
        </p>
        <Flash err={err} />
        <form action={verifyCodeAction} className="stack">
          <label>
            인증 코드
            <input name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]*" placeholder="123456" required />
          </label>
          <input type="hidden" name="next" value={nextPath} />
          <SubmitButton label="코드로 로그인" pendingLabel="확인 중…" />
        </form>
        <p className="muted small">
          메일이 오지 않았다면 스팸함을 확인하거나 <a href="/login">이메일을 다시 입력</a>해 주세요.
        </p>
      </main>
    );
  }

  return (
    <main className="narrow">
      <h1>로그인</h1>
      <p className="muted">이메일로 로그인 링크를 보내 드립니다. 처음이면 계정이 자동으로 만들어지고, 비밀번호는 필요 없습니다.</p>
      <Flash err={err} />
      <form action={loginAction} className="stack">
        <label>
          이메일
          <input type="email" name="email" required autoComplete="email" placeholder="you@example.com" />
        </label>
        <input type="hidden" name="next" value={nextPath} />
        <SubmitButton label="로그인 링크 받기" pendingLabel="보내는 중…" />
        {devLoginAllowed() && (
          <button type="submit" name="mode" value="dev" className="button secondary">
            테스트 로그인 (메일 없이, 개발 서버 전용)
          </button>
        )}
      </form>
    </main>
  );
}

export default function LoginPage(props: PageProps<"/login">) {
  return (
    <Suspense fallback={<Loading />}>
      <LoginPageContent {...props} />
    </Suspense>
  );
}
