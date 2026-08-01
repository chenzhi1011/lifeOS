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

do $migration$
begin
  if exists (
    select 1
    from achievements
    where short_goal_id is not null
    group by user_id, short_goal_id
    having count(*) > 1
  ) then
    raise exception 'duplicate (user_id, short_goal_id) achievement rows found; manually deduplicate or map achievements before retrying migration';
  end if;

  if exists (
    select 1
    from activities
    where task_id is not null
    group by user_id, task_id
    having count(*) > 1
  ) then
    raise exception 'duplicate (user_id, task_id) activity rows found; manually deduplicate or map activities before retrying migration';
  end if;
end
$migration$;

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
  if new.short_goal_id is null then
    raise exception 'achievement requires a short_term goal owned by the user';
  end if;

  perform 1
  from goals
  where user_id = new.user_id
    and id = new.short_goal_id
    and goal_type = 'short_term'
    and ability_id is null
  for share;

  if not found then
    raise exception 'achievement requires a short_term goal owned by the user';
  end if;

  return new;
end
$function$;

drop trigger if exists achievements_short_goal_guard on achievements;
create trigger achievements_short_goal_guard
before insert or update of user_id, short_goal_id on achievements
for each row execute function enforce_achievement_short_goal();

create or replace function enforce_goal_achievement_shape()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $function$
begin
  if (
    new.goal_type is distinct from 'short_term'
    or new.ability_id is not null
  ) and exists (
    select 1
    from achievements
    where user_id = new.user_id
      and short_goal_id = new.id
  ) then
    raise exception 'a goal referenced by an achievement must remain short_term without an ability';
  end if;

  return new;
end
$function$;

drop trigger if exists goals_achievement_shape_guard on goals;
create trigger goals_achievement_shape_guard
before update of goal_type, ability_id on goals
for each row execute function enforce_goal_achievement_shape();

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

create or replace function record_life_event_batch(
  p_user_id uuid,
  p_idempotency_key text,
  p_request_hash text,
  p_raw_text text,
  p_events jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_batch_id uuid;
  v_existing_hash text;
  v_existing_response jsonb;
  v_event jsonb;
  v_ordinal bigint;
  v_event_index integer;
  v_kind text;
  v_ability_id uuid;
  v_ability_match_count integer;
  v_goal_id uuid;
  v_parent_goal_id uuid;
  v_message_id uuid;
  v_task_id uuid;
  v_activity_id uuid;
  v_reminder_id uuid;
  v_inbox_item_id uuid;
  v_resolves_inbox_item_id uuid;
  v_results jsonb := '[]'::jsonb;
  v_response jsonb;
  v_updated_id uuid;
  v_alias text;
begin
  if not exists (select 1 from profiles where user_id = p_user_id) then
    raise exception 'profile does not exist for user %', p_user_id;
  end if;

  if jsonb_typeof(p_events) is distinct from 'array' then
    raise exception 'events must be a JSON array containing 1 to 20 items';
  end if;

  if jsonb_array_length(p_events) not between 1 and 20 then
    raise exception 'events must be a JSON array containing 1 to 20 items';
  end if;

  insert into action_batches (
    user_id,
    idempotency_key,
    request_hash,
    raw_text
  )
  values (
    p_user_id,
    p_idempotency_key,
    p_request_hash,
    p_raw_text
  )
  on conflict (user_id, idempotency_key) do nothing
  returning id into v_batch_id;

  if v_batch_id is null then
    select request_hash, response_json
    into v_existing_hash, v_existing_response
    from action_batches
    where user_id = p_user_id
      and idempotency_key = p_idempotency_key;

    if v_existing_hash = p_request_hash then
      return coalesce(v_existing_response, '{}'::jsonb)
        || jsonb_build_object('duplicate', true);
    end if;

    return jsonb_build_object(
      'error', 'idempotency_conflict',
      'duplicate', false
    );
  end if;

  for v_event, v_ordinal in
    select value, ordinality
    from jsonb_array_elements(p_events) with ordinality
  loop
    v_event_index := (v_ordinal - 1)::integer;
    v_kind := v_event->>'kind';
    v_ability_id := null;
    v_ability_match_count := 0;
    v_goal_id := null;
    v_parent_goal_id := null;
    v_message_id := null;
    v_task_id := null;
    v_activity_id := null;
    v_reminder_id := null;
    v_inbox_item_id := null;
    v_resolves_inbox_item_id := nullif(v_event->>'resolvesInboxItemId', '')::uuid;
    v_updated_id := null;

    if jsonb_typeof(v_event) is distinct from 'object'
       or v_kind is null
       or v_kind not in ('ability', 'goal', 'task', 'activity', 'inbox') then
      raise exception 'unsupported event kind at index %', v_event_index;
    end if;

    insert into messages (
      user_id,
      source,
      batch_id,
      event_index,
      raw_text,
      intent_type,
      confidence,
      parsed_json,
      status
    )
    values (
      p_user_id,
      'gpt_action',
      v_batch_id,
      v_event_index,
      p_raw_text,
      v_kind,
      (v_event->>'confidence')::numeric,
      v_event,
      case
        when v_kind = 'inbox' and v_event->>'resolution' is null then 'inbox'
        else 'processed'
      end
    )
    returning id into v_message_id;

    if v_kind = 'ability' then
      insert into abilities (
        user_id,
        title,
        status
      )
      values (
        p_user_id,
        v_event->>'title',
        'active'
      )
      on conflict (user_id, title) do update
      set title = excluded.title
      returning id into v_ability_id;

    elsif v_kind = 'goal' then
      v_parent_goal_id := nullif(v_event->>'parentGoalId', '')::uuid;

      if v_parent_goal_id is not null
         and not exists (
           select 1
           from goals
           where user_id = p_user_id
             and id = v_parent_goal_id
         ) then
        raise exception 'parent goal does not belong to user at event index %', v_event_index;
      end if;

      if nullif(v_event->>'abilityId', '') is not null
         and nullif(btrim(v_event->>'abilityTitle'), '') is not null then
        raise exception 'goal ability reference must use abilityId or abilityTitle, not both, at event index %', v_event_index;
      end if;

      if nullif(v_event->>'abilityId', '') is not null then
        select id into v_ability_id
        from abilities
        where user_id = p_user_id
          and id = nullif(v_event->>'abilityId', '')::uuid
          and status = 'active';

        if v_ability_id is null then
          raise exception 'ability does not belong to user or is not active at event index %', v_event_index;
        end if;
      elsif nullif(btrim(v_event->>'abilityTitle'), '') is not null then
        select
          count(*),
          (array_agg(id order by created_at, id))[1]
        into v_ability_match_count, v_ability_id
        from abilities
        where user_id = p_user_id
          and status = 'active'
          and regexp_replace(
            lower(btrim(title)),
            '[[:space:][:punct:]]+',
            '',
            'g'
          ) = regexp_replace(
            lower(btrim(v_event->>'abilityTitle')),
            '[[:space:][:punct:]]+',
            '',
            'g'
          );

        if v_ability_match_count = 0 then
          raise exception 'active abilityTitle does not exist at event index %', v_event_index;
        elsif v_ability_match_count > 1 then
          raise exception 'abilityTitle is ambiguous at event index %', v_event_index;
        end if;
      end if;

      if v_event->>'goalType' = 'long_term' and v_ability_id is null then
        raise exception 'long_term goal requires an ability at event index %', v_event_index;
      elsif v_event->>'goalType' = 'short_term' and v_ability_id is not null then
        raise exception 'short_term goal forbids an ability at event index %', v_event_index;
      elsif v_event->>'goalType' is null
         or v_event->>'goalType' not in ('long_term', 'short_term') then
        raise exception 'unsupported goalType at event index %', v_event_index;
      end if;

      insert into goals (
        user_id,
        title,
        category,
        parent_goal_id,
        goal_type,
        ability_id,
        metric_type,
        status
      )
      values (
        p_user_id,
        v_event->>'title',
        v_event->>'category',
        v_parent_goal_id,
        v_event->>'goalType',
        case
          when nullif(v_event->>'abilityId', '') is not null
            then nullif(v_event->>'abilityId', '')::uuid
          else v_ability_id
        end,
        v_event->>'metricType',
        'active'
      )
      on conflict (user_id, title) do nothing
      returning id into v_goal_id;

      if v_goal_id is null then
        select id into v_goal_id
        from goals
        where user_id = p_user_id
          and title = v_event->>'title';
      end if;

      for v_alias in
        select value
        from jsonb_array_elements_text(coalesce(v_event->'aliases', '[]'::jsonb))
      loop
        insert into goal_aliases (user_id, goal_id, alias)
        values (p_user_id, v_goal_id, v_alias)
        on conflict (user_id, alias) do nothing;
      end loop;

    elsif v_kind in ('task', 'activity') then
      v_goal_id := nullif(v_event->>'goalId', '')::uuid;

      if v_goal_id is not null then
        if not exists (
          select 1
          from goals
          where user_id = p_user_id
            and id = v_goal_id
        ) then
          raise exception 'goal does not belong to user at event index %', v_event_index;
        end if;
      elsif nullif(btrim(v_event->>'goalTitle'), '') is not null then
        select id into v_goal_id
        from goals
        where user_id = p_user_id
          and status = 'active'
          and lower(btrim(title)) = lower(btrim(v_event->>'goalTitle'));

        if v_goal_id is null then
          raise exception 'active goalTitle was not created before event index %', v_event_index;
        end if;
      end if;

      if v_kind = 'task' then
        insert into tasks (
          user_id,
          goal_id,
          message_id,
          title,
          status,
          due_at,
          priority,
          planned_metric_type,
          planned_value,
          planned_unit
        )
        values (
          p_user_id,
          v_goal_id,
          v_message_id,
          v_event->>'title',
          'open',
          (v_event->>'dueAt')::timestamptz,
          v_event->>'priority',
          nullif(v_event->>'plannedMetricType', ''),
          (v_event->>'plannedValue')::numeric,
          nullif(v_event->>'plannedUnit', '')
        )
        returning id into v_task_id;

        insert into reminders (
          user_id,
          task_id,
          message_id,
          remind_at,
          repeat_rule,
          status
        )
        values (
          p_user_id,
          v_task_id,
          v_message_id,
          (v_event->>'remindAt')::timestamptz,
          'none',
          'scheduled'
        )
        returning id into v_reminder_id;
      else
        if v_goal_id is null then
          raise exception 'activity requires a goal at event index %', v_event_index;
        end if;

        v_task_id := nullif(v_event->>'matchedTaskId', '')::uuid;
        if v_task_id is not null then
          update tasks
          set
            status = 'completed',
            completed_at = now()
          where user_id = p_user_id
            and id = v_task_id
            and goal_id = v_goal_id
            and status = 'open'
          returning id into v_updated_id;

          if v_updated_id is null then
            raise exception 'matched task is not an owned open task at event index %', v_event_index;
          end if;
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
          v_goal_id,
          v_task_id,
          v_message_id,
          v_event->>'summary',
          v_event->>'metricType',
          (v_event->>'value')::numeric,
          v_event->>'unit',
          (v_event->>'occurredOn')::date
        )
        returning id into v_activity_id;
      end if;

    else
      if v_event->>'resolution' = 'dismiss' then
        if v_resolves_inbox_item_id is null then
          raise exception 'dismiss requires resolvesInboxItemId at event index %', v_event_index;
        end if;

        update inbox_items
        set status = 'dismissed'
        where user_id = p_user_id
          and id = v_resolves_inbox_item_id
          and status = 'pending'
        returning id into v_inbox_item_id;

        if v_inbox_item_id is null then
          raise exception 'dismiss target is not an owned pending inbox item at event index %', v_event_index;
        end if;
      else
        insert into inbox_items (
          user_id,
          message_id,
          suggested_type,
          suggested_json,
          reason,
          status
        )
        values (
          p_user_id,
          v_message_id,
          v_event->>'suggestedType',
          coalesce(v_event->'suggestedEvent', '{}'::jsonb),
          v_event->>'reason',
          'pending'
        )
        returning id into v_inbox_item_id;
      end if;
    end if;

    if v_resolves_inbox_item_id is not null
       and not (v_kind = 'inbox' and v_event->>'resolution' = 'dismiss') then
      update inbox_items
      set status = 'resolved'
      where user_id = p_user_id
        and id = v_resolves_inbox_item_id
        and status = 'pending'
      returning id into v_updated_id;

      if v_updated_id is null then
        raise exception 'resolve target is not an owned pending inbox item at event index %', v_event_index;
      end if;
    end if;

    v_results := v_results || jsonb_build_array(
      jsonb_strip_nulls(
        jsonb_build_object(
          'eventIndex', v_event_index,
          'kind', v_kind,
          'messageId', v_message_id,
          'abilityId', v_ability_id,
          'goalId', v_goal_id,
          'taskId', v_task_id,
          'activityId', v_activity_id,
          'reminderId', v_reminder_id,
          'inboxItemId', v_inbox_item_id
        )
      )
    );
  end loop;

  v_response := jsonb_build_object(
    'batchId', v_batch_id,
    'duplicate', false,
    'results', v_results
  );

  update action_batches
  set response_json = v_response
  where user_id = p_user_id
    and id = v_batch_id;

  return v_response;
end
$function$;

revoke execute on function public.record_life_event_batch(uuid, text, text, text, jsonb) from public, anon, authenticated;
grant execute on function record_life_event_batch(uuid, text, text, text, jsonb) to service_role;
