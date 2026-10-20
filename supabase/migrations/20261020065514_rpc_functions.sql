-- 동시 요청에서 정합성이 깨질 수 있는 작업을 Postgres 함수 하나로 묶는다(PRD 7.7).
-- 모두 security definer이며 서버(service_role)만 실행할 수 있다.

-- 같은 사용자의 크레딧 변경을 트랜잭션 단위로 직렬화한다.
create function public.lock_user_credits(p_user_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  select pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('credits:' || p_user_id::text, 0));
$$;

create function public.credit_balance(p_user_id uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(amount), 0)::integer from public.credit_ledger where user_id = p_user_id;
$$;

-- 남은 크레딧을 만료시킨다. 진행 중인 생성 작업의 예약분은 남겨 둔다.
-- (예약분을 두 번 빼던 계산은 20261020065605_fix_expire_remaining_credits에서 수정)
create function public.expire_remaining_credits(p_user_id uuid, p_subscription_id uuid, p_reason text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_expirable integer;
begin
  perform public.lock_user_credits(p_user_id);
  v_expirable := public.credit_balance(p_user_id) - (
    select coalesce(sum(credits), 0)::integer from public.generation_jobs
    where user_id = p_user_id and status in ('queued', 'processing')
  );
  if v_expirable > 0 then
    insert into public.credit_ledger (user_id, type, amount, subscription_id, reason)
    values (p_user_id, 'expire', -v_expirable, p_subscription_id, p_reason);
    return v_expirable;
  end if;
  return 0;
end;
$$;

-- 생성 요청: 사용자 잠금 → 중복 요청 키 확인 → 잔액 확인 → 작업 생성 → 크레딧 예약
create function public.create_generation_job(
  p_user_id uuid,
  p_idempotency_key text,
  p_prompt text,
  p_aspect_ratio text,
  p_duration integer,
  p_credits integer,
  p_provider text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_existing record;
  v_balance integer;
  v_job_id uuid;
begin
  perform public.lock_user_credits(p_user_id);

  -- 같은 요청이 두 번 들어와도(버튼 연타 등) 작업과 차감은 한 번만 일어난다.
  select id, user_id into v_existing from public.generation_jobs where idempotency_key = p_idempotency_key;
  if found then
    if v_existing.user_id = p_user_id then
      return jsonb_build_object('ok', true, 'job_id', v_existing.id);
    end if;
    return jsonb_build_object('ok', false, 'message', '잘못된 요청입니다.');
  end if;

  v_balance := public.credit_balance(p_user_id);
  if v_balance < p_credits then
    return jsonb_build_object('ok', false, 'message', format('크레딧이 부족합니다. (필요 %s, 잔여 %s)', p_credits, v_balance));
  end if;

  insert into public.generation_jobs (user_id, idempotency_key, prompt, aspect_ratio, duration, credits, status, provider)
  values (p_user_id, p_idempotency_key, p_prompt, p_aspect_ratio, p_duration, p_credits, 'queued', p_provider)
  on conflict (idempotency_key) do nothing
  returning id into v_job_id;
  if v_job_id is null then
    return jsonb_build_object('ok', false, 'message', '잘못된 요청입니다.');
  end if;

  insert into public.credit_ledger (user_id, type, amount, job_id, reason)
  values (p_user_id, 'reserve', -p_credits, v_job_id, '동영상 생성 예약');
  return jsonb_build_object('ok', true, 'job_id', v_job_id);
end;
$$;

-- 생성 완료·실패 반영: 성공이면 사용 확정, 실패면 예약 해제(크레딧 복구).
create function public.complete_generation_job(p_job_id uuid, p_success boolean, p_failure_reason text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_credits integer;
begin
  select user_id into v_user_id from public.generation_jobs where id = p_job_id;
  if not found then
    return false;
  end if;
  perform public.lock_user_credits(v_user_id);

  update public.generation_jobs
  set status = case when p_success then 'completed' else 'failed' end,
      completed_at = now(),
      failure_reason = case when p_success then null else p_failure_reason end
  where id = p_job_id and status = 'processing'
  returning credits into v_credits;
  if not found then
    return false;
  end if;

  if p_success then
    insert into public.credit_ledger (user_id, type, amount, job_id, reason)
    values (v_user_id, 'consume', 0, p_job_id, format('동영상 생성 완료 (%s 크레딧 사용)', v_credits));
  else
    insert into public.credit_ledger (user_id, type, amount, job_id, reason)
    values (v_user_id, 'release', v_credits, p_job_id, '생성 실패로 크레딧 복구');
  end if;
  return true;
end;
$$;

-- 결제 잠금: 같은 구독의 동시 결제를 막는다. 잠금은 일정 시간 뒤 자동으로 풀린다.
create function public.acquire_billing_lock(p_subscription_id uuid, p_seconds integer)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.subscriptions
  set billing_lock_until = now() + make_interval(secs => p_seconds)
  where id = p_subscription_id and (billing_lock_until is null or billing_lock_until < now());
  return found;
end;
$$;

create function public.release_billing_lock(p_subscription_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.subscriptions set billing_lock_until = null where id = p_subscription_id;
$$;

-- 결제 성공 반영: 결제 상태 변경 → 구독 기간·회차 갱신 → 미사용 크레딧 만료 → 새 크레딧 지급(이월 없음)
create function public.apply_payment_success(
  p_payment_id uuid,
  p_payment_key text,
  p_receipt_url text,
  p_approved_at timestamptz
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pay public.payments;
  v_sub public.subscriptions;
  v_plan public.plans;
  v_start timestamptz;
  v_end timestamptz;
begin
  select * into v_pay from public.payments where id = p_payment_id for update;
  if not found then
    raise exception 'payment % not found', p_payment_id;
  end if;
  if v_pay.status = 'DONE' then
    return; -- 이미 반영됨(중복 호출에도 크레딧을 두 번 지급하지 않는다)
  end if;
  select * into v_sub from public.subscriptions where id = v_pay.subscription_id for update;
  select * into v_plan from public.plans where id = v_sub.plan_id;

  update public.payments
  set status = 'DONE', payment_key = p_payment_key, receipt_url = p_receipt_url,
      approved_at = coalesce(p_approved_at, now()), error_code = null, error_message = null
  where id = p_payment_id;

  v_start := case
    when v_pay.billing_cycle > 1 and v_sub.period_end is not null and v_sub.period_end < now() then v_sub.period_end
    else now()
  end;
  v_end := v_start + interval '1 month';

  update public.subscriptions
  set status = 'active', billing_cycle = v_pay.billing_cycle, period_start = v_start, period_end = v_end,
      next_billing_at = v_end, retry_count = 0, updated_at = now()
  where id = v_sub.id;

  perform public.expire_remaining_credits(
    v_sub.user_id, v_sub.id,
    case when v_pay.billing_cycle > 1 then format('%s회차 미사용 크레딧 만료', v_pay.billing_cycle - 1) else '이전 구독 잔여 크레딧 만료' end
  );
  insert into public.credit_ledger (user_id, type, amount, subscription_id, reason)
  values (v_sub.user_id, 'grant', v_plan.monthly_credits, v_sub.id, format('%s회차 구독 크레딧 지급', v_pay.billing_cycle));
end;
$$;

-- 구독 종료(해지·만료): 상태 변경 → 빌링키 제거 → 잔여 크레딧 만료. 삭제할 이전 빌링키(암호문)를 돌려준다.
create function public.end_subscription(
  p_subscription_id uuid,
  p_status text,
  p_reason text,
  p_cancel_requested boolean default false
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sub public.subscriptions;
begin
  if p_status not in ('canceled', 'expired') then
    raise exception 'invalid end status %', p_status;
  end if;
  select * into v_sub from public.subscriptions where id = p_subscription_id for update;
  if not found then
    raise exception 'subscription % not found', p_subscription_id;
  end if;

  update public.subscriptions
  set status = p_status, ended_at = now(), next_billing_at = null, billing_key_enc = null,
      cancel_requested_at = case when p_cancel_requested then now() else cancel_requested_at end,
      updated_at = now()
  where id = p_subscription_id;

  perform public.expire_remaining_credits(v_sub.user_id, v_sub.id, p_reason);
  return v_sub.billing_key_enc;
end;
$$;

revoke execute on function
  public.lock_user_credits(uuid),
  public.credit_balance(uuid),
  public.expire_remaining_credits(uuid, uuid, text),
  public.create_generation_job(uuid, text, text, text, integer, integer, text),
  public.complete_generation_job(uuid, boolean, text),
  public.acquire_billing_lock(uuid, integer),
  public.release_billing_lock(uuid),
  public.apply_payment_success(uuid, text, text, timestamptz),
  public.end_subscription(uuid, text, text, boolean)
from public, anon, authenticated;

grant execute on function
  public.credit_balance(uuid),
  public.expire_remaining_credits(uuid, uuid, text),
  public.create_generation_job(uuid, text, text, text, integer, integer, text),
  public.complete_generation_job(uuid, boolean, text),
  public.acquire_billing_lock(uuid, integer),
  public.release_billing_lock(uuid),
  public.apply_payment_success(uuid, text, text, timestamptz),
  public.end_subscription(uuid, text, text, boolean)
to service_role;
