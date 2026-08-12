# Semantic Procedural Growth Tree Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 Life OS 在保证新写入数据合法的前提下，根据每个用户的能力、目标和执行记录，稳定生成一棵形态独特、能够阶段成长、能够点击查看业务详情的程序树。

**Architecture:** 数据库只保存能力、目标、Todo、Activity 和成果等业务事实。纯函数管线将这些事实依次转换为 `GrowthMetrics`、EZ-Tree 风格的 `TreeRecipe` 和携带业务 ID 的 `SemanticTreeSkeleton`，最后由 Three.js 生成曲线枝干与实例化叶片；现有场景、选择交互和详情面板继续复用。

**Tech Stack:** Next.js 15、React 19、TypeScript 5.7、Three.js 0.185、Supabase/PostgreSQL、Zod、Vitest、Playwright、SQL 回归测试。

---

## 一、给项目负责人的背景说明

### 1. Life OS 目前在解决什么问题

这个项目把用户日常输入转换为结构化成长记录。用户看到的不是普通报表，而是一棵树：长期积累成为枝干，近期执行成为叶片，一次性事项成为水滴或小生物，短期目标的完成结果成为果实。

数据库中的五类核心事实是：

| 数据 | 用户语言 | 在树上的意义 |
|---|---|---|
| `abilities` | 健身能力、弹琴能力、编程能力 | 一级主树杈 |
| `goals` | 坚持健身、通过考试、找到工作 | 长期分枝或短期结果枝 |
| `tasks` | 今天跑步、买水、打扫卫生 | 未完成时不显示；完成后触发反馈 |
| `activities` | 实际跑了 30 分钟、练琴 1 小时 | 历史积累、嫩叶和树形成长依据 |
| `achievements` | 考试通过、拿到 offer | 果实面板中的永久收获 |

项目现有版本已经能读取这些数据，并将其画成直线圆柱枝干和少量叶片。问题是：数据少时树很秃；数据增加时通常只是圆柱变粗或多一片叶，并不像自然树木那样产生明显而稳定的形态变化。

### 2. EZ-Tree 是什么，本项目参考什么

EZ-Tree 是一个 Three.js 程序树生成器。它不是提供一棵固定模型，而是提供一组参数，例如：

- `seed`：同一个随机种子重复生成同一棵树；
- `levels`：有几级分枝；
- `children`：每级生成多少子枝；
- `length`、`radius`：枝干长度和粗细；
- `angle`、`gnarliness`、`twist`：分叉方向、自然弯曲和扭转；
- `leaves.count`、`size`：叶片数量和大小。

本项目只参考这种“参数决定树形”的方法，不直接接入 EZ-Tree 运行库。原因是 EZ-Tree 会把许多枝条合并成视觉几何，难以保证某根枝永远对应某个 ability 或 goal。Life OS 的树不只是装饰，它必须保留业务身份和点击交互。

### 3. 最终系统如何工作

```text
数据库业务事实
    ↓
成长指标 GrowthMetrics
    ↓
树形配方 TreeRecipe
    ↓
语义骨架 SemanticTreeSkeleton
    ↓
Three.js 曲线枝干、叶片和交互对象
```

用户每完成一次目标相关 Todo，会写入 Activity。Activity 会立即增加嫩叶或生命力；累计值跨过固定阶段阈值后，对应的枝干才永久增长。用户近期不活跃时，已经形成的枝干不会消失，只会出现轻微的叶片减少和颜色变淡。

### 4. 本次明确不做什么

- 不清洗、推测、迁移或回填现有生产数据；由项目负责人手工修正。
- 不使用静态 GLB 树模型。
- 不安装 `@dgreenheck/ez-tree`。
- 不播放成长动画。
- 不把未完成 Todo 放在树上。
- 不让树形参数成为数据库字段；视觉结果必须可以从业务事实重新计算。

## 二、交付边界与完成标准

本计划分为三个可以独立验收的子系统：

1. **写入可信**：新数据只能按规定路径写入，数据库拒绝非法组合。
2. **树形可信**：同一份数据稳定生成同一棵树，新增数据不会重排旧枝。
3. **展示可信**：自然曲线枝干、树冠季节变化和点击详情在桌面/移动端可用。

整个项目完成的判定不是“页面能打开”，而是以下事实同时成立：

- 新写入无法产生负 Activity、错误单位或错误长期/短期关系；
- 相同输入重复计算得到完全相同的 recipe 和 skeleton；
- 新增 Activity 未跨阶段时，已有永久骨架不变；
- 跨阶段时只改变所属目标和能力的局部结构；
- 低活跃只影响叶片，不删除历史枝干；
- 所有业务枝叶仍可点击并打开正确详情；
- 完整 Vitest、数据库测试、类型检查、生产构建和浏览器验收通过。

## 三、文件结构

### 新增文件

| 文件 | 单一职责 |
|---|---|
| `supabase/migrations/202608120001_growth_input_constraints.sql` | 对今后的 Activity 和指标单位写入施加强约束 |
| `src/domain/growth-metrics.ts` | 把 DashboardData 归一化为有界成长指标 |
| `src/domain/tree-recipe.ts` | 把成长指标转换为 EZ-Tree 风格参数，不包含 Three.js |
| `src/domain/semantic-tree-skeleton.ts` | 生成携带业务 ID 的稳定曲线骨架和叶片锚点 |
| `src/components/growth-tree-semantic-geometry.ts` | 把语义骨架转换为 Three.js 几何和材质 |
| `tests/growth-metrics.test.ts` | 指标换算、上限、近期窗口测试 |
| `tests/tree-recipe.test.ts` | 阶段阈值、参数范围、稳定性测试 |
| `tests/semantic-tree-skeleton.test.ts` | 局部增长和不重排测试 |
| `tests/growth-tree-semantic-geometry.test.ts` | 曲线几何、身份和资源释放测试 |

### 修改文件

| 文件 | 修改原因 |
|---|---|
| `supabase/schema.sql` | 同步最终规范数据库结构 |
| `supabase/operations/validate_growth_tree_constraints.sql` | 手工修正旧数据后验证新约束 |
| `supabase/tests/growth_tree_domain.sql` | 验证数据库拒绝非法写入 |
| `src/domain/tree-visualization.ts` | 从直接计算坐标改为组合 metrics、recipe、skeleton |
| `src/components/RealisticGrowthTree.tsx` | 使用新的语义几何层，同时保留选择映射 |
| `src/components/GrowthTreeScene.tsx` | 更新生成生命周期、季节材质和 readiness 统计 |
| `src/components/growth-tree/scene-config.ts` | 集中维护树形范围、颜色与性能预算 |
| `src/actions/repository.ts` | 停止生产环境的非事务多表写入 |
| `app/api/actions/life-event/route.ts` | 将旧单事件入口收口到事务批处理入口或明确退役 |
| `docs/custom-gpt-actions/openapi.yaml` | 只公开事务性写入端点 |

## 四、逐项实施任务

### Task 1：数据库拒绝今后的非法成长记录

**Files:**
- Create: `supabase/migrations/202608120001_growth_input_constraints.sql`
- Modify: `supabase/schema.sql`
- Modify: `supabase/operations/validate_growth_tree_constraints.sql`
- Test: `supabase/tests/growth_tree_domain.sql`
- Test: `tests/growth-tree-domain-schema.test.ts`

- [ ] **Step 1：先写会失败的 SQL 契约测试**

在 `supabase/tests/growth_tree_domain.sql` 增加事务内测试，分别尝试写入：`value = 0`、`value < 0`、`duration + count`、`count + hour`。每次必须捕获约束异常；若成功插入则主动 `raise exception`。

```sql
begin
  insert into activities (
    user_id, goal_id, message_id, summary,
    metric_type, value, unit, occurred_on
  ) values (
    test_user_id, test_goal_id, test_message_id, 'invalid',
    'duration', 0, 'minute', current_date
  );
  raise exception 'zero activity value must be rejected';
exception when check_violation then
  null;
end;
```

- [ ] **Step 2：运行数据库测试并确认新测试失败**

Run: `npm run test:db`

Expected: FAIL，信息包含 `zero activity value must be rejected` 或错误单位未被拒绝。

- [ ] **Step 3：增加仅约束新写入的迁移**

使用 `not valid`，这样约束立刻保护新数据，但不会扫描和阻塞用户尚未手工修正的旧数据。

```sql
alter table activities add constraint activities_value_positive_check
  check (value > 0) not valid;

alter table activities add constraint activities_metric_unit_check check (
  (metric_type = 'duration' and unit in ('minute', 'hour'))
  or (metric_type in ('count', 'milestone') and unit = 'count')
) not valid;

alter table tasks add constraint tasks_planned_metric_unit_check check (
  planned_metric_type is null
  or (planned_metric_type = 'duration' and planned_unit in ('minute', 'hour'))
  or (planned_metric_type in ('count', 'milestone') and planned_unit = 'count')
) not valid;
```

- [ ] **Step 4：同步 canonical schema 和手工验证操作**

在 `supabase/schema.sql` 中使用同名有效约束；在验证脚本末尾加入：

```sql
alter table activities validate constraint activities_value_positive_check;
alter table activities validate constraint activities_metric_unit_check;
alter table tasks validate constraint tasks_planned_metric_unit_check;
```

只有项目负责人手工修正旧数据后才执行验证脚本。

- [ ] **Step 5：运行数据库和 schema 契约测试**

Run: `npm run test:db && npm test -- tests/growth-tree-domain-schema.test.ts`

Expected: 全部 PASS。

- [ ] **Step 6：提交数据库约束**

```bash
git add supabase/migrations/202608120001_growth_input_constraints.sql supabase/schema.sql supabase/operations/validate_growth_tree_constraints.sql supabase/tests/growth_tree_domain.sql tests/growth-tree-domain-schema.test.ts
git commit -m "feat: enforce growth input constraints"
```

### Task 2：收口生产写入，禁止半套数据

**Files:**
- Modify: `app/api/actions/life-event/route.ts`
- Modify: `src/actions/repository.ts`
- Modify: `docs/custom-gpt-actions/openapi.yaml`
- Test: `tests/single-event-repository.test.ts`
- Test: `tests/custom-gpt-action-contract.test.ts`

- [ ] **Step 1：写旧入口退役契约测试**

旧 `/api/actions/life-event` 不再执行多次 `.from(...).insert(...)`。测试要求它返回 `410 Gone` 并指向 `/api/actions/life-events`。

```ts
expect(response.status).toBe(410);
expect(await response.json()).toEqual({
  error: "single-event endpoint retired",
  replacement: "/api/actions/life-events"
});
```

- [ ] **Step 2：运行测试确认失败**

Run: `npm test -- tests/single-event-repository.test.ts tests/custom-gpt-action-contract.test.ts`

Expected: FAIL，因为旧入口目前仍执行非事务写入。

- [ ] **Step 3：退役生产入口并保留只读上下文代码**

将 route 改为固定返回 410；从 `repository.ts` 删除或改为不再导出的 `writeSupabaseLifeEvent`、`materializeSupabaseGoal` 等非事务写入代码。保留 `readActionContext`，因为批处理准备阶段仍需要它。

```ts
export async function POST() {
  return NextResponse.json(
    {
      error: "single-event endpoint retired",
      replacement: "/api/actions/life-events"
    },
    { status: 410 }
  );
}
```

- [ ] **Step 4：从 OpenAPI 移除旧端点**

确保 GPT Action 只看见 `/api/actions/life-events`。该端点已通过 `record_life_event_batch` 在一个 PostgreSQL 事务中写入 message、ability、goal、task、activity 和 inbox。

- [ ] **Step 5：运行路由、批处理和数据库测试**

Run: `npm test -- tests/action-batch-route.test.ts tests/batch-repository.test.ts tests/custom-gpt-action-contract.test.ts && npm run test:db`

Expected: 全部 PASS；代码搜索不再发现生产 route 调用 `writeLifeEventFromAction`。

- [ ] **Step 6：提交事务写入收口**

```bash
git add app/api/actions/life-event/route.ts src/actions/repository.ts docs/custom-gpt-actions/openapi.yaml tests/single-event-repository.test.ts tests/custom-gpt-action-contract.test.ts
git commit -m "refactor: require transactional life event writes"
```

### Task 3：建立可解释的成长指标 GrowthMetrics

**Files:**
- Create: `src/domain/growth-metrics.ts`
- Create: `tests/growth-metrics.test.ts`

- [ ] **Step 1：写指标契约测试**

测试分钟、小时、count 和 milestone 的换算；异常大单次记录必须被封顶；历史和最近 30 天必须分开。

```ts
expect(growthPoints({ metricType: "duration", value: 60, unit: "minute" })).toBe(2);
expect(growthPoints({ metricType: "duration", value: 1, unit: "hour" })).toBe(2);
expect(growthPoints({ metricType: "count", value: 1000, unit: "count" })).toBe(10);
expect(growthPoints({ metricType: "milestone", value: 1, unit: "count" })).toBe(5);
```

- [ ] **Step 2：运行测试确认模块不存在**

Run: `npm test -- tests/growth-metrics.test.ts`

Expected: FAIL，无法导入 `growth-metrics`。

- [ ] **Step 3：定义纯数据类型和换算函数**

```ts
export type GrowthStage = 0 | 1 | 2 | 3 | 4 | 5;

export type EntityGrowthMetric = {
  entityId: string;
  lifetimePoints: number;
  activeDays: number;
  recentPoints: number;
  recentScore: number;
  stage: GrowthStage;
};

export const GROWTH_STAGE_THRESHOLDS = [0, 5, 15, 35, 70, 140] as const;
```

所有输出使用有限数字，`recentScore` clamp 到 `[0, 1]`。能力指标等于该 ability 下所有合法长期目标指标之和。

- [ ] **Step 4：实现并测试边界条件**

补充空数据、恰好跨阈值、未来日期不计入近期窗口、不同输入顺序输出相同的测试。

Run: `npm test -- tests/growth-metrics.test.ts`

Expected: PASS。

- [ ] **Step 5：提交成长指标**

```bash
git add src/domain/growth-metrics.ts tests/growth-metrics.test.ts
git commit -m "feat: derive bounded growth metrics"
```

### Task 4：建立 EZ-Tree 风格的 TreeRecipe 参数契约

**Files:**
- Create: `src/domain/tree-recipe.ts`
- Create: `tests/tree-recipe.test.ts`
- Modify: `src/components/growth-tree/scene-config.ts`

- [ ] **Step 1：写 recipe 稳定性和范围测试**

```ts
expect(first).toEqual(second);
expect(first.trunk.height).toBeGreaterThanOrEqual(2.8);
expect(first.trunk.height).toBeLessThanOrEqual(5.2);
expect(first.abilities.map((item) => item.entityId)).toEqual(
  second.abilities.map((item) => item.entityId)
);
```

另外验证 ability 增加只新增一个主枝参数，不改变已有 ability 的 `azimuth`。

- [ ] **Step 2：运行测试确认失败**

Run: `npm test -- tests/tree-recipe.test.ts`

Expected: FAIL，模块不存在。

- [ ] **Step 3：定义参数类型**

```ts
export type BranchRecipe = {
  entityType: "ability" | "long_goal" | "short_goal";
  entityId: string;
  parentEntityId: string;
  stage: GrowthStage;
  azimuth: number;
  elevation: number;
  length: number;
  radius: number;
  gnarliness: number;
  childSlots: number;
};

export type TreeRecipe = {
  seed: number;
  trunk: { height: number; radius: number; sections: number };
  abilities: BranchRecipe[];
  longGoals: BranchRecipe[];
  shortGoals: BranchRecipe[];
  canopy: { retention: number; saturation: number; youngLeafRatio: number };
};
```

- [ ] **Step 4：实现稳定参数映射**

采用以下范围，而不是让数据无限放大：

```ts
trunk.height = lerp(2.8, 5.2, maturity);
trunk.radius = lerp(0.28, 0.62, maturity);
branch.length = lerp(0.8, 2.6, stage / 5);
branch.radius = lerp(0.07, 0.28, stage / 5);
canopy.retention = lerp(0.45, 1, recentScore);
```

方向由 `seedFromId(entityId, "branch-azimuth")` 决定，不能根据数组下标决定。

- [ ] **Step 5：运行 recipe 测试**

Run: `npm test -- tests/tree-recipe.test.ts`

Expected: PASS。

- [ ] **Step 6：提交 TreeRecipe**

```bash
git add src/domain/tree-recipe.ts src/components/growth-tree/scene-config.ts tests/tree-recipe.test.ts
git commit -m "feat: map growth metrics to tree recipes"
```

### Task 5：生成携带业务身份的稳定语义骨架

**Files:**
- Create: `src/domain/semantic-tree-skeleton.ts`
- Create: `tests/semantic-tree-skeleton.test.ts`

- [ ] **Step 1：写局部稳定性测试**

生成基础骨架，再增加一个新 Activity 和一个新 ability：

```ts
expect(existingBranch(afterActivity)).toEqual(existingBranch(before));
expect(existingAbilityBranches(afterAbility)).toEqual(
  existingAbilityBranches(before)
);
expect(afterAbility.branches).toContainEqual(
  expect.objectContaining({ entityId: "new-ability" })
);
```

- [ ] **Step 2：运行测试确认失败**

Run: `npm test -- tests/semantic-tree-skeleton.test.ts`

Expected: FAIL，模块不存在。

- [ ] **Step 3：定义骨架契约**

```ts
export type SemanticBranch = {
  entityType: "root" | "ability" | "long_goal" | "short_goal";
  entityId: string;
  parentEntityId: string | null;
  controlPoints: readonly [SceneVector, SceneVector, SceneVector, SceneVector];
  baseRadius: number;
  tipRadius: number;
  radialSegments: number;
};

export type SemanticLeaf = {
  activityId: string;
  goalId: string;
  anchor: SceneVector;
  rotation: SceneVector;
  scale: number;
  visible: boolean;
};
```

- [ ] **Step 4：实现父子局部坐标生成**

根从原点向上。ability 从主干稳定高度出发；long goal 从所属 ability 曲线上的稳定比例出发；short goal 从主干稳定位置出发。控制点加入由实体 seed 决定的小幅弯曲，但终点始终向上，避免枝干倒插地面。

- [ ] **Step 5：实现确定性叶片保留**

不使用运行时 `Math.random()`。根据 activityId 哈希得到 `visibilityRank`，只有 `visibilityRank <= canopy.retention` 的近期叶片可见，因此季节变化不会让叶子位置每次刷新都改变。

- [ ] **Step 6：运行骨架测试并提交**

Run: `npm test -- tests/semantic-tree-skeleton.test.ts`

Expected: PASS。

```bash
git add src/domain/semantic-tree-skeleton.ts tests/semantic-tree-skeleton.test.ts
git commit -m "feat: generate stable semantic tree skeletons"
```

### Task 6：把现有投影层切换到 metrics → recipe → skeleton

**Files:**
- Modify: `src/domain/tree-visualization.ts`
- Modify: `tests/tree-visualization.test.ts`
- Modify: `src/components/TreeDetailPanel.tsx`

- [ ] **Step 1：扩展 ViewModel 契约测试**

要求 viewModel 暴露 recipe、semantic branches 和 semantic leaves，同时保留详情面板需要的累计值、状态和近期 Activity。

```ts
expect(model.recipe.seed).toBeTypeOf("number");
expect(model.branches.find((b) => b.entityId === "ability-a")).toBeDefined();
expect(model.branches.find((b) => b.entityId === "long-active")?.parentEntityId)
  .toBe("ability-b");
```

- [ ] **Step 2：运行现有投影测试确认失败**

Run: `npm test -- tests/tree-visualization.test.ts tests/growth-tree-details-panel.test.tsx`

Expected: 新断言 FAIL。

- [ ] **Step 3：将 buildGrowthTreeViewModel 改成编排器**

`tree-visualization.ts` 不再自行计算角度和直线端点，只负责调用：

```ts
const metrics = buildGrowthMetrics(data, asOf);
const recipe = buildTreeRecipe(data, metrics);
const skeleton = buildSemanticTreeSkeleton(data, recipe, asOf);
```

详情数据建立独立 `entityDetails` Map，避免几何类型承担业务统计职责。

- [ ] **Step 4：删除旧数据容错依赖**

由于项目负责人负责手动修正旧数据，生成器不再把 `goalType = null` 当作正常路径；API/数据库保证新数据合法。开发和测试中遇到非法结构应给出明确 diagnostic 或抛出契约错误，不伪造枝条。

- [ ] **Step 5：运行投影和面板测试并提交**

Run: `npm test -- tests/tree-visualization.test.ts tests/growth-tree-details-panel.test.tsx`

Expected: PASS。

```bash
git add src/domain/tree-visualization.ts src/components/TreeDetailPanel.tsx tests/tree-visualization.test.ts tests/growth-tree-details-panel.test.tsx
git commit -m "refactor: project growth data through semantic recipes"
```

### Task 7：用自然曲线枝干替换直线圆柱

**Files:**
- Create: `src/components/growth-tree-semantic-geometry.ts`
- Modify: `src/components/RealisticGrowthTree.tsx`
- Modify: `src/components/growth-tree-geometry.ts`
- Create: `tests/growth-tree-semantic-geometry.test.ts`
- Modify: `tests/growth-tree-geometry.test.ts`

- [ ] **Step 1：写曲线几何和身份测试**

```ts
expect(mesh.geometry).toBeInstanceOf(THREE.TubeGeometry);
expect(mesh.userData.entityType).toBe("ability");
expect(mesh.userData.entityId).toBe("ability-a");
expect(layer.entityByUuid.get(mesh.uuid)?.entityId).toBe("ability-a");
```

同时 spy `geometry.dispose()` 和 `material.dispose()`，要求重复调用 layer.dispose 只释放一次。

- [ ] **Step 2：运行测试确认失败**

Run: `npm test -- tests/growth-tree-semantic-geometry.test.ts tests/growth-tree-geometry.test.ts`

Expected: FAIL，因为当前仍是 `CylinderGeometry`。

- [ ] **Step 3：实现曲线枝干工厂**

```ts
const curve = new THREE.CubicBezierCurve3(p0, p1, p2, p3);
const geometry = new THREE.TubeGeometry(
  curve,
  tubularSegments,
  branch.baseRadius,
  branch.radialSegments,
  false
);
```

第一版允许 TubeGeometry 沿线半径一致；视觉上的父粗子细由不同语义枝的半径体现。不要在本任务引入自定义 shader taper，以控制风险。

- [ ] **Step 4：重建 RealisticGrowthTreeLayer**

遍历 semantic branches 创建 Mesh，遍历 visible leaves 创建叶片。继续填充 `selectable` 和 `entityByUuid`，基础装饰叶不进入业务映射。

- [ ] **Step 5：运行几何、交互和资源测试**

Run: `npm test -- tests/growth-tree-semantic-geometry.test.ts tests/growth-tree-geometry.test.ts tests/tree-interaction.test.ts tests/realistic-growth-tree-contract.test.ts`

Expected: PASS。

- [ ] **Step 6：提交曲线几何**

```bash
git add src/components/growth-tree-semantic-geometry.ts src/components/RealisticGrowthTree.tsx src/components/growth-tree-geometry.ts tests/growth-tree-semantic-geometry.test.ts tests/growth-tree-geometry.test.ts
git commit -m "feat: render semantic curved tree geometry"
```

### Task 8：实现轻度季节变化与数据少时的完整树冠

**Files:**
- Modify: `src/components/growth-tree-semantic-geometry.ts`
- Modify: `src/components/GrowthTreeScene.tsx`
- Modify: `src/components/growth-tree/scene-config.ts`
- Test: `tests/growth-tree-semantic-geometry.test.ts`
- Test: `tests/growth-environment-contract.test.ts`

- [ ] **Step 1：写近期状态视觉测试**

高活跃 recipe 必须比低活跃显示更多叶片，且叶色饱和度更高；两者的 branch controlPoints 必须完全相同。

```ts
expect(high.branches).toEqual(low.branches);
expect(high.visibleLeaves.length).toBeGreaterThan(low.visibleLeaves.length);
expect(high.recipe.canopy.saturation).toBeGreaterThan(low.recipe.canopy.saturation);
```

- [ ] **Step 2：运行测试确认失败**

Run: `npm test -- tests/growth-tree-semantic-geometry.test.ts`

Expected: 新季节断言 FAIL。

- [ ] **Step 3：加入非业务装饰叶**

每个阶段性末端枝生成固定 seed 的基础叶锚点，使数据少时仍有完整树冠。这些叶片只代表树的生命形态，不代表 Activity，不可点击。Activity 叶使用更亮颜色并继续可点击。

- [ ] **Step 4：映射季节颜色**

```ts
const baseLeaf = new THREE.Color(0x5c9847);
const mutedLeaf = new THREE.Color(0x718665);
const leafColor = mutedLeaf.clone().lerp(baseLeaf, recipe.canopy.saturation);
```

最低保留率 0.45；不允许近期低活跃把树变成裸树。

- [ ] **Step 5：更新场景 readiness 统计**

将 `data-scene-objects.tree` 改成语义枝数量，将 `leaves` 分为 decorative 和 activity，方便浏览器验收准确判断。

- [ ] **Step 6：运行测试并提交**

Run: `npm test -- tests/growth-tree-semantic-geometry.test.ts tests/growth-environment-contract.test.ts`

Expected: PASS。

```bash
git add src/components/growth-tree-semantic-geometry.ts src/components/GrowthTreeScene.tsx src/components/growth-tree/scene-config.ts tests/growth-tree-semantic-geometry.test.ts tests/growth-environment-contract.test.ts
git commit -m "feat: add data-driven seasonal canopy"
```

### Task 9：性能、移动端和 WebGL 生命周期收口

**Files:**
- Modify: `src/components/growth-tree-semantic-geometry.ts`
- Modify: `src/components/GrowthTreeScene.tsx`
- Modify: `tests/growth-tree-semantic-geometry.test.ts`
- Modify: `tests/realistic-growth-tree-contract.test.ts`

- [ ] **Step 1：建立第一版性能预算测试**

标准测试数据下限制：业务和装饰叶合计不超过 1,500，单枝 radial segments 不超过 10，主干 tubular segments 不超过 32，普通枝不超过 16。

```ts
expect(layer.stats.totalLeaves).toBeLessThanOrEqual(1500);
expect(layer.stats.maxRadialSegments).toBeLessThanOrEqual(10);
```

- [ ] **Step 2：运行测试确认统计尚不存在**

Run: `npm test -- tests/growth-tree-semantic-geometry.test.ts`

Expected: FAIL。

- [ ] **Step 3：对装饰叶使用 InstancedMesh**

业务 Activity 叶保留可拾取映射；大量不可点击装饰叶合并为一个 `THREE.InstancedMesh`。移动端沿用当前 `maxPixelRatio = 1.75`，不增加实时反射或风吹 shader。

- [ ] **Step 4：确保重建和卸载只释放一次**

场景每次 viewModel 更新时先移除旧 layer，再调用一次 dispose。共享材质在最后一个所有者释放时处理，不能在仍被实例使用时提前 dispose。

- [ ] **Step 5：运行性能和生命周期测试并提交**

Run: `npm test -- tests/growth-tree-semantic-geometry.test.ts tests/realistic-growth-tree-contract.test.ts`

Expected: PASS。

```bash
git add src/components/growth-tree-semantic-geometry.ts src/components/GrowthTreeScene.tsx tests/growth-tree-semantic-geometry.test.ts tests/realistic-growth-tree-contract.test.ts
git commit -m "perf: bound semantic tree rendering cost"
```

### Task 10：端到端验收与交付说明

**Files:**
- Modify: `tests/growth-tree-dashboard.test.tsx`
- Modify: `docs/code-reading-guide.md`
- Modify: `README.md`

- [ ] **Step 1：补充用户视角的组件测试**

覆盖：空用户显示完整幼树；选择 ability 打开正确详情；选择 Activity 叶显示关联 goal；果实面板仍只展示短期成果；未完成 Todo 不成为树对象。

- [ ] **Step 2：运行全部快速测试**

Run: `npm test`

Expected: 所有 Vitest 文件 PASS，无 skipped 的新测试。

- [ ] **Step 3：运行类型检查和生产构建**

Run: `npm run typecheck && npm run build`

Expected: 两条命令退出码 0；Next.js build 无 TypeScript 错误。

- [ ] **Step 4：运行数据库测试**

Run: `npm run test:db`

Expected: PASS。注意这验证测试数据库，不修改生产数据库。

- [ ] **Step 5：启动本地服务做桌面和移动端检查**

Run: `npm run dev`

检查 `/dashboard?userId=demo-user`：

- 树位于画面中间偏左；
- 山和湖仍有前后层次；
- 树冠明显比当前版本丰富；
- ability、goal 和 Activity 点击对象正确；
- 旋转和缩放不产生明显卡顿；
- 移动端没有面板遮住整棵树；
- 控制台无 WebGL 资源或 shader 错误。

- [ ] **Step 6：更新代码阅读指南**

写清新的阅读顺序：

```text
aggregation.ts
→ growth-metrics.ts
→ tree-recipe.ts
→ semantic-tree-skeleton.ts
→ tree-visualization.ts
→ RealisticGrowthTree.tsx
→ GrowthTreeScene.tsx
```

- [ ] **Step 7：提交验收与文档**

```bash
git add tests/growth-tree-dashboard.test.tsx docs/code-reading-guide.md README.md
git commit -m "docs: document semantic tree generation"
```

## 五、发布顺序

发布必须拆成两次，避免数据库和前端同时变化导致定位困难。

### 发布 A：数据约束与写入入口

1. 项目负责人手工检查现有数据，但不要求系统自动修改。
2. 应用 `202608120001_growth_input_constraints.sql`；`NOT VALID` 约束立即保护新写入。
3. 部署只公开批量事务端点的 API。
4. 用真实用户创建一次性 Todo、长期目标 Todo、短期目标和 Activity，确认写入路径正确。
5. 手工数据清理完成后，再执行 `validate_growth_tree_constraints.sql`。

### 发布 B：程序树渲染

1. 先部署 metrics、recipe 和 skeleton 纯函数，不改变页面输出。
2. 在本地/预览环境切换到新 Three.js layer。
3. 完成桌面和移动端视觉验收。
4. 再部署生产前端。
5. 出现渲染问题时可回退前端提交，数据库事实和写入约束不需要回退。

## 六、风险与管理决策

| 风险 | 表现 | 控制办法 |
|---|---|---|
| 树形每次变化 | 新数据让旧枝换方向 | 所有方向只由 userId/entityId 稳定 seed 决定 |
| 数据量大导致卡顿 | 叶片和 Mesh 数过多 | 装饰叶 InstancedMesh、数量上限、几何分段预算 |
| 新旧写入不一致 | 某入口留下 message 却没留下 task | 退役非事务单事件入口，只保留 batch RPC |
| 不同指标不可比 | 1 小时和 1 次被简单相加 | 在 GrowthMetrics 层集中换算并设置单次上限 |
| 低活跃惩罚感过强 | 用户回来看到秃树 | 永久骨架不退化，叶片最低保留 45% |
| 树好看但不可解释 | 用户不知道哪根枝是什么 | 每根语义枝保留实体 ID，点击打开现有详情 |
| 旧数据阻塞上线 | 新 CHECK 扫描历史数据失败 | 迁移使用 NOT VALID，用户清理后再 validate |

## 七、工作量与检查点

以一名熟悉 TypeScript/Three.js 的工程师为基准，建议安排 **8–12 个专注工程日**，不包含项目负责人手工修改生产数据的时间：

- 数据约束与写入收口：1–2 日；
- GrowthMetrics、TreeRecipe、语义骨架：3–4 日；
- Three.js 曲线几何、树冠与交互：3–4 日；
- 全量测试、移动端调优和发布：1–2 日。

管理检查点：

1. **检查点 1：写入可信**——非法数据测试全部通过后才进入树形开发。
2. **检查点 2：纯函数可信**——用 JSON 快照审查 recipe/skeleton，不先看漂亮画面。
3. **检查点 3：视觉可信**——确认低、中、高三种数据量的树形差异。
4. **检查点 4：交互可信**——逐个点击 ability、long goal、short goal、Activity 和果实。
5. **检查点 5：发布可信**——数据库与前端分两次发布，每次均可独立回退。

## 八、执行纪律

- 每个任务先写失败测试，再写最小实现。
- 每个任务完成后单独提交，不把十个任务压成一个大提交。
- 不在本计划中顺手重构无关代码。
- 不读取或输出 `.env.local`。
- 不运行历史映射脚本，不自动修改生产数据。
- 未通过对应检查点，不进入下一阶段。
