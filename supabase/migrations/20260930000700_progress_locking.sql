-- Serialize aggregate recomputation per work. Without this, two concurrent
-- episode toggles (READ COMMITTED) could each count only their own change and
-- the later commit would store a stale aggregate.

create function public.lock_progress_items(p_item_ids uuid[]) returns void
language sql set search_path = '' as $$
  select pg_advisory_xact_lock(hashtextextended('progress:' || id::text, 0))
  from (select distinct unnest(p_item_ids) as id order by 1) ids;
$$;

create or replace function public.recompute_container_progress(p_item_ids uuid[]) returns void
language plpgsql security invoker set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_item record;
  v_prev public.user_progress;
  v_checked integer;
  v_watched integer;
  v_mapped boolean;
begin
  if v_user is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  -- Held until commit; later statements see every earlier committed toggle.
  perform public.lock_progress_items(p_item_ids);
  for v_item in
    select m.id, m.total_episodes
    from public.media_items m
    where m.user_id = v_user and m.id = any (p_item_ids)
      and m.kind in ('series', 'movie', 'ova', 'ona', 'special')
    order by m.id
  loop
    select count(*) into v_checked
    from public.media_items c
    join public.user_progress p on p.user_id = c.user_id and p.media_item_id = c.id and p.is_checked
    where c.user_id = v_user and c.parent_id = v_item.id and c.kind = 'episode';

    select * into v_prev from public.user_progress
    where user_id = v_user and media_item_id = v_item.id;

    if not found or v_prev.episodes_mapped or v_checked >= v_prev.episodes_watched then
      v_watched := v_checked;
      v_mapped := true;
    else
      v_watched := v_prev.episodes_watched;
      v_mapped := false;
    end if;

    insert into public.user_progress as up (user_id, media_item_id, episodes_watched, episodes_mapped, status)
    values (
      v_user, v_item.id, v_watched, v_mapped,
      public.derive_watch_status(coalesce(v_prev.status, 'plan_to_watch'), v_watched, v_item.total_episodes)
    )
    on conflict (user_id, media_item_id) do update
      set episodes_watched = excluded.episodes_watched,
          episodes_mapped = excluded.episodes_mapped,
          status = excluded.status
      where (up.episodes_watched, up.episodes_mapped, up.status)
            is distinct from (excluded.episodes_watched, excluded.episodes_mapped, excluded.status);
  end loop;
end;
$$;

-- Take the same per-work lock before reading children in the other writers.
create or replace function public.set_container_progress(
  p_item_id uuid,
  p_episodes_watched integer default null,
  p_status text default null,
  p_score integer default null,
  p_clear_score boolean default false
)
returns setof public.user_progress
language plpgsql security invoker set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_item public.media_items;
  v_prev public.user_progress;
  v_children integer;
  v_checked integer;
  v_watched integer;
  v_status text;
  v_score smallint;
begin
  if v_user is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  select * into v_item from public.media_items
  where id = p_item_id and user_id = v_user and kind in ('series', 'movie', 'ova', 'ona', 'special');
  if not found then
    raise exception 'work not found' using errcode = '22023';
  end if;
  if p_status is not null and p_status not in ('watching', 'completed', 'on_hold', 'dropped', 'plan_to_watch') then
    raise exception 'invalid status' using errcode = '22023';
  end if;
  if p_score is not null and (p_score < 0 or p_score > 10) then
    raise exception 'score must be between 0 and 10' using errcode = '22023';
  end if;
  if p_episodes_watched is not null and p_episodes_watched < 0 then
    raise exception 'watched count cannot be negative' using errcode = '22023';
  end if;
  if p_episodes_watched is not null and coalesce(v_item.total_episodes, 0) > 0 and p_episodes_watched > v_item.total_episodes then
    raise exception 'watched count exceeds the known episode total' using errcode = '22023';
  end if;

  perform public.lock_progress_items(array[v_item.id]);
  select * into v_prev from public.user_progress where user_id = v_user and media_item_id = v_item.id;

  v_watched := coalesce(p_episodes_watched, v_prev.episodes_watched, 0);
  if p_status = 'completed' and p_episodes_watched is null and coalesce(v_item.total_episodes, 0) > 0 then
    v_watched := v_item.total_episodes;
  end if;

  if p_status is not null then
    v_status := p_status;
  elsif p_episodes_watched is not null then
    v_status := public.derive_watch_status(coalesce(v_prev.status, 'plan_to_watch'), v_watched, v_item.total_episodes);
  else
    v_status := coalesce(v_prev.status, 'plan_to_watch');
  end if;

  if p_clear_score then
    v_score := null;
  elsif p_score is not null then
    v_score := p_score;
  else
    v_score := v_prev.score;
  end if;

  select count(*), count(*) filter (where p.is_checked)
    into v_children, v_checked
  from public.media_items c
  left join public.user_progress p on p.user_id = c.user_id and p.media_item_id = c.id
  where c.user_id = v_user and c.parent_id = v_item.id and c.kind = 'episode';

  insert into public.user_progress as up (user_id, media_item_id, episodes_watched, episodes_mapped, status, score)
  values (v_user, v_item.id, v_watched, v_children = 0 or v_checked = v_watched, v_status, v_score)
  on conflict (user_id, media_item_id) do update
    set episodes_watched = excluded.episodes_watched,
        episodes_mapped = excluded.episodes_mapped,
        status = excluded.status,
        score = excluded.score;

  return query select up.* from public.user_progress up where up.user_id = v_user and up.media_item_id = v_item.id;
end;
$$;

revoke execute on function public.lock_progress_items(uuid[]) from public, anon;
grant execute on function public.lock_progress_items(uuid[]) to authenticated, service_role;
