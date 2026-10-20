import "server-only";

// 데이터는 Supabase Postgres에 있다. 스키마는 저장소 루트의 supabase/migrations, 접근은 ./supabase/admin.ts.
// 이 파일에는 도메인 타입과 공용 헬퍼만 둔다.

export const nowIso = () => new Date().toISOString();

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
