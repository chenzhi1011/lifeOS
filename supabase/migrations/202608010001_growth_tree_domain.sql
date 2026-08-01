create table if not exists abilities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(user_id) on delete cascade,
  title text not null,
  status text not null default 'active' check (status in ('active', 'archived')),
  created_at timestamptz not null default now(),
  archived_at timestamptz,
  unique (user_id, id),
  unique (user_id, title)
);

alter table goals
  add column if not exists goal_type text,
  add column if not exists ability_id uuid,
  add column if not exists due_at timestamptz,
  add column if not exists completed_at timestamptz;

do $migration$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'goals'::regclass and conname = 'goals_goal_type_required'
  ) then
    alter table goals add constraint goals_goal_type_required
      check (goal_type is not null) not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'goals'::regclass and conname = 'goals_goal_type_check'
  ) then
    alter table goals add constraint goals_goal_type_check
      check (goal_type in ('long_term', 'short_term')) not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'goals'::regclass and conname = 'goals_ability_shape_check'
  ) then
    alter table goals add constraint goals_ability_shape_check check (
      (goal_type = 'long_term' and ability_id is not null)
      or (goal_type = 'short_term' and ability_id is null)
    ) not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'goals'::regclass and conname = 'goals_completed_at_check'
  ) then
    alter table goals add constraint goals_completed_at_check check (
      status <> 'completed' or completed_at is not null
    ) not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'goals'::regclass and conname = 'goals_ability_fk'
  ) then
    alter table goals add constraint goals_ability_fk
      foreign key (user_id, ability_id)
      references abilities(user_id, id) not valid;
  end if;
end
$migration$;

alter table tasks
  add column if not exists planned_metric_type text,
  add column if not exists planned_value numeric,
  add column if not exists planned_unit text;

do $migration$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'tasks'::regclass
      and conname = 'tasks_planned_metric_shape_check'
  ) then
    alter table tasks add constraint tasks_planned_metric_shape_check check (
      (planned_metric_type is null and planned_value is null and planned_unit is null)
      or (
        planned_metric_type in ('duration', 'count', 'milestone')
        and planned_value > 0
        and planned_unit in ('minute', 'hour', 'count')
      )
    ) not valid;
  end if;
end
$migration$;

do $migration$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'achievements'
      and column_name = 'goal_id'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'achievements'
      and column_name = 'short_goal_id'
  ) then
    alter table achievements rename column goal_id to short_goal_id;
  end if;
end
$migration$;

alter table achievements
  add column if not exists short_goal_id uuid,
  add column if not exists note text,
  add column if not exists evidence_url text;

create unique index if not exists idx_achievements_user_short_goal
  on achievements(user_id, short_goal_id) where short_goal_id is not null;

create unique index if not exists idx_activities_user_task_unique
  on activities(user_id, task_id) where task_id is not null;

create or replace function enforce_achievement_short_goal()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $function$
begin
  if new.short_goal_id is null or not exists (
    select 1
    from goals
    where user_id = new.user_id
      and id = new.short_goal_id
      and goal_type = 'short_term'
  ) then
    raise exception 'achievement requires a short_term goal owned by the user';
  end if;
  return new;
end
$function$;

drop trigger if exists achievements_short_goal_guard on achievements;
create trigger achievements_short_goal_guard
before insert or update of user_id, short_goal_id on achievements
for each row execute function enforce_achievement_short_goal();

alter table messages drop constraint if exists messages_intent_type_check;
alter table messages add constraint messages_intent_type_check
  check (intent_type in ('task', 'activity', 'goal', 'ability', 'reminder', 'inbox'));

alter table inbox_items drop constraint if exists inbox_items_suggested_type_check;
alter table inbox_items add constraint inbox_items_suggested_type_check
  check (suggested_type in ('task', 'activity', 'goal', 'ability', 'reminder', 'inbox'));

create index if not exists idx_abilities_user_status
  on abilities(user_id, status);

alter table abilities enable row level security;

drop policy if exists abilities_own_rows on abilities;
create policy abilities_own_rows
  on abilities
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
