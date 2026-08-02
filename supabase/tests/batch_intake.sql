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
    '11000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000001',
    'Ambiguous Goal',
    'career',
    'long_term',
    '08000000-0000-4000-8000-000000000001',
    'duration'
  ),
  (
    '11000000-0000-4000-8000-000000000002',
    '00000000-0000-4000-8000-000000000001',
    ' ambiguous goal ',
    'career',
    'long_term',
    '08000000-0000-4000-8000-000000000001',
    'duration'
  );

do $test$
declare
  batch_count_before bigint;
  message_count_before bigint;
  task_count_before bigint;
  activity_count_before bigint;
  failed boolean := false;
begin
  select count(*) into batch_count_before from action_batches;
  select count(*) into message_count_before from messages;
  select count(*) into task_count_before from tasks;
  select count(*) into activity_count_before from activities;

  begin
    perform record_life_event_batch(
      '00000000-0000-4000-8000-000000000001',
      'batch-ambiguous-goal-title',
      'hash-ambiguous-goal-title',
      '添加歧义目标任务',
      jsonb_build_array(
        jsonb_build_object(
          'kind', 'task',
          'title', '不能归属的任务',
          'goalTitle', 'AMBIGUOUS GOAL',
          'dueAt', '2026-07-31T09:00:00+09:00',
          'remindAt', '2026-07-31T09:00:00+09:00',
          'priority', 'normal',
          'plannedMetricType', null,
          'plannedValue', null,
          'plannedUnit', null,
          'confidence', 0.99
        )
      )
    );
  exception
    when others then
      if sqlerrm not like 'goalTitle is ambiguous at event index %' then
        raise;
      end if;
      failed := true;
  end;

  if not failed then
    raise exception 'normalized ambiguous goalTitle must fail';
  end if;
  if (select count(*) from action_batches) <> batch_count_before
     or (select count(*) from messages) <> message_count_before
     or (select count(*) from tasks) <> task_count_before
     or (select count(*) from activities) <> activity_count_before then
    raise exception 'ambiguous goalTitle batch must roll back completely';
  end if;
end
$test$;

insert into goals (
  id,
  user_id,
  title,
  category,
  goal_type,
  ability_id,
  metric_type
)
values (
  '12000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000001',
  '冲突身份目标',
  'career',
  'short_term',
  null,
  'count'
);

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
      'batch-conflicting-goal-type',
      'hash-conflicting-goal-type',
      '把同名短期目标改成长期目标',
      jsonb_build_array(
        jsonb_build_object(
          'kind', 'goal',
          'title', '冲突身份目标',
          'category', 'career',
          'goalType', 'long_term',
          'abilityId', '08000000-0000-4000-8000-000000000001',
          'metricType', 'count',
          'aliases', '[]'::jsonb,
          'confidence', 0.99
        )
      )
    );
  exception
    when others then
      if sqlerrm not like 'goal identity conflicts with existing goal at event index %' then
        raise;
      end if;
      failed := true;
  end;

  if not failed then
    raise exception 'same-title goalType and ability conflict must fail';
  end if;
  if (select count(*) from action_batches) <> batch_count_before
     or (select count(*) from messages) <> message_count_before
     or (select count(*) from goals) <> goal_count_before then
    raise exception 'conflicting typed goal batch must roll back completely';
  end if;
  if not exists (
    select 1 from goals
    where user_id = '00000000-0000-4000-8000-000000000001'
      and id = '12000000-0000-4000-8000-000000000001'
      and goal_type = 'short_term'
      and ability_id is null
      and category = 'career'
      and metric_type = 'count'
      and parent_goal_id is null
  ) then
    raise exception 'conflicting typed goal must not mutate the existing goal';
  end if;
end
$test$;

do $test$
declare
  response jsonb;
begin
  response := record_life_event_batch(
    '00000000-0000-4000-8000-000000000001',
    'batch-identical-short-goal',
    'hash-identical-short-goal',
    '重复完全相同的短期目标',
    jsonb_build_array(
      jsonb_build_object(
        'kind', 'goal',
        'title', '冲突身份目标',
        'category', 'career',
        'goalType', 'short_term',
        'metricType', 'count',
        'aliases', '[]'::jsonb,
        'confidence', 0.99
      )
    )
  );

  if response#>>'{results,0,goalId}' <> '12000000-0000-4000-8000-000000000001' then
    raise exception 'identical short goal replay must return the existing goalId: %', response;
  end if;
end
$test$;

insert into abilities (id, user_id, title)
values (
  '08000000-0000-4000-8000-000000000003',
  '00000000-0000-4000-8000-000000000001',
  '备用能力'
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
values (
  '13000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000001',
  '身份字段目标',
  'career',
  'long_term',
  '08000000-0000-4000-8000-000000000001',
  'duration'
);

do $test$
declare
  conflicting_event jsonb;
  failed boolean;
  batch_count_before bigint;
  message_count_before bigint;
  goal_count_before bigint;
begin
  select count(*) into batch_count_before from action_batches;
  select count(*) into message_count_before from messages;
  select count(*) into goal_count_before from goals;

  for conflicting_event in
    select value
    from jsonb_array_elements(
      jsonb_build_array(
        jsonb_build_object(
          'caseKey', 'ability',
          'kind', 'goal',
          'title', '身份字段目标',
          'category', 'career',
          'goalType', 'long_term',
          'abilityId', '08000000-0000-4000-8000-000000000003',
          'metricType', 'duration',
          'aliases', '[]'::jsonb,
          'confidence', 0.99
        ),
        jsonb_build_object(
          'caseKey', 'category',
          'kind', 'goal',
          'title', '身份字段目标',
          'category', 'health',
          'goalType', 'long_term',
          'abilityId', '08000000-0000-4000-8000-000000000001',
          'metricType', 'duration',
          'aliases', '[]'::jsonb,
          'confidence', 0.99
        ),
        jsonb_build_object(
          'caseKey', 'metric',
          'kind', 'goal',
          'title', '身份字段目标',
          'category', 'career',
          'goalType', 'long_term',
          'abilityId', '08000000-0000-4000-8000-000000000001',
          'metricType', 'count',
          'aliases', '[]'::jsonb,
          'confidence', 0.99
        ),
        jsonb_build_object(
          'caseKey', 'parent',
          'kind', 'goal',
          'title', '身份字段目标',
          'category', 'career',
          'goalType', 'long_term',
          'abilityId', '08000000-0000-4000-8000-000000000001',
          'parentGoalId', '10000000-0000-4000-8000-000000000001',
          'metricType', 'duration',
          'aliases', '[]'::jsonb,
          'confidence', 0.99
        )
      )
    )
  loop
    failed := false;
    begin
      perform record_life_event_batch(
        '00000000-0000-4000-8000-000000000001',
        'batch-conflicting-goal-' || (conflicting_event->>'caseKey'),
        'hash-conflicting-goal-' || (conflicting_event->>'caseKey'),
        '冲突目标身份字段',
        jsonb_build_array(conflicting_event - 'caseKey')
      );
    exception
      when others then
        if sqlerrm not like 'goal identity conflicts with existing goal at event index %' then
          raise;
        end if;
        failed := true;
    end;

    if not failed then
      raise exception 'goal % identity conflict must fail', conflicting_event->>'caseKey';
    end if;
    if (select count(*) from action_batches) <> batch_count_before
       or (select count(*) from messages) <> message_count_before
       or (select count(*) from goals) <> goal_count_before then
      raise exception 'goal % identity conflict must roll back completely', conflicting_event->>'caseKey';
    end if;
  end loop;
end
$test$;

do $test$
declare
  response jsonb;
begin
  response := record_life_event_batch(
    '00000000-0000-4000-8000-000000000001',
    'batch-identical-long-goal',
    'hash-identical-long-goal',
    '重复完全相同的长期目标',
    jsonb_build_array(
      jsonb_build_object(
        'kind', 'goal',
        'title', '身份字段目标',
        'category', 'career',
        'goalType', 'long_term',
        'abilityId', '08000000-0000-4000-8000-000000000001',
        'metricType', 'duration',
        'aliases', '[]'::jsonb,
        'confidence', 0.99
      )
    )
  );

  if response#>>'{results,0,goalId}' <> '13000000-0000-4000-8000-000000000001' then
    raise exception 'identical long goal replay must return the existing goalId: %', response;
  end if;
end
$test$;

do $test$
declare
  first_response jsonb;
  replay_response jsonb;
  ability_id uuid;
  archived_at_before timestamptz := '2026-07-31T12:34:56+09:00';
begin
  first_response := record_life_event_batch(
    '00000000-0000-4000-8000-000000000001',
    'batch-archive-ability-first',
    'hash-archive-ability-first',
    '培养已归档能力',
    jsonb_build_array(
      jsonb_build_object(
        'kind', 'ability',
        'title', '已归档能力',
        'confidence', 0.99
      )
    )
  );
  ability_id := (first_response#>>'{results,0,abilityId}')::uuid;

  update abilities
  set status = 'archived', archived_at = archived_at_before
  where user_id = '00000000-0000-4000-8000-000000000001'
    and id = ability_id;

  replay_response := record_life_event_batch(
    '00000000-0000-4000-8000-000000000001',
    'batch-archive-ability-replay',
    'hash-archive-ability-replay',
    '再次培养已归档能力',
    jsonb_build_array(
      jsonb_build_object(
        'kind', 'ability',
        'title', '已归档能力',
        'confidence', 0.99
      )
    )
  );

  if replay_response#>>'{results,0,abilityId}' <> ability_id::text then
    raise exception 'ability replay must return the existing abilityId: %', replay_response;
  end if;
  if not exists (
    select 1 from abilities
    where user_id = '00000000-0000-4000-8000-000000000001'
      and id = ability_id
      and status = 'archived'
      and archived_at = archived_at_before
  ) then
    raise exception 'ability replay must preserve archived status and archived_at';
  end if;
end
$test$;

do $test$
declare
  ability_id uuid;
  archived_at_before timestamptz;
  batch_count_before bigint;
  message_count_before bigint;
  goal_count_before bigint;
  failed boolean := false;
begin
  select id, archived_at into ability_id, archived_at_before
  from abilities
  where user_id = '00000000-0000-4000-8000-000000000001'
    and title = '已归档能力';
  select count(*) into batch_count_before from action_batches;
  select count(*) into message_count_before from messages;
  select count(*) into goal_count_before from goals;

  begin
    perform record_life_event_batch(
      '00000000-0000-4000-8000-000000000001',
      'batch-archived-ability-goal',
      'hash-archived-ability-goal',
      '重放已归档能力并建立长期目标',
      jsonb_build_array(
        jsonb_build_object(
          'kind', 'ability',
          'title', '已归档能力',
          'confidence', 0.99
        ),
        jsonb_build_object(
          'kind', 'goal',
          'title', '不能建立的长期目标',
          'category', 'career',
          'goalType', 'long_term',
          'abilityTitle', '已归档能力',
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
    raise exception 'same-batch long_term goal must not use an archived ability';
  end if;
  if (select count(*) from action_batches) <> batch_count_before
     or (select count(*) from messages) <> message_count_before
     or (select count(*) from goals) <> goal_count_before then
    raise exception 'archived ability goal batch must roll back completely';
  end if;
  if not exists (
    select 1 from abilities
    where user_id = '00000000-0000-4000-8000-000000000001'
      and id = ability_id
      and status = 'archived'
      and archived_at = archived_at_before
  ) then
    raise exception 'failed archived ability goal batch must preserve the ability archive';
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

insert into goals (
  id, user_id, title, category, goal_type, ability_id,
  metric_type, status, completed_at
)
values
  (
    '14000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000001',
    'Alias Owner Goal', 'test', 'short_term', null,
    'count', 'active', null
  ),
  (
    '14000000-0000-4000-8000-000000000002',
    '00000000-0000-4000-8000-000000000001',
    'Completed Explicit Goal', 'test', 'short_term', null,
    'count', 'completed', now()
  ),
  (
    '14000000-0000-4000-8000-000000000003',
    '00000000-0000-4000-8000-000000000001',
    'Paused Explicit Goal', 'test', 'short_term', null,
    'count', 'paused', null
  );

insert into goal_aliases (user_id, goal_id, alias)
values (
  '00000000-0000-4000-8000-000000000001',
  '14000000-0000-4000-8000-000000000001',
  'Shared Alias X'
);

do $test$
declare
  batch_count_before bigint;
  message_count_before bigint;
  goal_count_before bigint;
  alias_count_before bigint;
  inbox_count_before bigint;
  failed boolean := false;
begin
  select count(*) into batch_count_before from action_batches;
  select count(*) into message_count_before from messages;
  select count(*) into goal_count_before from goals;
  select count(*) into alias_count_before from goal_aliases;
  select count(*) into inbox_count_before from inbox_items;

  begin
    perform record_life_event_batch(
      '00000000-0000-4000-8000-000000000001',
      'batch-existing-alias-conflict',
      'hash-existing-alias-conflict',
      'new goal attempts another goal alias',
      jsonb_build_array(
        jsonb_build_object(
          'kind', 'goal',
          'title', 'Alias Thief Goal',
          'category', 'test',
          'goalType', 'short_term',
          'abilityId', null,
          'metricType', 'count',
          'aliases', jsonb_build_array('Shared Alias X'),
          'confidence', 0.99
        )
      )
    );
  exception when others then
    if position('goal alias belongs to another goal' in sqlerrm) = 0 then
      raise;
    end if;
    failed := true;
  end;

  if not failed
     or (select count(*) from action_batches) <> batch_count_before
     or (select count(*) from messages) <> message_count_before
     or (select count(*) from goals) <> goal_count_before
     or (select count(*) from goal_aliases) <> alias_count_before
     or (select count(*) from inbox_items) <> inbox_count_before
     or exists (select 1 from goals where title = 'Alias Thief Goal')
     or not exists (
       select 1 from goal_aliases
       where user_id = '00000000-0000-4000-8000-000000000001'
         and goal_id = '14000000-0000-4000-8000-000000000001'
         and alias = 'Shared Alias X'
     ) then
    raise exception 'existing alias conflict must roll back the complete batch';
  end if;
end
$test$;

do $test$
declare
  batch_count_before bigint;
  message_count_before bigint;
  goal_count_before bigint;
  alias_count_before bigint;
  inbox_count_before bigint;
  failed boolean := false;
begin
  select count(*) into batch_count_before from action_batches;
  select count(*) into message_count_before from messages;
  select count(*) into goal_count_before from goals;
  select count(*) into alias_count_before from goal_aliases;
  select count(*) into inbox_count_before from inbox_items;

  begin
    perform record_life_event_batch(
      '00000000-0000-4000-8000-000000000001',
      'batch-same-alias-conflict',
      'hash-same-alias-conflict',
      'two new goals claim one alias',
      jsonb_build_array(
        jsonb_build_object(
          'kind', 'goal',
          'title', 'Batch Alias Goal One',
          'category', 'test',
          'goalType', 'short_term',
          'abilityId', null,
          'metricType', 'count',
          'aliases', jsonb_build_array('Same Batch Alias Y'),
          'confidence', 0.99
        ),
        jsonb_build_object(
          'kind', 'goal',
          'title', 'Batch Alias Goal Two',
          'category', 'test',
          'goalType', 'short_term',
          'abilityId', null,
          'metricType', 'count',
          'aliases', jsonb_build_array('Same Batch Alias Y'),
          'confidence', 0.99
        )
      )
    );
  exception when others then
    if position('goal alias belongs to another goal' in sqlerrm) = 0 then
      raise;
    end if;
    failed := true;
  end;

  if not failed
     or (select count(*) from action_batches) <> batch_count_before
     or (select count(*) from messages) <> message_count_before
     or (select count(*) from goals) <> goal_count_before
     or (select count(*) from goal_aliases) <> alias_count_before
     or (select count(*) from inbox_items) <> inbox_count_before
     or exists (
       select 1 from goals
       where title in ('Batch Alias Goal One', 'Batch Alias Goal Two')
     )
     or exists (
       select 1 from goal_aliases where alias = 'Same Batch Alias Y'
     ) then
    raise exception 'same-batch alias conflict must roll back both goals';
  end if;
end
$test$;

do $test$
declare
  batch_count_before bigint;
  message_count_before bigint;
  task_count_before bigint;
  reminder_count_before bigint;
  activity_count_before bigint;
  failed boolean := false;
begin
  select count(*) into batch_count_before from action_batches;
  select count(*) into message_count_before from messages;
  select count(*) into task_count_before from tasks;
  select count(*) into reminder_count_before from reminders;
  select count(*) into activity_count_before from activities;

  begin
    perform record_life_event_batch(
      '00000000-0000-4000-8000-000000000001',
      'batch-completed-explicit-goal',
      'hash-completed-explicit-goal',
      'task must reject completed explicit goal',
      jsonb_build_array(
        jsonb_build_object(
          'kind', 'task',
          'title', 'Task On Completed Goal',
          'goalId', '14000000-0000-4000-8000-000000000002',
          'dueAt', '2026-08-03T09:00:00+09:00',
          'remindAt', '2026-08-03T09:00:00+09:00',
          'priority', 'normal',
          'confidence', 0.99
        )
      )
    );
  exception when others then
    if position('goal does not belong to user or is not active' in sqlerrm) = 0 then
      raise;
    end if;
    failed := true;
  end;

  if not failed
     or (select count(*) from action_batches) <> batch_count_before
     or (select count(*) from messages) <> message_count_before
     or (select count(*) from tasks) <> task_count_before
     or (select count(*) from reminders) <> reminder_count_before
     or exists (select 1 from tasks where title = 'Task On Completed Goal') then
    raise exception 'completed explicit goal task batch must roll back completely';
  end if;

  failed := false;
  begin
    perform record_life_event_batch(
      '00000000-0000-4000-8000-000000000001',
      'batch-paused-explicit-goal',
      'hash-paused-explicit-goal',
      'activity must reject paused explicit goal',
      jsonb_build_array(
        jsonb_build_object(
          'kind', 'activity',
          'summary', 'Activity On Paused Goal',
          'goalId', '14000000-0000-4000-8000-000000000003',
          'metricType', 'count',
          'value', 1,
          'unit', 'count',
          'occurredOn', '2026-08-03',
          'confidence', 0.99
        )
      )
    );
  exception when others then
    if position('goal does not belong to user or is not active' in sqlerrm) = 0 then
      raise;
    end if;
    failed := true;
  end;

  if not failed
     or (select count(*) from action_batches) <> batch_count_before
     or (select count(*) from messages) <> message_count_before
     or (select count(*) from activities) <> activity_count_before
     or exists (
       select 1 from activities where summary = 'Activity On Paused Goal'
     ) then
    raise exception 'paused explicit goal activity batch must roll back completely';
  end if;
end
$test$;

select 'batch intake SQL behavior tests passed' as result;
