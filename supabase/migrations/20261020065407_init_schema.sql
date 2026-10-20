-- 기존 SQLite 스키마를 Postgres로 옮긴다(PRD 7.7).

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  -- 토스페이먼츠 customerKey. 추측할 수 없도록 UUID로 발급한다.
  customer_key uuid not null unique default gen_random_uuid(),
  role text not null default 'user' check (role in ('user', 'admin')),
  status text not null default 'active' check (status in ('active', 'suspended')),
  created_at timestamptz not null default now()
);

create table public.plans (
  id text primary key,
  name text not null,
  price integer not null check (price >= 0),
  monthly_credits integer not null check (monthly_credits >= 0),
  max_duration integer not null check (max_duration > 0),
  description text not null,
  active boolean not null default true,
  sort integer not null default 0
);

-- 예시 요금제. 실제 가격과 크레딧은 AI 제공자 원가 확인 후 확정한다(PRD 4.1).
insert into public.plans (id, name, price, monthly_credits, max_duration, description, sort) values
  ('basic', '베이직', 9900, 300, 5, '짧은 영상 위주, 월 300 크레딧', 1),
  ('pro', '프로', 29900, 1200, 10, '더 긴 영상, 월 1,200 크레딧', 2);

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  plan_id text not null references public.plans(id),
  status text not null check (status in ('pending', 'active', 'past_due', 'cancel_at_period_end', 'canceled', 'expired', 'suspended')),
  billing_cycle integer not null default 0,
  period_start timestamptz,
  period_end timestamptz,
  next_billing_at timestamptz,
  retry_count integer not null default 0,
  billing_key_enc text,
  card_company text,
  card_number text,
  billing_lock_until timestamptz,
  cancel_requested_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index subscriptions_user_idx on public.subscriptions (user_id, created_at desc);
create index subscriptions_due_idx on public.subscriptions (status, next_billing_at);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  subscription_id uuid not null references public.subscriptions(id) on delete cascade,
  billing_cycle integer not null,
  order_id text not null unique,
  order_name text not null,
  amount integer not null,
  currency text not null default 'KRW',
  status text not null check (status in ('IN_PROGRESS', 'DONE', 'FAILED', 'UNKNOWN', 'CANCELED')),
  payment_key text,
  receipt_url text,
  error_code text,
  error_message text,
  approved_at timestamptz,
  created_at timestamptz not null default clock_timestamp()
);
create index payments_user_idx on public.payments (user_id, created_at desc);
create index payments_subscription_idx on public.payments (subscription_id, billing_cycle);
-- 같은 구독의 같은 청구 회차는 한 번만 성공할 수 있다.
create unique index payments_cycle_done_uq on public.payments (subscription_id, billing_cycle) where status = 'DONE';

create table public.generation_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  idempotency_key text not null unique,
  prompt text not null,
  aspect_ratio text not null,
  duration integer not null,
  credits integer not null,
  status text not null check (status in ('queued', 'processing', 'completed', 'failed', 'canceled')),
  provider text not null,
  provider_job_id text,
  result_path text,
  failure_reason text,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz
);
create index generation_jobs_user_idx on public.generation_jobs (user_id, created_at desc);
create index generation_jobs_inflight_idx on public.generation_jobs (user_id) where status in ('queued', 'processing');

-- 크레딧 원장(PRD 7.6). 잔액은 저장하지 않고 amount 합계로 계산한다.
-- 한 트랜잭션 안의 여러 거래도 순서가 남도록 clock_timestamp()를 쓴다.
create table public.credit_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  type text not null check (type in ('grant', 'reserve', 'release', 'consume', 'expire', 'adjust')),
  amount integer not null,
  subscription_id uuid references public.subscriptions(id) on delete set null,
  job_id uuid references public.generation_jobs(id) on delete set null,
  reason text,
  created_at timestamptz not null default clock_timestamp()
);
create index credit_ledger_user_idx on public.credit_ledger (user_id, created_at desc);
create index credit_ledger_subscription_idx on public.credit_ledger (subscription_id);
create index credit_ledger_job_idx on public.credit_ledger (job_id);

-- auth.users가 생기면 프로필과 customerKey를 자동으로 만든다.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email) values (new.id, coalesce(new.email, ''));
  return new;
end;
$$;
revoke execute on function public.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
