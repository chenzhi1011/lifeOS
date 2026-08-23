# Life OS 成长树领域模型与 3D 场景设计

## 状态与范围

本文档记录已经确认的成长树重构设计。它覆盖数据模型、写入规则、Dashboard
查询、树投影、3D 场景、交互、旧数据迁移、错误处理和测试。

本文档取代
`2026-07-31-single-root-growth-tree-repair-design.md`。之前的方案准备在数据库中创建一个
`人生` 根 Goal，只解决多个根 Goal 被遗漏的问题；新方案明确区分能力、长期目标、短期目标、
Todo、实际投入和成果，因此不再把 `人生` 或能力伪装成 Goal。

每日 Todo 页面本身不在本次实现范围内，但本次数据模型必须完整保存 open、completed 和
cancelled Task，供该页面以后直接使用。

## 产品模型

用户每天记录的 Todo 只选择一个主要归属：

1. **一次性事项**：买水、打扫卫生、预约检查等。完成后不长出枝叶，而是影响最近 30 天的
   生命力，并显示为水滴、小生物或树下花草。
2. **长期能力路径**：Todo 属于某个长期目标，长期目标属于一个稳定能力。能力是大树枝，长期
   目标是树杈，实际完成产生的 Activity 是近期叶片。
3. **短期结果路径**：Todo 属于一个短期目标。短期目标是从主干长出的当前枝条，实际完成产生的
   Activity 是近期叶片；目标完成后枝条和叶片退出当前树，成果进入果实面板。

Task 从不直接显示在树上。未完成 Task 只保存在任务数据中；完成目标型 Task 时产生 Activity，
完成一次性 Task 时计入生命力。

```text
Todo（树外）
├── goal_id = null
│   └── 完成 → 最近 30 天生命力 → 水滴 / 小生物 / 花草
└── goal_id = 一个目标
    └── 完成 → Activity
        ├── 长期目标 → 近期叶片；历史投入增加永久木质成长
        └── 短期目标 → 近期叶片；目标完成后形成 Achievement
```

## 领域数据模型

### Ability

新增 `abilities` 表。Ability 表示长期存在的能力，例如前端能力、投资能力、健身能力或弹琴能力。
它不是一个会完成并退出的 Goal。

目标字段：

- `id`, `user_id`, `title`
- `status`: `active | archived`
- `created_at`, `archived_at`
- `(user_id, title)` 唯一
- `(user_id, id)` 唯一，用于复合外键和用户隔离

### Goal

保留现有 `goals` 表，并增加严格的目标类型：

- `goal_type`: `long_term | short_term`
- `ability_id`: 可空复合外键，指向同一用户的 Ability
- `due_at`, `completed_at`

数据库约束：

- `long_term` 必须有 `ability_id`
- `short_term` 必须没有 `ability_id`
- 一个 Goal 只能属于一个 Ability
- `status = completed` 时必须有 `completed_at`

现有的 `category` 和 `metric_type` 可继续作为筛选和统计元数据，但不再决定树的层级。
`parent_goal_id` 在兼容迁移期保留，新的写入和渲染不再使用它；是否删除该字段由后续清理任务决定。

长期 Goal 完成后仍保存在树上，成为永久木质树杈。短期 Goal 的 `active` 状态正常显示，
`paused` 状态以较暗材质显示，`completed` 状态不进入当前树。

### Task

保留现有 `tasks` 表。`goal_id` 同时表达唯一主要归属：

- `goal_id = null`：一次性 Todo
- `goal_id` 指向长期 Goal：长期能力路径 Todo
- `goal_id` 指向短期 Goal：短期结果路径 Todo

不新增冗余的 `task_type`。分类由是否关联 Goal 以及 Goal 类型唯一决定，避免出现
`task_type = one_off` 但同时带有 `goal_id` 的矛盾状态。

Task 无论 open 还是 completed 都不进入 TreeViewModel。目标型 Task 可保存可选的计划度量；
完成时优先使用用户提交的实际值，其次使用计划值，均不存在时写入 `count = 1`。
为此在 Task 上增加一组全空或全非空的字段：`planned_metric_type`、`planned_value` 和
`planned_unit`。例如“练琴 30 分钟”保存为 `duration / 30 / minute`。

### Activity

Activity 表示已经发生的实际投入，不表示计划。它必须关联一个长期或短期 Goal，可以选择关联
产生它的 Task。手动记录投入时允许 `task_id = null`。

目标型 Task 完成后，Task 状态更新和 Activity 插入必须在同一个事务中完成。增加
`(user_id, task_id)` 的非空唯一索引，保证同一个 Task 不会因重试产生多条 Activity。

### Achievement

Achievement 是短期目标完成后的持久成果，也是果实面板的数据源。沿用现有
`achievements` 表和 `achieved_at`，目标结构为：

- `id`, `user_id`
- `short_goal_id`: 指向同一用户的短期 Goal
- `title`, `achieved_at`, `created_at`
- `note`, `evidence_url`: 可选
- `metric_type`, `threshold_value`: 沿用现有字段，作为可选成果度量；没有数值目标时使用
  `metric_type = milestone` 和 `threshold_value = null`
- `(user_id, short_goal_id)` 唯一

`short_goal_id` 使用同一用户的复合外键；数据库约束触发器和服务端校验共同保证它只能指向
`goal_type = short_term` 的 Goal。

Achievement 不直接成为树上的永久节点。短期目标完成时可以显示一次简短的果实收获反馈，随后
对应枝条退出当前树；成果始终可在果实面板查看。

### Vitality

生命力不建立可被独立修改的持久表。它从查询时刻向前 30 天内满足以下条件的 Task 计算：

- `goal_id is null`
- `status = completed`
- `completed_at` 位于窗口内

映射函数必须确定、可测试并带数量上限。初始实现集中管理水滴、小生物和花草的阈值；环境元素
总量封顶，并可在低性能模式下降级。Todo 历史永久保存在 Task 中，但环境元素会随 30 天窗口
自然减少。一次性 Todo 完成时不播放浇水或施肥动画。

## 写入与分类

### 创建 Ability 和 Goal

- 写入协议新增 Ability 事件。
- 创建长期 Goal 时必须提供一个可唯一解析的 Ability 引用。
- 创建短期 Goal 时禁止提供 `ability_id`。
- AI 只提供类型和引用建议；服务端负责按同一用户下的 ID 或标题解析 Ability，并按 ID、标题或
  现有 Goal Alias 解析 Goal。
- 引用匹配为 0 个或多个时，事件进入 Inbox，不能猜测、不能悄悄改写成一次性事项。

现有单事件写入、批量 Action 校验、批量准备逻辑和 Supabase RPC 必须执行相同规则，不能出现
内存实现、单事件接口和批量接口行为不一致。

`messages.intent_type`、Inbox 建议类型、TypeScript IntentType 和批量事件 schema 同步增加
`ability`。Achievement 只能由完成短期 Goal 的命令产生，不开放独立的 AI 写入事件。

### 创建和完成 Task

- Task 写入协议必须带 `path = one_off | goal`。该字段用于请求校验，不在数据库重复保存。
- `path = one_off` 禁止携带 Goal 引用，最终写入 `goal_id = null`。
- `path = goal` 必须携带且唯一解析一个 Goal；解析失败时进入 Inbox，不写成 null。
- 每个 Task 最多保存一个 `goal_id`。
- 未完成 Task 写入 `status = open` 和 `completed_at = null`。
- 完成一次性 Task 时，只更新状态和 `completed_at`；生命力由读取端计算。
- 完成目标型 Task 时，在同一事务内更新 Task，并创建一条 Activity。
- 完成请求必须幂等。重复请求返回已经完成的结果，不重复创建 Activity。

### 完成 Goal

- 完成长期 Goal：更新状态和 `completed_at`，不创建 Achievement；渲染层继续保留木质树杈。
- 完成短期 Goal：在同一事务内更新 Goal，并创建唯一 Achievement。
- 重试短期目标完成请求不得产生重复果实记录。

## Dashboard 查询与 TreeViewModel

Dashboard 的服务端读取层一次取得：

- 所有未归档 Ability
- 长期 Goal，以及 active/paused 的短期 Goal
- 全部历史 Activity 聚合和最近 30 天 Activity 明细
- 最近 30 天完成的一次性 Task
- Achievement 列表

未来的每日 Todo 列表使用独立查询，不把所有 open Task 塞进成长树 Dashboard 数据。

读取结果先交给纯函数生成 `TreeViewModel`，再传给 Three.js：

```text
TreeViewModel
├── syntheticRoot: 人生
├── abilityBranches[]
│   └── longGoalTwigs[]
│       └── recentActivityLeaves[]
├── shortGoalBranches[]
│   └── recentActivityLeaves[]
├── vitalityElements[]
└── diagnostics[]
```

`人生` 是运行时合成根，不写入数据库。全部 Ability 和全部当前短期 Goal 都从完整数组构建，
禁止“选择第一个根再递归”的逻辑，因此不会再次只显示 `生活`。

全部历史 Activity 以单调方式决定能力枝和长期树杈的粗细、长度或累计统计；最近 30 天 Activity
形成可见叶片。一个 Activity 对应一个稳定的叶片投影记录，渲染器可以通过 InstancedMesh 批量
绘制。

所有位置和轻微随机变化都由实体 ID 产生的稳定种子计算。刷新页面或新增其他记录时，已有枝叶
不得随机跳位。

违反约束的遗留数据不允许被静默丢弃或自动挂到任意树枝。TreeViewModel 返回 diagnostics，
Dashboard 显示数据待确认提示；迁移完成后，数据库约束应阻止新异常记录产生。

## 前端组件边界

```text
GrowthTreeScene
├── GrowthEnvironment       群山、湖泊、岩石、草地、雾、光照
├── RealisticGrowthTree     木质结构和 Activity 叶片
├── VitalityElements        水滴、小生物、花草
├── TreeInteraction         Raycasting、悬停、选择、稳定 ID
├── TreeDetailPanel         HTML 详情面板
└── AchievementDrawer       HTML 果实历史面板
```

`RealisticGrowthTree.tsx` 只消费 TreeViewModel 的树结构，不读取数据库，也不负责整个环境、详情
面板或果实面板。`GrowthTreeScene` 管理 Canvas、相机、灯光和 OrbitControls。

3D 实体在 `userData` 中保存稳定实体类型和 ID。桌面悬停时高亮，点击或移动端触摸后打开右侧
HTML 详情面板；选择实体不重置相机。环境元素不逐个响应点击，顶部只显示最近 30 天生命力摘要。

果实按钮打开 HTML 抽屉，Achievement 按 `achieved_at` 倒序显示标题、日期、原短期目标、说明
和证据链接。Canvas 不承载长文字，保证可读性和可访问性。

## 3D 环境与视觉基准

场景采用柔和的 Low-poly 3D 游戏画风，不使用静态背景图替代可旋转的 3D 空间。

- 树位于默认画面的中间偏左，约为横向 40% 位置。
- 树和岩石草坡位于前景；湖泊从中下部向右侧和远处展开；多层群山、云和薄雾构成远景。
- 树冠保持清晰的自然绿色，饱和度高于背景；草地只做较小幅度的绿色增强。
- 湖泊、天空和远山使用中等偏低饱和度。背景山体相对主体再降低约 20% 饱和度，并通过较低
  对比度和雾形成空气透视。
- 禁止荧光绿、强烈青蓝湖水、秋季红橙树叶和高对比度写实材质。

环境模型、纹理路径和材质参数集中在资源配置中，允许以后替换成用户自己的 GLB/GLTF 模型与
贴图，而不改领域映射代码。

性能策略包括 InstancedMesh、受控设备像素比、有限实时阴影，以及可降级的湖面反射。低性能
模式减少反射、阴影和环境元素数量，但不能改变业务数据和节点选择。

## 加载、空状态和错误处理

- 加载中显示明确骨架或加载状态。
- 数据库查询失败显示“树数据加载失败”和重试按钮，并保留可观察的错误日志。
- 只有数据库成功返回且确实没有成长数据时，才显示基础树干和创建 Ability/Goal 的引导。
- 局部关联异常显示 diagnostics，不把异常记录静默隐藏成一棵看似正常的树。
- 3D 资源加载失败时显示降级几何和资源错误提示；数据详情面板仍可使用。
- 日志只能包含实体 ID、阶段和计数，不记录 Action token 或敏感原始消息。

## 旧数据迁移

生产库当前至少包含 `生活`、`AI副业`、`前端`、`投资` 四个没有类型的根 Goal。它们不能靠标题
可靠判断为 Ability、长期 Goal 或短期 Goal。

迁移采用显式人工映射：

1. 先执行只增加表、字段和宽松约束的 schema migration，不删除旧结构。
2. 一次性迁移工具默认 `dry-run`，输出每个旧 Goal、Task、Activity 的现状和建议操作。
3. 人工映射逐项指定：创建 Ability、转为长期 Goal 并关联 Ability、转为短期 Goal、把 Task
   改为一次性事项，或留在待确认区。
4. 未明确映射的数据不猜测、不删除、不进入新树。
5. 应用前再次读取目标行并验证用户、ID 和数量；实际写入在事务中完成，任何失败整批回滚。
6. 迁移后验证引用完整性和新旧计数，再启用严格约束和新渲染读取。
7. 新结构稳定前保留旧字段和记录；破坏性清理由后续独立任务处理。

迁移映射文件包含生产记录 ID 时不得提交到仓库。仓库只保存可复用迁移工具、schema migration
和不含真实用户标识的测试夹具。

## 上线顺序

1. 添加失败测试和 schema migration。
2. 部署兼容新旧结构的写入代码和读取诊断，不切换生产渲染。
3. 对生产旧数据执行 dry-run，人工确认映射。
4. 在事务中应用迁移并重新读取验证。
5. 部署 TreeViewModel、新组件边界和 3D 环境。
6. 验证 Dashboard 数据、可见树结构、果实面板和错误状态。
7. 观察稳定后启用严格约束；旧字段清理另行设计。

## 测试与验收

实现遵循测试驱动开发，并至少覆盖：

### 领域与数据库

- 长期 Goal 缺少 Ability 时拒绝写入。
- 短期 Goal 带 Ability 时拒绝写入。
- 同一个 Task 不能关联多个目标。
- 重复完成目标型 Task 只生成一条 Activity。
- 完成一次性 Task 不生成 Activity。
- 重复完成短期 Goal 只生成一条 Achievement。
- RLS 和复合外键阻止跨用户引用。

### TreeViewModel

- 多个 Ability 和多个短期 Goal 全部进入合成根，不能只保留第一个。
- Task 无论状态如何都不成为树节点。
- 最近 30 天 Activity 形成叶片，窗口外 Activity 只影响累计成长。
- 完成的长期 Goal 保留为木质树杈。
- 完成的短期 Goal 退出树，并能在 Achievement 列表中读取。
- 最近 30 天一次性 Task 生成确定且封顶的环境元素。
- 相同输入重复生成完全相同的位置和稳定 ID。
- 遗留异常返回 diagnostics，而不是静默丢弃。

### 页面与 3D 场景

- loading、真实空状态、数据库错误和 3D 资源错误分别显示正确 UI。
- 点击 Ability、长期 Goal 和短期 Goal 打开对应 HTML 详情。
- 相机旋转和缩放后选择实体不会重置视角。
- 果实面板按时间倒序显示 Achievement。
- 桌面和移动端构图保持树在中间偏左，群山、湖泊不遮挡主要交互实体。
- 低性能配置正确降低反射、阴影和环境实例数量。

完成后运行聚焦测试、完整 Vitest、TypeScript 类型检查、数据库测试、生产构建和浏览器视觉验证。

## 不在本次范围

- 实现完整的每日 Todo 页面。
- 一个 Todo 同时贡献多个能力或目标。
- 让一次性事项永久生成装饰物。
- 为水滴、施肥或小生物增加完成动画。
- 自动猜测旧 Goal 的新类型。
- 在本次迁移中删除旧 Goal 记录、Goal 的兼容字段或原始消息。
- 把已生成的概念图直接当成静态网页背景。
