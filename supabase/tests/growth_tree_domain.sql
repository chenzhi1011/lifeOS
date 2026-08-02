\set ON_ERROR_STOP on

do $test$
begin
  if has_function_privilege(
    'anon',
    'public.apply_growth_model_mapping(jsonb,jsonb)',
    'EXECUTE'
  ) or has_function_privilege(
    'authenticated',
    'public.apply_growth_model_mapping(jsonb,jsonb)',
    'EXECUTE'
  ) then
    raise exception 'client roles must not execute apply_growth_model_mapping';
  end if;
  if not has_function_privilege(
    'service_role',
    'public.apply_growth_model_mapping(jsonb,jsonb)',
    'EXECUTE'
  ) then
    raise exception 'service_role must execute apply_growth_model_mapping';
  end if;
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

insert into auth.users (id)
values ('00000000-0000-4000-8000-000000000003');

insert into profiles (user_id, display_name)
values ('00000000-0000-4000-8000-000000000003', 'mapping test user');

insert into abilities (id, user_id, title, status, archived_at)
values
  (
    '58000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000003',
    'Legacy Ability', 'active', null
  ),
  (
    '58000000-0000-4000-8000-000000000002',
    '00000000-0000-4000-8000-000000000003',
    'Mapped Ability', 'archived', now()
  );

insert into goals (
  id, user_id, title, category, goal_type, ability_id, metric_type
)
values
  (
    '59000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000003',
    'Mapping Goal A', 'test', 'long_term',
    '58000000-0000-4000-8000-000000000001', 'count'
  ),
  (
    '59000000-0000-4000-8000-000000000002',
    '00000000-0000-4000-8000-000000000003',
    'Mapping Goal B', 'test', 'short_term', null, 'milestone'
  ),
  (
    '59000000-0000-4000-8000-000000000003',
    '00000000-0000-4000-8000-000000000003',
    'Mapping Goal C', 'test', 'long_term',
    '58000000-0000-4000-8000-000000000001', 'milestone'
  );

insert into messages (
  id, user_id, source, raw_text, intent_type, confidence, parsed_json, status
)
values
  (
    '5a000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000003',
    'app', 'mapping task one', 'task', 1, '{}'::jsonb, 'processed'
  ),
  (
    '5a000000-0000-4000-8000-000000000002',
    '00000000-0000-4000-8000-000000000003',
    'app', 'mapping task two', 'task', 1, '{}'::jsonb, 'processed'
  ),
  (
    '5a000000-0000-4000-8000-000000000003',
    '00000000-0000-4000-8000-000000000003',
    'app', 'mapping activity', 'activity', 1, '{}'::jsonb, 'processed'
  );

insert into tasks (id, user_id, goal_id, message_id, title)
values
  (
    '5b000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000003',
    '59000000-0000-4000-8000-000000000002',
    '5a000000-0000-4000-8000-000000000001', 'Mapping one-off'
  ),
  (
    '5b000000-0000-4000-8000-000000000002',
    '00000000-0000-4000-8000-000000000003',
    '59000000-0000-4000-8000-000000000002',
    '5a000000-0000-4000-8000-000000000002', 'Mapping redirect'
  );

insert into activities (
  id, user_id, goal_id, message_id, summary,
  metric_type, value, unit, occurred_on
)
values (
  '5c000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000003',
  '59000000-0000-4000-8000-000000000002',
  '5a000000-0000-4000-8000-000000000003', 'Mapping activity',
  'count', 1, 'count', '2026-08-02'
);

alter table achievements alter column short_goal_id drop not null;
alter table achievements disable trigger achievements_short_goal_guard;

insert into achievements (
  id, user_id, short_goal_id, title, metric_type, achieved_at
)
values (
  '5d000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000003',
  null,
  'Mapping harvest', 'milestone', now()
);

alter table achievements enable trigger achievements_short_goal_guard;

create or replace function fail_growth_mapping_achievement_update()
returns trigger
language plpgsql
as $function$
begin
  raise exception 'forced achievement mapping failure';
end
$function$;

do $test$
declare
  mapping jsonb := jsonb_build_object(
    'userId', '00000000-0000-4000-8000-000000000003',
    'goals', jsonb_build_array(
      jsonb_build_object(
        'legacyGoalId', '59000000-0000-4000-8000-000000000001',
        'goalType', 'long_term', 'abilityTitle', 'Mapped Ability'
      ),
      jsonb_build_object(
        'legacyGoalId', '59000000-0000-4000-8000-000000000002',
        'goalType', 'long_term', 'abilityTitle', 'Outcome Ability'
      ),
      jsonb_build_object(
        'legacyGoalId', '59000000-0000-4000-8000-000000000003',
        'goalType', 'short_term'
      )
    ),
    'taskOverrides', jsonb_build_array(
      jsonb_build_object(
        'taskId', '5b000000-0000-4000-8000-000000000001',
        'target', jsonb_build_object('kind', 'one_off')
      ),
      jsonb_build_object(
        'taskId', '5b000000-0000-4000-8000-000000000002',
        'target', jsonb_build_object(
          'kind', 'goal',
          'targetGoalId', '59000000-0000-4000-8000-000000000001'
        )
      )
    ),
    'activityOverrides', jsonb_build_array(
      jsonb_build_object(
        'activityId', '5c000000-0000-4000-8000-000000000001',
        'targetGoalId', '59000000-0000-4000-8000-000000000001'
      )
    ),
    'achievementOverrides', jsonb_build_array(
      jsonb_build_object(
        'achievementId', '5d000000-0000-4000-8000-000000000001',
        'targetGoalId', '59000000-0000-4000-8000-000000000003'
      )
    )
  );
  expected_snapshot jsonb := jsonb_build_object(
    'expectedProfileIds', jsonb_build_array(
      '00000000-0000-4000-8000-000000000003'
    ),
    'expectedGoalIds', jsonb_build_array(
      '59000000-0000-4000-8000-000000000001',
      '59000000-0000-4000-8000-000000000002',
      '59000000-0000-4000-8000-000000000003'
    ),
    'expectedTaskIds', jsonb_build_array(
      '5b000000-0000-4000-8000-000000000001',
      '5b000000-0000-4000-8000-000000000002'
    ),
    'expectedActivityIds', jsonb_build_array(
      '5c000000-0000-4000-8000-000000000001'
    ),
    'expectedAchievementIds', jsonb_build_array(
      '5d000000-0000-4000-8000-000000000001'
    ),
    'counts', jsonb_build_object(
      'profiles', 1, 'goals', 3, 'tasks', 2,
      'activities', 1, 'achievements', 1
    )
  );
  failed boolean := false;
  result jsonb;
begin
  begin
    perform apply_growth_model_mapping(
      mapping #- '{goals,0,goalType}',
      expected_snapshot
    );
    raise exception 'missing goalType mapping was accepted';
  exception when others then
    if sqlerrm = 'missing goalType mapping was accepted' then
      raise;
    end if;
    if position('invalid goal classification' in sqlerrm) = 0 then
      raise;
    end if;
  end;

  begin
    perform apply_growth_model_mapping(
      mapping #- '{taskOverrides,0,target,kind}',
      expected_snapshot
    );
    raise exception 'missing task target kind was accepted';
  exception when others then
    if sqlerrm = 'missing task target kind was accepted' then
      raise;
    end if;
    if position('invalid task target' in sqlerrm) = 0 then
      raise;
    end if;
  end;

  begin
    perform apply_growth_model_mapping(
      mapping,
      expected_snapshot #- '{counts,goals}'
    );
    raise exception 'missing expected goal count was accepted';
  exception when others then
    if sqlerrm = 'missing expected goal count was accepted' then
      raise;
    end if;
    if position('expected snapshot counts' in sqlerrm) = 0 then
      raise;
    end if;
  end;

  begin
    perform apply_growth_model_mapping(
      jsonb_set(
        mapping,
        '{taskOverrides,1,target,targetGoalId}',
        '"61000000-0000-4000-8000-000000000003"'::jsonb
      ),
      expected_snapshot
    );
    raise exception 'cross-user target was accepted';
  exception when others then
    if sqlerrm = 'cross-user target was accepted' then
      raise;
    end if;
    if position('invalid task target' in sqlerrm) = 0 then
      raise;
    end if;
  end;

  execute 'create trigger zz_mapping_failure_guard before update on achievements for each row execute function fail_growth_mapping_achievement_update()';
  failed := false;
  begin
    perform apply_growth_model_mapping(mapping, expected_snapshot);
  exception when others then
    if position('forced achievement mapping failure' in sqlerrm) = 0 then
      raise;
    end if;
    failed := true;
  end;
  if not failed
     or not exists (
       select 1 from abilities
       where id = '58000000-0000-4000-8000-000000000002'
         and status = 'archived' and archived_at is not null
     )
     or exists (
       select 1 from abilities
       where user_id = '00000000-0000-4000-8000-000000000003'
         and title = 'Outcome Ability'
     )
     or not exists (
       select 1 from goals
       where id = '59000000-0000-4000-8000-000000000003'
         and goal_type = 'long_term'
         and ability_id = '58000000-0000-4000-8000-000000000001'
     )
     or not exists (
       select 1 from tasks
       where id = '5b000000-0000-4000-8000-000000000001'
         and goal_id = '59000000-0000-4000-8000-000000000002'
     )
     or not exists (
       select 1 from activities
       where id = '5c000000-0000-4000-8000-000000000001'
         and goal_id = '59000000-0000-4000-8000-000000000002'
     )
     or not exists (
       select 1 from achievements
       where id = '5d000000-0000-4000-8000-000000000001'
         and short_goal_id is null
     ) then
    raise exception 'late achievement failure must roll back prior mapping writes';
  end if;
  execute 'drop trigger zz_mapping_failure_guard on achievements';

  failed := false;
  begin
    perform apply_growth_model_mapping(
      mapping,
      jsonb_set(expected_snapshot, '{counts,goals}', '4'::jsonb)
    );
  exception when others then
    if position('snapshot mismatch' in sqlerrm) = 0 then
      raise;
    end if;
    failed := true;
  end;

  if not failed
     or exists (
       select 1 from abilities
       where user_id = '00000000-0000-4000-8000-000000000003'
         and title = 'Outcome Ability'
     )
     or not exists (
       select 1 from goals
       where id = '59000000-0000-4000-8000-000000000002'
         and goal_type = 'short_term' and ability_id is null
     )
     or not exists (
       select 1 from tasks
       where id = '5b000000-0000-4000-8000-000000000001'
         and goal_id = '59000000-0000-4000-8000-000000000002'
     )
     or not exists (
       select 1 from activities
       where id = '5c000000-0000-4000-8000-000000000001'
         and goal_id = '59000000-0000-4000-8000-000000000002'
     )
     or not exists (
       select 1 from achievements
       where id = '5d000000-0000-4000-8000-000000000001'
         and short_goal_id is null
     ) then
    raise exception 'snapshot mismatch must leave all mapping entities unchanged';
  end if;

  result := apply_growth_model_mapping(mapping, expected_snapshot);
  if result->>'applied' <> 'true'
     or not exists (
       select 1 from goals goal join abilities ability on ability.id = goal.ability_id
       where goal.id = '59000000-0000-4000-8000-000000000001'
         and goal.goal_type = 'long_term' and ability.title = 'Mapped Ability'
     )
     or not exists (
       select 1 from goals goal join abilities ability on ability.id = goal.ability_id
       where goal.id = '59000000-0000-4000-8000-000000000002'
         and goal.goal_type = 'long_term' and ability.title = 'Outcome Ability'
     )
     or not exists (
       select 1 from goals
       where id = '59000000-0000-4000-8000-000000000003'
         and goal_type = 'short_term' and ability_id is null
     )
     or not exists (
       select 1 from tasks
       where id = '5b000000-0000-4000-8000-000000000001' and goal_id is null
     )
     or not exists (
       select 1 from tasks
       where id = '5b000000-0000-4000-8000-000000000002'
         and goal_id = '59000000-0000-4000-8000-000000000001'
     )
     or not exists (
       select 1 from activities
       where id = '5c000000-0000-4000-8000-000000000001'
         and goal_id = '59000000-0000-4000-8000-000000000001'
     )
     or not exists (
       select 1 from achievements
       where id = '5d000000-0000-4000-8000-000000000001'
         and short_goal_id = '59000000-0000-4000-8000-000000000003'
     )
     or not exists (
       select 1 from abilities
       where id = '58000000-0000-4000-8000-000000000002'
         and title = 'Mapped Ability'
         and status = 'active'
         and archived_at is null
     )
     or (
       select count(*) from abilities
       where user_id = '00000000-0000-4000-8000-000000000003'
         and title in ('Mapped Ability', 'Outcome Ability')
     ) <> 2 then
    raise exception 'complete mapping must update goals, tasks, activities, achievements, and ability upserts together: %', result;
  end if;

  result := apply_growth_model_mapping(mapping, expected_snapshot);
  if result->>'applied' <> 'true'
     or (
       select count(*) from abilities
       where user_id = '00000000-0000-4000-8000-000000000003'
         and title in ('Mapped Ability', 'Outcome Ability')
     ) <> 2
     or not exists (
       select 1 from achievements
       where id = '5d000000-0000-4000-8000-000000000001'
         and short_goal_id = '59000000-0000-4000-8000-000000000003'
     ) then
    raise exception 'reapplying the same complete mapping must be idempotent: %', result;
  end if;
end
$test$;

drop function fail_growth_mapping_achievement_update();

select 'growth completion SQL behavior tests passed' as result;
