# Single-Root Growth Tree Repair Design

## Problem

The production Dashboard reads four Goals and three Activities from Supabase,
but all four Goals have `parent_goal_id = null`. The current scene builder picks
the first root Goal and only traverses children whose `parent_goal_id` points to
that root. Production therefore renders only the first Goal, `生活`, as an
isolated trunk and silently omits `AI副业`, `前端`, and `投资`.

The previous deployment did not contain a growth-tree repair. It only shipped
the already-staged Action rate-limit changes.

## Approved Outcome

Production will persist one canonical root Goal and attach the four existing
Goals directly beneath it:

```text
人生
├── 生活
├── AI副业
├── 前端
└── 投资
```

After repair, the Dashboard must render one trunk and four branches. Existing
Activities remain attached to their current Goal IDs and therefore require no
rewriting.

## Data Invariant

For each user represented by the growth tree:

1. Exactly one canonical root Goal exists with title `人生`, category `root`,
   `metric_type = milestone`, active status, and `parent_goal_id = null`.
2. A non-root Goal without an explicit valid parent is attached to that
   canonical root.
3. Existing valid parent-child relationships remain unchanged.
4. Activity ownership and `goal_id` references remain unchanged during repair.

The repair targets the currently diagnosed production user only. It must first
re-read the target rows and abort if their IDs, user ownership, or root counts
do not match the diagnosed shape. The operation must run transactionally so the
new root and parent updates either all succeed or all roll back.

## Write-Path Prevention

The Supabase single-event writer will ensure the canonical `人生` root exists
before inserting a Goal. It will continue to honor an explicitly resolved
parent. If `parentTitle` or category lookup does not resolve a parent, it will
use the canonical root rather than writing another root Goal.

The in-memory writer will apply the same rule so local behavior matches
production. Existing Goals returned by title lookup are not silently reparented
during ordinary event ingestion; repairing existing malformed data remains an
explicit migration operation.

The batch writer already accepts explicit `parentGoalId`. Its database RPC will
apply the same canonical-root fallback when a new Goal arrives without a parent
ID, keeping the single-event and batch paths consistent.

## Renderer Defense

`buildGrowthTreeScene` will remain compatible with valid single-root data. If it
receives multiple root Goals, it will choose a canonical root deterministically:

1. Prefer a root with title `人生` or category `root`.
2. Otherwise choose the earliest root by `createdAt`, then `id`.

Any additional roots will be treated as direct children of the chosen root for
scene construction only. This does not mutate input data. It prevents future
malformed records from disappearing while keeping the database invariant
visible and repairable.

If no Goals exist, the current empty-scene behavior remains unchanged.

## Error Handling and Observability

- Supabase read or write errors abort the request or migration; they do not fall
  back to a successful-looking partial hierarchy.
- Production repair logs only aggregate counts and the created root ID. It does
  not log credentials or raw Action tokens.
- The repair verifies one root, four direct children, three preserved
  Activities, and zero missing Goal references before reporting success.
- Dashboard API verification checks that all five Goals are returned and that
  the scene model produces four branches.

## Testing

Implementation follows test-driven development.

1. Add a failing scene-model test proving four root Goals produce one root plus
   three branches instead of silently dropping three Goals.
2. Add failing store/repository tests proving an unresolved parent falls back
   to the canonical `人生` root.
3. Add a failing database contract test for canonical-root fallback in the
   batch RPC.
4. Implement the minimum changes required to make each test pass.
5. Run the focused tests, full Vitest suite, TypeScript typecheck, database test
   suite, and production build.
6. After deployment, verify the production Dashboard API and the visible tree.

## Rollout

1. Implement and verify code and migration changes locally.
2. Commit and push the repair.
3. Wait for the Vercel deployment to succeed.
4. Apply the guarded production data repair to the diagnosed user.
5. Re-read Supabase to verify the persisted hierarchy.
6. Request the production Dashboard API and visually confirm the tree.

The production data mutation is explicitly authorized by the user. No Goal or
Activity will be deleted.

## Out of Scope

- Introducing automatic `职业`, `理财`, or other category nodes.
- Redesigning the 3D tree appearance.
- Moving existing Activities between Goals.
- Changing Dashboard authentication or sharing behavior.
