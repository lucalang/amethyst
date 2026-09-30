-- Read helpers for franchise pages (SECURITY INVOKER, so RLS applies).

create function public.entry_episode_rows(p_entry_id uuid)
returns setof public.media_items
language sql stable security invoker set search_path = '' as $$
  select c.*
  from public.media_items c
  join public.entry_media_items em
    on em.user_id = c.user_id and em.media_item_id = c.parent_id
  where em.entry_id = p_entry_id
    and em.user_id = (select auth.uid())
    and c.kind = 'episode'
  order by c.parent_id, c.episode_number nulls last, c.position, c.id;
$$;

create function public.entry_progress_rows(p_entry_id uuid)
returns setof public.user_progress
language sql stable security invoker set search_path = '' as $$
  select p.*
  from public.user_progress p
  where p.user_id = (select auth.uid())
    and p.media_item_id in (
      select em.media_item_id from public.entry_media_items em
       where em.entry_id = p_entry_id and em.user_id = (select auth.uid())
      union all
      select c.id from public.media_items c
        join public.entry_media_items em on em.user_id = c.user_id and em.media_item_id = c.parent_id
       where em.entry_id = p_entry_id and c.user_id = (select auth.uid())
    )
  order by p.media_item_id;
$$;

revoke execute on function public.entry_episode_rows(uuid) from public, anon;
revoke execute on function public.entry_progress_rows(uuid) from public, anon;
grant execute on function public.entry_episode_rows(uuid) to authenticated, service_role;
grant execute on function public.entry_progress_rows(uuid) to authenticated, service_role;
