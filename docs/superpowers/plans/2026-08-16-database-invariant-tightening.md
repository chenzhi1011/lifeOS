# Database Invariant Tightening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make metric storage, Goal ownership, Task completion, Reminder ownership, Goal naming, Goal shape, and optional input provenance match the approved Life OS rules.

**Architecture:** PostgreSQL remains the final authority for cross-row and transactional invariants. Input adapters normalize duration to minutes before the transactional RPC; domain rows may optionally reference a natural-language Message; tree aggregation continues to consume Goal and Activity facts. The clean `supabase/schema.sql` remains the final schema source, while tests establish each rule before production code changes.

**Tech Stack:** PostgreSQL/Supabase, PL/pgSQL, TypeScript, Zod, Next.js, Vitest.

---

### Task 1: Canonical metrics and Goal/Activity compatibility

**Files:**
- Modify: `tests/batch-preparation.test.ts`
- Modify: `tests/growth-tree-domain-schema.test.ts`
- Modify: `supabase/tests/growth_tree_domain.sql`
- Modify: `src/actions/batch-preparation.ts`
- Modify: `supabase/schema.sql`

- [x] Add failing tests proving `1 hour` becomes `60 minute`, duration rows only store `minute`, and Activity metric type must equal its Goal metric type.
- [x] Run the focused tests and confirm failures describe missing normalization/constraints.
- [x] Add a metric normalization helper in batch preparation, store canonical values, add `unique(user_id,id,metric_type)` to Goal, and use a composite Activity foreign key.
- [x] Update task completion so duration Goal tasks require an actual or planned duration; count/milestone may default to `1 count`.
- [x] Run focused TypeScript tests until green; PostgreSQL execution awaits a running Docker daemon.

### Task 2: Task completion and Reminder ownership

**Files:**
- Modify: `tests/growth-tree-domain-schema.test.ts`
- Modify: `tests/growth-completion.test.ts`
- Modify: `supabase/tests/growth_tree_domain.sql`
- Modify: `supabase/schema.sql`

- [x] Add failing tests for bidirectional Task status/completed-at shape, non-null Reminder task, and scheduled Reminder cancellation on Task completion/cancellation.
- [x] Run focused tests and verify the expected failures.
- [x] Add database CHECK/NOT NULL constraints and update completion RPCs to cancel pending reminders atomically.
- [x] Run focused tests until green.

### Task 3: Reusable Goal titles and simplified Goal shape

**Files:**
- Modify: `tests/growth-tree-domain-schema.test.ts`
- Modify: `tests/batch-resolution.test.ts`
- Modify: `tests/batch-validation.test.ts`
- Modify: `supabase/tests/batch_intake.sql`
- Modify: `supabase/schema.sql`
- Modify: `src/domain/types.ts`
- Modify: `src/domain/life-event-schema.ts`
- Modify: `src/actions/batch-validation.ts`
- Modify: `src/actions/batch-preparation.ts`
- Modify: `src/actions/repository.ts`
- Modify: `src/db/lifeos-read.ts`
- Modify: `docs/custom-gpt-actions/openapi.yaml`
- Modify dependent fixtures/components/tests that still consume `category` or `parentGoalId`.

- [x] Add failing contract tests requiring a normalized partial unique index for active/paused titles and forbidding `category`/`parent_goal_id` in the final Goal model.
- [x] Run tests and confirm the old Goal contract fails.
- [x] Remove `category` and `parent_goal_id` end to end; replace permanent title uniqueness with `lower(btrim(title)) WHERE status IN ('active','paused')`.
- [x] Update Goal resolution to search current Goals deterministically and allow completed titles to be reused.
- [x] Run all affected tests until green.

### Task 4: Optional Message provenance

**Files:**
- Modify: `tests/growth-tree-domain-schema.test.ts`
- Modify: `supabase/tests/growth_tree_domain.sql`
- Modify: `supabase/schema.sql`
- Modify: `src/domain/types.ts`
- Modify: `src/db/lifeos-read.ts`
- Modify: `src/domain/store.ts`
- Modify fixtures/tests containing `messageId`.

- [x] Add failing tests requiring nullable `source_message_id` on Task, Activity, and Reminder while AI batch writes still populate it.
- [x] Run focused tests and confirm the current mandatory `message_id` contract fails.
- [x] Rename the columns and TypeScript fields to `source_message_id` / `sourceMessageId`, preserving non-null values for AI-originated writes and allowing null for structured UI writes.
- [x] Run focused tests until green.

### Task 5: Full verification and review handoff

**Files:** all files changed above.

- [x] Run `npm test -- --run`.
- [x] Run `npm run typecheck` after the Next build types are stable.
- [x] Run `npm run build`.
- [ ] Run `npm run test:db` against the disposable local PostgreSQL container.
- [x] Run `git diff --check`, summarize `git diff --stat`, and leave every change uncommitted for user review.
