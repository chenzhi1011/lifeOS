\set ON_ERROR_STOP on

do $test$
begin
  if has_function_privilege(
    'anon',
    'public.complete_growth_task(uuid,uuid,date,text,numeric,text)',
    'EXECUTE'
  ) or has_function_privilege(
    'authenticated',
    'public.complete_growth_task(uuid,uuid,date,text,numeric,text)',
    'EXECUTE'
  ) then
    raise exception 'client roles must not execute complete_growth_task';
  end if;

  if not has_function_privilege(
    'service_role',
    'public.complete_growth_task(uuid,uuid,date,text,numeric,text)',
    'EXECUTE'
  ) or not has_function_privilege(
    'service_role',
    'public.complete_growth_goal(uuid,uuid,text,text,text)',
    'EXECUTE'
  ) then
    raise exception 'service_role must execute growth completion functions';
  end if;
end
$test$;

insert into goals (
  id, user_id, title, category, goal_type, life_area, metric_type
)
values
  (
    '61000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000001',
    '每周跑步', '运动', 'long_term', 'health', 'duration'
  ),
  (
    '61000000-0000-4000-8000-000000000002',
    '00000000-0000-4000-8000-000000000001',
    '通过认证考试', '考试', 'short_term', 'growth', 'milestone'
  );

insert into messages (
  id, user_id, source, raw_text, intent_type, confidence, parsed_json, status
)
values
  (
    '62000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000001',
    'app', '跑步 30 分钟', 'task', 1, '{}'::jsonb, 'processed'
  ),
  (
    '62000000-0000-4000-8000-000000000002',
    '00000000-0000-4000-8000-000000000001',
    'app', '买水', 'task', 1, '{}'::jsonb, 'processed'
  );

insert into tasks (
  id, user_id, goal_id, message_id, title, status,
  planned_metric_type, planned_value, planned_unit
)
values
  (
    '63000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000001',
    '61000000-0000-4000-8000-000000000001',
    '62000000-0000-4000-8000-000000000001',
    '跑步 30 分钟', 'open', 'duration', 30, 'minute'
  ),
  (
    '63000000-0000-4000-8000-000000000002',
    '00000000-0000-4000-8000-000000000001',
    null,
    '62000000-0000-4000-8000-000000000002',
    '买水', 'open', null, null, null
  );

do $test$
declare
  response jsonb;
  activity_id uuid;
begin
  response := complete_growth_task(
    '00000000-0000-4000-8000-000000000001',
    '63000000-0000-4000-8000-000000000001',
    '2026-08-13',
    null, null, null
  );
  activity_id := (response->>'activityId')::uuid;

  if activity_id is null
     or not exists (
       select 1 from activities
       where id = activity_id
         and goal_id = '61000000-0000-4000-8000-000000000001'
         and task_id = '63000000-0000-4000-8000-000000000001'
         and metric_type = 'duration'
         and value = 30
         and unit = 'minute'
     ) then
    raise exception 'goal task completion must create its activity: %', response;
  end if;

  response := complete_growth_task(
    '00000000-0000-4000-8000-000000000001',
    '63000000-0000-4000-8000-000000000002',
    '2026-08-13',
    null, null, null
  );

  if response->>'activityId' is not null
     or exists (
       select 1 from activities
       where task_id = '63000000-0000-4000-8000-000000000002'
     ) then
    raise exception 'one-off task completion must not create activity: %', response;
  end if;
end
$test$;

do $test$
declare
  response jsonb;
  achievement_id uuid;
begin
  response := complete_growth_goal(
    '00000000-0000-4000-8000-000000000001',
    '61000000-0000-4000-8000-000000000002',
    '认证通过',
    '一次完成',
    null
  );
  achievement_id := (response->>'achievementId')::uuid;

  if achievement_id is null
     or not exists (
       select 1 from achievements
       where id = achievement_id
         and short_goal_id = '61000000-0000-4000-8000-000000000002'
         and title = '认证通过'
     ) then
    raise exception 'short-term completion must create one achievement: %', response;
  end if;
end
$test$;

do $test$
begin
  insert into goals (
    user_id, title, category, goal_type, life_area, metric_type
  ) values (
    '00000000-0000-4000-8000-000000000001',
    '非法领域', 'invalid', 'long_term', 'unknown', 'count'
  );
  raise exception 'invalid life area must be rejected';
exception
  when check_violation then null;
end
$test$;

do $test$
begin
  insert into activities (
    user_id, goal_id, message_id, summary,
    metric_type, value, unit, occurred_on
  ) values (
    '00000000-0000-4000-8000-000000000001',
    '61000000-0000-4000-8000-000000000001',
    '62000000-0000-4000-8000-000000000001',
    'invalid zero',
    'duration', 0, 'minute', current_date
  );
  raise exception 'zero activity value must be rejected';
exception
  when check_violation then null;
end
$test$;

do $test$
begin
  insert into activities (
    user_id, goal_id, message_id, summary,
    metric_type, value, unit, occurred_on
  ) values (
    '00000000-0000-4000-8000-000000000001',
    '61000000-0000-4000-8000-000000000001',
    '62000000-0000-4000-8000-000000000001',
    'invalid unit',
    'duration', 1, 'count', current_date
  );
  raise exception 'duration count unit must be rejected';
exception
  when check_violation then null;
end
$test$;
