# 语义程序成长树设计

## 目标

参考 EZ-Tree 的“参数驱动程序树”思想，但不复制其成品树，也不依赖静态 GLB。Life OS 根据用户的能力、目标和执行记录生成一棵形态独特、位置稳定、仍可点击的程序树。

## 已确认的产品规则

1. 历史积累形成永久骨架，不因近期不活跃而消失。
2. 近期不活跃只造成轻度季节变化：树叶减少、颜色变淡。
3. 每次 Activity 带来即时反馈；只有跨越成长阶段才改变永久骨架。
4. 能力和目标结构决定树的轮廓，不同用户可以长成明显不同的树。
5. 一次性 Todo 不显示为业务枝叶，只贡献水滴、小生物和花草。
6. 未完成 Todo 只供未来 Todo 界面使用，不在树上显示。
7. 短期目标完成后成为果实，并保存在果实面板。
8. 忽略现存数据的清洗、回填与兼容；用户自行修正历史数据。

## 业务模型

```text
长期路径：Todo → Activity → 长期目标 → 能力 → 主树杈
短期路径：Todo → Activity → 短期目标 → 完成结果 → 果实
一次性路径：Todo → 完成 → 近期生命力装饰
```

- `abilities` 表示长期培养的能力，是一级主树杈。
- `goals.goal_type = long_term` 必须关联一个 ability，是该主树杈上的二级或三级枝。
- `goals.goal_type = short_term` 不关联 ability，是从主干生长的结果枝。
- `tasks.goal_id is null` 表示一次性 Todo；非空表示服务于某个目标。
- `activities` 只记录目标相关的真实执行，必须关联 goal。
- `achievements` 只记录完成的短期目标。

## 数据库边界

数据库保存事实，不保存 `tree_height`、`branch_angle`、`leaf_count` 等可重新计算的视觉结果。

数据库必须强制：

- 长期目标必须有同用户的 active ability。
- 短期目标不得关联 ability。
- Activity 的 value 必须大于零。
- duration 只能使用 minute/hour；count 和 milestone 使用 count。
- 完成目标 Todo 时事务性创建 Activity。
- 完成一次性 Todo 时不创建 Activity。
- 完成短期目标时事务性创建唯一 Achievement。
- 所有生产写入通过事务 RPC，不能留下半套数据。

本项目不执行旧数据映射和自动修复。新约束启用前，现有数据由用户手动修正。

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
- `abilityValue`：单项能力下所有长期目标的累计值。
- `goalValue`：单目标累计值。
- `growthStage`：由累计值跨越固定阈值得到的离散阶段。

不同 metric 先转换为成长点数：分钟按 30 分钟约等于 1 点，小时按 2 点/小时，count 每次最多计 10 点，milestone 每次计 5 点。所有单次贡献设上限，避免异常输入让树无限增长。

### TreeRecipe

TreeRecipe 是业务与几何之间唯一契约，采用 EZ-Tree 风格参数：

- 用户 ID 生成固定 `seed`。
- 人生累计阶段控制树干高度、半径和分段数。
- active ability 数量决定一级主树杈数量。
- ability 累计值决定对应树杈长度、半径和冠幅。
- long-term goal 的阶段决定该能力枝上的分枝数量、长度和粗细。
- active short-term goal 形成从主干出发的结果枝。
- recentActivityScore 控制树叶保留率、绿色程度和嫩叶比例。

第一版固定阶段阈值为 `[0, 5, 15, 35, 70, 140]`。阶段只增加永久结构；累计值在同一阶段内只改变近期反馈，不重排骨架。

## 稳定性规则

- 用户 seed 由 userId 稳定生成。
- 每个 ability/goal 的局部 seed 由实体 ID 稳定生成。
- 实体排序按稳定哈希，不按数据库返回顺序。
- 新增实体只占用新方向，不改变已有实体方向。
- 同一输入和同一 `asOf` 必须产生完全相同的 recipe 和 skeleton。
- 近期窗口变化只能改变叶片与颜色，不改变永久枝干。

## 几何与交互

- 枝干由语义骨架的三次贝塞尔曲线生成 `TubeGeometry`，替代当前直线 `CylinderGeometry`。
- 根、ability、long goal、short goal 都保留 `entityType` 和 `entityId`。
- Activity 叶片使用 `InstancedMesh` 或可单独拾取的实例映射。
- Raycaster 仍只检测 `selectable`。
- Hover、selected、related 的颜色优先级保持现有行为。
- 详情面板和果实面板不改变业务接口。

## 生命周期与季节表现

- 永久层：树干、能力枝、目标枝。
- 近期层：叶密度、叶色、嫩叶、水滴、小生物、花草。
- 近期分数高时叶片更绿、更密；低时最低仍保留约 45% 基础叶，避免树突然变秃。
- 不播放树木生长动画；数据刷新后直接显示新状态。

## 错误处理

- 非法写入在 API 校验层和数据库约束层同时拒绝。
- 生成器只接受合法规范化数据；开发环境对不可能状态抛出明确错误。
- 场景生成失败时显示现有错误边界，不回退到伪造数据树。
- WebGL 资源在 viewModel 变化和组件卸载时只释放一次。

## 不在本次范围

- 自动修改或迁移现有生产数据。
- 接入 `@dgreenheck/ez-tree` 运行时依赖。
- GLB 树模型。
- 用户自选树种。
- 树木成长动画。
- 把未完成 Todo 显示在树上。

## 验收标准

1. 相同用户、相同数据、相同日期生成相同树。
2. 新增 Activity 在未跨阶段时不会重排已有枝干。
3. 跨阶段后只增长对应实体的永久结构。
4. 不同 ability 结构产生明显不同的主树杈轮廓。
5. 低活跃只改变叶片，不删除枝干。
6. 每根业务枝和 Activity 叶仍可点击并打开正确详情。
7. 一次性 Todo、目标 Todo、短期完成和长期完成遵守数据库写入规则。
8. 桌面和移动端保持当前山、湖、树的层次构图。
