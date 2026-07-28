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
