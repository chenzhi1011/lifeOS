create extension if not exists pgcrypto;

create table profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
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

create table goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(user_id) on delete cascade,
  title text not null,
  category text not null,
  parent_goal_id uuid,
  metric_type text not null check (metric_type in ('duration', 'count', 'milestone')),
  status text not null default 'active' check (status in ('active', 'paused', 'completed')),
  created_at timestamptz not null default now(),
  unique (user_id, id),
  unique (user_id, title),
  foreign key (user_id, parent_goal_id) references goals(user_id, id)
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
  raw_text text not null,
  intent_type text not null check (intent_type in ('task', 'activity', 'goal', 'reminder', 'inbox')),
  confidence numeric not null check (confidence >= 0 and confidence <= 1),
  parsed_json jsonb not null,
  status text not null check (status in ('processed', 'inbox', 'failed')),
  created_at timestamptz not null default now(),
  unique (user_id, id)
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
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (user_id, id),
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
  suggested_type text not null check (suggested_type in ('task', 'activity', 'goal', 'reminder', 'inbox')),
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
  goal_id uuid,
  title text not null,
  metric_type text not null check (metric_type in ('duration', 'count', 'milestone')),
  threshold_value numeric,
  achieved_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (user_id, id),
  foreign key (user_id, goal_id) references goals(user_id, id)
);

create index idx_messages_user_created on messages (user_id, created_at desc);
create index idx_action_credentials_hash_status on action_credentials (token_hash, status);
create index idx_action_credentials_user_status on action_credentials (user_id, status);
create index idx_goals_user_parent on goals (user_id, parent_goal_id);
create index idx_goal_aliases_user_alias on goal_aliases (user_id, alias);
create index idx_tasks_user_status_due on tasks (user_id, status, due_at);
create index idx_activities_user_date on activities (user_id, occurred_on desc);
create index idx_activities_user_goal_date on activities (user_id, goal_id, occurred_on desc);
create index idx_reminders_user_status_time on reminders (user_id, status, remind_at);
create index idx_inbox_items_user_status on inbox_items (user_id, status, created_at desc);

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
create policy goals_own_rows on goals using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy goal_aliases_own_rows on goal_aliases using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy messages_own_rows on messages using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy tasks_own_rows on tasks using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy activities_own_rows on activities using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy reminders_own_rows on reminders using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy inbox_items_own_rows on inbox_items using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy achievements_own_rows on achievements using (user_id = auth.uid()) with check (user_id = auth.uid());
