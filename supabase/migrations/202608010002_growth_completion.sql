create unique index if not exists idx_activities_user_task_unique
  on activities(user_id, task_id) where task_id is not null;

create unique index if not exists idx_achievements_user_short_goal
  on achievements(user_id, short_goal_id) where short_goal_id is not null;

create or replace function complete_growth_task(
  p_user_id uuid,
  p_task_id uuid,
  p_occurred_on date,
  p_metric_type text,
  p_value numeric,
  p_unit text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_task tasks%rowtype;
  v_activity_id uuid;
  v_metric_type text;
  v_value numeric;
  v_unit text;
begin
  if p_occurred_on is null then
    raise exception 'occurredOn is required';
  end if;

  if p_metric_type is null and p_value is null and p_unit is null then
    null;
  elsif p_metric_type is null or p_value is null or p_unit is null then
    raise exception 'actual metric requires type, value, and unit together';
  elsif p_metric_type not in ('duration', 'count', 'milestone')
     or p_value <= 0
     or p_unit not in ('minute', 'hour', 'count') then
    raise exception 'actual metric is invalid';
  end if;

  select * into v_task
  from tasks
  where user_id = p_user_id
    and id = p_task_id
  for update;

  if not found then
    raise exception 'task does not belong to user';
  end if;

  if v_task.status = 'completed' then
    if v_task.goal_id is not null then
      select id into v_activity_id
      from activities
      where user_id = p_user_id
        and task_id = p_task_id;

      if v_activity_id is null then
        raise exception 'completed goal task is missing its activity';
      end if;
    end if;

    return jsonb_build_object(
      'taskId', v_task.id,
      'status', 'completed',
      'activityId', v_activity_id,
      'duplicate', true
    );
  end if;

  if v_task.status <> 'open' then
    raise exception 'task is not open';
  end if;

  update tasks
  set
    status = 'completed',
    completed_at = now()
  where user_id = p_user_id
    and id = p_task_id;

  if v_task.goal_id is not null then
    if p_metric_type is not null then
      v_metric_type := p_metric_type;
      v_value := p_value;
      v_unit := p_unit;
    elsif v_task.planned_metric_type is not null then
      v_metric_type := v_task.planned_metric_type;
      v_value := v_task.planned_value;
      v_unit := v_task.planned_unit;
    else
      v_metric_type := 'count';
      v_value := 1;
      v_unit := 'count';
    end if;

    insert into activities (
      user_id,
      goal_id,
      task_id,
      message_id,
      summary,
      metric_type,
      value,
      unit,
      occurred_on
    )
    values (
      p_user_id,
      v_task.goal_id,
      v_task.id,
      v_task.message_id,
      v_task.title,
      v_metric_type,
      v_value,
      v_unit,
      p_occurred_on
    )
    returning id into v_activity_id;
  end if;

  return jsonb_build_object(
    'taskId', v_task.id,
    'status', 'completed',
    'activityId', v_activity_id,
    'duplicate', false
  );
end
$function$;

revoke execute on function public.complete_growth_task(uuid, uuid, date, text, numeric, text) from public, anon, authenticated;
grant execute on function complete_growth_task(uuid, uuid, date, text, numeric, text) to service_role;

create or replace function complete_growth_goal(
  p_user_id uuid,
  p_goal_id uuid,
  p_title text,
  p_note text,
  p_evidence_url text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_goal goals%rowtype;
  v_achievement_id uuid;
  v_duplicate boolean;
begin
  select * into v_goal
  from goals
  where user_id = p_user_id
    and id = p_goal_id
  for update;

  if not found then
    raise exception 'goal does not belong to user';
  end if;

  if v_goal.goal_type not in ('long_term', 'short_term') then
    raise exception 'goal type is invalid';
  end if;

  v_duplicate := v_goal.status = 'completed';
  if not v_duplicate then
    update goals
    set
      status = 'completed',
      completed_at = now()
    where user_id = p_user_id
      and id = p_goal_id
    returning * into v_goal;
  end if;

  if v_goal.completed_at is null then
    raise exception 'completed goal is missing completed_at';
  end if;

  if v_goal.goal_type = 'short_term' then
    insert into achievements (
      user_id,
      short_goal_id,
      title,
      metric_type,
      threshold_value,
      note,
      evidence_url,
      achieved_at
    )
    values (
      p_user_id,
      v_goal.id,
      coalesce(nullif(btrim(p_title), ''), v_goal.title),
      v_goal.metric_type,
      null,
      p_note,
      p_evidence_url,
      v_goal.completed_at
    )
    on conflict do nothing
    returning id into v_achievement_id;

    if v_achievement_id is null then
      select id into v_achievement_id
      from achievements
      where user_id = p_user_id
        and short_goal_id = v_goal.id;
    end if;
  end if;

  return jsonb_build_object(
    'goalId', v_goal.id,
    'status', 'completed',
    'achievementId', v_achievement_id,
    'duplicate', v_duplicate
  );
end
$function$;

revoke execute on function public.complete_growth_goal(uuid, uuid, text, text, text) from public, anon, authenticated;
grant execute on function complete_growth_goal(uuid, uuid, text, text, text) to service_role;
