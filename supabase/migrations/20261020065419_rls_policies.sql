-- 모든 테이블에 RLS를 켜고, 사용자는 본인 데이터만 조회할 수 있게 한다.
-- 쓰기는 서버가 시크릿 키(service_role)로만 수행하므로 사용자 역할에는 쓰기 정책·권한을 주지 않는다.

alter table public.profiles enable row level security;
alter table public.plans enable row level security;
alter table public.subscriptions enable row level security;
alter table public.payments enable row level security;
alter table public.generation_jobs enable row level security;
alter table public.credit_ledger enable row level security;

revoke all on public.profiles, public.plans, public.subscriptions, public.payments,
  public.generation_jobs, public.credit_ledger from anon, authenticated;

grant select on public.plans to anon, authenticated;
grant select on public.profiles, public.payments, public.generation_jobs, public.credit_ledger to authenticated;
-- 빌링키(billing_key_enc)와 내부 잠금 컬럼은 사용자 역할이 조회할 수 없다.
grant select (id, user_id, plan_id, status, billing_cycle, period_start, period_end, next_billing_at, retry_count,
  card_company, card_number, cancel_requested_at, ended_at, created_at, updated_at)
  on public.subscriptions to authenticated;

create policy "요금제는 누구나 조회" on public.plans
  for select to anon, authenticated using (active);

create policy "본인 프로필 조회" on public.profiles
  for select to authenticated using ((select auth.uid()) = id);

create policy "본인 구독 조회" on public.subscriptions
  for select to authenticated using ((select auth.uid()) = user_id);

create policy "본인 결제 내역 조회" on public.payments
  for select to authenticated using ((select auth.uid()) = user_id);

create policy "본인 생성 작업 조회" on public.generation_jobs
  for select to authenticated using ((select auth.uid()) = user_id);

create policy "본인 크레딧 내역 조회" on public.credit_ledger
  for select to authenticated using ((select auth.uid()) = user_id);
