begin;
create or replace function public.sudoku_board_valid(p_size text, p_board text, p_blank boolean default true)
returns boolean language sql immutable set search_path = '' as $$
  select coalesce(case p_size
    when 'mini' then length(p_board) = 16 and p_board ~ (case when p_blank then '^[0-4]+$' else '^[1-4]+$' end)
    when 'normal' then length(p_board) = 81 and p_board ~ (case when p_blank then '^[0-9]+$' else '^[1-9]+$' end)
    when 'xxl' then length(p_board) = 256 and p_board ~ (case when p_blank then '^[0-9A-G]+$' else '^[1-9A-G]+$' end)
    else false end, false);
$$;
notify pgrst, 'reload schema';
commit;