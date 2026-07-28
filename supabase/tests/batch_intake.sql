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

insert into goals (id, user_id, title, category, metric_type)
values
  (
    '10000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000001',
    'AWS',
    'career',
    'count'
  ),
  (
    '10000000-0000-4000-8000-000000000002',
    '00000000-0000-4000-8000-000000000001',
    '增肌',
    'health',
    'count'
  ),
  (
    '10000000-0000-4000-8000-000000000003',
    '00000000-0000-4000-8000-000000000002',
    'private goal',
    'private',
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

select 'batch intake SQL behavior tests passed' as result;
