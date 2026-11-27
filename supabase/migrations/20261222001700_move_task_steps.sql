-- Steps can move to another task of the same list. Moving to a task of a different list stays forbidden
-- (the guard checks both tasks), and the owner of a step never changes.

begin;

create or replace function public.task_steps_guard() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.user_id <> old.user_id then
    raise exception 'Steps cannot change owner.' using errcode = '23514';
  end if;
  if new.task_id <> old.task_id and not exists (
    select 1
      from public.tasks a
      join public.tasks b on b.user_id = a.user_id and b.list_id = a.list_id
     where a.id = old.task_id and b.id = new.task_id and a.user_id = old.user_id
  ) then
    raise exception 'Steps can only move between tasks of the same list.' using errcode = '23514';
  end if;
  new.created_at := old.created_at;
  new.updated_at := now();
  return new;
end;
$$;

-- Moves a step to the end of another task's steps (same list only; the guard enforces it). It runs as its owner
-- because clients can only update a step's title, completed and position; every row it touches is the caller's.
create function public.move_task_step(p_step_id uuid, p_task_id uuid) returns public.task_steps
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_step public.task_steps;
begin
  if v_user is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  perform 1 from public.tasks t where t.id = p_task_id and t.user_id = v_user for update;
  if not found then
    raise exception 'That task no longer exists.' using errcode = '22023';
  end if;
  update public.task_steps s
     set task_id = p_task_id,
         position = coalesce((select max(o.position) + 1 from public.task_steps o where o.user_id = v_user and o.task_id = p_task_id), 0)
   where s.id = p_step_id and s.user_id = v_user
  returning * into v_step;
  if not found then
    raise exception 'That step no longer exists.' using errcode = '22023';
  end if;
  return v_step;
end;
$$;

revoke execute on function public.move_task_step(uuid, uuid) from public, anon;
grant execute on function public.move_task_step(uuid, uuid) to authenticated, service_role;

commit;
