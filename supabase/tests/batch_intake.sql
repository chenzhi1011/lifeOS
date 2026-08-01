\set ON_ERROR_STOP on

do $test$
begin
  if has_function_privilege(
    'anon',
    'public.record_life_event_batch(uuid,text,text,text,jsonb)',
    'EXECUTE'
  ) then
    raise exception 'anon must not execute record_life_event_batch';
  end if;
  if has_function_privilege(
    'authenticated',
    'public.record_life_event_batch(uuid,text,text,text,jsonb)',
    'EXECUTE'
  ) then
    raise exception 'authenticated must not execute record_life_event_batch';
  end if;
  if not has_function_privilege(
    'service_role',
    'public.record_life_event_batch(uuid,text,text,text,jsonb)',
    'EXECUTE'
  ) then
    raise exception 'service_role must execute record_life_event_batch';
  end if;
end
$test$;

insert into auth.users (id)
values
  ('00000000-0000-4000-8000-000000000001'),
  ('00000000-0000-4000-8000-000000000002');

insert into profiles (user_id, display_name)
values
  ('00000000-0000-4000-8000-000000000001', 'User A'),
  ('00000000-0000-4000-8000-000000000002', 'User B');

insert into abilities (id, user_id, title)
values
  (
    '08000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000001',
    '持续成长'
  ),
  (
    '08000000-0000-4000-8000-000000000002',
    '00000000-0000-4000-8000-000000000002',
    '个人成长'
  );

insert into goals (
  id,
  user_id,
  title,
  category,
  goal_type,
  ability_id,
  metric_type
)
values
  (
    '10000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000001',
    'AWS',
    'career',
    'long_term',
    '08000000-0000-4000-8000-000000000001',
    'count'
  ),
  (
    '10000000-0000-4000-8000-000000000002',
    '00000000-0000-4000-8000-000000000001',
    '增肌',
    'health',
    'long_term',
    '08000000-0000-4000-8000-000000000001',
    'count'
  ),
  (
    '10000000-0000-4000-8000-000000000003',
    '00000000-0000-4000-8000-000000000002',
    'private goal',
    'private',
    'long_term',
    '08000000-0000-4000-8000-000000000002',
    'count'
  );

insert into messages (
  id,
  user_id,
  source,
  raw_text,
  intent_type,
  confidence,
  parsed_json,
  status
)
values (
  '20000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000001',
  'app',
  '今天练肩',
  'task',
  1,
  '{}'::jsonb,
  'processed'
);

insert into tasks (
  id,
  user_id,
  goal_id,
  message_id,
  title,
  status,
  due_at
)
values (
  '30000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000002',
  '20000000-0000-4000-8000-000000000001',
  '练肩',
  'open',
  '2026-07-28T09:00:00+09:00'
);

do $test$
declare
  first_response jsonb;
  replay_response jsonb;
  conflict_response jsonb;
begin
  first_response := record_life_event_batch(
    '00000000-0000-4000-8000-000000000001',
    'batch-main',
    'hash-main',
    '明天学习 AWS；今天练肩了',
    jsonb_build_array(
      jsonb_build_object(
        'kind', 'task',
        'title', '学习 AWS',
        'goalId', '10000000-0000-4000-8000-000000000001',
        'dueAt', '2026-07-29T09:00:00+09:00',
        'remindAt', '2026-07-29T09:00:00+09:00',
        'priority', 'normal',
        'confidence', 0.98
      ),
      jsonb_build_object(
        'kind', 'activity',
        'summary', '练肩',
        'goalId', '10000000-0000-4000-8000-000000000002',
        'matchedTaskId', '30000000-0000-4000-8000-000000000001',
        'metricType', 'count',
        'value', 1,
        'unit', 'count',
        'occurredOn', '2026-07-28',
        'confidence', 0.96
      )
    )
  );

  if first_response->>'duplicate' <> 'false' then
    raise exception 'first response must not be a duplicate: %', first_response;
  end if;
  if jsonb_array_length(first_response->'results') <> 2 then
    raise exception 'first response must contain two results: %', first_response;
  end if;
  if first_response#>>'{results,0,eventIndex}' <> '0'
     or first_response#>>'{results,1,eventIndex}' <> '1' then
    raise exception 'event results must preserve input order: %', first_response;
  end if;
  if (select count(*) from action_batches where user_id = '00000000-0000-4000-8000-000000000001') <> 1 then
    raise exception 'expected one action batch';
  end if;
  if (select count(*) from messages where batch_id = (first_response->>'batchId')::uuid) <> 2 then
    raise exception 'expected two batch messages';
  end if;
  if (select count(*) from tasks where user_id = '00000000-0000-4000-8000-000000000001') <> 2 then
    raise exception 'expected the old task and one new task';
  end if;
  if (select count(*) from reminders where user_id = '00000000-0000-4000-8000-000000000001') <> 1 then
    raise exception 'expected one reminder';
  end if;
  if not exists (
    select 1
    from activities
    where user_id = '00000000-0000-4000-8000-000000000001'
      and task_id = '30000000-0000-4000-8000-000000000001'
  ) then
    raise exception 'expected an activity linked to the old task';
  end if;
  if not exists (
    select 1
    from tasks
    where id = '30000000-0000-4000-8000-000000000001'
      and status = 'completed'
      and completed_at is not null
  ) then
    raise exception 'expected the matched old task to be completed';
  end if;

  replay_response := record_life_event_batch(
    '00000000-0000-4000-8000-000000000001',
    'batch-main',
    'hash-main',
    '明天学习 AWS；今天练肩了',
    jsonb_build_array(
      jsonb_build_object(
        'kind', 'task',
        'title', 'ignored on replay',
        'goalId', '10000000-0000-4000-8000-000000000001',
        'dueAt', '2026-07-30T09:00:00+09:00',
        'remindAt', '2026-07-30T09:00:00+09:00',
        'priority', 'normal',
        'confidence', 0.9
      )
    )
  );

  if replay_response->>'duplicate' <> 'true'
     or replay_response->>'batchId' <> first_response->>'batchId' then
    raise exception 'same hash replay must return cached batch as duplicate: %', replay_response;
  end if;
  if (select count(*) from tasks where user_id = '00000000-0000-4000-8000-000000000001') <> 2
     or (select count(*) from reminders where user_id = '00000000-0000-4000-8000-000000000001') <> 1
     or (select count(*) from activities where user_id = '00000000-0000-4000-8000-000000000001') <> 1 then
    raise exception 'idempotent replay created duplicate entities';
  end if;

  conflict_response := record_life_event_batch(
    '00000000-0000-4000-8000-000000000001',
    'batch-main',
    'different-hash',
    'changed content',
    jsonb_build_array(
      jsonb_build_object(
        'kind', 'task',
        'title', 'changed',
        'goalId', null,
        'dueAt', '2026-07-30T09:00:00+09:00',
        'remindAt', '2026-07-30T09:00:00+09:00',
        'priority', 'normal',
        'confidence', 0.9
      )
    )
  );
  if conflict_response <> '{"error":"idempotency_conflict","duplicate":false}'::jsonb then
    raise exception 'changed hash must return idempotency conflict: %', conflict_response;
  end if;
end
$test$;

insert into messages (
  id,
  user_id,
  source,
  raw_text,
  intent_type,
  confidence,
  parsed_json,
  status
)
values (
  '20000000-0000-4000-8000-000000000002',
  '00000000-0000-4000-8000-000000000001',
  'app',
  '复习增肌计划',
  'task',
  1,
  '{}'::jsonb,
  'processed'
);

insert into tasks (
  id,
  user_id,
  goal_id,
  message_id,
  title,
  status,
  due_at
)
values (
  '30000000-0000-4000-8000-000000000002',
  '00000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000002',
  '20000000-0000-4000-8000-000000000002',
  '复习增肌计划',
  'open',
  '2026-07-29T09:00:00+09:00'
);

do $test$
declare
  batch_count_before bigint;
  message_count_before bigint;
  activity_count_before bigint;
  failed boolean := false;
begin
  select count(*) into batch_count_before from action_batches;
  select count(*) into message_count_before from messages;
  select count(*) into activity_count_before from activities;

  begin
    perform record_life_event_batch(
      '00000000-0000-4000-8000-000000000001',
      'batch-cross-goal-task',
      'hash-cross-goal-task',
      'attempt cross-goal task match',
      jsonb_build_array(
        jsonb_build_object(
          'kind', 'activity',
          'summary', '完成 AWS 学习',
          'goalId', '10000000-0000-4000-8000-000000000001',
          'matchedTaskId', '30000000-0000-4000-8000-000000000002',
          'metricType', 'count',
          'value', 1,
          'unit', 'count',
          'occurredOn', '2026-07-28',
          'confidence', 0.95
        )
      )
    );
  exception
    when others then
      failed := true;
  end;

  if not failed then
    raise exception 'cross-goal matched task must fail';
  end if;
  if (select count(*) from action_batches) <> batch_count_before
     or (select count(*) from messages) <> message_count_before
     or (select count(*) from activities) <> activity_count_before then
    raise exception 'failed cross-goal task match must roll back batch, messages, and activity';
  end if;
  if not exists (
    select 1
    from tasks
    where id = '30000000-0000-4000-8000-000000000002'
      and user_id = '00000000-0000-4000-8000-000000000001'
      and goal_id = '10000000-0000-4000-8000-000000000002'
      and status = 'open'
      and completed_at is null
  ) then
    raise exception 'cross-goal task must remain open';
  end if;
end
$test$;

do $test$
declare
  response jsonb;
  family_goal_id uuid;
begin
  response := record_life_event_batch(
    '00000000-0000-4000-8000-000000000001',
    'batch-family',
    'hash-family',
    '建立家庭目标，然后买菜',
    jsonb_build_array(
      jsonb_build_object(
        'kind', 'goal',
        'title', '家庭',
        'category', 'life',
        'parentGoalId', null,
        'goalType', 'short_term',
        'metricType', 'count',
        'aliases', jsonb_build_array('家'),
        'confidence', 0.99
      ),
      jsonb_build_object(
        'kind', 'task',
        'title', '买菜',
        'goalId', null,
        'goalTitle', '家庭',
        'dueAt', '2026-07-29T09:00:00+09:00',
        'remindAt', '2026-07-29T09:00:00+09:00',
        'priority', 'normal',
        'confidence', 0.95
      )
    )
  );

  select id into family_goal_id
  from goals
  where user_id = '00000000-0000-4000-8000-000000000001'
    and title = '家庭';

  if family_goal_id is null then
    raise exception 'same-batch goal was not created';
  end if;
  if not exists (
    select 1 from tasks
    where user_id = '00000000-0000-4000-8000-000000000001'
      and title = '买菜'
      and goal_id = family_goal_id
  ) then
    raise exception 'same-batch task did not resolve goalTitle';
  end if;
  if response#>>'{results,0,eventIndex}' <> '0'
     or response#>>'{results,1,eventIndex}' <> '1' then
    raise exception 'same-batch result ordering was not preserved: %', response;
  end if;
end
$test$;

do $test$
declare
  batch_count_before bigint;
  failed boolean := false;
begin
  select count(*) into batch_count_before from action_batches;

  begin
    perform record_life_event_batch(
      '00000000-0000-4000-8000-000000000001',
      'batch-cross-user',
      'hash-cross-user',
      'attempt cross-user reference',
      jsonb_build_array(
        jsonb_build_object(
          'kind', 'task',
          'title', 'must rollback',
          'goalId', '10000000-0000-4000-8000-000000000003',
          'dueAt', '2026-07-29T09:00:00+09:00',
          'remindAt', '2026-07-29T09:00:00+09:00',
          'priority', 'normal',
          'confidence', 0.9
        )
      )
    );
  exception
    when others then
      failed := true;
  end;

  if not failed then
    raise exception 'cross-user goal reference must fail';
  end if;
  if (select count(*) from action_batches) <> batch_count_before then
    raise exception 'failed cross-user batch must roll back action_batches';
  end if;
  if exists (
    select 1 from tasks
    where user_id = '00000000-0000-4000-8000-000000000001'
      and title = 'must rollback'
  ) then
    raise exception 'failed cross-user batch must roll back entities';
  end if;
end
$test$;

do $test$
declare
  response jsonb;
  music_ability_id uuid;
  piano_goal_id uuid;
begin
  response := record_life_event_batch(
    '00000000-0000-4000-8000-000000000001',
    'batch-growth-paths',
    'hash-growth-paths',
    '培养音乐能力，开始练琴；同时买水',
    jsonb_build_array(
      jsonb_build_object(
        'kind', 'ability',
        'title', '音乐能力',
        'confidence', 0.99
      ),
      jsonb_build_object(
        'kind', 'goal',
        'title', '练琴',
        'category', 'interest',
        'goalType', 'long_term',
        'abilityId', null,
        'abilityTitle', '音乐能力',
        'metricType', 'duration',
        'aliases', jsonb_build_array('钢琴'),
        'confidence', 0.98
      ),
      jsonb_build_object(
        'kind', 'task',
        'title', '练琴 40 分钟',
        'goalId', null,
        'goalTitle', '练琴',
        'dueAt', '2026-07-30T09:00:00+09:00',
        'remindAt', '2026-07-30T09:00:00+09:00',
        'priority', 'normal',
        'plannedMetricType', 'duration',
        'plannedValue', 40,
        'plannedUnit', 'minute',
        'confidence', 0.97
      ),
      jsonb_build_object(
        'kind', 'task',
        'title', '买水',
        'goalId', null,
        'dueAt', '2026-07-30T09:00:00+09:00',
        'remindAt', '2026-07-30T09:00:00+09:00',
        'priority', 'normal',
        'plannedMetricType', null,
        'plannedValue', null,
        'plannedUnit', null,
        'confidence', 0.96
      )
    )
  );

  select id into music_ability_id
  from abilities
  where user_id = '00000000-0000-4000-8000-000000000001'
    and title = '音乐能力'
    and status = 'active';

  select id into piano_goal_id
  from goals
  where user_id = '00000000-0000-4000-8000-000000000001'
    and title = '练琴'
    and goal_type = 'long_term'
    and ability_id = music_ability_id;

  if music_ability_id is null or piano_goal_id is null then
    raise exception 'same-batch ability and typed goal were not persisted';
  end if;
  if response#>>'{results,0,kind}' <> 'ability'
     or response#>>'{results,0,abilityId}' <> music_ability_id::text then
    raise exception 'ability result must include abilityId: %', response;
  end if;
  if response#>>'{results,1,goalId}' <> piano_goal_id::text then
    raise exception 'typed goal result must include goalId: %', response;
  end if;
  if not exists (
    select 1 from tasks
    where user_id = '00000000-0000-4000-8000-000000000001'
      and title = '练琴 40 分钟'
      and goal_id = piano_goal_id
      and planned_metric_type = 'duration'
      and planned_value = 40
      and planned_unit = 'minute'
  ) then
    raise exception 'goal-path task did not persist its planned metric';
  end if;
  if not exists (
    select 1 from tasks
    where user_id = '00000000-0000-4000-8000-000000000001'
      and title = '买水'
      and goal_id is null
      and planned_metric_type is null
      and planned_value is null
      and planned_unit is null
  ) then
    raise exception 'one-off task must remain outside goals';
  end if;
end
$test$;

do $test$
declare
  batch_count_before bigint;
  message_count_before bigint;
  goal_count_before bigint;
  failed boolean := false;
begin
  select count(*) into batch_count_before from action_batches;
  select count(*) into message_count_before from messages;
  select count(*) into goal_count_before from goals;

  begin
    perform record_life_event_batch(
      '00000000-0000-4000-8000-000000000001',
      'batch-short-goal-ability',
      'hash-short-goal-ability',
      'invalid short goal ability',
      jsonb_build_array(
        jsonb_build_object(
          'kind', 'goal',
          'title', '错误短期目标',
          'category', 'career',
          'goalType', 'short_term',
          'abilityId', '08000000-0000-4000-8000-000000000001',
          'metricType', 'count',
          'aliases', '[]'::jsonb,
          'confidence', 0.99
        )
      )
    );
  exception
    when others then
      failed := true;
  end;

  if not failed then
    raise exception 'short_term goal with ability must fail';
  end if;
  if (select count(*) from action_batches) <> batch_count_before
     or (select count(*) from messages) <> message_count_before
     or (select count(*) from goals) <> goal_count_before then
    raise exception 'invalid short_term goal batch must roll back completely';
  end if;
end
$test$;

do $test$
declare
  batch_count_before bigint;
  message_count_before bigint;
  goal_count_before bigint;
  failed boolean := false;
begin
  select count(*) into batch_count_before from action_batches;
  select count(*) into message_count_before from messages;
  select count(*) into goal_count_before from goals;

  begin
    perform record_life_event_batch(
      '00000000-0000-4000-8000-000000000001',
      'batch-cross-user-ability',
      'hash-cross-user-ability',
      'invalid cross-user ability',
      jsonb_build_array(
        jsonb_build_object(
          'kind', 'goal',
          'title', '越权长期目标',
          'category', 'career',
          'goalType', 'long_term',
          'abilityId', '08000000-0000-4000-8000-000000000002',
          'metricType', 'duration',
          'aliases', '[]'::jsonb,
          'confidence', 0.99
        )
      )
    );
  exception
    when others then
      failed := true;
  end;

  if not failed then
    raise exception 'cross-user ability reference must fail';
  end if;
  if (select count(*) from action_batches) <> batch_count_before
     or (select count(*) from messages) <> message_count_before
     or (select count(*) from goals) <> goal_count_before then
    raise exception 'cross-user ability batch must roll back completely';
  end if;
end
$test$;

select 'batch intake SQL behavior tests passed' as result;
