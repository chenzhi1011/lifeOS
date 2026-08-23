# Life OS 代码阅读指南

不要按文件夹逐个读。先沿“数据如何变成一棵树”这条主线阅读，再看写入和 API。

## 一、先建立产品概念

- 七个固定生活领域：工作、成长、健康、生活、财务、人际关系、娱乐。它们永远对应七根一级主树杈。
- `Goal`：长期目标或短期目标，必须属于一个生活领域。
- `Task`：尚未完成或已完成的待办。未完成 Task 供未来 Todo 页面使用，不显示在树上。
- `Activity`：对 Goal 的实际投入，是树成长的主要事实。
- `Achievement`：已完成短期目标的收获，在果实面板展示。
- 一次性 Task：买水、打扫等不属于 Goal；完成后只影响近期生命力装饰。

## 二、前端渲染树的必读顺序

### 1. `src/domain/aggregation.ts`

把数据库/内存状态整理为 `DashboardData`。这里决定树能收到哪些数据。注意 open Task 和 scheduled Reminder 不在树输入中。

### 2. `src/domain/growth-metrics.ts`

把分钟、小时、次数和里程碑换算为统一成长点，并计算历史成熟度与最近 30 天状态。成熟度采用 `1 - exp(-points / 35)`：前期变化快，成熟后放慢。

### 3. `src/domain/tree-recipe.ts`

这是最接近 EZ-Tree“前端参数面板”的层。它把成长阶段映射为树干高度、半径、枝长、弯曲度和树冠保留率。七根主枝的方位与连接高度固定在这里；数据不能改变它们的身份和方向。

### 4. `src/domain/semantic-tree-skeleton.ts`

根据 recipe 生成三次贝塞尔曲线控制点。每根枝保留 `entityType/entityId/parentEntityId`，所以视觉几何仍能对应具体生活领域或 Goal。

### 5. `src/domain/tree-visualization.ts`

编排上述纯函数，并补充详情面板所需的累计值、近期 Activity、生命力装饰和诊断信息。

### 6. `src/theme/healing-palette.ts`

唯一治愈色板来源。天空、草地、树干、叶片、果实和 UI 都应引用这里，不要在场景文件中随意增加颜色。

### 7. `src/components/RealisticGrowthTree.tsx`

把语义骨架转换为 Three.js 对象，建立可点击对象映射，管理几何和材质释放。基础装饰叶不可点击，Activity 叶可点击。

### 8. `src/components/GrowthTreeScene.tsx`

Three.js 场景生命周期：renderer、camera、光照、山湖环境、鼠标拾取、缩放旋转、重建和销毁。这里不决定树怎么长，只负责展示和交互。

实际几何工厂在 `src/components/growth-tree-semantic-geometry.ts`，山湖在 `src/components/growth-tree/GrowthEnvironment.ts`。

## 三、数据写入顺序

从 `src/domain/types.ts` 和 `src/domain/life-areas.ts` 看最终领域类型，再按下面顺序：

```text
HTTP route
→ src/auth/api-principal.ts（身份）
→ src/application/life-event-service.ts（统一用例）
→ src/actions/batch-validation.ts（输入契约）
→ src/actions/batch-preparation.ts（解析引用和时间）
→ src/actions/batch-repository.ts（调用事务 RPC）
→ supabase/schema.sql / record_life_event_batch（原子写入）
```

网页 Session 使用 `POST /api/life-events`；AI 使用 `POST /api/actions/life-events`。两者只负责不同认证，共用同一个应用服务和数据库事务。

## 四、Todo 与 Reminder

- `GET /api/tasks` → `src/application/task-queries.ts`
- `GET /api/reminders` → `src/application/reminder-queries.ts`
- `POST /api/tasks/[id]/complete`：完成 Task，可按输入生成 Activity。
- `POST /api/goals/[id]/complete`：完成短期 Goal，可生成 Achievement。

所有接口从认证 principal 获取 `userId`，不相信 body/query 中的 userId。前端请求封装在 `src/client/lifeos-api.ts`。

## 五、数据库最终结构

以 `supabase/schema.sql` 为准。核心关系：

```text
profiles
  ├─ goals (goal_type, life_area, metric_type)
  │    ├─ tasks (open/completed/cancelled)
  │    ├─ activities (实际投入)
  │    └─ achievements (仅已完成短期 Goal)
  ├─ reminders → tasks
  ├─ messages / action_batches（写入审计与幂等）
  └─ inbox_items（待确认输入）
```

项目不再存在 Ability 表或 `ability_id`。Task 不保存 `life_area`，而是通过 Goal 得到领域，避免两份分类冲突。

## 六、修改树形时的边界

- 调整树“长成什么样”：改 `tree-recipe.ts` 的范围和阶段映射。
- 调整某根固定主枝方向：显式改 `LIFE_AREA_BRANCH_PLACEMENTS` 并更新测试。
- 调整曲线生成：改 `semantic-tree-skeleton.ts`。
- 调整枝叶网格：改 `growth-tree-semantic-geometry.ts`。
- 调整颜色：只改 `healing-palette.ts`。
- 不要让 open Task、Reminder 或数据库返回顺序参与树骨架计算。
