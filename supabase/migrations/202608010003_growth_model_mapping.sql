create or replace function apply_growth_model_mapping(
  p_mapping jsonb,
  p_expected_snapshot jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_user_id uuid;
  v_actual_profile_ids uuid[];
  v_actual_goal_ids uuid[];
  v_actual_task_ids uuid[];
  v_actual_activity_ids uuid[];
  v_actual_achievement_ids uuid[];
  v_expected_profile_ids uuid[];
  v_expected_goal_ids uuid[];
  v_expected_task_ids uuid[];
  v_expected_activity_ids uuid[];
  v_expected_achievement_ids uuid[];
  v_mapping_goal_ids uuid[];
  v_mapping_task_ids uuid[];
  v_mapping_activity_ids uuid[];
  v_mapping_achievement_ids uuid[];
  v_expected_profile_count integer;
  v_expected_goal_count integer;
  v_expected_task_count integer;
  v_expected_activity_count integer;
  v_expected_achievement_count integer;
begin
  if jsonb_typeof(p_mapping) is distinct from 'object'
     or jsonb_typeof(p_expected_snapshot) is distinct from 'object' then
    raise exception 'mapping and expected snapshot must be JSON objects';
  end if;

  if nullif(p_mapping->>'userId', '') is null then
    raise exception 'mapping userId must be a UUID';
  end if;
  begin
    v_user_id := (p_mapping->>'userId')::uuid;
  exception when others then
    raise exception 'mapping userId must be a UUID';
  end;

  if jsonb_typeof(p_mapping->'goals') is distinct from 'array'
     or jsonb_typeof(p_mapping->'taskOverrides') is distinct from 'array'
     or jsonb_typeof(p_mapping->'activityOverrides') is distinct from 'array'
     or jsonb_typeof(p_mapping->'achievementOverrides') is distinct from 'array'
     or jsonb_typeof(p_expected_snapshot->'expectedProfileIds') is distinct from 'array'
     or jsonb_typeof(p_expected_snapshot->'expectedGoalIds') is distinct from 'array'
     or jsonb_typeof(p_expected_snapshot->'expectedTaskIds') is distinct from 'array'
     or jsonb_typeof(p_expected_snapshot->'expectedActivityIds') is distinct from 'array'
     or jsonb_typeof(p_expected_snapshot->'expectedAchievementIds') is distinct from 'array'
     or jsonb_typeof(p_expected_snapshot->'counts') is distinct from 'object' then
    raise exception 'mapping and expected snapshot arrays are required';
  end if;

  if jsonb_typeof(p_expected_snapshot#>'{counts,profiles}') is distinct from 'number'
     or jsonb_typeof(p_expected_snapshot#>'{counts,goals}') is distinct from 'number'
     or jsonb_typeof(p_expected_snapshot#>'{counts,tasks}') is distinct from 'number'
     or jsonb_typeof(p_expected_snapshot#>'{counts,activities}') is distinct from 'number'
     or jsonb_typeof(p_expected_snapshot#>'{counts,achievements}') is distinct from 'number' then
    raise exception 'expected snapshot counts must be nonnegative integers';
  end if;
  begin
    v_expected_profile_count := (p_expected_snapshot#>>'{counts,profiles}')::integer;
    v_expected_goal_count := (p_expected_snapshot#>>'{counts,goals}')::integer;
    v_expected_task_count := (p_expected_snapshot#>>'{counts,tasks}')::integer;
    v_expected_activity_count := (p_expected_snapshot#>>'{counts,activities}')::integer;
    v_expected_achievement_count := (p_expected_snapshot#>>'{counts,achievements}')::integer;
  exception when others then
    raise exception 'expected snapshot counts must be nonnegative integers';
  end;
  if v_expected_profile_count < 0
     or v_expected_goal_count < 0
     or v_expected_task_count < 0
     or v_expected_activity_count < 0
     or v_expected_achievement_count < 0 then
    raise exception 'expected snapshot counts must be nonnegative integers';
  end if;

  perform 1 from profiles where user_id = v_user_id for update;
  if not found then
    raise exception 'snapshot mismatch: profile is absent';
  end if;
  perform 1 from goals where user_id = v_user_id for update;
  perform 1 from tasks where user_id = v_user_id for update;
  perform 1 from activities where user_id = v_user_id for update;
  perform 1 from achievements where user_id = v_user_id for update;

  select array[user_id] into v_actual_profile_ids
  from profiles where user_id = v_user_id;
  select coalesce(array_agg(id order by id), array[]::uuid[])
    into v_actual_goal_ids from goals where user_id = v_user_id;
  select coalesce(array_agg(id order by id), array[]::uuid[])
    into v_actual_task_ids from tasks where user_id = v_user_id;
  select coalesce(array_agg(id order by id), array[]::uuid[])
    into v_actual_activity_ids from activities where user_id = v_user_id;
  select coalesce(array_agg(id order by id), array[]::uuid[])
    into v_actual_achievement_ids from achievements where user_id = v_user_id;

  begin
    select coalesce(array_agg(value::uuid order by value::uuid), array[]::uuid[])
      into v_expected_profile_ids
      from jsonb_array_elements_text(p_expected_snapshot->'expectedProfileIds') expected(value);
    select coalesce(array_agg(value::uuid order by value::uuid), array[]::uuid[])
      into v_expected_goal_ids
      from jsonb_array_elements_text(p_expected_snapshot->'expectedGoalIds') expected(value);
    select coalesce(array_agg(value::uuid order by value::uuid), array[]::uuid[])
      into v_expected_task_ids
      from jsonb_array_elements_text(p_expected_snapshot->'expectedTaskIds') expected(value);
    select coalesce(array_agg(value::uuid order by value::uuid), array[]::uuid[])
      into v_expected_activity_ids
      from jsonb_array_elements_text(p_expected_snapshot->'expectedActivityIds') expected(value);
    select coalesce(array_agg(value::uuid order by value::uuid), array[]::uuid[])
      into v_expected_achievement_ids
      from jsonb_array_elements_text(p_expected_snapshot->'expectedAchievementIds') expected(value);
  exception when others then
    raise exception 'expected snapshot IDs must be UUID arrays';
  end;

  if v_actual_profile_ids is distinct from v_expected_profile_ids
     or v_actual_goal_ids is distinct from v_expected_goal_ids
     or v_actual_task_ids is distinct from v_expected_task_ids
     or v_actual_activity_ids is distinct from v_expected_activity_ids
     or v_actual_achievement_ids is distinct from v_expected_achievement_ids
     or cardinality(v_actual_profile_ids) is distinct from v_expected_profile_count
     or cardinality(v_actual_goal_ids) is distinct from v_expected_goal_count
     or cardinality(v_actual_task_ids) is distinct from v_expected_task_count
     or cardinality(v_actual_activity_ids) is distinct from v_expected_activity_count
     or cardinality(v_actual_achievement_ids) is distinct from v_expected_achievement_count then
    raise exception 'snapshot mismatch: IDs or counts changed after dry-run';
  end if;

  begin
    select coalesce(
      array_agg((item->>'legacyGoalId')::uuid order by (item->>'legacyGoalId')::uuid),
      array[]::uuid[]
    ) into v_mapping_goal_ids from jsonb_array_elements(p_mapping->'goals') item;
    select coalesce(
      array_agg((item->>'taskId')::uuid order by (item->>'taskId')::uuid),
      array[]::uuid[]
    ) into v_mapping_task_ids from jsonb_array_elements(p_mapping->'taskOverrides') item;
    select coalesce(
      array_agg((item->>'activityId')::uuid order by (item->>'activityId')::uuid),
      array[]::uuid[]
    ) into v_mapping_activity_ids from jsonb_array_elements(p_mapping->'activityOverrides') item;
    select coalesce(
      array_agg((item->>'achievementId')::uuid order by (item->>'achievementId')::uuid),
      array[]::uuid[]
    ) into v_mapping_achievement_ids from jsonb_array_elements(p_mapping->'achievementOverrides') item;
  exception when others then
    raise exception 'mapping source IDs must be UUIDs';
  end;

  if v_mapping_goal_ids is distinct from v_actual_goal_ids then
    raise exception 'mapping must completely cover goal IDs exactly once';
  end if;
  if v_mapping_task_ids is distinct from v_actual_task_ids then
    raise exception 'mapping must completely cover task IDs exactly once';
  end if;
  if v_mapping_activity_ids is distinct from v_actual_activity_ids then
    raise exception 'mapping must completely cover activity IDs exactly once';
  end if;
  if v_mapping_achievement_ids is distinct from v_actual_achievement_ids then
    raise exception 'mapping must completely cover achievement IDs exactly once';
  end if;

  if exists (
    select 1 from jsonb_array_elements(p_mapping->'goals') item
    where jsonb_typeof(item) is distinct from 'object'
       or item->>'goalType' is null
       or item->>'goalType' not in ('long_term', 'short_term')
       or (
         item->>'goalType' = 'long_term'
         and (
           jsonb_typeof(item->'abilityTitle') is distinct from 'string'
           or coalesce(length(btrim(item->>'abilityTitle')), 0) = 0
         )
       )
       or (item->>'goalType' = 'short_term' and item ? 'abilityTitle')
  ) then
    raise exception 'mapping contains an invalid goal classification';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_mapping->'taskOverrides') item
    where jsonb_typeof(item) is distinct from 'object'
       or jsonb_typeof(item->'target') is distinct from 'object'
       or item->'target'->>'kind' is null
       or item->'target'->>'kind' not in ('one_off', 'goal')
       or (
         item->'target'->>'kind' = 'one_off'
         and item->'target' ? 'targetGoalId'
       )
       or (
         item->'target'->>'kind' = 'goal'
         and (
           jsonb_typeof(item->'target'->'targetGoalId') is distinct from 'string'
           or item->'target'->>'targetGoalId' is null
         )
       )
  ) then
    raise exception 'mapping contains an invalid task target';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_mapping->'activityOverrides') item
    where jsonb_typeof(item) is distinct from 'object'
       or jsonb_typeof(item->'targetGoalId') is distinct from 'string'
       or item->>'targetGoalId' is null
  ) then
    raise exception 'mapping contains an invalid activity target';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(p_mapping->'achievementOverrides') achievement
    where jsonb_typeof(achievement) is distinct from 'object'
       or jsonb_typeof(achievement->'targetGoalId') is distinct from 'string'
       or achievement->>'targetGoalId' is null
       or not exists (
      select 1 from jsonb_array_elements(p_mapping->'goals') goal
      where goal->>'legacyGoalId' = achievement->>'targetGoalId'
        and goal->>'goalType' = 'short_term'
    )
  ) then
    raise exception 'mapping achievement targets must be short_term goals';
  end if;

  begin
    perform (item->'target'->>'targetGoalId')::uuid
    from jsonb_array_elements(p_mapping->'taskOverrides') item
    where item->'target'->>'kind' = 'goal';
    perform (item->>'targetGoalId')::uuid
    from jsonb_array_elements(p_mapping->'activityOverrides') item;
    perform (item->>'targetGoalId')::uuid
    from jsonb_array_elements(p_mapping->'achievementOverrides') item;
  exception when others then
    raise exception 'mapping target IDs must be UUIDs';
  end;

  if exists (
    select 1 from jsonb_array_elements(p_mapping->'taskOverrides') item
    where item->'target'->>'kind' = 'goal'
      and not ((item->'target'->>'targetGoalId')::uuid = any(v_actual_goal_ids))
  ) then
    raise exception 'mapping contains an invalid task target';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_mapping->'activityOverrides') item
    where not ((item->>'targetGoalId')::uuid = any(v_actual_goal_ids))
  ) then
    raise exception 'mapping contains an invalid activity target';
  end if;

  insert into abilities (user_id, title, status, archived_at)
  select distinct v_user_id, btrim(item->>'abilityTitle'), 'active', null::timestamptz
  from jsonb_array_elements(p_mapping->'goals') item
  where item->>'goalType' = 'long_term'
  on conflict (user_id, title) do update
    set status = 'active', archived_at = null;

  update goals goal
  set goal_type = 'short_term', ability_id = null
  from jsonb_array_elements(p_mapping->'goals') item
  where goal.user_id = v_user_id
    and goal.id = (item->>'legacyGoalId')::uuid
    and item->>'goalType' = 'short_term';

  update tasks task
  set goal_id = case
    when item->'target'->>'kind' = 'one_off' then null
    else (item->'target'->>'targetGoalId')::uuid
  end
  from jsonb_array_elements(p_mapping->'taskOverrides') item
  where task.user_id = v_user_id
    and task.id = (item->>'taskId')::uuid;

  update activities activity
  set goal_id = (item->>'targetGoalId')::uuid
  from jsonb_array_elements(p_mapping->'activityOverrides') item
  where activity.user_id = v_user_id
    and activity.id = (item->>'activityId')::uuid;

  update achievements achievement
  set short_goal_id = (item->>'targetGoalId')::uuid
  from jsonb_array_elements(p_mapping->'achievementOverrides') item
  where achievement.user_id = v_user_id
    and achievement.id = (item->>'achievementId')::uuid;

  update goals goal
  set goal_type = 'long_term', ability_id = ability.id
  from jsonb_array_elements(p_mapping->'goals') item
  join abilities ability
    on ability.user_id = v_user_id
   and ability.title = btrim(item->>'abilityTitle')
  where goal.user_id = v_user_id
    and goal.id = (item->>'legacyGoalId')::uuid
    and item->>'goalType' = 'long_term';

  if exists (
    select 1 from goals
    where user_id = v_user_id
      and (
        goal_type is null
        or goal_type not in ('long_term', 'short_term')
        or (goal_type = 'long_term' and ability_id is null)
        or (goal_type = 'short_term' and ability_id is not null)
      )
  ) then
    raise exception 'mapped goal shape verification failed';
  end if;

  return jsonb_build_object(
    'applied', true,
    'counts', jsonb_build_object(
      'profiles', cardinality(v_actual_profile_ids),
      'goals', cardinality(v_actual_goal_ids),
      'tasks', cardinality(v_actual_task_ids),
      'activities', cardinality(v_actual_activity_ids),
      'achievements', cardinality(v_actual_achievement_ids)
    ),
    'abilityCount', (select count(*) from abilities where user_id = v_user_id)
  );
end
$function$;

revoke execute on function public.apply_growth_model_mapping(jsonb, jsonb) from public, anon, authenticated;
grant execute on function apply_growth_model_mapping(jsonb, jsonb) to service_role;
