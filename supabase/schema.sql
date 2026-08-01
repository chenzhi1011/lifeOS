create extension if not exists pgcrypto;

create table profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  timezone text not null default 'Asia/Tokyo',
  default_reminder_time time not null default '09:00',
  created_at timestamptz not null default now()
);

create table external_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(user_id) on delete cascade,
  provider text not null check (provider in ('mock', 'wechat', 'telegram', 'app')),
  external_user_id text not null,
  created_at timestamptz not null default now(),
  unique (provider, external_user_id),
  unique (user_id, id)
);

create table action_credentials (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(user_id) on delete cascade,
  name text not null,
  token_hash text not null unique,
  status text not null default 'active' check (status in ('active', 'revoked')),
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  unique (user_id, id)
);

create table action_batches (
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

create table abilities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(user_id) on delete cascade,
  title text not null,
  status text not null default 'active' check (status in ('active', 'archived')),
  created_at timestamptz not null default now(),
  archived_at timestamptz,
  unique (user_id, id),
  unique (user_id, title)
);

create table goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(user_id) on delete cascade,
  title text not null,
  category text not null,
  parent_goal_id uuid,
  goal_type text not null check (goal_type in ('long_term', 'short_term')),
  ability_id uuid,
  due_at timestamptz,
  metric_type text not null check (metric_type in ('duration', 'count', 'milestone')),
  status text not null default 'active' check (status in ('active', 'paused', 'completed')),
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (user_id, id),
  unique (user_id, title),
  constraint goals_ability_shape_check check (
    (goal_type = 'long_term' and ability_id is not null)
    or (goal_type = 'short_term' and ability_id is null)
  ),
  constraint goals_completed_at_check check (
    status <> 'completed' or completed_at is not null
  ),
  foreign key (user_id, parent_goal_id) references goals(user_id, id),
  constraint goals_ability_fk foreign key (user_id, ability_id)
    references abilities(user_id, id)
);

create table goal_aliases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(user_id) on delete cascade,
  goal_id uuid not null,
  alias text not null,
  created_at timestamptz not null default now(),
  unique (user_id, id),
  unique (user_id, alias),
  foreign key (user_id, goal_id) references goals(user_id, id) on delete cascade
);

create table messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(user_id) on delete cascade,
  source text not null check (source in ('mock', 'wechat', 'app', 'telegram', 'gpt_action')),
  batch_id uuid,
  event_index integer,
  raw_text text not null,
  intent_type text not null check (intent_type in ('task', 'activity', 'goal', 'ability', 'reminder', 'inbox')),
  confidence numeric not null check (confidence >= 0 and confidence <= 1),
  parsed_json jsonb not null,
  status text not null check (status in ('processed', 'inbox', 'failed')),
  created_at timestamptz not null default now(),
  unique (user_id, id),
  constraint messages_batch_event_pair check (
    (batch_id is null and event_index is null)
    or (batch_id is not null and event_index is not null and event_index between 0 and 19)
  ),
  constraint messages_batch_fk foreign key (user_id, batch_id) references action_batches(user_id, id)
);

create table tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(user_id) on delete cascade,
  goal_id uuid,
  message_id uuid not null,
  title text not null,
  status text not null default 'open' check (status in ('open', 'completed', 'cancelled')),
  due_at timestamptz,
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high')),
  planned_metric_type text,
  planned_value numeric,
  planned_unit text,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (user_id, id),
  constraint tasks_planned_metric_shape_check check (
    (planned_metric_type is null and planned_value is null and planned_unit is null)
    or (
      planned_metric_type in ('duration', 'count', 'milestone')
      and planned_value > 0
      and planned_unit in ('minute', 'hour', 'count')
    )
  ),
  foreign key (user_id, goal_id) references goals(user_id, id),
  foreign key (user_id, message_id) references messages(user_id, id)
);

create table activities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(user_id) on delete cascade,
  goal_id uuid not null,
  task_id uuid,
  message_id uuid not null,
  summary text not null,
  metric_type text not null check (metric_type in ('duration', 'count', 'milestone')),
  value numeric not null,
  unit text not null check (unit in ('minute', 'hour', 'count')),
  occurred_on date not null,
  created_at timestamptz not null default now(),
  unique (user_id, id),
  foreign key (user_id, goal_id) references goals(user_id, id),
  foreign key (user_id, task_id) references tasks(user_id, id),
  foreign key (user_id, message_id) references messages(user_id, id)
);

create table reminders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(user_id) on delete cascade,
  task_id uuid,
  message_id uuid not null,
  remind_at timestamptz not null,
  repeat_rule text not null default 'none' check (repeat_rule in ('none', 'daily', 'weekly')),
  status text not null default 'scheduled' check (status in ('scheduled', 'sent', 'cancelled')),
  created_at timestamptz not null default now(),
  unique (user_id, id),
  foreign key (user_id, task_id) references tasks(user_id, id),
  foreign key (user_id, message_id) references messages(user_id, id)
);

create table inbox_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(user_id) on delete cascade,
  message_id uuid not null,
  suggested_type text not null check (suggested_type in ('task', 'activity', 'goal', 'ability', 'reminder', 'inbox')),
  suggested_json jsonb not null,
  reason text not null,
  status text not null default 'pending' check (status in ('pending', 'resolved', 'dismissed')),
  created_at timestamptz not null default now(),
  unique (user_id, id),
  foreign key (user_id, message_id) references messages(user_id, id)
);

create table achievements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(user_id) on delete cascade,
  short_goal_id uuid not null,
  title text not null,
  metric_type text not null check (metric_type in ('duration', 'count', 'milestone')),
  threshold_value numeric,
  note text,
  evidence_url text,
  achieved_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (user_id, id),
  foreign key (user_id, short_goal_id) references goals(user_id, id)
);

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

create trigger goals_achievement_shape_guard
before update of goal_type, ability_id on goals
for each row execute function enforce_goal_achievement_shape();

create index idx_messages_user_created on messages (user_id, created_at desc);
create unique index idx_messages_batch_event on messages (batch_id, event_index) where batch_id is not null;
create index idx_action_credentials_hash_status on action_credentials (token_hash, status);
create index idx_action_credentials_user_status on action_credentials (user_id, status);
create index idx_action_batches_user_created on action_batches (user_id, created_at desc);
create index idx_abilities_user_status on abilities (user_id, status);
create index idx_goals_user_parent on goals (user_id, parent_goal_id);
create index idx_goal_aliases_user_alias on goal_aliases (user_id, alias);
create index idx_tasks_user_status_due on tasks (user_id, status, due_at);
create index idx_activities_user_date on activities (user_id, occurred_on desc);
create index idx_activities_user_goal_date on activities (user_id, goal_id, occurred_on desc);
create unique index idx_activities_user_task_unique on activities (user_id, task_id) where task_id is not null;
create index idx_reminders_user_status_time on reminders (user_id, status, remind_at);
create index idx_inbox_items_user_status on inbox_items (user_id, status, created_at desc);
create unique index idx_achievements_user_short_goal on achievements (user_id, short_goal_id) where short_goal_id is not null;

create view goal_activity_rollup as
select
  g.user_id,
  g.id as goal_id,
  coalesce(sum(a.value), 0) as total_value,
  count(a.id) as activity_count,
  count(distinct a.occurred_on) as active_days,
  max(a.occurred_on) as last_activity_on,
  least(count(distinct date_trunc('week', a.occurred_on::timestamp)), 52) as streak_weeks
from goals g
left join activities a on a.user_id = g.user_id and a.goal_id = g.id
group by g.user_id, g.id;

create view goal_growth_stats as
select
  user_id,
  goal_id,
  total_value,
  activity_count,
  active_days,
  last_activity_on,
  streak_weeks,
  least(1, total_value / greatest(1, max(total_value) over (partition by user_id))) as intensity
from goal_activity_rollup;

alter table profiles enable row level security;
alter table external_accounts enable row level security;
alter table action_credentials enable row level security;
alter table action_batches enable row level security;
alter table abilities enable row level security;
alter table goals enable row level security;
alter table goal_aliases enable row level security;
alter table messages enable row level security;
alter table tasks enable row level security;
alter table activities enable row level security;
alter table reminders enable row level security;
alter table inbox_items enable row level security;
alter table achievements enable row level security;

create policy profiles_own_rows on profiles using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy external_accounts_own_rows on external_accounts using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy action_credentials_own_rows on action_credentials using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy action_batches_own_rows on action_batches for select using (user_id = auth.uid());
create policy abilities_own_rows on abilities using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy goals_own_rows on goals using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy goal_aliases_own_rows on goal_aliases using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy messages_own_rows on messages using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy tasks_own_rows on tasks using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy activities_own_rows on activities using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy reminders_own_rows on reminders using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy inbox_items_own_rows on inbox_items using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy achievements_own_rows on achievements using (user_id = auth.uid()) with check (user_id = auth.uid());

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
        nullif(v_event->>'abilityId', '')::uuid,
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
