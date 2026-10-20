-- 예약(reserve) 거래는 이미 잔액에서 빠져 있으므로 진행 중 작업의 예약분을 다시 빼지 않는다.
-- 잔액 전체를 만료시켜도 예약분은 그대로 남고, 작업이 실패하면 release로 복구된다.
create or replace function public.expire_remaining_credits(p_user_id uuid, p_subscription_id uuid, p_reason text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_expirable integer;
begin
  perform public.lock_user_credits(p_user_id);
  v_expirable := public.credit_balance(p_user_id);
  if v_expirable > 0 then
    insert into public.credit_ledger (user_id, type, amount, subscription_id, reason)
    values (p_user_id, 'expire', -v_expirable, p_subscription_id, p_reason);
    return v_expirable;
  end if;
  return 0;
end;
$$;
