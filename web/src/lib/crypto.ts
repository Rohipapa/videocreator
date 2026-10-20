import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

// 빌링키는 조회 API가 없고 유출 시 결제에 쓰일 수 있으므로 AES-256-GCM으로 암호화해 저장한다.
function key(): Buffer {
  const raw = process.env.BILLING_KEY_SECRET;
  if (!raw) throw new Error("BILLING_KEY_SECRET 환경변수가 없습니다. .env.local을 확인하세요.");
  const buf = Buffer.from(raw, "base64");
  if (buf.length !== 32) throw new Error("BILLING_KEY_SECRET은 base64로 인코딩한 32바이트여야 합니다.");
  return buf;
}

export function encrypt(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map((b) => b.toString("base64")).join(".");
}

export function decrypt(payload: string): string {
  const [iv, tag, data] = payload.split(".").map((s) => Buffer.from(s, "base64"));
  const decipher = createDecipheriv("aes-256-gcm", key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}
