import { Suspense } from "react";
import { Loading } from "../components/Loading";
import { loginAction } from "../actions";
import { Flash } from "../components/Flash";

async function LoginPageContent({ searchParams }: PageProps<"/login">) {
  const { err, next } = await searchParams;
  return (
    <main className="narrow">
      <h1>로그인</h1>
      <p className="muted">테스트 환경에서는 이메일만 입력하면 계정이 만들어지고 바로 로그인됩니다.</p>
      <Flash err={err} />
      <form action={loginAction} className="stack">
        <label>
          이메일
          <input type="email" name="email" required autoComplete="email" placeholder="you@example.com" />
        </label>
        <input type="hidden" name="next" value={typeof next === "string" ? next : ""} />
        <button type="submit" className="button">
          로그인
        </button>
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
