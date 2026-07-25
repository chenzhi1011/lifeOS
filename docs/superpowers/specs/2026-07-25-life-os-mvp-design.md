# Life OS MVP Design

Date: 2026-07-25

## Product Boundary

Life OS is not a todo app. It is an AI-driven personal accumulation system.

The user sends fragmented natural-language messages through an input channel. AI turns those messages into durable growth records: goals, tasks, activities, reminders, and inbox items.

For the MVP, the chat-like input is a local mock adapter. It is not part of the dashboard product surface. Later, the same intake API can be called from WeChat, a native app, Telegram, or another webhook integration.

## MVP Scope

Included:

- Local mock input page at `/mock`.
- Growth dashboard at `/dashboard`.
- Goal detail page at `/goals/[id]`.
- AI intake endpoint at `POST /api/intake`.
- Local LLM provider first, mock parser fallback.
- Supabase-ready multi-user database model.
- Goal tree, activities, tasks, reminders, inbox, achievements.
- Growth tree home visualization driven by aggregate activity data.

Deferred:

- Public sharing pages.
- Visibility and privacy levels.
- Team or shared goals.
- Real WeChat, Telegram, calendar, push, or email integration.
- Heavy cache tables, materialized views, background jobs.
- Complex tree closure tables.

## Architecture

```text
External or mock input
  -> POST /api/intake
  -> AI provider adapter
  -> normalized Life Event JSON
  -> domain write layer
  -> Supabase PostgreSQL
  -> dashboard and goal views
```

Layers:

1. Input adapter
   - MVP: `/mock`.
   - Future: WeChat, own app, Telegram, webhook.
   - Sends raw text and source metadata to the same intake API.

2. AI intake
   - Parses natural language into a normalized JSON event.
   - Computes confidence.
   - Routes uncertain input to inbox.

3. Life OS core
   - Writes structured data into goals, tasks, activities, reminders, and inbox items.
   - Keeps original messages for audit, repair, and reprocessing.

4. Display
   - `/dashboard` renders growth, not task management.
   - `/goals/[id]` renders focused goal progress and detailed activities.

## AI Provider Design

The intake API does not directly depend on OpenAI. It calls a provider interface:

```ts
interface AIProvider {
  parseLifeEvent(input: {
    userId: string
    text: string
    source: string
    timestamp: string
  }): Promise<LifeEventParseResult>
}
```

Providers:

- `localProvider`: default. Calls the user's local LLM endpoint.
- `mockProvider`: rule-based fallback when local LLM is unavailable.
- `openaiProvider`: future adapter for OpenAI Responses API.

Suggested environment variables:

```env
AI_PROVIDER=local
LOCAL_LLM_BASE_URL=http://localhost:11434
LOCAL_LLM_MODEL=life-os-local
```

The local provider should prefer an OpenAI-compatible chat/completions shape if the local runtime supports it. If the runtime differs, only the provider adapter changes.

## Normalized AI Output

Activity:

```json
{
  "type": "activity",
  "confidence": 0.92,
  "goal": {
    "title": "AWS",
    "category": "职业"
  },
  "summary": "学习 Terraform",
  "metric": {
    "type": "duration",
    "value": 30,
    "unit": "minute"
  },
  "date": "2026-07-25",
  "task": null,
  "reminder": null
}
```

Task:

```json
{
  "type": "task",
  "confidence": 0.9,
  "goal": {
    "title": "增肌",
    "category": "健康"
  },
  "task": {
    "title": "练肩",
    "dueAt": "2026-07-26T15:00:00+09:00",
    "priority": "normal"
  }
}
```

Goal:

```json
{
  "type": "goal",
  "confidence": 0.88,
  "goal": {
    "title": "AWS DevOps",
    "category": "职业",
    "parentTitle": "职业",
    "metricType": "duration",
    "aliases": ["AWS", "DevOps", "Terraform"]
  }
}
```

Reminder:

```json
{
  "type": "reminder",
  "confidence": 0.86,
  "goal": {
    "title": "增肌",
    "category": "健康"
  },
  "task": {
    "title": "练肩"
  },
  "reminder": {
    "remindAt": "2026-07-29T20:00:00+09:00",
    "repeatRule": "none"
  }
}
```

Inbox:

```json
{
  "type": "inbox",
  "confidence": 0.48,
  "rawText": "下周 Sansan",
  "suggestedTypes": ["task", "goal"],
  "reason": "Could be an interview preparation task or a job-change goal."
}
```

## Database Principles

This is a multi-user system from day one because friends may test it. It is not a collaboration system.

Use direct ownership columns:

- Every user-owned business table has `user_id`.
- All application queries filter by `user_id`.
- Supabase RLS enforces `user_id = auth.uid()`.
- Do not introduce a generic `resource_owners` table for MVP.

Why:

- Simpler queries.
- Better indexes.
- Easier RLS.
- Lower risk of cross-user data leaks.
- Future collaborative ownership can be added later as a separate model.

## Tables

### profiles

Stores app-level profile data for each Supabase Auth user.

| Field | Type | Notes |
| --- | --- | --- |
| `user_id` | uuid | Primary key, references auth user |
| `display_name` | text | Optional |
| `created_at` | timestamptz | Default now |

### external_accounts

Future-ready mapping from external input channels to a Life OS user.

| Field | Type | Notes |
| --- | --- | --- |
| `id` | uuid | Primary key |
| `user_id` | uuid | Owner |
| `provider` | text | `wechat`, `telegram`, `app`, `mock` |
| `external_user_id` | text | Provider-specific id |
| `created_at` | timestamptz | Default now |

MVP can seed only the `mock` provider.

### messages

Stores every raw input and AI parse result.

| Field | Type | Notes |
| --- | --- | --- |
| `id` | uuid | Primary key |
| `user_id` | uuid | Owner |
| `source` | text | `mock`, `wechat`, `app`, `telegram` |
| `raw_text` | text | Original input |
| `intent_type` | text | `task`, `activity`, `goal`, `reminder`, `inbox` |
| `confidence` | numeric | 0 to 1 |
| `parsed_json` | jsonb | Raw normalized AI output |
| `status` | text | `processed`, `inbox`, `failed` |
| `created_at` | timestamptz | Input time |

### goals

Stores the user's goal tree.

| Field | Type | Notes |
| --- | --- | --- |
| `id` | uuid | Primary key |
| `user_id` | uuid | Owner |
| `title` | text | Goal name |
| `category` | text | `职业`, `健康`, `财富`, `兴趣`, etc. |
| `parent_goal_id` | uuid | Nullable self-reference |
| `metric_type` | text | `duration`, `count`, `milestone` |
| `status` | text | `active`, `paused`, `completed` |
| `created_at` | timestamptz | Default now |

Use `parent_goal_id` for MVP tree structure. Do not use a closure table initially.

### goal_aliases

Helps AI and rules map varied language to existing goals.

| Field | Type | Notes |
| --- | --- | --- |
| `id` | uuid | Primary key |
| `user_id` | uuid | Owner |
| `goal_id` | uuid | Goal |
| `alias` | text | Example: `AWS DevOps`, `Terraform`, `クラウド学习` |
| `created_at` | timestamptz | Default now |

### tasks

Stores future plans. Tasks are not the final growth asset.

| Field | Type | Notes |
| --- | --- | --- |
| `id` | uuid | Primary key |
| `user_id` | uuid | Owner |
| `goal_id` | uuid | Nullable, linked goal |
| `message_id` | uuid | Source message |
| `title` | text | Task title |
| `status` | text | `open`, `completed`, `cancelled` |
| `due_at` | timestamptz | Nullable |
| `priority` | text | `low`, `normal`, `high` |
| `created_at` | timestamptz | Default now |
| `completed_at` | timestamptz | Nullable |

When a task is completed, create an activity. Do not delete the task.

### activities

The core accumulation ledger.

| Field | Type | Notes |
| --- | --- | --- |
| `id` | uuid | Primary key |
| `user_id` | uuid | Owner |
| `goal_id` | uuid | Linked goal |
| `task_id` | uuid | Nullable source task |
| `message_id` | uuid | Source message |
| `summary` | text | Example: `学习 Terraform` |
| `metric_type` | text | `duration`, `count`, `milestone` |
| `value` | numeric | Example: 30 |
| `unit` | text | `minute`, `hour`, `count` |
| `occurred_on` | date | Actual date |
| `created_at` | timestamptz | Record creation time |

Dashboard, timeline, heatmap, achievements, and growth tree intensity are derived from activities.

### reminders

Stores reminder intent. MVP does not send notifications.

| Field | Type | Notes |
| --- | --- | --- |
| `id` | uuid | Primary key |
| `user_id` | uuid | Owner |
| `task_id` | uuid | Nullable |
| `message_id` | uuid | Source message |
| `remind_at` | timestamptz | Reminder time |
| `repeat_rule` | text | `none`, `daily`, `weekly`, or simple RRULE later |
| `status` | text | `scheduled`, `sent`, `cancelled` |
| `created_at` | timestamptz | Default now |

### inbox_items

Stores low-confidence or ambiguous AI parses.

| Field | Type | Notes |
| --- | --- | --- |
| `id` | uuid | Primary key |
| `user_id` | uuid | Owner |
| `message_id` | uuid | Source message |
| `suggested_type` | text | Best guess |
| `suggested_json` | jsonb | Suggested structured output |
| `reason` | text | Why AI is uncertain |
| `status` | text | `pending`, `resolved`, `dismissed` |
| `created_at` | timestamptz | Default now |

### achievements

Stores explicit milestones and notable events.

| Field | Type | Notes |
| --- | --- | --- |
| `id` | uuid | Primary key |
| `user_id` | uuid | Owner |
| `goal_id` | uuid | Nullable |
| `title` | text | Example: `AWS 累计学习 100 小时` |
| `metric_type` | text | `duration`, `count`, `milestone` |
| `threshold_value` | numeric | Nullable |
| `achieved_at` | timestamptz | When achieved |
| `created_at` | timestamptz | Default now |

For MVP, some achievements can be generated in application logic instead of stored immediately.

## Growth Tree Aggregation

The dashboard home renders a tree. Branches and leaves represent goals, and visual richness is based on accumulated data.

Home should not load all activity rows. It should read goals plus aggregate stats.

Initial implementation can use a SQL view or API-level aggregation:

`goal_growth_stats`

| Field | Meaning |
| --- | --- |
| `user_id` | Owner |
| `goal_id` | Goal |
| `total_value` | Sum of activity values |
| `activity_count` | Number of activities |
| `active_days` | Distinct active days |
| `last_activity_on` | Most recent activity |
| `streak_weeks` | Consecutive active weeks |
| `intensity` | 0 to 1 normalized rendering weight |

Rendering:

- Branch thickness: `total_value` or normalized total.
- Leaf density: `activity_count`.
- Color saturation: recency or `streak_weeks`.
- Node size: combined `intensity`.

Drill-down:

- Home tree reads `goals + goal_growth_stats`.
- Clicking a branch reads child goals and recent activities.
- Selecting a date range reads activities filtered by `user_id`, `goal_id`, and `occurred_on`.

## Recommended Indexes

Use user-prefixed indexes because this is multi-user.

```sql
create index idx_messages_user_created
on messages (user_id, created_at desc);

create index idx_goals_user_parent
on goals (user_id, parent_goal_id);

create index idx_goal_aliases_user_alias
on goal_aliases (user_id, alias);

create index idx_tasks_user_status_due
on tasks (user_id, status, due_at);

create index idx_activities_user_date
on activities (user_id, occurred_on desc);

create index idx_activities_user_goal_date
on activities (user_id, goal_id, occurred_on desc);

create index idx_reminders_user_status_time
on reminders (user_id, status, remind_at);

create index idx_inbox_items_user_status
on inbox_items (user_id, status, created_at desc);
```

For cross-user safety, prefer composite foreign keys where useful:

```sql
unique (user_id, id)
```

Then reference `(user_id, id)` from child tables, such as:

```sql
foreign key (user_id, goal_id)
references goals (user_id, id)
```

This prevents one user's activity from accidentally referencing another user's goal.

## RLS Policy

Every user-owned table should have RLS enabled. The MVP policy shape is:

```sql
user_id = auth.uid()
```

The app should still include `user_id` in application-level queries. RLS is the safety boundary, not a substitute for clear queries.

## Write Rules

Input: `明天练肩`

- Insert `messages`.
- AI returns `type = task`.
- Resolve or create goal `增肌` under category `健康`.
- Insert `tasks`.

Input: `今天学习 AWS 40 分钟`

- Insert `messages`.
- AI returns `type = activity`.
- Resolve or create goal `AWS` under category `职业`.
- Insert `activities`.

Input: `我今年想考 AWS DevOps`

- Insert `messages`.
- AI returns `type = goal`.
- Insert or update `goals`.
- Insert useful `goal_aliases`.

Input: `周三晚上提醒我练肩`

- Insert `messages`.
- AI returns `type = reminder`.
- Resolve or create related task if needed.
- Insert `reminders`.

Input: `下周 Sansan`

- Insert `messages`.
- AI confidence is low.
- Insert `inbox_items`.
- Do not create task/activity/goal until confirmed.

Task completion:

- Update `tasks.status = completed`.
- Set `completed_at`.
- Insert an `activities` row.
- Keep the task as historical planning context.

## Read Rules

`/mock`:

- Reads recent messages and parse results for the current user.
- Writes through `POST /api/intake`.
- May show the created records after each input.

`/dashboard`:

- Reads current user's goal tree.
- Reads aggregate growth stats.
- Reads recent activities.
- Reads inbox count.
- Does not show a chat input.

`/goals/[id]`:

- Reads selected goal and child goals.
- Reads aggregate stats for that goal.
- Reads recent activities.
- Reads time-filtered activities when the user selects a date range.

Timeline:

- Reads activities ordered by `occurred_on desc`.

Heatmap:

- Aggregates activities by `occurred_on`.

Inbox:

- Reads `inbox_items where status = pending`.

## Testing Strategy

Use focused MVP tests:

- Provider tests for local/mock AI normalization.
- Intake tests for each type: task, activity, goal, reminder, inbox.
- Database write tests for task completion creating activity.
- Query tests for dashboard aggregates.
- UI smoke tests for `/mock`, `/dashboard`, and `/goals/[id]`.

Manual sample inputs:

- `今天学习 AWS 40 分钟`
- `明天下午练肩`
- `我今年想考 AWS DevOps`
- `周三晚上提醒我练肩`
- `今天完成了 Terraform 模块`
- `下周准备 Sansan 面试`
- `想学习 Rust`
- `今天跑步 20 分钟`

