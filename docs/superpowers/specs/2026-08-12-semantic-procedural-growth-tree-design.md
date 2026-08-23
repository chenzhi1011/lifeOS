# 语义程序成长树设计

## 目标

参考 EZ-Tree 的“参数驱动程序树”思想，但不复制其成品树，也不依赖静态 GLB。Life OS 固定使用七个人生领域作为一级主树杈，再根据领域下的长期目标、短期目标和执行记录生成位置稳定、仍可点击的下级程序枝叶。

## 已确认的产品规则

1. 历史积累形成永久骨架，不因近期不活跃而消失。
2. 近期不活跃只造成轻度季节变化：树叶减少、颜色变淡。
3. 每次 Activity 带来即时反馈；只有跨越成长阶段才改变永久骨架。
4. 永久成长采用负指数趋近成熟值：前期跨阶段快、外形变化明显，成熟后同样投入带来的尺寸增长逐渐放慢。
5. 一级主树杈固定为工作、成长、健康、生活、财务、人际关系、娱乐，始终存在且顺序稳定。
6. 不再存在 Ability 概念、数据表、写入事件或树枝层级；七个固定领域完全替代原 Ability。
7. 一次性 Todo 不显示为业务枝叶，只贡献水滴、小生物和花草。
8. 未完成 Todo 只供未来 Todo 界面使用，不在树上显示。
9. 短期目标完成后成为果实，并保存在果实面板。
10. 当前系统只有项目负责人一名用户且数据可丢弃；不保留、清洗、回填或迁移旧数据，直接按最终模型重建数据库。
11. Task 与 Reminder 是独立产品数据：现在先提供稳定的查询边界，将来 Todo 页面或自建 AI 助手都通过同一后端读取。
12. AI 只负责把自然语言转换成结构化命令，不拥有数据库规则，也不直接访问数据库；当前 Custom GPT 和未来自建 AI 助手可以互换。
13. 第一版视觉固定为低饱和、暖光的卡通治愈风；只使用纯色基础材质和柔和光照，不使用贴图、PBR 参数或自定义 Shader。

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

未完成 Todo + Reminder → Todo 查询模型（不进入成长树）
```

- 七个固定人生领域不是用户创建的数据行，而是代码和数据库约束共享的稳定枚举：`work`、`growth`、`health`、`life`、`finance`、`relationships`、`entertainment`。
- `goals` 的每一行都必须直接保存一个 `life_area`。
- `goals.goal_type = long_term` 是固定领域主树杈下面的长期积累枝。
- `goals.goal_type = short_term` 是固定领域主树杈下面的结果枝。
- `tasks.goal_id is null` 表示一次性 Todo；非空表示服务于某个目标。
- `activities` 只记录目标相关的真实执行，必须关联 goal。
- `achievements` 只记录完成的短期目标。
- `reminders` 关联 Task，保存提醒时刻、重复规则和发送状态；它不参与成长点或树形计算。
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
- 完成短期目标时事务性创建唯一 Achievement；数据库禁止未完成或长期 Goal 拥有 Achievement。
- 所有生产写入通过事务 RPC，不能留下半套数据。
- 未完成 Task 和待发送 Reminder 必须能够按认证用户独立查询，并支持游标分页；查询结果不能混入树的 ViewModel。
- 无鉴权的 `/api/intake` 只供本地演示，生产环境关闭；它不属于数据库写入入口。

`supabase/schema.sql` 直接描述最终数据库，不包含 Ability，也不包含过渡字段。开发与测试数据库从空库应用该 schema；当前远程数据库在明确确认删除后一次性重建。旧 Goal、Task、Activity 和 Reminder 均不做转换或保留，因此不存在 `life_area` 暂时可空、`NOT VALID` 约束、手工回填或维护窗口切换。

## 前后端与 AI 边界

```text
网页表单（Supabase Session） ─┐
                              ├→ HTTP 适配器 → 应用服务 → Repository / 事务 RPC → PostgreSQL
AI 助手（Action Token） ─────┘

自然语言 → AI 解析 → 结构化 LifeEventCommand
```

- 浏览器、Custom GPT、未来自建 AI 助手都只是客户端；任何客户端都不能复制“如何创建 Goal/Task/Activity”的业务规则。
- 应用服务接受已经认证的 `principal` 和结构化命令，统一完成校验、幂等判断、归属检查与事务写入。
- 浏览器使用 Supabase Session；AI 或自动化使用 Action Token。两种认证最终都转换成服务端 `principal.userId`，API 不接受客户端通过 query/body 指定其他用户。
- 保留 `POST /api/actions/life-events` 作为 AI/自动化适配器；新增 `POST /api/life-events` 作为网页会话适配器。两者调用同一个应用服务。
- 新增 `GET /api/tasks` 与 `GET /api/reminders`。将来开发 Todo 页面只消费这些稳定响应，不需要了解 Supabase 表结构。
- React 页面和组件不得直接 import repository 或 Supabase service-role client；树、Todo 列表和 AI 接入通过应用查询或公开 API 契约解耦。
- 删除旧 `POST /api/actions/life-event` 路由文件，不保留 410 兼容层；访问旧地址按不存在的路由返回 404。

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
- `maturity`：成长点经过负指数曲线得到的成熟度，范围 0–1。

不同 metric 先转换为成长点数：分钟按 30 分钟约等于 1 点，小时按 2 点/小时，count 每次最多计 10 点，milestone 每次计 5 点。所有单次贡献设上限，避免异常输入让树无限增长。

成熟度使用：

```text
maturity(points) = 1 - e^(-points / 35)
```

普通指数增长会越来越快，不符合产品目的；这里使用负指数饱和曲线。0、5、15、35、70、140 点分别约为 0%、13%、35%、63%、86%、98% 成熟。前期较少投入即可产生明显成长，后期仍记录全部历史贡献，但树的外形逐渐接近成熟上限。

### TreeRecipe

TreeRecipe 是业务与几何之间唯一契约，采用 EZ-Tree 风格参数：

- 用户 ID 生成固定 `seed`。
- 人生累计阶段控制树干高度、半径和分段数。
- 一级主树杈固定为七根，其方位由 life area 常量决定，不受 Task 或 Goal 数量影响。
- 领域累计值控制对应主树杈的长度、半径、弯曲和树冠繁茂度，但不能删除或新增一级主树杈。
- long-term goal 的阶段决定所属领域主树杈上的长期分枝长度和粗细。
- active short-term goal 形成所属领域主树杈上的结果枝。
- recentActivityScore 控制树叶保留率、绿色程度和嫩叶比例。

第一版固定阶段阈值为 `[0, 5, 15, 35, 70, 140]`，它们是负指数曲线上的永久结构快照。阶段只增加永久结构；累计值在同一阶段内只改变近期反馈，不重排骨架。树干、领域主枝和目标枝都使用相同曲线，但分别依据全局、领域和 Goal 自身的成长点计算。

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
- 场景 Mesh 使用纯色 `MeshLambertMaterial`；天空渐变使用透明 WebGL 画布下方的 CSS `linear-gradient`，不使用天空贴图或 ShaderMaterial。
- 根、life area、long goal、short goal 都保留 `entityType` 和 `entityId`；life area 的 entityId 就是稳定枚举值。
- Activity 叶片使用 `InstancedMesh` 或可单独拾取的实例映射。
- Raycaster 仍只检测 `selectable`。
- Hover、selected、related 的颜色优先级保持现有行为。
- 详情面板增加领域详情，并保留目标详情和果实面板。

## 卡通治愈色板

色板使用语义名称集中定义，Three.js 场景和 React UI 都从同一个 `HEALING_PALETTE` 读取，不允许组件内散落新的十六进制颜色。

| 语义 | 颜色 | 用途 |
|---|---|---|
| 天空顶部 | `#9DCDF2` | CSS 天空渐变上端 |
| 天空地平线 | `#FFE0B5` | CSS 天空渐变下端 |
| 太阳 | `#FFF1C7` | 可见太阳圆面及暖色主光 |
| 默认雾 | `#DDE8D5` | 场景纵深雾；`#F3DFC4` 留作未来黄昏状态 |
| 主草地 | `#91B873` | 前景主要草坡 |
| 浅草地 | `#B8CE8F` | 远处或受光草面 |
| 土地 | `#C99D72` | 裸土、坡面和树根周围 |
| 树干主体 | `#9B6848` | 主干与枝干基础色 |
| 树干亮面 | `#C48B62` | TubeGeometry 朝向主光的顶点色 |
| 成熟叶 | `#6FAF67` | 稳定叶片 |
| 嫩叶 | `#A7D97B` | 新 Activity 和高近期活跃反馈 |
| 休眠叶 | `#C6A56D` | 低近期活跃状态，不表示永久退化 |
| 成就果实 | `#F29A78` / `#F5C56A` | 按 Achievement ID 稳定分配 |
| 云朵 | `#FFF8E8` | 纯色低模云 |
| UI 背景 | `#FFF8EA` | 面板、卡片和浮层 |
| UI 文字 | `#59483A` | 正文和标题，替代低对比度白字 |

- 树干亮面通过几何顶点色与 Lambert 光照形成，不增加木纹或法线贴图。
- 叶色只在成熟叶、嫩叶、休眠叶三种语义色之间按状态混合，不再任意调整 HSL 饱和度。
- 两种果实颜色由 Achievement ID 的稳定哈希决定，同一成果刷新后不换色。
- Hover、selected、related 通过亮度、描边或轮廓表示，不能覆盖实体的基础类别色。
- 第一版没有昼夜、天气或季节主题切换；`#F3DFC4` 仅预留，不进入默认渲染。

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

- 保留、转换或兼容现有数据库数据。
- 增量迁移与新旧 schema 并行运行；当前阶段采用空库重建。
- 接入 `@dgreenheck/ez-tree` 运行时依赖。
- GLB 树模型。
- 图片贴图、PBR 木纹/草地、normal/roughness/metalness map、自定义 ShaderMaterial。
- 昼夜、天气和多套季节主题。
- 用户自选或新增人生领域。
- Ability 概念及其兼容层。
- 继续支持旧的非事务单事件写入 API。
- 本阶段制作完整 Todo 列表与提醒 UI（本阶段只建立数据、应用服务和 API 边界）。
- 树木成长动画。
- 把未完成 Todo 显示在树上。

## 验收标准

1. 相同用户、相同数据、相同日期生成相同树。
2. 所有用户始终拥有同样七根一级主树杈。
3. 新增 Task 不会新增、删除、重排或重新分类一级主树杈。
4. 新增 Activity 在未跨阶段时不会重排已有枝干。
5. 跨阶段后只增长对应 Goal 和所属领域的局部结构。
6. 成长曲线单调增加且边际增长递减；5 点带来的成熟度增量必须大于成熟后再增加 5 点的增量。
7. 不同领域积累使七根主树杈呈现不同长度、粗细和繁茂程度。
8. 低活跃只改变叶片，不删除枝干。
9. 每根领域枝、目标枝和 Activity 叶仍可点击并打开正确详情。
10. 一次性 Todo、目标 Todo、短期完成和长期完成遵守数据库写入规则。
11. 桌面和移动端保持当前山、湖、树的层次构图。
12. 未完成 Task 和 scheduled Reminder 可通过独立分页 API 查询，但不会改变任何树枝、叶片或装饰。
13. 网页 Session 与 Action Token 写入经过同一个应用服务；替换 AI 客户端不需要改数据库写入规则。
14. 旧 `/api/actions/life-event` 文件、OpenAPI 路径和非事务 repository 写入函数全部不存在。
15. 空数据库应用最终 `supabase/schema.sql` 后，所有表、约束、RLS 和 RPC 一次创建成功；最终 schema 中不存在 Ability 或可空 `goals.life_area`。
16. 场景和 UI 只使用 `HEALING_PALETTE` 中的固定语义色；默认雾为 `#DDE8D5`，UI 正文为 `#59483A`，不存在白色正文。
17. Three.js 业务场景不使用纹理贴图、`MeshStandardMaterial` 或 `ShaderMaterial`；天空仍呈现从柔和蓝到奶油暖黄的渐变。
