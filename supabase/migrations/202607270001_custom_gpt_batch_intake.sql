alter table profiles
  add column if not exists timezone text not null default 'Asia/Tokyo',
  add column if not exists default_reminder_time time not null default '09:00';

create table if not exists action_batches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(user_id) on delete cascade,
  idempotency_key text not null,
  request_hash text not null,
  raw_text text not null,
  response_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (user_id, idempotency_key),
  unique (user_id, id)
);

alter table messages
  add column if not exists batch_id uuid,
  add column if not exists event_index integer;

alter table messages
  add constraint messages_batch_event_pair
  check (
    (batch_id is null and event_index is null)
    or (batch_id is not null and event_index is not null and event_index between 0 and 19)
  );

alter table messages
  add constraint messages_batch_fk
  foreign key (user_id, batch_id) references action_batches(user_id, id);

create unique index if not exists idx_messages_batch_event
  on messages (batch_id, event_index)
  where batch_id is not null;

create index if not exists idx_action_batches_user_created
  on action_batches (user_id, created_at desc);

alter table action_batches enable row level security;

create policy action_batches_own_rows
  on action_batches
  for select
  using (user_id = auth.uid());

revoke insert, update, delete on action_batches from anon, authenticated;

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
       or v_kind not in ('goal', 'task', 'activity', 'inbox') then
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

    if v_kind = 'goal' then
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

      insert into goals (
        user_id,
        title,
        category,
        parent_goal_id,
        metric_type,
        status
      )
      values (
        p_user_id,
        v_event->>'title',
        v_event->>'category',
        v_parent_goal_id,
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
          priority
        )
        values (
          p_user_id,
          v_goal_id,
          v_message_id,
          v_event->>'title',
          'open',
          (v_event->>'dueAt')::timestamptz,
          v_event->>'priority'
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
