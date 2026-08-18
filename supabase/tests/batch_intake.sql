\set ON_ERROR_STOP on

do $test$
begin
  if has_function_privilege(
    'anon',
    'public.record_life_event_batch(uuid,text,text,text,jsonb)',
    'EXECUTE'
  ) or has_function_privilege(
    'authenticated',
    'public.record_life_event_batch(uuid,text,text,text,jsonb)',
    'EXECUTE'
  ) then
    raise exception 'client roles must not execute record_life_event_batch';
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

do $test$
declare
  first_response jsonb;
  replay_response jsonb;
  goal_id uuid;
begin
  first_response := record_life_event_batch(
    '00000000-0000-4000-8000-000000000001',
    'batch-create-health-goal',
    'hash-create-health-goal',
    '每周跑步三次',
    jsonb_build_array(
      jsonb_build_object(
        'kind', 'goal',
        'confidence', 1,
        'title', '每周跑步三次',
        'goalType', 'long_term',
        'lifeArea', 'health',
        'metricType', 'count',
        'aliases', jsonb_build_array('跑步')
      )
    )
  );

  goal_id := (first_response#>>'{results,0,goalId}')::uuid;
  if goal_id is null
     or first_response->>'duplicate' <> 'false'
     or not exists (
       select 1 from goals
       where id = goal_id
         and user_id = '00000000-0000-4000-8000-000000000001'
         and goal_type = 'long_term'
         and life_area = 'health'
     ) then
    raise exception 'fixed-life-area goal was not persisted: %', first_response;
  end if;

  replay_response := record_life_event_batch(
    '00000000-0000-4000-8000-000000000001',
    'batch-create-health-goal',
    'hash-create-health-goal',
    '每周跑步三次',
    jsonb_build_array(
      jsonb_build_object(
        'kind', 'goal',
        'confidence', 1,
        'title', '每周跑步三次',
        'goalType', 'long_term',
        'lifeArea', 'health',
        'metricType', 'count',
        'aliases', jsonb_build_array('跑步')
      )
    )
  );

  if replay_response->>'duplicate' <> 'true'
     or replay_response#>>'{results,0,goalId}' <> goal_id::text
     or (select count(*) from goals where title = '每周跑步三次') <> 1 then
    raise exception 'batch replay must be idempotent: %', replay_response;
  end if;
end
$test$;

do $test$
declare
  response jsonb;
begin
  response := record_life_event_batch(
    '00000000-0000-4000-8000-000000000001',
    'batch-idempotency-conflict',
    'hash-a',
    'first',
    jsonb_build_array(
      jsonb_build_object(
        'kind', 'goal',
        'confidence', 1,
        'title', '通过考试',
        'goalType', 'short_term',
        'lifeArea', 'growth',
        'metricType', 'milestone',
        'aliases', '[]'::jsonb
      )
    )
  );

  response := record_life_event_batch(
    '00000000-0000-4000-8000-000000000001',
    'batch-idempotency-conflict',
    'hash-b',
    'different',
    jsonb_build_array(
      jsonb_build_object(
        'kind', 'goal',
        'confidence', 1,
        'title', '不同目标',
        'goalType', 'short_term',
        'lifeArea', 'growth',
        'metricType', 'milestone',
        'aliases', '[]'::jsonb
      )
    )
  );

  if response->>'error' <> 'idempotency_conflict'
     or exists (select 1 from goals where title = '不同目标') then
    raise exception 'idempotency conflict must not write a second batch: %', response;
  end if;
end
$test$;

do $test$
begin
  perform record_life_event_batch(
    '00000000-0000-4000-8000-000000000001',
    'batch-invalid-life-area',
    'hash-invalid-life-area',
    'invalid',
    jsonb_build_array(
      jsonb_build_object(
        'kind', 'goal',
        'confidence', 1,
        'title', '非法领域目标',
        'goalType', 'long_term',
        'lifeArea', 'unknown',
        'metricType', 'count',
        'aliases', '[]'::jsonb
      )
    )
  );
  raise exception 'invalid life area must fail';
exception
  when others then
    if sqlerrm = 'invalid life area must fail' then
      raise;
    end if;
end
$test$;

do $test$
begin
  if exists (select 1 from goals where title = '非法领域目标') then
    raise exception 'invalid life area batch must roll back';
  end if;
end
$test$;
