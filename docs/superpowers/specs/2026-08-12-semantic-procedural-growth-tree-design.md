# 语义程序成长树设计

## 目标

参考 EZ-Tree 的“参数驱动程序树”思想，但不复制其成品树，也不依赖静态 GLB。Life OS 固定使用七个人生领域作为一级主树杈，再根据领域下的长期目标、短期目标和执行记录生成位置稳定、仍可点击的下级程序枝叶。

## 已确认的产品规则

1. 历史积累形成永久骨架，不因近期不活跃而消失。
2. 近期不活跃只造成轻度季节变化：树叶减少、颜色变淡。
3. 每次 Activity 带来即时反馈；只有跨越成长阶段才改变永久骨架。
4. 一级主树杈固定为工作、成长、健康、生活、财务、人际关系、娱乐，始终存在且顺序稳定。
5. 不再存在 Ability 概念、数据表、写入事件或树枝层级；七个固定领域完全替代原 Ability。
6. 一次性 Todo 不显示为业务枝叶，只贡献水滴、小生物和花草。
7. 未完成 Todo 只供未来 Todo 界面使用，不在树上显示。
8. 短期目标完成后成为果实，并保存在果实面板。
9. 忽略现存数据的清洗、回填与兼容；用户自行修正历史数据。

## 业务模型

```text
人生树干
└── 固定领域主树杈（七根）
    ├── 长期目标枝
    │   └── Activity 叶片
    └── 短期目标枝
        ├── Activity 叶片
        └── 完成后形成果实

一次性 Todo → 完成 → 近期生命力装饰
```

- 七个固定人生领域不是用户创建的数据行，而是代码和数据库约束共享的稳定枚举：`work`、`growth`、`health`、`life`、`finance`、`relationships`、`entertainment`。
- `goals` 的每一行都必须直接保存一个 `life_area`。
- `goals.goal_type = long_term` 是固定领域主树杈下面的长期积累枝。
- `goals.goal_type = short_term` 是固定领域主树杈下面的结果枝。
- `tasks.goal_id is null` 表示一次性 Todo；非空表示服务于某个目标。
- `activities` 只记录目标相关的真实执行，必须关联 goal。
- `achievements` 只记录完成的短期目标。
- Task 和 Activity 永远不提交、推断或修改人生领域；它们从 Goal 继承领域。
- `category` 可以暂时保留为自由文本标签，但不参与树的归类和几何生成；未来确认无其他用途后可单独移除。

## 数据库边界

数据库保存事实，不保存 `tree_height`、`branch_angle`、`leaf_count` 等可重新计算的视觉结果。

数据库必须强制：

- 删除 `abilities` 表和 `goals.ability_id`，所有生产代码删除 Ability 类型与事件。
- 每个长期或短期 Goal 都必须具有七个允许值之一的 `life_area`。
- Activity 的 value 必须大于零。
- duration 只能使用 minute/hour；count 和 milestone 使用 count。
- 完成目标 Todo 时事务性创建 Activity。
- 完成一次性 Todo 时不创建 Activity。
- 完成短期目标时事务性创建唯一 Achievement。
- 所有生产写入通过事务 RPC，不能留下半套数据。

本项目不执行旧数据自动映射和自动修复。用户先手工把现有 Goal 补齐 `life_area`；确认无代码依赖 Ability 后，再执行删除 `ability_id` 和 `abilities` 的迁移。

## 生成管线

```text
DashboardData
  → GrowthMetrics
  → TreeRecipe
  → SemanticTreeSkeleton
  → Three.js Geometry
  → selectable / entityByUuid
```

### GrowthMetrics

把原始业务数据转换为有界指标：

- `lifetimeValue`：所有有效 Activity 的累计值。
- `activeDays`：历史活跃日期数量。
- `recentActivityScore`：最近 30 天活跃程度，范围 0–1。
- `lifeAreaValue`：单一固定人生领域下所有目标的累计值。
- `goalValue`：单目标累计值。
- `growthStage`：由累计值跨越固定阈值得到的离散阶段。

不同 metric 先转换为成长点数：分钟按 30 分钟约等于 1 点，小时按 2 点/小时，count 每次最多计 10 点，milestone 每次计 5 点。所有单次贡献设上限，避免异常输入让树无限增长。

### TreeRecipe

TreeRecipe 是业务与几何之间唯一契约，采用 EZ-Tree 风格参数：

- 用户 ID 生成固定 `seed`。
- 人生累计阶段控制树干高度、半径和分段数。
- 一级主树杈固定为七根，其方位由 life area 常量决定，不受 Task 或 Goal 数量影响。
- 领域累计值控制对应主树杈的长度、半径、弯曲和树冠繁茂度，但不能删除或新增一级主树杈。
- long-term goal 的阶段决定所属领域主树杈上的长期分枝长度和粗细。
- active short-term goal 形成所属领域主树杈上的结果枝。
- recentActivityScore 控制树叶保留率、绿色程度和嫩叶比例。

第一版固定阶段阈值为 `[0, 5, 15, 35, 70, 140]`。阶段只增加永久结构；累计值在同一阶段内只改变近期反馈，不重排骨架。

## 稳定性规则

- 用户 seed 由 userId 稳定生成。
- 七个 life area 使用预设且固定的方位槽位。
- 每个 goal 的局部 seed 由实体 ID 稳定生成。
- 实体排序按稳定哈希，不按数据库返回顺序。
- 新增 Goal 只占用所属领域的新方向，不改变已有 Goal 方向。
- 新增 Task 不得新增、删除、重排或重新分类一级主树杈。
- 同一输入和同一 `asOf` 必须产生完全相同的 recipe 和 skeleton。
- 近期窗口变化只能改变叶片与颜色，不改变永久枝干。

## 几何与交互

- 枝干由语义骨架的三次贝塞尔曲线生成 `TubeGeometry`，替代当前直线 `CylinderGeometry`。
- 根、life area、long goal、short goal 都保留 `entityType` 和 `entityId`；life area 的 entityId 就是稳定枚举值。
- Activity 叶片使用 `InstancedMesh` 或可单独拾取的实例映射。
- Raycaster 仍只检测 `selectable`。
- Hover、selected、related 的颜色优先级保持现有行为。
- 详情面板增加领域详情，并保留目标详情和果实面板。

## 生命周期与季节表现

- 永久层：树干、七根固定领域主树杈、目标枝。
- 近期层：叶密度、叶色、嫩叶、水滴、小生物、花草。
- 近期分数高时叶片更绿、更密；低时最低仍保留约 45% 基础叶，避免树突然变秃。
- 不播放树木生长动画；数据刷新后直接显示新状态。

## 错误处理

- 非法写入在 API 校验层和数据库约束层同时拒绝。
- 生成器只接受具有合法 `life_area` 的 Goal；开发环境遇到不可能状态时抛出明确错误。
- 场景生成失败时显示现有错误边界，不回退到伪造数据树。
- WebGL 资源在 viewModel 变化和组件卸载时只释放一次。

## 不在本次范围

- 自动修改或迁移现有生产数据。
- 接入 `@dgreenheck/ez-tree` 运行时依赖。
- GLB 树模型。
- 用户自选或新增人生领域。
- Ability 概念及其兼容层。
- 树木成长动画。
- 把未完成 Todo 显示在树上。

## 验收标准

1. 相同用户、相同数据、相同日期生成相同树。
2. 所有用户始终拥有同样七根一级主树杈。
3. 新增 Task 不会新增、删除、重排或重新分类一级主树杈。
4. 新增 Activity 在未跨阶段时不会重排已有枝干。
5. 跨阶段后只增长对应 Goal 和所属领域的局部结构。
6. 不同领域积累使七根主树杈呈现不同长度、粗细和繁茂程度。
7. 低活跃只改变叶片，不删除枝干。
8. 每根领域枝、目标枝和 Activity 叶仍可点击并打开正确详情。
9. 一次性 Todo、目标 Todo、短期完成和长期完成遵守数据库写入规则。
10. 桌面和移动端保持当前山、湖、树的层次构图。
