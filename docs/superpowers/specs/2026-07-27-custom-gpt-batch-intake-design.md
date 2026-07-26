# Custom GPT Batch Intake Design

**Date:** 2026-07-27
**Status:** Approved design, pending user review of this written specification

## Goal

Make the Life OS Custom GPT reliably turn one natural-language update into one or more structured Life OS records.

The intended experience includes statements such as:

- “今天要写报告。”
- “明天学习 AWS，属于转职目标。”
- “下周一要练肩。”
- “今天学习了 AWS 40 分钟。”
- “昨天练肩了。”

The system must distinguish future plans from completed activity, resolve relative dates in the user's timezone, associate records with existing goals, create reminders for future tasks, and avoid duplicate or partial writes.

## Scope

This design includes:

- Batch intake through a Custom GPT Action.
- Task, activity, goal, reminder, message, and inbox persistence.
- User timezone and default reminder-time preferences.
- Goal and alias resolution.
- Matching a completed activity to one existing open task.
- Transactional writes and retry-safe idempotency.
- GPT confirmation flows for missing goals and ambiguous task matches.
- Compatibility with the existing single-event Action during migration.

This design does not include:

- Sending a WeChat, email, or ChatGPT push notification.
- A production scheduler or notification worker.
- A settings UI for editing timezone and reminder time.
- Replacing Custom GPT parsing with a separate OpenAI API call in the backend.
- Unrelated Dashboard or growth-tree rendering changes.

The implementation will create correctly scheduled `reminders` rows. Delivery of those reminders is a separate follow-up project.

## Current State

The project currently exposes:

- `GET /api/actions/context` as `getLifeOSContext`.
- `POST /api/actions/life-event` as `recordLifeEvent`.

The existing write path accepts one event and stores data in `messages`, then conditionally in `goals`, `tasks`, `activities`, `reminders`, or `inbox_items`.

Current limitations relevant to this design are:

- One request primarily represents one event.
- A task may have a null `due_at`.
- A normal task does not automatically create a reminder.
- GPT retries can create duplicate records.
- Completed activity does not match and complete an existing task.
- The context response does not include open tasks or user time preferences.
- Goal creation can occur too eagerly when the GPT supplies a new goal title.

## Chosen Approach

Add a batch Action and perform the complete batch write in one PostgreSQL transaction.

The Custom GPT remains responsible for understanding the user's language and decomposing it into structured events. The backend remains responsible for authentication, validation, deterministic defaults, ownership checks, goal and task resolution, idempotency, and database writes.

This was selected over:

1. Making multiple calls to the existing single-event endpoint, which can partially succeed and is harder to retry safely.
2. Sending only raw text to the backend and calling another model, which adds API credentials, cost, latency, and a second parsing system.

## High-Level Flow

```text
User message
  -> Custom GPT calls getLifeOSContext
  -> GPT decomposes the message into up to 20 events
  -> GPT calls recordLifeEvents once
  -> API authenticates the Bearer credential
  -> API validates and normalizes the batch
  -> API resolves goals and candidate open tasks
  -> API calls one PostgreSQL transaction function
  -> Transaction writes normal records and Inbox records
  -> API returns created records and confirmation questions
  -> GPT summarizes the result or asks one required follow-up
```

## Action Contracts

### `getLifeOSContext`

Keep the existing operation and extend its response with:

- Authenticated user ID and action-credential name.
- Active goals and their parent relationships.
- Goal aliases.
- Open tasks that may be matched by a later completion statement.
- User timezone.
- User default reminder time.
- Current server time expressed in the user's timezone.

Open-task context must include only the authenticated user's rows and only the fields required for matching:

- Task ID.
- Title.
- Goal ID.
- Due time.
- Status.

### `recordLifeEvents`

Add:

```text
POST /api/actions/life-events
operationId: recordLifeEvents
```

The request contains:

- `idempotencyKey`: a non-empty client-generated identifier for this interpreted user message.
- `rawText`: the user's original, unmodified message.
- `events`: between 1 and 20 structured events in source order.

Each event contains:

- `type`: `task`, `activity`, `goal`, or `inbox`.
- `confidence`: number between 0 and 1.
- `summary` or type-specific title.
- Optional goal reference with Goal ID, title, whether the user named it explicitly, and match confidence.
- Type-specific task, activity, goal, or inbox fields.
- Optional `resolvesInboxItemId` for a confirmation response.

Task events carry a local calendar date and may carry an explicit absolute due time. Activity events carry an `occurredOn` date and may carry a metric and candidate open Task ID. The backend, rather than the GPT, applies missing-time and missing-metric defaults.

Reminder creation is a backend consequence of a future task, not a separate event the GPT must remember to submit.

The response contains:

- Whether the batch was newly processed or returned from idempotency storage.
- Created or updated record identifiers by event index.
- Human-readable result summaries.
- Confirmation requirements for Inbox events.

### Compatibility

Keep `recordLifeEvent` during migration. The revised Custom GPT instructions must use `recordLifeEvents`. The single-event endpoint can later be implemented as a one-item adapter over the batch service.

## Database Changes

### Profile preferences

Add to `profiles`:

- `timezone text not null default 'Asia/Tokyo'`
- `default_reminder_time time not null default '09:00'`

Existing users receive these defaults. Timezone values must be validated as supported IANA timezone identifiers by the application before update.

### Action batches

Add `action_batches`:

- `id uuid primary key`
- `user_id uuid not null`
- `idempotency_key text not null`
- `request_hash text not null`
- `raw_text text not null`
- `response_json jsonb not null`
- `created_at timestamptz not null default now()`
- Unique constraint on `(user_id, idempotency_key)`.
- Foreign key to `profiles`.

The batch row is created in the same transaction as its result rows. A duplicate `(user_id, idempotency_key)` with the same request hash returns the stored `response_json`. Reusing the key with different request content returns `409 Conflict`.

### Message membership

Add to `messages`:

- `batch_id uuid`
- `event_index integer`

Each extracted event gets one `messages` row. Events from the same user message share `raw_text` and `batch_id`, while `event_index` preserves their original order.

The existing single `intent_type` column remains valid because each row represents one extracted event.

Add a foreign key from `messages.batch_id` to `action_batches.id` and a unique constraint on `(batch_id, event_index)` for batch-created rows.

### Existing domain tables

Keep the current relationships:

- `tasks.goal_id` remains nullable.
- `activities.goal_id` remains required.
- `activities.task_id` remains optional.
- `reminders.task_id` remains optional at the schema level but is required for task-generated reminders.
- `inbox_items.message_id` identifies the unresolved event.

## Classification Rules

### Tasks

Future intent such as “要做”, “准备做”, or “计划做” creates a Task.

Rules:

- The Task starts with `status = open`.
- Explicit goal names or aliases are preferred over inferred goals.
- If no goal is mentioned and no existing goal can be inferred confidently, the Task is still created with `goal_id = null`.
- If the user explicitly says the Task belongs to a goal that does not exist, the event becomes an Inbox item instead of an unassigned Task.
- Every future Task creates one `reminders` row with `status = scheduled` and `repeat_rule = none`.
- The Task `due_at` and Reminder `remind_at` use the same effective time in this phase.

### Activities

Past or completed intent such as “做了”, “完成了”, or “学习了” creates an Activity.

Rules:

- `occurred_on` is resolved in the user's timezone.
- Explicit duration or count is preserved.
- If no duration or count is given, store `metric_type = count`, `value = 1`, and `unit = count`.
- Activity requires a resolved Goal because the existing schema requires `goal_id`.
- If no Goal can be resolved confidently, create an Inbox item instead of inventing a Goal.
- Do not create a new Goal solely because an Activity mentions a new noun.

### Goals

Create a Goal only when:

- The user explicitly states a long-term direction, or
- The user confirms creation after the GPT reports that an explicitly referenced goal does not exist.

Goal matching order is:

1. Authenticated-user Goal ID returned by context.
2. Exact active Goal title.
3. Exact Goal alias.
4. A GPT-proposed existing Goal match with confidence at least `0.85`.
5. Inbox confirmation.

When the user explicitly references a missing Goal, the GPT must ask whether to create it and which parent Goal it belongs under. The initial event is preserved in `inbox_items`.

The confirmation batch:

- Creates the approved Goal with the selected parent.
- Creates the original Task or Activity against the new Goal.
- Marks the referenced Inbox item `resolved`.

If the user declines, mark the Inbox item `dismissed` without creating a Goal or domain record.

## Time Rules

All relative dates are interpreted using the authenticated profile's timezone. The initial default is `Asia/Tokyo`.

Rules:

- “今天” resolves to the user's current calendar date.
- “明天” resolves to the next calendar date.
- “昨天” resolves to the previous calendar date.
- Weekday phrases such as “下周一” resolve against the user's local calendar.
- An explicit clock time takes precedence.
- Common periods resolve deterministically: `早上/上午 = 09:00`, `中午 = 12:00`, `下午 = 15:00`, and `晚上 = 20:00`.
- A date without a specific time uses `default_reminder_time`, initially `09:00`.
- If the user creates a Task for today after today's default time has passed, use one hour after the current time.
- If the user gives an explicitly past clock time while describing a future Task, return a confirmation requirement instead of silently changing the explicit time.

The backend receives absolute dates or date-plus-time components, re-applies the profile timezone, and validates that the resulting timestamp follows these rules.

## Task Completion Matching

When an Activity may represent completion of an existing Task, the GPT supplies an optional candidate Task ID from context.

The backend accepts the match only when:

- The candidate belongs to the authenticated user.
- The candidate status is `open`.
- The GPT's Task-match confidence is at least `0.85`.
- The normalized activity summary and Task title match, with Goal and date evidence used to narrow candidates.
- No second open Task has the same normalized title and equivalent Goal/date evidence.

On an accepted match, one transaction:

- Creates the Activity.
- Sets `activities.task_id` to the matched Task.
- Sets Task `status = completed`.
- Sets Task `completed_at` to the actual processing timestamp.

If multiple tasks are plausible, create an Inbox item and ask the user which Task was completed. Do not update any candidate Task until confirmation.

## Inbox and Partial Ambiguity

An ambiguous event is a valid batch outcome, not a server error.

For a batch containing both clear and ambiguous events:

- Clear events create their normal records.
- Ambiguous events create `messages` and `inbox_items` rows.
- All outcomes commit together in one transaction.

This preserves the approved “all database operations are transactional” behavior without blocking clear events merely because another event needs confirmation.

Invalid event structure is different from ambiguity. A structurally invalid event rejects the entire request before the transaction starts.

## Transaction and Idempotency

Use one PostgreSQL function, called through Supabase RPC, to write a normalized batch.

The function must:

- Check or create the `(user_id, idempotency_key)` batch.
- Insert one Message per event.
- Resolve or validate referenced row ownership.
- Insert or update domain rows in event order.
- Insert Reminder rows for future Tasks.
- Resolve or dismiss confirmed Inbox rows when requested.
- Store the stable response in `action_batches.response_json`.
- Return the response.

Any database error rolls back the batch row and all domain changes.

Concurrent calls with the same key are serialized by the unique constraint. The losing call compares `request_hash`, then either returns the committed response or returns `409 Conflict`.

## Component Boundaries

Implementation should keep these responsibilities separate:

1. `batch-validation`: validates the public request shape and maximum event count.
2. `time-normalization`: resolves deterministic time defaults from profile settings.
3. `goal-resolution`: resolves explicit titles, aliases, and safe existing matches.
4. `task-matching`: validates candidate Task ownership and uniqueness.
5. `batch-repository`: calls the transaction RPC and formats database results.
6. API route: authentication, rate limiting, request parsing, response status.
7. Custom GPT instructions and OpenAPI: natural-language decomposition and public Action contract.

Pure time and matching logic should be testable without Supabase.

## Error Handling

- Missing or invalid Bearer token: `401`, no writes.
- Rate limit exceeded: `429`, no writes.
- Invalid JSON or schema: `400`, no writes.
- Empty events or more than 20 events: `400`, no writes.
- Invalid date or time: `400`, no writes.
- Structurally valid ambiguity: `200`, with an Inbox result and confirmation prompt.
- Duplicate idempotency key: `200`, with the original stable result.
- Idempotency key reused with different content: `409`, no new writes.
- Database transaction failure: `500`, with all transaction writes rolled back.

Responses must not expose service-role credentials, token hashes, other users' identifiers, or raw database errors.

## Security

- Continue deriving `user_id` exclusively from the Bearer action credential.
- Continue rejecting any request body containing `userId`.
- Restrict all context queries to the authenticated user.
- Validate ownership again inside the transaction for Goal, Task, Inbox, and alias IDs.
- Preserve current token hashing, revocation, and rate limiting.
- Limit text lengths and batch size in both OpenAPI and backend validation.
- Enable row-level security for `action_batches` and add an own-row policy.
- Restrict transaction-function execution to the backend service path and set an explicit PostgreSQL `search_path`.

## Custom GPT Instructions

Revise the GPT instructions to require this sequence:

1. Call `getLifeOSContext`.
2. Split the user message into independent events.
3. Preserve `rawText` exactly.
4. Use existing Goal titles and aliases before inference.
5. Use open Task IDs only as candidate completion matches.
6. Submit one `recordLifeEvents` call for up to 20 events.
7. Summarize created Tasks, Activities, Goals, and Reminders.
8. Ask only the confirmation questions returned by the backend.

The GPT must not:

- Invent a Goal merely to satisfy Activity validation.
- Submit `userId`.
- Claim a Task was completed when the backend returned an Inbox result.
- Claim that a Reminder was delivered; only scheduling is in scope.

## Testing

### Unit tests

Cover:

- Today, tomorrow, yesterday, and next-weekday resolution in `Asia/Tokyo`.
- User-specific default reminder time.
- Today's expired default shifting to one hour after creation.
- Explicit time precedence.
- Explicit past time requiring confirmation.
- Missing Activity metric defaulting to `count = 1`.
- Goal title and alias matching order.
- Candidate Task ownership and open-status validation.
- Multiple matching Tasks becoming Inbox.

### Validation and route tests

Cover:

- One through 20 events accepted.
- Empty and over-limit batches rejected.
- Unknown fields rejected.
- `userId` rejected.
- Authentication and rate limiting preserved.
- OpenAPI examples accepted by the backend schema.

### Repository and database tests

Cover:

- Multiple Tasks and Activities created from one message.
- Every future Task receives one Reminder.
- A matched Task completes and links to its Activity.
- A missing explicit Goal becomes Inbox.
- A confirmation creates Goal plus original record and resolves Inbox.
- One invalid database write rolls back the complete transaction.
- Duplicate batch submission returns the first result without duplicate rows.
- Reusing a batch key with changed content is rejected.
- Cross-user Goal, Task, and Inbox references are rejected.

### Compatibility tests

Cover:

- Existing `recordLifeEvent` behavior remains available during migration.
- Existing Dashboard reads still work with the new profile fields and message columns.

## Rollout

1. Add database migration and transaction RPC.
2. Add backend batch types, pure normalizers, resolvers, and tests.
3. Add `recordLifeEvents` route.
4. Extend context response with preferences and open tasks.
5. Update OpenAPI and Custom GPT instructions.
6. Test against a non-production action credential.
7. Switch the Custom GPT to the batch operation.
8. Keep the single-event endpoint until the batch path is stable.

## Acceptance Criteria

The design is implemented successfully when:

- One user message can create multiple correctly typed records.
- Future statements become Tasks with effective times and scheduled Reminders.
- Completed statements become Activities on the correct local date.
- Metric-free completions use `count = 1`.
- Explicit existing Goal references are honored.
- Missing explicit Goals require confirmation and do not create accidental Goals.
- A unique matching Task is completed and linked to the new Activity.
- Ambiguous matches are preserved in Inbox.
- A failed batch does not leave partial domain writes.
- Retried batches do not create duplicates.
- The Custom GPT accurately reports scheduled records without claiming external notification delivery.
