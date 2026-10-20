import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { db, newId, nowIso, type User } from "./db";

// 테스트 환경용 간이 로그인: 이메일만으로 세션을 만든다.
// 운영 전환 시 이메일 인증·비밀번호 재설정이 있는 인증 서비스로 교체한다(PRD 3.2).
const SESSION_COOKIE = "session";
const SESSION_DAYS = 7;

export async function getCurrentUser(): Promise<User | null> {
  // 세션 만료 비교에 현재 시각을 쓰므로 요청 시점 렌더링으로 고정한다(Cache Components).
  await connection();
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const user = db
    .prepare(
      `SELECT u.id, u.email, u.customer_key, u.role FROM sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.token = ? AND s.expires_at > ? AND u.status = 'active'`,
    )
    .get(token, nowIso()) as User | undefined;
  return user ?? null;
}

export async function requireUser(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export async function signIn(email: string) {
  let user = db.prepare("SELECT id FROM users WHERE email = ?").get(email) as { id: string } | undefined;
  if (!user) {
    // customerKey는 토스페이먼츠 구매자 ID. 추측할 수 없도록 UUID로 발급한다.
    user = { id: newId() };
    db.prepare("INSERT INTO users (id, email, customer_key, created_at) VALUES (?, ?, ?, ?)").run(
      user.id,
      email,
      crypto.randomUUID(),
      nowIso(),
    );
  }
  const token = crypto.randomUUID() + crypto.randomUUID();
  const expires = new Date(Date.now() + SESSION_DAYS * 86400_000);
  db.prepare("INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)").run(
    token,
    user.id,
    expires.toISOString(),
  );
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires,
  });
}

export async function signOut() {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) db.prepare("DELETE FROM sessions WHERE token = ?").run(token);
  store.delete(SESSION_COOKIE);
}
