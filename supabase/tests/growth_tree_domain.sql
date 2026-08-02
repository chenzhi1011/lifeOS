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
  ) then
    raise exception 'service_role must execute complete_growth_task';
  end if;
  if has_function_privilege(
    'anon',
    'public.complete_growth_goal(uuid,uuid,text,text,text)',
    'EXECUTE'
  ) or has_function_privilege(
    'authenticated',
    'public.complete_growth_goal(uuid,uuid,text,text,text)',
    'EXECUTE'
  ) then
    raise exception 'client roles must not execute complete_growth_goal';
  end if;
  if not has_function_privilege(
    'service_role',
    'public.complete_growth_goal(uuid,uuid,text,text,text)',
    'EXECUTE'
  ) then
    raise exception 'service_role must execute complete_growth_goal';
  end if;
end
$test$;

insert into goals (
  id, user_id, title, category, goal_type, ability_id, metric_type
)
values
  (
    '61000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000001',
    '完成测试长期目标',
    'career',
    'long_term',
    '08000000-0000-4000-8000-000000000001',
    'duration'
  ),
  (
    '61000000-0000-4000-8000-000000000002',
    '00000000-0000-4000-8000-000000000001',
    '完成测试短期目标',
    'career',
    'short_term',
    null,
    'milestone'
  ),
  (
    '61000000-0000-4000-8000-000000000003',
    '00000000-0000-4000-8000-000000000002',
    '其他用户完成目标',
    'private',
    'long_term',
    '08000000-0000-4000-8000-000000000002',
    'count'
  ),
  (
    '61000000-0000-4000-8000-000000000004',
    '00000000-0000-4000-8000-000000000001',
    '完成测试计时短期目标',
    'career',
    'short_term',
    null,
    'duration'
  ),
  (
    '61000000-0000-4000-8000-000000000005',
    '00000000-0000-4000-8000-000000000001',
    '完成测试计数短期目标',
    'career',
    'short_term',
    null,
    'count'
  );

insert into messages (
  id, user_id, source, raw_text, intent_type, confidence, parsed_json, status
)
values
  ('62000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', 'app', 'actual metric task', 'task', 1, '{}'::jsonb, 'processed'),
  ('62000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000001', 'app', 'planned metric task', 'task', 1, '{}'::jsonb, 'processed'),
  ('62000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000001', 'app', 'fallback metric task', 'task', 1, '{}'::jsonb, 'processed'),
  ('62000000-0000-4000-8000-000000000004', '00000000-0000-4000-8000-000000000001', 'app', 'one off task', 'task', 1, '{}'::jsonb, 'processed'),
  ('62000000-0000-4000-8000-000000000005', '00000000-0000-4000-8000-000000000002', 'app', 'cross user task', 'task', 1, '{}'::jsonb, 'processed'),
  ('62000000-0000-4000-8000-000000000006', '00000000-0000-4000-8000-000000000001', 'app', 'invalid metric task', 'task', 1, '{}'::jsonb, 'processed');

insert into tasks (
  id, user_id, goal_id, message_id, title, status,
  planned_metric_type, planned_value, planned_unit
)
values
  ('63000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', '61000000-0000-4000-8000-000000000001', '62000000-0000-4000-8000-000000000001', '实际值优先', 'open', 'duration', 30, 'minute'),
  ('63000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000001', '61000000-0000-4000-8000-000000000001', '62000000-0000-4000-8000-000000000002', '计划值回退', 'open', 'duration', 25, 'minute'),
  ('63000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000001', '61000000-0000-4000-8000-000000000001', '62000000-0000-4000-8000-000000000003', '默认值回退', 'open', null, null, null),
  ('63000000-0000-4000-8000-000000000004', '00000000-0000-4000-8000-000000000001', null, '62000000-0000-4000-8000-000000000004', '买水', 'open', 'count', 1, 'count'),
  ('63000000-0000-4000-8000-000000000005', '00000000-0000-4000-8000-000000000002', '61000000-0000-4000-8000-000000000003', '62000000-0000-4000-8000-000000000005', '其他用户任务', 'open', 'count', 1, 'count'),
  ('63000000-0000-4000-8000-000000000006', '00000000-0000-4000-8000-000000000001', '61000000-0000-4000-8000-000000000001', '62000000-0000-4000-8000-000000000006', '校验失败任务', 'open', null, null, null);

do $test$
declare
  first_response jsonb;
  replay_response jsonb;
  activity_id uuid;
begin
  first_response := complete_growth_task(
    '00000000-0000-4000-8000-000000000001',
    '63000000-0000-4000-8000-000000000001',
    '2026-08-02',
    'count',
    5,
    'count'
  );
  activity_id := (first_response->>'activityId')::uuid;

  if first_response->>'taskId' <> '63000000-0000-4000-8000-000000000001'
     or first_response->>'status' <> 'completed'
     or first_response->>'duplicate' <> 'false'
     or activity_id is null then
    raise exception 'actual metric task result is invalid: %', first_response;
  end if;
  if not exists (
    select 1 from activities
    where id = activity_id
      and user_id = '00000000-0000-4000-8000-000000000001'
      and goal_id = '61000000-0000-4000-8000-000000000001'
      and task_id = '63000000-0000-4000-8000-000000000001'
      and message_id = '62000000-0000-4000-8000-000000000001'
      and metric_type = 'count'
      and value = 5
      and unit = 'count'
      and occurred_on = '2026-08-02'
  ) then
    raise exception 'actual metric must override planned metric';
  end if;

  replay_response := complete_growth_task(
    '00000000-0000-4000-8000-000000000001',
    '63000000-0000-4000-8000-000000000001',
    '2026-08-03',
    'duration',
    99,
    'minute'
  );
  if replay_response->>'duplicate' <> 'true'
     or replay_response->>'activityId' <> activity_id::text
     or (select count(*) from activities where task_id = '63000000-0000-4000-8000-000000000001') <> 1 then
    raise exception 'task replay must return the original unique activity: %', replay_response;
  end if;
end
$test$;

do $test$
declare
  first_response jsonb;
  count_response jsonb;
  replay_response jsonb;
  achievement_id uuid;
begin
  first_response := complete_growth_goal(
    '00000000-0000-4000-8000-000000000001',
    '61000000-0000-4000-8000-000000000004',
    '首次成果', '首次备注', 'https://example.com/first'
  );
  achievement_id := (first_response->>'achievementId')::uuid;
  if achievement_id is null or not exists (
    select 1 from achievements
    where id = achievement_id
      and metric_type = 'milestone'
      and threshold_value is null
  ) then
    raise exception 'short-term completion must always create a milestone achievement: %', first_response;
  end if;

  count_response := complete_growth_goal(
    '00000000-0000-4000-8000-000000000001',
    '61000000-0000-4000-8000-000000000005',
    null, null, null
  );
  if not exists (
    select 1 from achievements
    where id = (count_response->>'achievementId')::uuid
      and metric_type = 'milestone'
      and threshold_value is null
  ) then
    raise exception 'count short-term completion must create a milestone achievement: %', count_response;
  end if;

  replay_response := complete_growth_goal(
    '00000000-0000-4000-8000-000000000001',
    '61000000-0000-4000-8000-000000000004',
    '更新成果', '更新备注', 'https://example.com/updated'
  );
  if replay_response->>'duplicate' <> 'true'
     or replay_response->>'achievementId' <> achievement_id::text
     or (select count(*) from achievements where short_goal_id = '61000000-0000-4000-8000-000000000004') <> 1
     or not exists (
       select 1 from achievements
       where id = achievement_id
         and title = '更新成果'
         and metric_type = 'milestone'
         and threshold_value is null
         and note = '更新备注'
         and evidence_url = 'https://example.com/updated'
     ) then
    raise exception 'short-term replay must update the original achievement metadata: %', replay_response;
  end if;
end
$test$;

do $test$
declare
  planned_response jsonb;
  fallback_response jsonb;
begin
  planned_response := complete_growth_task(
    '00000000-0000-4000-8000-000000000001',
    '63000000-0000-4000-8000-000000000002',
    '2026-08-02',
    null, null, null
  );
  if not exists (
    select 1 from activities
    where id = (planned_response->>'activityId')::uuid
      and metric_type = 'duration'
      and value = 25
      and unit = 'minute'
  ) then
    raise exception 'planned metric must be the second completion priority';
  end if;

  fallback_response := complete_growth_task(
    '00000000-0000-4000-8000-000000000001',
    '63000000-0000-4000-8000-000000000003',
    '2026-08-02',
    null, null, null
  );
  if not exists (
    select 1 from activities
    where id = (fallback_response->>'activityId')::uuid
      and metric_type = 'count'
      and value = 1
      and unit = 'count'
  ) then
    raise exception 'count=1 must be the final completion fallback';
  end if;
end
$test$;

do $test$
declare
  response jsonb;
begin
  response := complete_growth_task(
    '00000000-0000-4000-8000-000000000001',
    '63000000-0000-4000-8000-000000000004',
    '2026-08-02',
    null, null, null
  );
  if response->>'status' <> 'completed'
     or response->'activityId' <> 'null'::jsonb
     or exists (select 1 from activities where task_id = '63000000-0000-4000-8000-000000000004')
     or not exists (
       select 1 from tasks
       where id = '63000000-0000-4000-8000-000000000004'
         and status = 'completed'
         and completed_at is not null
     ) then
    raise exception 'one-off completion must not create an activity: %', response;
  end if;
end
$test$;

do $test$
declare
  failed boolean := false;
begin
  begin
    perform complete_growth_task(
      '00000000-0000-4000-8000-000000000001',
      '63000000-0000-4000-8000-000000000006',
      null,
      'duration', 10, 'minute'
    );
  exception when others then
    if position('occurredOn is required' in sqlerrm) = 0 then
      raise;
    end if;
    failed := true;
  end;
  if not failed or not exists (
    select 1 from tasks
    where id = '63000000-0000-4000-8000-000000000006'
      and status = 'open'
      and completed_at is null
  ) then
    raise exception 'null occurredOn must fail without completing the task';
  end if;

  failed := false;
  begin
    perform complete_growth_task(
      '00000000-0000-4000-8000-000000000001',
      '63000000-0000-4000-8000-000000000006',
      '2026-08-02',
      'duration', null, 'minute'
    );
  exception when others then
    if position('actual metric requires type, value, and unit together' in sqlerrm) = 0 then
      raise;
    end if;
    failed := true;
  end;
  if not failed or not exists (
    select 1 from tasks
    where id = '63000000-0000-4000-8000-000000000006'
      and status = 'open'
      and completed_at is null
  ) then
    raise exception 'partial actual metric must fail without completing the task';
  end if;
end
$test$;

do $test$
declare
  task_count_before bigint;
  activity_count_before bigint;
  failed boolean := false;
begin
  select count(*) into task_count_before from tasks;
  select count(*) into activity_count_before from activities;
  begin
    perform complete_growth_task(
      '00000000-0000-4000-8000-000000000001',
      '63000000-0000-4000-8000-000000000005',
      '2026-08-02',
      null, null, null
    );
  exception when others then
    if position('task does not belong to user' in sqlerrm) = 0 then
      raise;
    end if;
    failed := true;
  end;
  if not failed
     or (select count(*) from tasks) <> task_count_before
     or (select count(*) from activities) <> activity_count_before
     or not exists (
       select 1 from tasks
       where id = '63000000-0000-4000-8000-000000000005'
         and user_id = '00000000-0000-4000-8000-000000000002'
         and status = 'open'
     ) then
    raise exception 'cross-user task completion must roll back';
  end if;
end
$test$;

do $test$
declare
  first_response jsonb;
  replay_response jsonb;
begin
  first_response := complete_growth_goal(
    '00000000-0000-4000-8000-000000000001',
    '61000000-0000-4000-8000-000000000001',
    null, null, null
  );
  if first_response->>'status' <> 'completed'
     or first_response->>'duplicate' <> 'false'
     or first_response->'achievementId' <> 'null'::jsonb
     or not exists (
       select 1 from goals
       where id = '61000000-0000-4000-8000-000000000001'
         and status = 'completed'
         and completed_at is not null
     ) then
    raise exception 'long-term completion must not create an achievement: %', first_response;
  end if;

  replay_response := complete_growth_goal(
    '00000000-0000-4000-8000-000000000001',
    '61000000-0000-4000-8000-000000000001',
    'ignored', 'ignored', 'https://example.com/ignored'
  );
  if replay_response->>'duplicate' <> 'true'
     or replay_response->'achievementId' <> 'null'::jsonb
     or exists (
       select 1 from achievements
       where short_goal_id = '61000000-0000-4000-8000-000000000001'
     ) then
    raise exception 'long-term replay must stay achievement-free: %', replay_response;
  end if;
end
$test$;

do $test$
declare
  first_response jsonb;
  replay_response jsonb;
  achievement_id uuid;
begin
  first_response := complete_growth_goal(
    '00000000-0000-4000-8000-000000000001',
    '61000000-0000-4000-8000-000000000002',
    null,
    '完成短期目标',
    'https://example.com/evidence'
  );
  achievement_id := (first_response->>'achievementId')::uuid;
  if first_response->>'duplicate' <> 'false'
     or achievement_id is null
     or not exists (
       select 1 from achievements
       where id = achievement_id
         and user_id = '00000000-0000-4000-8000-000000000001'
         and short_goal_id = '61000000-0000-4000-8000-000000000002'
         and title = '完成测试短期目标'
         and metric_type = 'milestone'
         and note = '完成短期目标'
         and evidence_url = 'https://example.com/evidence'
     ) then
    raise exception 'short-term completion must create the fallback-title achievement: %', first_response;
  end if;

  replay_response := complete_growth_goal(
    '00000000-0000-4000-8000-000000000001',
    '61000000-0000-4000-8000-000000000002',
    'new title', 'new note', 'https://example.com/new'
  );
  if replay_response->>'duplicate' <> 'true'
     or replay_response->>'achievementId' <> achievement_id::text
     or (select count(*) from achievements where short_goal_id = '61000000-0000-4000-8000-000000000002') <> 1 then
    raise exception 'short-term replay must reuse one achievement: %', replay_response;
  end if;
end
$test$;

do $test$
declare
  goal_count_before bigint;
  achievement_count_before bigint;
  failed boolean := false;
begin
  select count(*) into goal_count_before from goals;
  select count(*) into achievement_count_before from achievements;
  begin
    perform complete_growth_goal(
      '00000000-0000-4000-8000-000000000001',
      '61000000-0000-4000-8000-000000000003',
      null, null, null
    );
  exception when others then
    if position('goal does not belong to user' in sqlerrm) = 0 then
      raise;
    end if;
    failed := true;
  end;
  if not failed
     or (select count(*) from goals) <> goal_count_before
     or (select count(*) from achievements) <> achievement_count_before
     or not exists (
       select 1 from goals
       where id = '61000000-0000-4000-8000-000000000003'
         and user_id = '00000000-0000-4000-8000-000000000002'
         and status = 'active'
         and completed_at is null
     ) then
    raise exception 'cross-user goal completion must roll back';
  end if;
end
$test$;

select 'growth completion SQL behavior tests passed' as result;
