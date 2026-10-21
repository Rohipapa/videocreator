-- 요금제 조정: 10초 영상(20 크레딧) 기준 베이직 20편, 프로 65편. 가격은 그대로 둔다.
-- 웹의 PLAN_SUMMARY(web/src/lib/site.ts)와 같은 값이어야 한다.
update public.plans
   set monthly_credits = 400, max_duration = 10, description = '10초 영상 20편, 월 400 크레딧'
 where id = 'basic';
update public.plans
   set monthly_credits = 1300, max_duration = 10, description = '10초 영상 65편, 월 1,300 크레딧'
 where id = 'pro';

-- 가입 체험 크레딧: 10초 영상 2편(40 크레딧). 구독 없이 쓰고, 구독을 시작하면 첫 결제 때
-- 남은 양이 다른 미사용 크레딧과 함께 만료된다(apply_payment_success). 웹의 TRIAL_CREDITS와 같은 값.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email) values (new.id, coalesce(new.email, ''));
  insert into public.credit_ledger (user_id, type, amount, reason)
  values (new.id, 'grant', 40, '가입 체험 크레딧');
  return new;
end;
$$;
revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- 기존 가입자 중 구독도 지급 기록도 없는 사람에게 체험 크레딧을 한 번 지급한다.
insert into public.credit_ledger (user_id, type, amount, reason)
select p.id, 'grant', 40, '가입 체험 크레딧'
  from public.profiles p
 where not exists (select 1 from public.subscriptions s where s.user_id = p.id)
   and not exists (select 1 from public.credit_ledger l where l.user_id = p.id and l.type = 'grant');
