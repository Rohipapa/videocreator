// Supabase MCP generate_typescript_types로 생성한 타입(public 스키마). 스키마를 바꾸면 다시 생성한다.
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

type Table<Row, Insert, Update = Partial<Insert>> = { Row: Row; Insert: Insert; Update: Update; Relationships: [] };

type CreditLedgerRow = {
  amount: number;
  created_at: string;
  id: string;
  job_id: string | null;
  reason: string | null;
  subscription_id: string | null;
  type: string;
  user_id: string;
};
type GenerationJobRow = {
  aspect_ratio: string;
  completed_at: string | null;
  created_at: string;
  credits: number;
  duration: number;
  failure_reason: string | null;
  id: string;
  idempotency_key: string;
  prompt: string;
  provider: string;
  provider_job_id: string | null;
  result_path: string | null;
  started_at: string | null;
  status: string;
  user_id: string;
};
type PaymentRow = {
  amount: number;
  approved_at: string | null;
  billing_cycle: number;
  created_at: string;
  currency: string;
  error_code: string | null;
  error_message: string | null;
  id: string;
  order_id: string;
  order_name: string;
  payment_key: string | null;
  receipt_url: string | null;
  status: string;
  subscription_id: string;
  user_id: string;
};
type PlanRow = {
  active: boolean;
  description: string;
  id: string;
  max_duration: number;
  monthly_credits: number;
  name: string;
  price: number;
  sort: number;
};
type ProfileRow = {
  created_at: string;
  customer_key: string;
  email: string;
  id: string;
  role: string;
  status: string;
};
type SubscriptionRow = {
  billing_cycle: number;
  billing_key_enc: string | null;
  billing_lock_until: string | null;
  cancel_requested_at: string | null;
  card_company: string | null;
  card_number: string | null;
  created_at: string;
  ended_at: string | null;
  id: string;
  next_billing_at: string | null;
  period_end: string | null;
  period_start: string | null;
  plan_id: string;
  retry_count: number;
  status: string;
  updated_at: string;
  user_id: string;
};

type Optional<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

export type Database = {
  __InternalSupabase: { PostgrestVersion: "14.18" };
  public: {
    Tables: {
      credit_ledger: Table<CreditLedgerRow, Optional<CreditLedgerRow, "created_at" | "id" | "job_id" | "reason" | "subscription_id">>;
      generation_jobs: Table<
        GenerationJobRow,
        Optional<
          GenerationJobRow,
          "completed_at" | "created_at" | "failure_reason" | "id" | "provider_job_id" | "result_path" | "started_at"
        >
      >;
      payments: Table<
        PaymentRow,
        Optional<
          PaymentRow,
          "approved_at" | "created_at" | "currency" | "error_code" | "error_message" | "id" | "payment_key" | "receipt_url"
        >
      >;
      plans: Table<PlanRow, Optional<PlanRow, "active" | "sort">>;
      profiles: Table<ProfileRow, Optional<ProfileRow, "created_at" | "customer_key" | "role" | "status">>;
      subscriptions: Table<
        SubscriptionRow,
        Optional<
          SubscriptionRow,
          | "billing_cycle"
          | "billing_key_enc"
          | "billing_lock_until"
          | "cancel_requested_at"
          | "card_company"
          | "card_number"
          | "created_at"
          | "ended_at"
          | "id"
          | "next_billing_at"
          | "period_end"
          | "period_start"
          | "retry_count"
          | "updated_at"
        >
      >;
    };
    Views: { [_ in never]: never };
    Functions: {
      acquire_billing_lock: { Args: { p_seconds: number; p_subscription_id: string }; Returns: boolean };
      apply_payment_success: {
        Args: { p_approved_at: string | null; p_payment_id: string; p_payment_key: string; p_receipt_url: string | null };
        Returns: undefined;
      };
      complete_generation_job: {
        Args: { p_failure_reason: string | null; p_job_id: string; p_success: boolean };
        Returns: boolean;
      };
      create_generation_job: {
        Args: {
          p_aspect_ratio: string;
          p_credits: number;
          p_duration: number;
          p_idempotency_key: string;
          p_prompt: string;
          p_provider: string;
          p_user_id: string;
        };
        Returns: Json;
      };
      credit_balance: { Args: { p_user_id: string }; Returns: number };
      end_subscription: {
        Args: { p_cancel_requested?: boolean; p_reason: string; p_status: string; p_subscription_id: string };
        Returns: string | null;
      };
      expire_remaining_credits: {
        Args: { p_reason: string; p_subscription_id: string; p_user_id: string };
        Returns: number;
      };
      release_billing_lock: { Args: { p_subscription_id: string }; Returns: undefined };
    };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};
