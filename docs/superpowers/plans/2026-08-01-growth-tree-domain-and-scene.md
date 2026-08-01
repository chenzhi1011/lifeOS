# Growth Tree Domain and Scene Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 Life OS 从通用 Goal 树升级为“能力—长期目标—实际投入 / 短期目标—成果 / 一次性事项—近期生命力”的数据模型，并以稳定、可交互的 3D 绿色成长树、湖泊和群山场景呈现。

**Architecture:** Supabase 负责领域约束、幂等完成事务和人工映射迁移；服务端读取后由纯函数生成唯一合成根的 TreeViewModel；客户端把 TreeViewModel 分别交给树、环境、生命力和 HTML 面板模块。迁移先增加兼容字段和 `NOT VALID` 约束，默认只 dry-run，生产映射得到用户确认后才应用。

**Tech Stack:** Next.js 15、React 19、TypeScript、Supabase/PostgreSQL、Zod、Three.js、Vitest、Testing Library、Playwright、Docker PostgreSQL 15。

---

## 实施边界与文件结构

执行前使用 `superpowers:using-git-worktrees` 创建隔离 worktree。不要带入或提交主工作区中未跟踪的
`docs/superpowers/plans/2026-07-27-custom-gpt-batch-intake.md`。

新增文件及职责：

- `supabase/migrations/202608010001_growth_tree_domain.sql`：兼容生产旧行的增量 schema、约束和更新后的批量 RPC。
- `supabase/migrations/202608010002_growth_completion.sql`：Task/Goal 幂等完成 RPC。
- `supabase/migrations/202608010003_growth_model_mapping.sql`：旧数据显式映射的 service-role-only 事务 RPC。
- `supabase/tests/growth_tree_domain.sql`：领域约束、完成事务和跨用户隔离测试。
- `supabase/operations/validate_growth_tree_constraints.sql`：人工迁移完成后才运行的约束验证。
- `src/domain/vitality.ts`：最近 30 天一次性事项到有限环境元素的纯函数。
- `src/domain/stable-seed.ts`：从实体 ID 生成跨刷新稳定的伪随机值。
- `src/components/GrowthTreeDashboard.tsx`：选择状态、详情和果实抽屉的 React 编排。
- `src/components/GrowthTreeScene.tsx`：Canvas、相机、OrbitControls、raycasting 和资源生命周期。
- `src/components/growth-tree/GrowthEnvironment.ts`：湖泊、群山、岩石草坡、云雾和灯光。
- `src/components/growth-tree/VitalityElements.ts`：水滴、小生物和花草实例及轻微环境运动。
- `src/components/growth-tree/scene-config.ts`：模型 URL、颜色、材质和性能配置；以后替换自有 GLB/GLTF 只改这里。
- `src/components/TreeDetailPanel.tsx`：Ability / 长期 Goal / 短期 Goal 的 HTML 详情。
- `src/components/AchievementDrawer.tsx`：按时间倒序显示成果。
- `src/actions/growth-completion.ts`：完成 RPC 的服务端仓库。
- `app/api/tasks/[id]/complete/route.ts`：完成 Task 的认证入口。
- `app/api/goals/[id]/complete/route.ts`：完成 Goal 的认证入口。
- `app/dashboard/loading.tsx`、`app/dashboard/error.tsx`：加载和数据库失败状态。
- `scripts/migrate-growth-model.ts`：显式映射、默认 dry-run 的迁移工具。
- `tests/growth-tree-domain-schema.test.ts`、`tests/growth-completion.test.ts`、`tests/lifeos-read.test.ts`、`tests/vitality.test.ts`、`tests/growth-tree-dashboard.test.tsx`、`tests/growth-environment-contract.test.ts`、`tests/growth-model-migration.test.ts`：新增测试。

重点修改文件：

- `supabase/schema.sql`
- `scripts/test-batch-rpc.sh`
- `src/domain/types.ts`
- `src/domain/seed.ts`
- `src/domain/store.ts`
- `src/domain/aggregation.ts`
- `src/domain/tree-visualization.ts`
- `src/domain/tree-interaction.ts`
- `src/actions/batch-validation.ts`
- `src/actions/batch-preparation.ts`
- `src/actions/batch-resolution.ts`
- `src/actions/batch-repository.ts`
- `src/actions/repository.ts`
- `src/actions/validation.ts`
- `src/db/lifeos-read.ts`
- `src/components/RealisticGrowthTree.tsx`
- `src/components/growth-tree-geometry.ts`
- `app/dashboard/page.tsx`
- `app/api/dashboard/route.ts`
- 现有相关 Vitest 和 Supabase SQL 测试。
- `docs/custom-gpt-actions/openapi.yaml`、`docs/custom-gpt-actions/instructions.md`、`docs/custom-gpt-actions/setup.md`

### Task 1: 建立兼容旧数据的数据库领域骨架

**Files:**
- Create: `tests/growth-tree-domain-schema.test.ts`
- Create: `supabase/migrations/202608010001_growth_tree_domain.sql`
- Modify: `supabase/schema.sql`
- Modify: `supabase/tests/batch_intake.sql`

- [ ] **Step 1: 写 schema 失败测试**

```ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const schema = readFileSync("supabase/schema.sql", "utf8");
const migration = readFileSync(
  "supabase/migrations/202608010001_growth_tree_domain.sql",
  "utf8"
);

describe("growth tree domain schema", () => {
  it.each([schema, migration])("defines explicit growth entities", (sql) => {
    expect(sql).toMatch(/create table(?: if not exists)? abilities/i);
    expect(sql).toContain("goal_type");
    expect(sql).toContain("ability_id");
    expect(sql).toContain("planned_metric_type");
    expect(sql).toContain("short_goal_id");
    expect(sql).toContain("idx_activities_user_task_unique");
    expect(sql).toContain("ability");
  });
});
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `npm test -- tests/growth-tree-domain-schema.test.ts`

Expected: FAIL，因为 migration 不存在且 schema 没有 `abilities`。

- [ ] **Step 3: 在 migration 中添加兼容 DDL**

Migration 必须保留旧行，使用 nullable 字段配合 `NOT VALID` 约束；新写入立即受约束：

```sql
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

alter table goals
  add constraint goals_goal_type_required check (goal_type is not null) not valid,
  add constraint goals_goal_type_check check (goal_type in ('long_term', 'short_term')) not valid,
  add constraint goals_ability_shape_check check (
    (goal_type = 'long_term' and ability_id is not null)
    or (goal_type = 'short_term' and ability_id is null)
  ) not valid,
  add constraint goals_completed_at_check check (
    status <> 'completed' or completed_at is not null
  ) not valid,
  add constraint goals_ability_fk foreign key (user_id, ability_id)
    references abilities(user_id, id) not valid;

alter table tasks
  add column if not exists planned_metric_type text,
  add column if not exists planned_value numeric,
  add column if not exists planned_unit text;

alter table tasks add constraint tasks_planned_metric_shape_check check (
  (planned_metric_type is null and planned_value is null and planned_unit is null)
  or (
    planned_metric_type in ('duration', 'count', 'milestone')
    and planned_value > 0
    and planned_unit in ('minute', 'hour', 'count')
  )
) not valid;

alter table achievements rename column goal_id to short_goal_id;
alter table achievements
  add column if not exists note text,
  add column if not exists evidence_url text;
create unique index if not exists idx_achievements_user_short_goal
  on achievements(user_id, short_goal_id) where short_goal_id is not null;
create unique index if not exists idx_activities_user_task_unique
  on activities(user_id, task_id) where task_id is not null;

create or replace function enforce_achievement_short_goal()
returns trigger language plpgsql set search_path = public, pg_temp as $function$
begin
  if new.short_goal_id is null or not exists (
    select 1 from goals
    where user_id = new.user_id
      and id = new.short_goal_id
      and goal_type = 'short_term'
  ) then
    raise exception 'achievement requires a short_term goal owned by the user';
  end if;
  return new;
end
$function$;

create trigger achievements_short_goal_guard
before insert or update of user_id, short_goal_id on achievements
for each row execute function enforce_achievement_short_goal();
```

Migration 还要重建 `messages_intent_type_check` 和 `inbox_items_suggested_type_check`，把
`ability` 加入允许值；为 abilities 添加 RLS、own-row policy 和 user/status 索引。

- [ ] **Step 4: 把最终严格结构同步到 clean schema**

在 `supabase/schema.sql` 中使用 `goal_type text not null`，并直接声明复合外键与 shape check；
Achievement 使用 `short_goal_id`。更新 `supabase/tests/batch_intake.sql` 的 Goal fixture：先插入
Ability，再为每个 Goal 提供 `goal_type = 'long_term'` 和 `ability_id`。

- [ ] **Step 5: 运行 schema 与现有 DB 测试**

Run: `npm test -- tests/growth-tree-domain-schema.test.ts tests/supabase-batch-schema.test.ts`

Expected: PASS。

Run: `npm run test:db`

Expected: PASS，现有批量 RPC 行为未回归。

- [ ] **Step 6: 提交数据库骨架**

```bash
git add tests/growth-tree-domain-schema.test.ts supabase/schema.sql supabase/migrations/202608010001_growth_tree_domain.sql supabase/tests/batch_intake.sql
git commit -m "feat: add explicit growth tree domain schema"
```

### Task 2: 更新 TypeScript 领域类型和内存 fixture

**Files:**
- Modify: `src/domain/types.ts`
- Modify: `src/domain/seed.ts`
- Modify: `src/domain/store.ts`
- Modify: `tests/store.test.ts`

- [ ] **Step 1: 写新的 seed 领域断言**

```ts
it("separates abilities from typed goals", () => {
  const state = createInitialState();
  expect(state.abilities.map((ability) => ability.title)).toContain("前端能力");
  expect(state.goals.every((goal) => goal.goalType !== null)).toBe(true);
  expect(
    state.goals
      .filter((goal) => goal.goalType === "long_term")
      .every((goal) => goal.abilityId !== null)
  ).toBe(true);
  expect(
    state.goals
      .filter((goal) => goal.goalType === "short_term")
      .every((goal) => goal.abilityId === null)
  ).toBe(true);
});
```

- [ ] **Step 2: 运行测试并确认类型或断言失败**

Run: `npm test -- tests/store.test.ts`

Expected: FAIL，因为 `LifeOSState` 没有 abilities，Goal 没有 goalType。

- [ ] **Step 3: 添加精确领域类型**

```ts
export type AbilityStatus = "active" | "archived";
export type GoalType = "long_term" | "short_term";

export type Ability = {
  id: string;
  userId: string;
  title: string;
  status: AbilityStatus;
  createdAt: string;
  archivedAt: string | null;
};

export type Goal = {
  id: string;
  userId: string;
  title: string;
  category: string;
  parentGoalId: string | null;
  goalType: GoalType | null;
  abilityId: string | null;
  metricType: MetricType;
  status: GoalStatus;
  dueAt: string | null;
  completedAt: string | null;
  createdAt: string;
};
```

给 Task 增加三个 nullable planned 字段；把 Achievement 的 `goalId` 改成
`shortGoalId`，增加 `note` 和 `evidenceUrl`；给 `LifeOSState` 增加 `abilities`；把
`IntentType` 增加 `ability`。同步扩展 `LifeEventParseResult`：Task 事件携带
`path: "one_off" | "goal"`，Ability 事件携带 ability title，Goal 事件携带 goalType 和可选
ability reference，确保 store、单事件和批量事件共享同一词汇。

- [ ] **Step 4: 重写 seed 使其符合新模型**

Seed 至少包含：`前端能力`、`健康能力`、`投资能力`；AWS/AI 为前端能力的长期 Goal，增肌为
健康能力的长期 Goal，转职为 active 短期 Goal，另设一个 completed 短期 Goal 和唯一
Achievement。删除 `人生`、`职业` 等伪 Goal 父节点。

- [ ] **Step 5: 让内存 store 编译并保持同样约束**

`resolveGoal` 必须只创建显式类型 Goal；Ability 事件创建 Ability；一次性 Task 不调用
`resolveGoal`。这一步先保持既有 API 可运行，Task path 的强校验由 Task 3 完成。

- [ ] **Step 6: 运行测试和类型检查**

Run: `npm test -- tests/store.test.ts tests/aggregation.test.ts`

Expected: PASS。

Run: `npm run typecheck`

Expected: PASS。

- [ ] **Step 7: 提交类型和 fixture**

```bash
git add src/domain/types.ts src/domain/seed.ts src/domain/store.ts tests/store.test.ts tests/aggregation.test.ts
git commit -m "refactor: model abilities and typed goals"
```

### Task 3: 强制 Action 分类和唯一目标归属

**Files:**
- Modify: `src/actions/batch-validation.ts`
- Modify: `src/actions/batch-resolution.ts`
- Modify: `src/actions/batch-preparation.ts`
- Modify: `src/actions/repository.ts`
- Modify: `tests/batch-validation.test.ts`
- Modify: `tests/batch-preparation.test.ts`
- Modify: `tests/action-context.test.ts`
- Create: `tests/custom-gpt-action-contract.test.ts`
- Modify: `docs/custom-gpt-actions/openapi.yaml`
- Modify: `docs/custom-gpt-actions/instructions.md`
- Modify: `docs/custom-gpt-actions/setup.md`

- [ ] **Step 1: 写失败测试：Task path 必须与 Goal 引用一致**

```ts
it.each([
  [{ path: "one_off", goal: { title: "AWS", explicit: true } }, "one_off forbids goal"],
  [{ path: "goal" }, "goal path requires goal"]
])("rejects an inconsistent task path: %s", (extra) => {
  expect(() => validateLifeEventBatchPayload({
    idempotencyKey: "task-path",
    rawText: "测试",
    events: [{
      type: "task",
      confidence: 0.9,
      title: "学习",
      localDate: "2026-08-01",
      priority: "normal",
      ...extra
    }]
  })).toThrow();
});
```

- [ ] **Step 2: 写失败测试：Ability 和两种 Goal**

```ts
const parsed = validateLifeEventBatchPayload({
  idempotencyKey: "ability-goal",
  rawText: "培养前端能力并学习架构",
  events: [
    { type: "ability", title: "前端能力", confidence: 0.99 },
    {
      type: "goal",
      goalType: "long_term",
      title: "学习架构",
      category: "职业",
      ability: { title: "前端能力" },
      metricType: "duration",
      aliases: [],
      confidence: 0.98
    }
  ]
});
expect(parsed.events.map((event) => event.type)).toEqual(["ability", "goal"]);
```

- [ ] **Step 3: 运行失败测试**

Run: `npm test -- tests/batch-validation.test.ts tests/batch-preparation.test.ts tests/action-context.test.ts`

Expected: FAIL，`ability`、`path`、`goalType` 和 abilities context 尚不存在。

- [ ] **Step 4: 实现 Zod 合约和 PreparedEvent**

Task schema 增加 `path: z.enum(["one_off", "goal"])` 与可选 metric，并在 `superRefine`
实施互斥规则。新增 Ability reference、Ability event；Goal schema 改为判别后的严格结构：

```ts
const abilityBatchInputSchema = z.object({
  ...commonEventFields,
  type: z.literal("ability"),
  title: textField
}).strict();

const goalBatchInputSchema = z.object({
  ...commonEventFields,
  type: z.literal("goal"),
  goalType: z.enum(["long_term", "short_term"]),
  title: textField,
  category: textField,
  ability: abilityReferenceSchema.optional(),
  metricType: z.enum(["duration", "count", "milestone"]).default("count"),
  aliases: z.array(textField).max(12).default([])
}).strict().superRefine((goal, ctx) => {
  if (goal.goalType === "long_term" && !goal.ability) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "long_term goal requires ability" });
  }
  if (goal.goalType === "short_term" && goal.ability) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "short_term goal forbids ability" });
  }
});
```

- [ ] **Step 5: 实现 context 和准备逻辑**

`BatchPreparationContext` 增加 abilities。one_off Task 直接准备 `goalId: null`；goal path 必须
唯一解析，失败进入 Inbox。支持同批次先创建 Ability，再通过 `abilityTitle` 创建长期 Goal；禁止
forward reference。Prepared Task 携带 planned metric 三元组。

- [ ] **Step 6: 更新 action context 查询和格式化**

`readActionContext` 增加 `.from("abilities")` 用户过滤；Goal context 增加 `goalType`、
`abilityId`。Ability 只按 ID 或标准化标题解析；Goal 继续支持 alias。

- [ ] **Step 7: 运行聚焦测试和类型检查**

在 `tests/custom-gpt-action-contract.test.ts` 读取 OpenAPI 和 instructions，断言文档包含 ability、
goalType、task path 的 one_off/goal，并且不再指导模型为一次性事项创建“生活” Goal。

Run: `npm test -- tests/batch-validation.test.ts tests/batch-preparation.test.ts tests/batch-resolution.test.ts tests/action-context.test.ts tests/custom-gpt-action-contract.test.ts`

Expected: PASS。

Run: `npm run typecheck`

Expected: PASS。

- [ ] **Step 8: 提交分类合约**

```bash
git add src/actions/batch-validation.ts src/actions/batch-resolution.ts src/actions/batch-preparation.ts src/actions/repository.ts tests/batch-validation.test.ts tests/batch-preparation.test.ts tests/batch-resolution.test.ts tests/action-context.test.ts tests/custom-gpt-action-contract.test.ts docs/custom-gpt-actions/openapi.yaml docs/custom-gpt-actions/instructions.md docs/custom-gpt-actions/setup.md
git commit -m "feat: validate explicit growth paths"
```

### Task 4: 扩展事务批量 RPC

**Files:**
- Modify: `supabase/schema.sql`
- Modify: `supabase/migrations/202608010001_growth_tree_domain.sql`
- Modify: `supabase/tests/batch_intake.sql`
- Modify: `src/actions/batch-repository.ts`
- Modify: `tests/batch-repository.test.ts`
- Modify: `tests/supabase-batch-schema.test.ts`

- [ ] **Step 1: 写失败的 RPC 合约测试**

在 schema contract 中要求 `record_life_event_batch` 接受 `ability`，长期 Goal 写入
`goal_type`/`ability_id`，Task 写入 planned metric；在 repository 测试中加入：

```ts
expect(result.results[0]).toEqual({
  eventIndex: 0,
  kind: "ability",
  messageId: "message-ability",
  abilityId: "ability-frontend"
});
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `npm test -- tests/batch-repository.test.ts tests/supabase-batch-schema.test.ts`

Expected: FAIL，result kind 和 SQL RPC 都不认识 ability。

- [ ] **Step 3: 更新 RPC 的事件分支**

允许集合改为 `('ability', 'goal', 'task', 'activity', 'inbox')`。Ability 分支使用
`on conflict (user_id, title)` 幂等返回；Goal 分支必须验证同一用户 Ability 并写入类型：

```sql
if v_kind = 'ability' then
  insert into abilities (user_id, title, status)
  values (p_user_id, v_event->>'title', 'active')
  on conflict (user_id, title) do update set title = excluded.title
  returning id into v_ability_id;
elsif v_kind = 'goal' then
  v_ability_id := nullif(v_event->>'abilityId', '')::uuid;
  if v_ability_id is null and nullif(btrim(v_event->>'abilityTitle'), '') is not null then
    select id into v_ability_id from abilities
    where user_id = p_user_id and status = 'active'
      and lower(btrim(title)) = lower(btrim(v_event->>'abilityTitle'));
  end if;
  if v_event->>'goalType' = 'long_term' and v_ability_id is null then
    raise exception 'long_term goal requires ability at event index %', v_event_index;
  end if;
  if v_event->>'goalType' = 'short_term' and v_ability_id is not null then
    raise exception 'short_term goal forbids ability at event index %', v_event_index;
  end if;
end if;
```

Task 分支写入 `plannedMetricType`、`plannedValue`、`plannedUnit`。Result JSON 对 Ability 返回
`abilityId`。同步修改 schema 与 migration 中的完整函数定义。

- [ ] **Step 4: 更新 Supabase SQL 行为测试**

加入同批次 Ability → 长期 Goal → goal-path Task；加入 short-term 带 Ability 回滚、跨用户
Ability 引用回滚和 one_off Task 的 `goal_id is null` 断言。

- [ ] **Step 5: 更新 TypeScript RPC 返回校验**

`BatchEventWriteResult.kind` 增加 ability，`optionalEntityIdKeys` 增加 abilityId，
`hasRequiredEntityIds` 对 ability 强制 abilityId。

- [ ] **Step 6: 运行全部 Action 与 DB 测试**

Run: `npm test -- tests/batch-repository.test.ts tests/action-batch-route.test.ts tests/supabase-batch-schema.test.ts`

Expected: PASS。

Run: `npm run test:db`

Expected: PASS。

- [ ] **Step 7: 提交事务写入扩展**

```bash
git add supabase/schema.sql supabase/migrations/202608010001_growth_tree_domain.sql supabase/tests/batch_intake.sql src/actions/batch-repository.ts tests/batch-repository.test.ts tests/supabase-batch-schema.test.ts tests/action-batch-route.test.ts
git commit -m "feat: persist abilities and typed goals in batches"
```

### Task 5: 统一单事件和内存写入行为

**Files:**
- Modify: `src/actions/validation.ts`
- Modify: `src/actions/repository.ts`
- Modify: `src/domain/store.ts`
- Modify: `src/ai/mock-parser.ts`
- Modify: `src/ai/normalize.ts`
- Modify: `tests/action-security.test.ts`
- Modify: `tests/mock-parser.test.ts`
- Modify: `tests/store.test.ts`

- [ ] **Step 1: 写单事件 one_off 与 goal path 测试**

```ts
expect(validateLifeEventPayload({
  type: "task",
  path: "one_off",
  rawText: "买水",
  confidence: 0.98,
  task: { title: "买水", dueAt: null, priority: "normal" }
})).toMatchObject({ type: "task", path: "one_off" });

expect(() => validateLifeEventPayload({
  type: "task",
  path: "goal",
  rawText: "学习",
  confidence: 0.9,
  task: { title: "学习" }
})).toThrow(/goal path requires goal/);
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `npm test -- tests/action-security.test.ts tests/mock-parser.test.ts tests/store.test.ts`

Expected: FAIL，legacy schema 不支持 path 和 ability。

- [ ] **Step 3: 复用同一领域规则**

单事件 schema 增加 `path`、Ability、goalType/ability reference；`writeSupabaseLifeEvent` 与内存
store 都执行：one_off 不解析 Goal、goal path 必须有目标、长期 Goal 必须有 Ability、短期 Goal
禁止 Ability。Mock parser 对没有成长目标的日常事项输出 one_off，不再自动创建“生活” Goal。

- [ ] **Step 4: 运行单事件、store 和类型检查**

Run: `npm test -- tests/action-security.test.ts tests/mock-parser.test.ts tests/store.test.ts`

Expected: PASS。

Run: `npm run typecheck`

Expected: PASS。

- [ ] **Step 5: 提交兼容写入**

```bash
git add src/actions/validation.ts src/actions/repository.ts src/domain/store.ts src/ai/mock-parser.ts src/ai/normalize.ts tests/action-security.test.ts tests/mock-parser.test.ts tests/store.test.ts
git commit -m "refactor: align all life event writers"
```

### Task 6: 实现幂等 Task 和 Goal 完成事务

**Files:**
- Create: `supabase/migrations/202608010002_growth_completion.sql`
- Create: `supabase/tests/growth_tree_domain.sql`
- Create: `src/actions/growth-completion.ts`
- Create: `app/api/tasks/[id]/complete/route.ts`
- Create: `app/api/goals/[id]/complete/route.ts`
- Create: `tests/growth-completion.test.ts`
- Modify: `supabase/schema.sql`
- Modify: `scripts/test-batch-rpc.sh`

- [ ] **Step 1: 写 repository 和 route 失败测试**

```ts
it("passes actual metric to complete_task", async () => {
  const rpc = vi.fn().mockResolvedValue({
    data: { taskId: "task-1", status: "completed", activityId: "activity-1", duplicate: false },
    error: null
  });
  await completeTask("user-1", "task-1", {
    occurredOn: "2026-08-01",
    metric: { type: "duration", value: 30, unit: "minute" }
  }, { rpc });
  expect(rpc).toHaveBeenCalledWith("complete_growth_task", expect.objectContaining({
    p_user_id: "user-1",
    p_task_id: "task-1",
    p_value: 30
  }));
});
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `npm test -- tests/growth-completion.test.ts`

Expected: FAIL，因为 repository 和 routes 不存在。

- [ ] **Step 3: 实现 `complete_growth_task`**

函数只授予 service_role。锁定同一用户 Task；已完成时返回现有 Activity；一次性 Task 只更新
status/completed_at；目标型 Task 使用实际 metric、planned metric、`count = 1` 的优先级插入唯一
Activity，并复用 Task 的 message_id。

返回格式固定为：

```json
{"taskId":"uuid","status":"completed","activityId":"uuid-or-null","duplicate":false}
```

- [ ] **Step 4: 实现 `complete_growth_goal`**

长期 Goal 只完成并返回 `achievementId = null`；短期 Goal 使用以下幂等写入并返回唯一
Achievement。两个函数都验证用户归属和 Goal 类型。

```sql
insert into achievements (
  user_id,
  short_goal_id,
  title,
  metric_type,
  threshold_value,
  achieved_at,
  note,
  evidence_url
)
values (
  p_user_id,
  v_goal_id,
  coalesce(nullif(btrim(p_title), ''), v_goal_title),
  'milestone',
  null,
  now(),
  p_note,
  p_evidence_url
)
on conflict (user_id, short_goal_id)
do update set
  title = excluded.title,
  note = excluded.note,
  evidence_url = excluded.evidence_url
returning id into v_achievement_id;
```

- [ ] **Step 5: 实现仓库与认证 routes**

两个 route 使用 `requireActionCredential`，Zod 校验 body，不接受 body userId；将未知数据库错误
映射为不泄漏细节的 500。Goal route 接受 `title`、`note`、`evidenceUrl`，Task route 接受
`occurredOn` 和可选 metric。

- [ ] **Step 6: 扩展 DB runner 并写 SQL 断言**

`scripts/test-batch-rpc.sh` 在 batch test 后执行
`/workspace/supabase/tests/growth_tree_domain.sql`。SQL 测试必须证明重复完成不重复 Activity/
Achievement、一次性 Task 不产生 Activity、跨用户调用回滚。

- [ ] **Step 7: 运行聚焦测试和 DB 测试**

Run: `npm test -- tests/growth-completion.test.ts tests/action-security.test.ts`

Expected: PASS。

Run: `npm run test:db`

Expected: PASS。

- [ ] **Step 8: 提交完成事务**

```bash
git add supabase/schema.sql supabase/migrations/202608010002_growth_completion.sql supabase/tests/growth_tree_domain.sql scripts/test-batch-rpc.sh src/actions/growth-completion.ts 'app/api/tasks/[id]/complete/route.ts' 'app/api/goals/[id]/complete/route.ts' tests/growth-completion.test.ts
git commit -m "feat: complete growth tasks and goals atomically"
```

### Task 7: 扩展 Dashboard 数据读取和聚合

**Files:**
- Create: `tests/lifeos-read.test.ts`
- Modify: `src/domain/aggregation.ts`
- Modify: `src/db/lifeos-read.ts`
- Modify: `tests/aggregation.test.ts`
- Modify: `app/api/dashboard/route.ts`

- [ ] **Step 1: 写聚合失败测试**

```ts
it("keeps tasks out of tree data except recent one-off completions", () => {
  const data = buildDashboardData(state, "demo-user", new Date("2026-08-01T00:00:00Z"));
  expect(data.recentCompletedOneOffTasks.every((task) => task.goalId === null)).toBe(true);
  expect(data.recentCompletedOneOffTasks.every((task) => task.status === "completed")).toBe(true);
  expect(data.abilities.length).toBeGreaterThan(0);
  expect(data.achievements.every((achievement) => achievement.shortGoalId !== null)).toBe(true);
});
```

- [ ] **Step 2: 写 Supabase 查询范围失败测试**

Mock `from` builders，断言 abilities/goals/activities/tasks/achievements/inbox_items 全部调用
`.eq("user_id", userId)`；Task 还要过滤 `status = completed`、`goal_id is null` 和 30 天起点。

- [ ] **Step 3: 运行测试并确认失败**

Run: `npm test -- tests/aggregation.test.ts tests/lifeos-read.test.ts`

Expected: FAIL，DashboardData 不包含新集合，读取层只查三张表。

- [ ] **Step 4: 实现 DashboardData**

```ts
export type DashboardData = {
  abilities: Ability[];
  goals: Goal[];
  goalStats: GoalGrowthStat[];
  allActivities: Activity[];
  recentActivities: Activity[];
  recentCompletedOneOffTasks: Task[];
  achievements: Achievement[];
  heatmap: HeatmapPoint[];
  inboxCount: number;
};
```

`buildDashboardData` 接收显式 `asOf`，用 UTC 日期计算 inclusive 30 天窗口，避免测试依赖系统时间。

- [ ] **Step 5: 实现 Supabase 并行读取和映射**

读取错误立即 throw；不要在 Supabase 已配置但查询失败时回退 demo store。映射 goalType=null 的遗留
Goal，交由 TreeViewModel diagnostics 处理。

- [ ] **Step 6: 运行聚焦测试和类型检查**

Run: `npm test -- tests/aggregation.test.ts tests/lifeos-read.test.ts tests/dashboard-user-id.test.ts`

Expected: PASS。

Run: `npm run typecheck`

Expected: PASS。

- [ ] **Step 7: 提交读取层**

```bash
git add src/domain/aggregation.ts src/db/lifeos-read.ts app/api/dashboard/route.ts tests/aggregation.test.ts tests/lifeos-read.test.ts
git commit -m "feat: read complete growth dashboard data"
```

### Task 8: 用纯函数生成确定的 TreeViewModel

**Files:**
- Create: `src/domain/vitality.ts`
- Create: `src/domain/stable-seed.ts`
- Create: `tests/vitality.test.ts`
- Modify: `src/domain/tree-visualization.ts`
- Modify: `src/domain/tree-interaction.ts`
- Modify: `tests/tree-visualization.test.ts`
- Modify: `tests/tree-interaction.test.ts`

- [ ] **Step 1: 写完整行为失败测试**

测试夹具包含两个 Ability、一个 active 长期 Goal、一个 completed 长期 Goal、一个 active 短期
Goal、一个 completed 短期 Goal、窗口内外 Activity 和窗口内外一次性 Task。断言：

```ts
expect(model.root.label).toBe("人生");
expect(model.abilityBranches.map((branch) => branch.abilityId)).toEqual(["ability-a", "ability-b"]);
expect(model.longGoalTwigs.map((twig) => twig.goalId)).toContain("long-completed");
expect(model.shortGoalBranches.map((branch) => branch.goalId)).toEqual(["short-active"]);
expect(model.activityLeaves.map((leaf) => leaf.activityId)).toEqual(["activity-recent"]);
expect(model.diagnostics).toContainEqual(expect.objectContaining({ code: "untyped_goal" }));
```

- [ ] **Step 2: 写生命力失败测试**

```ts
const first = buildVitalityElements(tasks, new Date("2026-08-01T00:00:00Z"));
const second = buildVitalityElements(tasks, new Date("2026-08-01T00:00:00Z"));
expect(second).toEqual(first);
expect(first.length).toBeLessThanOrEqual(18);
expect(first.every((element) => element.source === "one_off_completion")).toBe(true);
```

- [ ] **Step 3: 运行测试并确认失败**

Run: `npm test -- tests/tree-visualization.test.ts tests/vitality.test.ts tests/tree-interaction.test.ts`

Expected: FAIL，旧 builder 选择第一个 parentGoal root。

- [ ] **Step 4: 定义新的 ViewModel 类型和稳定种子**

Tree wood 使用 `entityType: "root" | "ability" | "long_goal" | "short_goal"`、entityId、label、
start/end/thickness/status；ActivityLeaf 使用 activityId 和 goalId；diagnostic 使用 code/entityId/message。
位置只调用 `src/domain/stable-seed.ts` 导出的纯 `seedFromId`，禁止 `Math.random()`。
新入口固定为
`buildGrowthTreeViewModel(data: DashboardData, asOf: Date): GrowthTreeViewModel`，后续服务端页面和
测试都只使用该名称。

- [ ] **Step 5: 实现合成根和全部分支投影**

Ability 大枝来自全部 active Ability；长期树杈包含 active/paused/completed；短期枝只包含
active/paused；最近 30 天 Activity 一条对应一个 leaf；历史 totals 单调增加 wood thickness。
goalType=null、缺 Ability、错误 Ability 归属进入 diagnostics。

- [ ] **Step 6: 实现确定且封顶的 vitality**

初始最大值固定为水滴 7、小生物 3、花草 8，总计 18。类型和位置由完成 Task ID 的稳定种子
决定，不播放完成动画。

- [ ] **Step 7: 运行测试和类型检查**

Run: `npm test -- tests/tree-visualization.test.ts tests/vitality.test.ts tests/tree-interaction.test.ts`

Expected: PASS。

Run: `npm run typecheck`

Expected: PASS。

- [ ] **Step 8: 提交 TreeViewModel**

```bash
git add src/domain/tree-visualization.ts src/domain/tree-interaction.ts src/domain/vitality.ts src/domain/stable-seed.ts tests/tree-visualization.test.ts tests/tree-interaction.test.ts tests/vitality.test.ts
git commit -m "feat: project growth data into a stable tree model"
```

### Task 9: 建立 Dashboard HTML 交互层和明确状态

**Files:**
- Create: `src/components/GrowthTreeDashboard.tsx`
- Create: `src/components/TreeDetailPanel.tsx`
- Create: `src/components/AchievementDrawer.tsx`
- Create: `app/dashboard/loading.tsx`
- Create: `app/dashboard/error.tsx`
- Create: `tests/growth-tree-dashboard.test.tsx`
- Modify: `app/dashboard/page.tsx`
- Delete: `src/components/GrowthTreeDetailsPanel.tsx`
- Modify: `tests/growth-tree-details-panel.test.tsx`

- [ ] **Step 1: 写面板和状态失败测试**

```tsx
render(<GrowthTreeDashboard viewModel={viewModel} achievements={achievements} />);
expect(screen.getByRole("button", { name: /果实面板 · 2/ })).toBeTruthy();
fireEvent.click(screen.getByRole("button", { name: /果实面板/ }));
expect(screen.getByText("通过前端面试")).toBeTruthy();
expect(screen.queryByText("未完成 Task")).toBeNull();
```

另测 diagnostics 提示、真实空数据引导、error.tsx 的“树数据加载失败”和重试按钮。

- [ ] **Step 2: 运行测试并确认失败**

Run: `npm test -- tests/growth-tree-dashboard.test.tsx tests/growth-tree-details-panel.test.tsx`

Expected: FAIL，新组件不存在。

- [ ] **Step 3: 实现 React 编排**

`GrowthTreeDashboard` 维护 `{ entityType, entityId, leafId }` 和 drawer open 状态；只把选择回调与
ViewModel 传给 `GrowthTreeScene`。`TreeDetailPanel` 根据 ViewModel 查 Ability/Goal 统计，不查询
Task。`AchievementDrawer` 倒序排序 `achievedAt`，显示 note/evidenceUrl。

- [ ] **Step 4: 在服务端页面生成 ViewModel**

```tsx
const data = await readDashboardData(userId);
const viewModel = buildGrowthTreeViewModel(data, new Date());
return <GrowthTreeDashboard viewModel={viewModel} achievements={data.achievements} />;
```

这样客户端 Three.js 不再接触数据库表形状。

- [ ] **Step 5: 运行 UI 测试和类型检查**

Run: `npm test -- tests/growth-tree-dashboard.test.tsx tests/growth-tree-details-panel.test.tsx tests/dashboard-user-gate.test.tsx`

Expected: PASS。

Run: `npm run typecheck`

Expected: PASS。

- [ ] **Step 6: 提交 HTML 交互层**

```bash
git add app/dashboard/page.tsx app/dashboard/loading.tsx app/dashboard/error.tsx src/components/GrowthTreeDashboard.tsx src/components/TreeDetailPanel.tsx src/components/AchievementDrawer.tsx tests/growth-tree-dashboard.test.tsx tests/growth-tree-details-panel.test.tsx
git rm src/components/GrowthTreeDetailsPanel.tsx
git commit -m "feat: add tree details and achievement panels"
```

### Task 10: 拆分 Three.js 树场景和交互运行时

**Files:**
- Create: `src/components/GrowthTreeScene.tsx`
- Modify: `src/components/RealisticGrowthTree.tsx`
- Modify: `src/components/growth-tree-geometry.ts`
- Modify: `src/components/GrowthTreeDashboard.tsx`
- Modify: `tests/realistic-growth-tree-contract.test.ts`
- Modify: `tests/growth-tree-geometry.test.ts`

- [ ] **Step 1: 写组件边界失败测试**

```ts
const sceneSource = readFileSync("src/components/GrowthTreeScene.tsx", "utf8");
const treeSource = readFileSync("src/components/RealisticGrowthTree.tsx", "utf8");
expect(sceneSource).toContain("OrbitControls");
expect(sceneSource).toContain("createRealisticGrowthTreeLayer");
expect(treeSource).not.toContain("WebGLRenderer");
expect(treeSource).not.toContain("GrowthTreeDetailsPanel");
expect(treeSource).toContain("createWoodSegmentMesh");
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `npm test -- tests/realistic-growth-tree-contract.test.ts tests/growth-tree-geometry.test.ts`

Expected: FAIL，Canvas 和面板仍集中在 RealisticGrowthTree。

- [ ] **Step 3: 抽取树绘制层**

`createRealisticGrowthTreeLayer(viewModel)` 返回：

```ts
type TreeLayer = {
  group: THREE.Group;
  selectable: THREE.Object3D[];
  entityByUuid: Map<string, TreeSelectionTarget>;
  dispose: () => void;
};
```

wood/leaf mesh 的 `userData` 必须有 entityType/entityId，material 保留 baseColor 供 hover/selection
恢复。paused Goal 使用降低饱和度和亮度的材质，completed 长期 Goal 保持木质但不显示近期活跃
高亮。dispose 必须释放 geometry 和 material。

- [ ] **Step 4: 实现 GrowthTreeScene**

只在这里创建 renderer、scene、camera、OrbitControls、raycaster 和 resize listener。pointer move
更新 hover；pointer up 在移动小于 5px 时选择；选择后不修改 camera。cleanup 释放所有层、controls
和 renderer。

- [ ] **Step 5: 运行 Three 合约和交互测试**

Run: `npm test -- tests/realistic-growth-tree-contract.test.ts tests/growth-tree-geometry.test.ts tests/tree-interaction.test.ts`

Expected: PASS。

Run: `npm run typecheck`

Expected: PASS。

- [ ] **Step 6: 提交场景拆分**

```bash
git add src/components/GrowthTreeScene.tsx src/components/RealisticGrowthTree.tsx src/components/growth-tree-geometry.ts src/components/GrowthTreeDashboard.tsx tests/realistic-growth-tree-contract.test.ts tests/growth-tree-geometry.test.ts
git commit -m "refactor: separate tree rendering from scene UI"
```

### Task 11: 添加 Low-poly 群山、湖泊和动态生命力元素

**Files:**
- Create: `src/components/growth-tree/scene-config.ts`
- Create: `src/components/growth-tree/GrowthEnvironment.ts`
- Create: `src/components/growth-tree/VitalityElements.ts`
- Create: `tests/growth-environment-contract.test.ts`
- Modify: `src/components/GrowthTreeScene.tsx`
- Modify: `scripts/verify-3d-dashboard.mjs`

- [ ] **Step 1: 写视觉结构失败测试**

```ts
const environment = readFileSync("src/components/growth-tree/GrowthEnvironment.ts", "utf8");
const vitality = readFileSync("src/components/growth-tree/VitalityElements.ts", "utf8");
const config = readFileSync("src/components/growth-tree/scene-config.ts", "utf8");
expect(environment).toContain("createLake");
expect(environment).toContain("createMountainLayers");
expect(environment).toContain("flatShading: true");
expect(vitality).toContain("updateVitalityElements");
expect(config).toContain("treeOffsetX: -1.2");
expect(config).toContain("backgroundSaturation: 0.8");
expect(environment).not.toContain("background-image");
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `npm test -- tests/growth-environment-contract.test.ts`

Expected: FAIL，环境模块不存在。

- [ ] **Step 3: 创建集中资源与性能配置**

```ts
export const GROWTH_SCENE_CONFIG = {
  treeOffsetX: -1.2,
  backgroundSaturation: 0.8,
  colors: {
    leaf: 0x4f8b3d,
    leafHighlight: 0x78a94c,
    lake: 0x6f9ea4,
    mountainNear: 0x788795,
    mountainFar: 0x9aa7b3,
    rock: 0x91877d
  },
  models: { tree: null, mountains: null, rocks: null },
  performance: { maxPixelRatio: 1.75, shadows: true, lakeReflection: "simple" }
} as const;
```

将来用户提供 GLB/GLTF 时只替换 models URL 和 loader 分支；领域数据与 ViewModel 不变。

- [ ] **Step 4: 实现三层环境**

前景创建 faceted 岩石草坡；中景湖泊使用低 roughness、克制蓝绿色平面和轻微顶点波纹；远景用
两层 flat-shaded 山体、低对比度颜色和 Fog。默认相机 framing 让树位于横向约 40%，湖泊向右
展开，背景饱和度比树低约 20%。当 models URL 非 null 时用 GLTFLoader 加载；加载失败必须保留
procedural fallback，并向 Dashboard 回传 `asset_load_failed` diagnostic，数据面板仍可使用。

- [ ] **Step 5: 实现动态但非事件触发的生命力元素**

读取 ViewModel 的 `vitalityElements`，用 InstancedMesh 创建最多 7 个水滴、3 个小生物和 8 个
花草。元素初始位置和运动相位来自 ViewModel，不能 `Math.random()`。水滴只做轻微高光变化，
小生物缓慢移动或摆动，花草轻微摇曳；这些是持续环境运动，不能在完成 Todo 时触发浇水、施肥
或突然出现的奖励动画。`GrowthTreeScene` 的 animation loop 调用
`updateVitalityElements(elapsedSeconds)`，cleanup 时释放全部 InstancedMesh 资源。

- [ ] **Step 6: 扩展 Playwright 验证**

脚本除 nonBlank canvas 外，还断言：desktop canvas、果实按钮、生命力摘要存在；mobile 没有
水平溢出。截图仍输出 `test-results/dashboard-3d-desktop.png` 和 mobile 文件。

- [ ] **Step 7: 运行测试和本地视觉检查**

Run: `npm test -- tests/growth-environment-contract.test.ts tests/realistic-growth-tree-contract.test.ts`

Expected: PASS。

Run terminal A: `npm run dev -- --port 3001`

Run terminal B: `LIFE_OS_DASHBOARD_URL=http://localhost:3001/dashboard?userId=demo-user node scripts/verify-3d-dashboard.mjs`

Expected: JSON 输出 `{ "ok": true }`，desktop/mobile 截图中树位于中间偏左、绿色明显、湖泊在右、
群山有前后层次，交互面板没有遮住树冠。

- [ ] **Step 8: 提交环境场景**

```bash
git add src/components/GrowthTreeScene.tsx src/components/growth-tree/scene-config.ts src/components/growth-tree/GrowthEnvironment.ts src/components/growth-tree/VitalityElements.ts tests/growth-environment-contract.test.ts scripts/verify-3d-dashboard.mjs
git commit -m "feat: add layered growth tree environment"
```

### Task 12: 建立人工映射迁移工具

**Files:**
- Create: `scripts/migrate-growth-model.ts`
- Create: `tests/growth-model-migration.test.ts`
- Create: `supabase/migrations/202608010003_growth_model_mapping.sql`
- Create: `supabase/operations/validate_growth_tree_constraints.sql`
- Modify: `supabase/schema.sql`
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `README.md`
- Modify: `tests/growth-tree-domain-schema.test.ts`
- Modify: `supabase/tests/growth_tree_domain.sql`

- [ ] **Step 1: 安装 TypeScript CLI runner**

Run: `npm install --save-dev tsx`

Expected: package.json 和 lockfile 增加 `tsx`，安装成功。

- [ ] **Step 2: 写 mapping 校验失败测试**

```ts
expect(() => validateGrowthMapping({
  userId: "00000000-0000-4000-8000-000000000001",
  goals: [{ legacyGoalId: "not-a-uuid", goalType: "long_term" }],
  taskOverrides: [],
  activityOverrides: []
})).toThrow();

expect(validateGrowthMapping(validMapping).goals).toHaveLength(4);
```

有效 mapping 的每个长期 Goal 必须有 abilityTitle，每个短期 Goal 禁止 abilityTitle；task override
只能是 one_off 或具体 targetGoalId；activity override 必须有具体 targetGoalId。

Mapping 文件结构固定为：

```json
{
  "userId": "00000000-0000-4000-8000-000000000001",
  "goals": [
    {
      "legacyGoalId": "10000000-0000-4000-8000-000000000001",
      "goalType": "long_term",
      "abilityTitle": "前端能力"
    },
    {
      "legacyGoalId": "10000000-0000-4000-8000-000000000002",
      "goalType": "short_term"
    }
  ],
  "taskOverrides": [
    {
      "taskId": "20000000-0000-4000-8000-000000000001",
      "target": { "kind": "one_off" }
    }
  ],
  "activityOverrides": [
    {
      "activityId": "30000000-0000-4000-8000-000000000001",
      "targetGoalId": "10000000-0000-4000-8000-000000000001"
    }
  ],
  "achievementOverrides": []
}
```

- [ ] **Step 3: 运行测试并确认失败**

Run: `npm test -- tests/growth-model-migration.test.ts`

Expected: FAIL，脚本和 validator 不存在。

- [ ] **Step 4: 实现默认 dry-run CLI**

命令接口固定为：

```bash
npm run migrate:growth-model -- --mapping /absolute/path/mapping.json
npm run migrate:growth-model -- --mapping /absolute/path/mapping.json --apply
```

在 `package.json` 增加：

```json
"migrate:growth-model": "tsx scripts/migrate-growth-model.ts"
```

脚本开头调用 `loadEnvConfig(process.cwd())`，只读取 `NEXT_PUBLIC_SUPABASE_URL` 和
`SUPABASE_SERVICE_ROLE_KEY`；任一缺失时在查询前退出，错误信息只列变量名，不打印值。

默认只读取 profiles/goals/tasks/activities/achievements，验证 user、ID、完整覆盖和引用，输出
before/after 数量及每条操作；禁止输出环境变量和原始消息。缺 `--apply` 时不得调用写 RPC。

- [ ] **Step 5: 实现事务 apply RPC 调用和验证 SQL**

`--apply` 必须把 mapping 和 dry-run 时记录的 expected IDs/counts 一次传给 service-role-only
`apply_growth_model_mapping`。RPC 在事务内重新核对快照、upsert Ability、更新 Goal 类型/
ability_id、重定向 Task/Activity，并在不一致时 raise 使整批回滚。

RPC 的完整定义写入 `supabase/migrations/202608010003_growth_model_mapping.sql` 并同步到
`supabase/schema.sql`；revoke public/anon/authenticated execute，只 grant service_role。Schema
contract test必须断言权限和 `expectedGoalIds`/`expectedTaskIds` 快照校验片段存在。

在 `supabase/tests/growth_tree_domain.sql` 增加一次 expected snapshot 不一致的调用，断言 Goal、Task、
Activity 均未变化；再用完整 snapshot 应用测试映射，断言四类更新全部在同一事务成功。

`validate_growth_tree_constraints.sql` 只包含显式：

```sql
alter table goals validate constraint goals_goal_type_required;
alter table goals validate constraint goals_goal_type_check;
alter table goals validate constraint goals_ability_shape_check;
alter table goals validate constraint goals_completed_at_check;
alter table goals validate constraint goals_ability_fk;
alter table tasks validate constraint tasks_planned_metric_shape_check;
```

该文件不由普通 migration 自动执行。

- [ ] **Step 6: 文档化人工 checkpoint**

README 写明：mapping JSON 不能提交；先保存 dry-run 输出并由用户逐项确认；只有用户再次明确批准
该映射，才能运行 `--apply`；apply 后重读计数，再单独执行约束验证 SQL。

- [ ] **Step 7: 运行迁移工具测试**

Run: `npm test -- tests/growth-model-migration.test.ts tests/growth-tree-domain-schema.test.ts`

Expected: PASS。

Run: `npm run test:db`

Expected: PASS，mapping RPC 的成功和回滚路径均通过。

Run: `npm run typecheck`

Expected: PASS。

- [ ] **Step 8: 提交迁移工具，不运行生产 apply**

```bash
git add package.json package-lock.json scripts/migrate-growth-model.ts tests/growth-model-migration.test.ts tests/growth-tree-domain-schema.test.ts supabase/schema.sql supabase/migrations/202608010003_growth_model_mapping.sql supabase/operations/validate_growth_tree_constraints.sql supabase/tests/growth_tree_domain.sql README.md
git commit -m "feat: add guarded growth model migration tool"
```

### Task 13: 全量验证和交付检查

**Files:**
- Modify only if verification finds a scoped defect: files already listed in Tasks 1–12

- [ ] **Step 1: 运行完整 Vitest**

Run: `npm test`

Expected: 全部 tests PASS，无 unhandled rejection。

- [ ] **Step 2: 运行数据库测试**

Run: `npm run test:db`

Expected: batch intake 和 growth tree domain SQL 全部完成，退出码 0。

- [ ] **Step 3: 运行静态检查和生产构建**

Run: `npm run typecheck`

Expected: PASS，无 TypeScript error。

Run: `npm run build`

Expected: Next.js production build 成功，dashboard、completion routes 和 Action routes 均列出。

- [ ] **Step 4: 运行桌面和移动端浏览器验证**

Run terminal A: `npm run dev -- --port 3001`

Run terminal B: `LIFE_OS_DASHBOARD_URL=http://localhost:3001/dashboard?userId=demo-user node scripts/verify-3d-dashboard.mjs`

Expected: `{ "ok": true }`；截图人工确认树中间偏左、绿色、湖泊和远山层次、详情/果实按钮可读。

- [ ] **Step 5: 审计 git diff 和生产安全边界**

Run: `git status --short`

Expected: 只有本计划范围内文件；主工作区原有未跟踪计划没有进入 worktree 或提交。

Run: `git diff --check HEAD~12..HEAD`

Expected: 无 whitespace error。

确认日志和测试输出没有 Supabase service key、Action token、mapping 真实 ID 或原始消息。

- [ ] **Step 6: 提交仅由验证发现的最后修复**

如果 Step 1–5 没有产生代码修改，则跳过此提交；如产生修复，只暂存对应文件并使用：

```bash
git commit -m "fix: close growth tree verification gaps"
```

不要在本 Task 中 push、部署、运行生产 mapping 或执行约束验证；这些外部状态变更需要独立明确授权。
