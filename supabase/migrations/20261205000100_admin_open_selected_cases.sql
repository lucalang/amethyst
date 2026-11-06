-- Administrator bulk opening now targets one chosen case and amount per step instead of every owned case.
-- Each step opens and claims up to 200 of that case; repeating a step id returns the stored result.
drop function public.admin_open_all_loot_cases(uuid);
drop function public._loot_openable(uuid);

create function public.admin_open_loot_cases(p_step uuid, p_case text, p_quantity integer)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := public._require_admin();
  v_prior jsonb;
  v_left integer := p_quantity;
  v_take integer;
  v_id uuid;
  v_ids uuid[] := '{}';
  v_claim jsonb;
begin
  if p_step is null or p_case is null then
    raise exception 'A step id and case are required.' using errcode = '22023';
  end if;
  if p_quantity is null or p_quantity < 1 or p_quantity > 200 then
    raise exception 'Open between 1 and 200 cases per step.' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('loot_openings:' || v_user::text, 0));
  select result into v_prior from public.loot_bulk_steps where id = p_step and user_id = v_user;
  if not found then
    while v_left > 0 loop
      v_take := least(10, v_left);
      v_id := gen_random_uuid();
      perform public._loot_open(v_user, v_id, p_case, v_take);
      v_ids := v_ids || v_id;
      v_left := v_left - v_take;
    end loop;

    v_claim := public._loot_claim(v_user, v_ids);
    v_prior := jsonb_build_object('case', p_case, 'opened', p_quantity, 'newItems', v_claim -> 'newItems', 'duplicates', v_claim -> 'duplicates',
      'refund', v_claim -> 'refund', 'balance', v_claim -> 'balance');
    insert into public.loot_bulk_steps (id, user_id, result) values (p_step, v_user, v_prior);
  end if;

  select coalesce(sum(quantity), 0)::integer into v_left from public.user_loot_cases where user_id = v_user and case_id = v_prior ->> 'case';
  return v_prior || jsonb_build_object('remaining', v_left);
end;
$$;
revoke all on function public.admin_open_loot_cases(uuid, text, integer) from public, anon;
grant execute on function public.admin_open_loot_cases(uuid, text, integer) to authenticated;
