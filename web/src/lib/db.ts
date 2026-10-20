import "server-only";
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";

// 테스트 환경용 로컬 SQLite. 운영 전환 시 Postgres(Supabase 등)로 교체한다.
const DATA_DIR = path.join(process.cwd(), "data");
const DB_PATH = path.join(DATA_DIR, "app.db");

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  customer_key TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL DEFAULT 'user',
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS plans (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  price INTEGER NOT NULL,
  monthly_credits INTEGER NOT NULL,
  max_duration INTEGER NOT NULL,
  description TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  sort INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS subscriptions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  plan_id TEXT NOT NULL REFERENCES plans(id),
  status TEXT NOT NULL,
  billing_cycle INTEGER NOT NULL DEFAULT 0,
  period_start TEXT,
  period_end TEXT,
  next_billing_at TEXT,
  retry_count INTEGER NOT NULL DEFAULT 0,
  billing_key_enc TEXT,
  card_company TEXT,
  card_number TEXT,
  billing_lock_until TEXT,
  cancel_requested_at TEXT,
  ended_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_subscriptions_user ON subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_due ON subscriptions(status, next_billing_at);

CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  subscription_id TEXT NOT NULL REFERENCES subscriptions(id),
  billing_cycle INTEGER NOT NULL,
  order_id TEXT NOT NULL UNIQUE,
  order_name TEXT NOT NULL,
  amount INTEGER NOT NULL,
  status TEXT NOT NULL,
  payment_key TEXT,
  receipt_url TEXT,
  error_code TEXT,
  error_message TEXT,
  approved_at TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_payments_user ON payments(user_id, created_at);
-- 같은 구독의 같은 청구 회차는 한 번만 성공할 수 있다.
CREATE UNIQUE INDEX IF NOT EXISTS uq_payments_cycle_done
  ON payments(subscription_id, billing_cycle) WHERE status = 'DONE';

CREATE TABLE IF NOT EXISTS credit_ledger (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  type TEXT NOT NULL,
  amount INTEGER NOT NULL,
  subscription_id TEXT,
  job_id TEXT,
  reason TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ledger_user ON credit_ledger(user_id, created_at);

CREATE TABLE IF NOT EXISTS generation_jobs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  idempotency_key TEXT NOT NULL UNIQUE,
  prompt TEXT NOT NULL,
  aspect_ratio TEXT NOT NULL,
  duration INTEGER NOT NULL,
  credits INTEGER NOT NULL,
  status TEXT NOT NULL,
  provider TEXT NOT NULL,
  failure_reason TEXT,
  created_at TEXT NOT NULL,
  started_at TEXT,
  completed_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_jobs_user ON generation_jobs(user_id, created_at);
`;

// 예시 요금제. 실제 가격과 크레딧은 AI 제공자 원가 확인 후 확정한다(PRD 4.1).
const SEED_PLANS = [
  { id: "basic", name: "베이직", price: 9900, monthly_credits: 300, max_duration: 5, description: "짧은 영상 위주, 월 300 크레딧", sort: 1 },
  { id: "pro", name: "프로", price: 29900, monthly_credits: 1200, max_duration: 10, description: "더 긴 영상, 월 1,200 크레딧", sort: 2 },
];

function open(): DatabaseSync {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const db = new DatabaseSync(DB_PATH);
  db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
  db.exec(SCHEMA);
  const insert = db.prepare(
    `INSERT OR IGNORE INTO plans (id, name, price, monthly_credits, max_duration, description, sort)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );
  for (const p of SEED_PLANS) {
    insert.run(p.id, p.name, p.price, p.monthly_credits, p.max_duration, p.description, p.sort);
  }
  return db;
}

// dev 서버의 핫 리로드 때마다 연결이 새로 열리지 않도록 전역에 보관한다.
const globalForDb = globalThis as unknown as { __db?: DatabaseSync };
export const db: DatabaseSync = globalForDb.__db ?? (globalForDb.__db = open());

export function transaction<T>(fn: () => T): T {
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = fn();
    db.exec("COMMIT");
    return result;
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}

export const nowIso = () => new Date().toISOString();
export const newId = () => crypto.randomUUID();

export type Plan = {
  id: string;
  name: string;
  price: number;
  monthly_credits: number;
  max_duration: number;
  description: string;
};

export type User = {
  id: string;
  email: string;
  customer_key: string;
  role: string;
};

export type SubscriptionStatus =
  | "pending"
  | "active"
  | "past_due"
  | "cancel_at_period_end"
  | "canceled"
  | "expired"
  | "suspended";

export type Subscription = {
  id: string;
  user_id: string;
  plan_id: string;
  status: SubscriptionStatus;
  billing_cycle: number;
  period_start: string | null;
  period_end: string | null;
  next_billing_at: string | null;
  retry_count: number;
  billing_key_enc: string | null;
  card_company: string | null;
  card_number: string | null;
  cancel_requested_at: string | null;
  ended_at: string | null;
  created_at: string;
};

export type Payment = {
  id: string;
  order_id: string;
  order_name: string;
  amount: number;
  status: string;
  billing_cycle: number;
  receipt_url: string | null;
  error_code: string | null;
  error_message: string | null;
  approved_at: string | null;
  created_at: string;
};

export type Job = {
  id: string;
  prompt: string;
  aspect_ratio: string;
  duration: number;
  credits: number;
  status: "queued" | "processing" | "completed" | "failed" | "canceled";
  failure_reason: string | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
};
