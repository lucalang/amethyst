create table public.task_add_batches (
  user_id uuid not null default auth.uid() references public.users (id) on delete cascade,
  batch_id uuid not null,
  payload jsonb not null,
  result jsonb not null,
  created_at timestamptz not null default now(),
  primary key (user_id, batch_id)
);

alter table public.task_add_batches enable row level security;
revoke all on public.task_add_batches from public, anon, authenticated;
grant all on public.task_add_batches to service_role;

create function public.add_task_batch(
  p_batch_id uuid,
  p_target_id uuid,
  p_kind text,
  p_tasks jsonb,
  p_important boolean default false,
  p_due_date date default null,
  p_my_day date default null
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_payload jsonb := jsonb_build_object('target', p_target_id, 'kind', p_kind, 'tasks', p_tasks,
    'important', p_important, 'due', p_due_date, 'my_day', p_my_day);
  v_previous public.task_add_batches;
  v_labels text[];
  v_checked boolean[];
  v_result jsonb;
begin
  if v_user is null then
    raise exception 'Sign in again to add tasks.' using errcode = '42501';
  end if;
  if p_batch_id is null or p_target_id is null or p_kind is null or p_kind not in ('todo', 'checklist') then
    raise exception 'Choose a list or checklist and try again.' using errcode = '22023';
  end if;
  if jsonb_typeof(p_tasks) is distinct from 'array' then
    raise exception 'Enter at least one task.' using errcode = '22023';
  end if;
  if jsonb_array_length(p_tasks) not between 1 and 500 then
    raise exception 'Each batch must contain between 1 and 500 tasks.' using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_tasks) task
    where jsonb_typeof(task->'label') is distinct from 'string'
       or jsonb_typeof(task->'checked') is distinct from 'boolean'
  ) then
    raise exception 'Every task needs a title and completion state.' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_user::text || p_batch_id::text, 0));
  select * into v_previous from public.task_add_batches
    where user_id = v_user and batch_id = p_batch_id;
  if found then
    if v_previous.payload <> v_payload then
      raise exception 'This batch has changed. Restore its original tasks before retrying.' using errcode = '22023';
    end if;
    return v_previous.result;
  end if;

  select array_agg(task->>'label' order by ord), array_agg((task->>'checked')::boolean order by ord)
    into v_labels, v_checked
    from jsonb_array_elements(p_tasks) with ordinality as input(task, ord);

  if p_kind = 'todo' then
    select coalesce(jsonb_agg(to_jsonb(task) - 'user_id' - 'notes' order by task.position), '[]'::jsonb)
      into v_result
      from public.add_tasks(p_target_id, v_labels, v_checked, p_important, p_due_date, p_my_day) task;
  else
    select coalesce(jsonb_agg(to_jsonb(task) - 'user_id' order by task.position), '[]'::jsonb)
      into v_result
      from public.add_checklist_tasks(p_target_id, v_labels, v_checked) task;
  end if;
  if jsonb_array_length(v_result) <> jsonb_array_length(p_tasks) then
    raise exception 'This batch could not be saved in full. Try again.' using errcode = '22023';
  end if;
  insert into public.task_add_batches (user_id, batch_id, payload, result)
    values (v_user, p_batch_id, v_payload, v_result);
  return v_result;
end;
$$;

revoke all on function public.add_task_batch(uuid, uuid, text, jsonb, boolean, date, date) from public, anon;
grant execute on function public.add_task_batch(uuid, uuid, text, jsonb, boolean, date, date) to authenticated, service_role;

create function public.normalize_task_name() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.name := regexp_replace(new.name, '^[[:space:]]+|[[:space:]]+$', '', 'g');
  return new;
end;
$$;

revoke all on function public.normalize_task_name() from public, anon, authenticated;
create trigger task_lists_normalize_name before insert or update of name on public.task_lists
  for each row execute function public.normalize_task_name();
create trigger task_groups_normalize_name before insert or update of name on public.task_groups
  for each row execute function public.normalize_task_name();