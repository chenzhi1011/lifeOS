# Semantic Procedural Growth Tree Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 Life OS 在保证新写入数据合法的前提下，以七个固定人生领域作为一级主树杈，根据领域下的长期目标、短期目标和执行记录生成能够阶段成长、能够点击查看业务详情的程序树。

**Architecture:** 数据库保存 Goal、Todo、Activity 和成果等业务事实，每个 Goal 直接属于七个固定领域之一，不再存在 Ability。纯函数管线将这些事实依次转换为 `GrowthMetrics`、EZ-Tree 风格的 `TreeRecipe` 和携带业务 ID 的 `SemanticTreeSkeleton`，最后由 Three.js 生成曲线枝干与实例化叶片；现有场景、选择交互和详情面板继续复用。

**Tech Stack:** Next.js 15、React 19、TypeScript 5.7、Three.js 0.185、Supabase/PostgreSQL、Zod、Vitest、Playwright、SQL 回归测试。

---

## 一、给项目负责人的背景说明

### 1. Life OS 目前在解决什么问题

这个项目把用户日常输入转换为结构化成长记录。用户看到的不是普通报表，而是一棵树：长期积累成为枝干，近期执行成为叶片，一次性事项成为水滴或小生物，短期目标的完成结果成为果实。

数据库中的核心事实是：

| 数据 | 用户语言 | 在树上的意义 |
|---|---|---|
| 固定 life areas | 工作、成长、健康、生活、财务、人际关系、娱乐 | 始终存在的七根一级主树杈 |
| `goals` | 坚持健身、通过考试、找到工作 | 领域下的长期积累枝或短期结果枝 |
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

本项目只参考这种“参数决定树形”的方法，不直接接入 EZ-Tree 运行库。原因是 EZ-Tree 会把许多枝条合并成视觉几何，难以保证某根枝永远对应某个人生领域或 Goal。Life OS 的树不只是装饰，它必须保留业务身份和点击交互。

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

用户每完成一次目标相关 Todo，会写入 Activity。Activity 会立即增加嫩叶或生命力；累计值跨过固定阶段阈值后，对应的枝干才永久增长。七根一级主树杈不会因新增 Task 或 Goal 而增减或换位。用户近期不活跃时，已经形成的枝干不会消失，只会出现轻微的叶片减少和颜色变淡。

### 4. 本次明确不做什么

- 不清洗、推测、迁移或回填现有生产数据；由项目负责人手工修正。
- 不使用静态 GLB 树模型。
- 不安装 `@dgreenheck/ez-tree`。
- 不播放成长动画。
- 不把未完成 Todo 放在树上。
- 不保留 Ability 表、类型、事件或兼容层。
- 不让树形参数成为数据库字段；视觉结果必须可以从业务事实重新计算。

## 二、交付边界与完成标准

本计划分为三个可以独立验收的子系统：

1. **写入可信**：新数据只能按规定路径写入，数据库拒绝非法组合。
2. **树形可信**：同一份数据稳定生成同一棵树，新增数据不会重排旧枝。
3. **展示可信**：自然曲线枝干、树冠季节变化和点击详情在桌面/移动端可用。

整个项目完成的判定不是“页面能打开”，而是以下事实同时成立：

- 新写入无法产生负 Activity、错误单位或错误长期/短期关系；
- 所有用户都稳定拥有工作、成长、健康、生活、财务、人际关系、娱乐七根一级主树杈；
- 新增 Task 不会新增、重排或重新分类一级主树杈；
- 相同输入重复计算得到完全相同的 recipe 和 skeleton；
- 新增 Activity 未跨阶段时，已有永久骨架不变；
- 跨阶段时只改变所属 Goal 和人生领域的局部结构；
- 永久尺寸的成长前期明显、后期递减，并在成熟时趋近固定上限；
- 低活跃只影响叶片，不删除历史枝干；
- 所有业务枝叶仍可点击并打开正确详情；
- 完整 Vitest、数据库测试、类型检查、生产构建和浏览器验收通过。

## 三、非技术审核指南：每项修改为什么存在

下面不是代码清单，而是项目负责人需要批准的业务变化。审核时不需要判断函数名称是否合适，只需要确认“问题是否真实、改完的行为是否符合产品”。

### 修改 1：用七个固定领域替代 Ability

**现在是什么：** 数据库有一张 `abilities` 表。长期目标必须先关联 Ability，树再把 Ability 画成一级主枝。

**为什么要改：** 这与新的产品决定冲突。工作、成长、健康等应该是所有用户共有且稳定的一级结构，不应该因为 AI 或用户创建了一个“能力”而多出或重排主树杈。

**准备怎么改：** 删除 `abilities` 表、`goals.ability_id`、Ability API 事件以及前后端 Ability 类型。每个长期/短期 Goal 直接保存一个 `life_area`。

**改完后的用户体验：** 所有用户永远看到七根主树杈。新增“每周跑步”只会在健康树杈下面长出目标枝，不会创建第八根主树杈。

**负责人验收问题：** 是否确认人生领域固定为七个，且第一版不允许用户自定义？

### 修改 2：只保留一个可靠的生产写入入口

**现在是什么：** 项目同时有单事件写入和批量事务写入。旧单事件写入依次写 message、goal、task/activity，中途失败可能只留下前半部分。

**为什么要改：** 树依赖数据关系完整。半套数据可能出现“有消息但没有 Todo”或“Todo 完成但没有 Activity”，导致树与真实行为不一致。

**准备怎么改：** 生产集成只允许调用 `/api/actions/life-events`。它在一个数据库事务中完成所有写入；任何一步失败，整批都不保存。旧入口返回 410，告诉调用方迁移到新入口。

**改完后的用户体验：** 同一句输入不会只保存一半；重复提交同一个批次不会生成重复记录。

**负责人验收问题：** 是否接受旧集成必须升级到批量端点？

### 修改 3：增加成长点数换算层

**现在是什么：** Activity 可能记录分钟、小时、次数或里程碑，现有树主要直接累计 `value`。这样“练琴 60 分钟”和“跑步 1 次”无法公平比较。

**为什么要改：** 如果直接相加，单位选择会不合理地决定树长多快，异常大的数值还可能让树突然变形。

**准备怎么改：** 新增 GrowthMetrics，把不同单位转换为有上限的成长点，再用负指数饱和曲线 `1 - e^(-points/35)` 计算成熟度。它与普通指数相反：前期变化快，成熟后逐渐放慢。历史累计和最近 30 天状态仍分开计算。

**改完后的用户体验：** 新用户前几次完成目标就能明显看到树成长，获得成就感；成熟树仍会保留所有积累记录，但不会无限变高、变粗或挤出画面。

**第一版成长速度示例：**

| 成长点 | 成熟度 | 产品感受 |
|---:|---:|---|
| 0 | 0% | 初始幼树 |
| 5 | 13% | 很快出现第一次明显成长 |
| 15 | 35% | 前期反馈仍然强烈 |
| 35 | 63% | 进入稳定成长阶段 |
| 70 | 86% | 接近成熟，增长开始明显放慢 |
| 140 | 98% | 成熟树，后续以细节和长期记录为主 |

**负责人验收问题：** 是否接受曲线常数 35 和阶段点 `[0,5,15,35,70,140]` 作为第一版，后续通过真实使用数据调参？

### 修改 4：建立 TreeRecipe 树形配方

**现在是什么：** 数据投影代码直接计算 Three.js 坐标，业务含义和视觉参数混在一起，很难像 EZ-Tree 一样集中调整树形。

**为什么要改：** 产品以后会不断调整树高、分叉角度、枝条弯曲和叶密度。如果没有中间配方，每次视觉调整都可能破坏数据映射。

**准备怎么改：** 用 TreeRecipe 集中描述树干、七根领域枝、目标枝和树冠参数。数据库不保存这些参数，它们由数据随时重新计算。

**改完后的用户体验：** 工作量增加会让对应领域枝按“前快后慢”的成熟度变粗、变长；七根主枝的位置仍保持稳定。

**负责人验收问题：** 是否认可“固定主枝位置，数据只改变生长程度”的原则？

### 修改 5：建立不会重排的语义骨架

**现在是什么：** 当前使用稳定随机值计算少量直线枝，但没有完整的父子骨架契约。

**为什么要改：** 如果新增一条记录后所有随机数重新分配，用户会看到旧目标突然换到另一边，失去“这是我的树”的连续感。

**准备怎么改：** 七个领域使用固定方位；每个 Goal 的方向只由自身 ID 决定。新增 Goal 只在所属领域增加局部分枝。

**改完后的用户体验：** 树会成长，但已经认识的枝条不会乱跑。

**负责人验收问题：** 是否将位置稳定性置于每次生成的完全自然随机感之上？

### 修改 6：把业务数据投影和 Three.js 渲染分开

**现在是什么：** `tree-visualization.ts` 同时处理业务筛选、统计、坐标和诊断，修改任何一层都容易牵动其他部分。

**为什么要改：** 数据规则和画面规则的变化频率不同。分开后，可以调整树的画风而不改变数据库含义。

**准备怎么改：** 业务层只产出 metrics、recipe、skeleton；Three.js 层只把 skeleton 画出来。

**改完后的用户体验：** 没有直接功能变化，但后续视觉迭代更安全、更快。

**负责人验收问题：** 是否接受这部分属于必要基础建设，而不是立刻可见的画面功能？

### 修改 7：把直线圆柱换成自然曲线枝干

**现在是什么：** 每根枝是两个点之间的一根直圆柱，因此画面像结构示意图。

**为什么要改：** EZ-Tree 视觉自然的关键之一是枝条由连续弯曲段组成，而不是直棍。

**准备怎么改：** 使用三次贝塞尔曲线和 Three.js `TubeGeometry` 生成弯曲枝干，同时保留每根枝的领域/Goal ID。

**改完后的用户体验：** 树的轮廓更自然，点击枝条仍能打开正确详情。

**负责人验收问题：** 第一版是否接受枝条内部半径一致，以换取较低实现风险；父粗子细通过不同层级枝条体现？

### 修改 8：数据少时也要有完整树冠

**现在是什么：** 只有真实 Activity 才生成数据叶，所以新用户或低活跃用户的树很秃。

**为什么要改：** 树首先要像一棵树，但又不能伪造 Activity。

**准备怎么改：** 增加不可点击的装饰叶形成基础树冠；真实 Activity 叶颜色更亮并可点击。近期活跃度只改变树冠密度和颜色，最低保留 45%。

**改完后的用户体验：** 数据少时仍有完整绿色树冠；用户仍能区分哪些亮叶代表真实执行。

**负责人验收问题：** 是否接受装饰叶不对应数据库记录？

### 修改 9：控制性能和资源释放

**现在是什么：** 数据增长后，每片叶、每根枝都可能成为独立 WebGL 对象；反复刷新还可能遗漏资源释放。

**为什么要改：** 手机端可能卡顿、耗电，长时间打开可能逐渐占用更多显存。

**准备怎么改：** 装饰叶合并成 InstancedMesh，限制枝叶数量和几何精度，并测试每次更新只释放一次旧资源。

**改完后的用户体验：** 桌面和手机上旋转、缩放更稳定，长时间使用不会越来越卡。

**负责人验收问题：** 是否接受在极大数据量时压缩装饰细节，而不是无限增加叶片？

### 修改 10：分两阶段发布并提供回退点

**现在是什么：** Ability 删除同时影响数据库、API、读取和渲染，是一次破坏性结构变更。

**为什么要改：** 如果所有变化一次上线，故障时很难判断是数据还是画面问题。

**准备怎么改：** 先完成数据库字段准备和手工归类，再在短维护窗口删除 Ability 并切换 API；数据稳定后再单独发布程序树渲染。

**改完后的用户体验：** 发布过程可能有一次短维护窗口，但数据与画面可以分别验收和回退。

**负责人验收问题：** 是否接受短维护窗口来换取安全的结构切换？

## 四、修改完成后的数据库存储结构

### 1. 总体关系

```text
Supabase auth.users
└── profiles（Life OS 用户）
    ├── external_accounts（微信/Telegram/App 外部身份）
    ├── action_credentials（Custom GPT/API 凭证）
    ├── action_batches（一次原子写入批次）
    │   └── messages（用户原始输入及解析结果）
    ├── goals（长期/短期目标，直接属于固定领域）
    │   ├── goal_aliases（目标别名）
    │   ├── tasks（目标 Todo）
    │   │   ├── reminders（提醒）
    │   │   └── activities（完成后产生的真实执行）
    │   ├── activities（没有 Todo 也可直接记录执行）
    │   └── achievements（仅短期目标完成后产生）
    ├── tasks（goal_id 为空时是一次性 Todo）
    └── inbox_items（无法可靠分类、等待用户确认）
```

最终数据库中没有 `abilities` 表，也没有 `goals.ability_id`。

除固定领域枚举外，所有业务表都通过 `user_id` 隔离用户。Supabase Row Level Security 继续限制登录用户只能访问自己的行；需要跨表事务的 HTTP API 在服务器端使用 service role，并在 RPC 中再次按 `p_user_id` 校验归属。service role 密钥不得发送到浏览器。

### 2. 固定人生领域如何保存

七个领域不单独建表，因为它们不是用户数据，而是产品常量：

```text
work           工作
growth         成长
health         健康
life           生活
finance        财务
relationships  人际关系
entertainment  娱乐
```

数据库通过 CHECK 约束保证 `goals.life_area` 只能使用这七个值。长期和短期 Goal 都必须直接选择一个领域。

### 3. 每张表保存什么

#### `profiles`：用户基本设置

| 关键字段 | 含义 |
|---|---|
| `user_id` | Supabase 登录用户 UUID，主键 |
| `display_name` | 显示名称 |
| `timezone` | 用户时区，决定“今天”和提醒时间 |
| `default_reminder_time` | 默认提醒时刻 |

#### `external_accounts`：外部平台账号映射

把微信、Telegram 或 App 外部用户 ID 映射到 Life OS 用户。它不参与树形计算。

#### `action_credentials`：API 访问凭证

保存凭证名称、token 哈希、启用/撤销状态和最后使用时间。数据库只保存哈希，不保存明文 token。

#### `action_batches`：一次完整写入请求

| 关键字段 | 含义 |
|---|---|
| `idempotency_key` | 防止同一请求重复写入 |
| `request_hash` | 判断相同 key 是否被错误用于不同内容 |
| `raw_text` | 用户整段原始输入 |
| `response_json` | 第一次执行结果，重复请求直接复用 |

#### `goals`：所有长期和短期目标

| 字段 | 含义和规则 |
|---|---|
| `id`、`user_id` | Goal 身份和所属用户 |
| `title` | 目标名称，同一用户内唯一 |
| `life_area` | 必填，只能是七个固定领域之一 |
| `goal_type` | `long_term` 或 `short_term` |
| `category` | 保留的自由文本展示标签；不决定树枝位置 |
| `parent_goal_id` | 可选的父目标关系；第一版树形不依赖它 |
| `metric_type` | duration、count 或 milestone |
| `status` | active、paused、completed |
| `due_at` | 可选截止时间 |
| `completed_at` | completed 时必须存在 |

示例：

```text
“每周跑步”     life_area=health, goal_type=long_term
“通过 AWS 考试” life_area=growth, goal_type=short_term
“拿到新工作”   life_area=work,   goal_type=short_term
```

#### `goal_aliases`：目标别名

例如 “AWS 认证”“AWS 考试”“SAA” 都可指向同一个 Goal。别名只用于输入解析，不额外生成树枝。

#### `messages`：原始输入审计记录

保存输入来源、原文、识别类型、置信度、解析 JSON、批次序号和处理状态。删除 Ability 后，允许类型为 task、activity、goal、reminder、inbox，不再允许 ability。

#### `tasks`：待办事项

| 情况 | `goal_id` | 树上的处理 |
|---|---|---|
| 买水、打扫卫生 | `null` | 未完成不显示；完成后成为近期生命力装饰 |
| 今天跑步 30 分钟 | 健康领域下的 Goal ID | 未完成不显示；完成后产生 Activity 叶片 |

Task 保存状态、截止时间、优先级和计划指标。Task 不保存 `life_area`，避免与 Goal 出现两份互相矛盾的分类。

#### `activities`：真实发生的执行

Activity 必须关联 Goal，可以选择关联促成它的 Task。它保存执行摘要、日期、指标类型、正数值和单位，是树成长的主要事实来源。

单位规则：duration 只能用 minute/hour；count 和 milestone 只能用 count。

#### `reminders`：提醒计划

关联 Task 和原始 message，保存提醒时间、重复规则以及 scheduled/sent/cancelled 状态。它不参与树形计算。

#### `inbox_items`：等待确认的数据

当系统无法唯一判断 Goal 或事件类型时，不冒险创建错误数据，而是保存建议内容、原因和待处理状态。

#### `achievements`：短期成果/果实

每个已完成短期 Goal 最多对应一个 Achievement，保存标题、说明、证据链接和达成时间。数据库触发器必须同时检查 Goal 为 `short_term` 且状态已经是 `completed`；长期或未完成 Goal 都不能拥有 Achievement。

### 4. 三条典型写入链路

```text
一次性 Todo：
message → task(goal_id=null) → 完成 task
                              └→ 不创建 activity

目标 Todo：
message → task(goal_id=某 Goal) → 完成 task
                                  └→ activity(goal_id=同一 Goal)

短期目标完成：
goal(status=completed) → achievement(short_goal_id=该 Goal)
```

## 五、全部 API 说明

### 1. API 分组

| 分组 | 用途 | 身份验证 |
|---|---|---|
| Actions API | Custom GPT、自动化或外部客户端读写用户数据 | Bearer Action Token |
| Completion API | 完成 Todo 或 Goal | Bearer Action Token |
| Dashboard API | 网页读取树和详情 | 当前通过 `userId` 查询参数；后续正式多用户上线前应改为登录 Session |
| Demo API | 本地演示自然语言解析 | 当前无鉴权且只写内存；生产环境应关闭 |
| PostgreSQL RPC | HTTP API 内部使用的原子事务 | 仅 service role |

### 2. `GET /api/actions/context`——读取写入上下文

**调用者：** Custom GPT 或外部自动化。

**目的：** 在写入前获取当前时间、已有 Goal、Goal 别名和未完成 Todo，避免重复创建或错误匹配。

**认证：** `Authorization: Bearer los_...`。

**修改背景：** 当前返回 `abilities`；Ability 删除后该字段也删除，Goal 新增 `lifeArea`。

**最终返回示意：**

```json
{
  "user": { "id": "uuid", "actionCredential": "my-gpt" },
  "currentTime": "2026-08-12 10:00:00 Asia/Tokyo",
  "timezone": "Asia/Tokyo",
  "defaultReminderTime": "09:00",
  "goals": [
    {
      "id": "goal-uuid",
      "title": "每周跑步",
      "goalType": "long_term",
      "lifeArea": "health",
      "status": "active"
    }
  ],
  "aliases": [],
  "openTasks": []
}
```

### 3. `POST /api/actions/life-events`——唯一生产写入入口

**调用者：** Custom GPT 或外部自动化。

**目的：** 一次提交 1–20 个有顺序的事件，并在一个数据库事务中全部写入。

**认证：** Bearer Action Token；有速率限制。

**批次字段：**

- `idempotencyKey`：同一输入的稳定唯一键；重复提交返回第一次结果。
- `rawText`：用户完整原文。
- `events`：有顺序的事件数组。

**最终允许的事件：**

| type | 用途 | 是否直接写 lifeArea |
|---|---|---|
| `goal` | 创建长期或短期 Goal | 是，必填 |
| `task` | 创建一次性或目标 Todo | 否，从 Goal 继承 |
| `activity` | 记录已发生的执行 | 否，从 Goal 继承 |
| `inbox` | 保存无法可靠分类的内容 | 否 |

不再允许 `ability`。

**创建长期目标示例：**

```json
{
  "idempotencyKey": "message-20260812-001",
  "rawText": "我要每周跑步三次",
  "events": [
    {
      "type": "goal",
      "confidence": 0.96,
      "goalType": "long_term",
      "title": "每周跑步三次",
      "lifeArea": "health",
      "category": "运动",
      "metricType": "count",
      "aliases": ["跑步"]
    }
  ]
}
```

**创建一次性 Todo 示例：**

```json
{
  "idempotencyKey": "message-20260812-002",
  "rawText": "明天买水",
  "events": [
    {
      "type": "task",
      "confidence": 0.99,
      "path": "one_off",
      "title": "买水",
      "localDate": "2026-08-13",
      "priority": "normal"
    }
  ]
}
```

**重要行为：** 任一事件校验或写入失败，整批回滚；相同 idempotency key 配不同内容返回 409；存储不可用返回 503。

### 4. `POST /api/actions/life-event`——旧单事件入口

**当前：** 会执行多次非事务写入。

**最终：** 退役并固定返回 `410 Gone`：

```json
{
  "error": "single-event endpoint retired",
  "replacement": "/api/actions/life-events"
}
```

### 5. `POST /api/tasks/{id}/complete`——完成 Todo

**调用者：** 有 Action Token 的客户端。

**输入：**

```json
{
  "occurredOn": "2026-08-12",
  "metric": { "type": "duration", "value": 30, "unit": "minute" }
}
```

`metric` 可省略：目标 Todo 优先使用 Task 计划指标，否则默认 count=1。

**数据库行为：**

- 锁定并完成一条 open Task；
- `goal_id=null` 时不创建 Activity；
- 有 Goal 时，在同一事务中创建 Activity；
- 重复完成不会重复创建 Activity。

### 6. `POST /api/goals/{id}/complete`——完成 Goal

**输入：** 可选的 `title`、`note`、`evidenceUrl`。

**数据库行为：**

- 将 Goal 标记 completed 并填写 `completed_at`；
- short_term Goal 创建或更新唯一 Achievement；
- long_term Goal 不创建 Achievement；
- 重复调用保持幂等。

### 7. `GET /api/dashboard?userId={id}`——读取整棵树所需数据

**调用者：** Dashboard 页面。

**返回：** Goals、全部/近期 Activities、最近完成的一次性 Todo、Achievements、热力图和待确认数量。程序树在服务端/前端根据这些事实计算，不从数据库读取树形坐标。

**当前限制：** 该接口通过查询参数决定用户，适合当前 MVP 和 demo-user，但不是最终多用户安全方案。本次程序树计划保持现状；正式开放前应另立安全任务，改为从 Supabase 登录 Session 推导 userId。

### 8. `GET /api/goals/{id}?userId={id}`——读取目标详情

返回单个 Goal、子目标、统计、近期 Activity 和热力图，用于目标详情页。它与 Dashboard API 有同样的 userId 查询参数限制。

### 9. `POST /api/intake`——本地演示解析接口

**当前：** 无 Bearer 鉴权，把自然语言交给 mock/AI parser，并写入进程内存 `lifeOSStore`；不会写 Supabase。

**修改背景：** 它当前仍能产生 Ability 解析结果，与新模型冲突。

**最终处理：** 更新 mock parser，使 Goal 直接带 `lifeArea`；删除 Ability 分支；仅在开发/演示环境启用，生产环境返回 404。它不属于生产数据写入路径。

### 10. 数据库内部 RPC

| RPC | HTTP 调用方 | 作用 | 最终状态 |
|---|---|---|---|
| `record_life_event_batch` | `/api/actions/life-events` | 原子写入 batch/messages/goals/tasks/activities/inbox | 保留并删除 Ability 逻辑 |
| `complete_growth_task` | `/api/tasks/{id}/complete` | 完成 Task，目标 Todo 同时生成 Activity | 保留 |
| `complete_growth_goal` | `/api/goals/{id}/complete` | 完成 Goal，短期 Goal 同时生成果实 | 保留 |
| `apply_growth_model_mapping` | 旧迁移脚本 | 自动映射旧 Ability/Goal 数据 | 删除，不再使用 |

这些 RPC 不直接暴露给浏览器，并只授权给 Supabase `service_role`。

## 六、文件结构

### 新增文件

| 文件 | 单一职责 |
|---|---|
| `supabase/migrations/202608120001_growth_input_constraints.sql` | 对今后的 Activity 和指标单位写入施加强约束 |
| `supabase/migrations/202608120002_fixed_life_area_writes.sql` | 删除 Ability 结构并更新事务 RPC，使所有 Goal 明确写入固定领域 |
| `src/domain/life-areas.ts` | 定义七个固定人生领域、中文标签和固定方位槽位 |
| `src/domain/growth-metrics.ts` | 把 DashboardData 归一化为有界成长指标 |
| `src/domain/tree-recipe.ts` | 把成长指标转换为 EZ-Tree 风格参数，不包含 Three.js |
| `src/domain/semantic-tree-skeleton.ts` | 生成携带业务 ID 的稳定曲线骨架和叶片锚点 |
| `src/components/growth-tree-semantic-geometry.ts` | 把语义骨架转换为 Three.js 几何和材质 |
| `tests/growth-metrics.test.ts` | 指标换算、上限、近期窗口测试 |
| `tests/life-areas.test.ts` | 七个固定领域、排序和输入校验测试 |
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
| `src/domain/types.ts` | 删除 Ability 类型，并为所有 Goal 增加受约束的 lifeArea 类型 |
| `src/domain/life-event-schema.ts` | 删除 Ability 事件，并要求长期/短期 Goal 明确选择人生领域 |
| `src/actions/batch-preparation.ts` | 将 lifeArea 传给事务写入，Task 不参与领域分类 |
| `src/domain/aggregation.ts` | 删除 Ability 聚合，按 Goal.lifeArea 汇总领域数据 |
| `src/db/lifeos-read.ts` | 不再读取 abilities，读取 goals.life_area |
| `src/domain/store.ts`、`src/domain/seed.ts` | 删除内存模型中的 Ability 数据 |
| `app/api/intake/route.ts`、`src/ai/mock-parser.ts` | 让 demo 解析使用 lifeArea，并禁止生产环境调用内存写入接口 |
| `app/api/actions/life-event/route.ts` | 将旧单事件入口收口到事务批处理入口或明确退役 |
| `docs/custom-gpt-actions/openapi.yaml` | 只公开事务性写入端点 |

### 删除文件

| 文件 | 删除原因 |
|---|---|
| `scripts/migrate-growth-model.ts` | 旧脚本围绕 Ability 自动映射；用户已决定手工修改数据 |
| `tests/growth-model-migration.test.ts` | 被删除脚本的测试，不再代表产品需求 |

## 七、逐项实施任务

### Task 1：定义七个固定人生领域并准备数据库过渡字段

**Files:**
- Create: `supabase/migrations/202608120001_growth_input_constraints.sql`
- Create: `src/domain/life-areas.ts`
- Modify: `supabase/schema.sql`
- Modify: `supabase/operations/validate_growth_tree_constraints.sql`
- Test: `supabase/tests/growth_tree_domain.sql`
- Test: `tests/growth-tree-domain-schema.test.ts`
- Test: `tests/life-areas.test.ts`

- [ ] **Step 1：先写会失败的 SQL 契约测试**

在 `tests/life-areas.test.ts` 先锁定七个且仅七个领域及顺序；在 `supabase/tests/growth_tree_domain.sql` 增加事务内测试，分别尝试写入：`value = 0`、`value < 0`、`duration + count`、`count + hour`。Goal 的 life-area 强制测试放在 Task 2，因为 Task 1 只新增可供项目负责人手工填写的过渡列，不能提前中断现有写入。

```ts
expect(LIFE_AREAS.map((area) => area.id)).toEqual([
  "work",
  "growth",
  "health",
  "life",
  "finance",
  "relationships",
  "entertainment"
]);
```

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

Run: `npm test -- tests/life-areas.test.ts && npm run test:db`

Expected: FAIL，因为 life areas 模块尚不存在，或 Activity 非法值尚未被拒绝。

- [ ] **Step 3：定义固定领域枚举**

先建立唯一的应用层枚举；固定数组顺序同时作为渲染方位顺序，Task 不得修改它。

```ts
export const LIFE_AREA_IDS = [
  "work", "growth", "health", "life",
  "finance", "relationships", "entertainment"
] as const;

export type LifeAreaId = (typeof LIFE_AREA_IDS)[number];

export const LIFE_AREAS = [
  { id: "work", label: "工作", slot: 0 },
  { id: "growth", label: "成长", slot: 1 },
  { id: "health", label: "健康", slot: 2 },
  { id: "life", label: "生活", slot: 3 },
  { id: "finance", label: "财务", slot: 4 },
  { id: "relationships", label: "人际关系", slot: 5 },
  { id: "entertainment", label: "娱乐", slot: 6 }
] as const;
```

- [ ] **Step 4：增加过渡字段和成长值约束**

本迁移为 Goal 增加可空 `life_area`，供项目负责人手工填写；此时暂不增加必填约束，否则仍在运行的旧写入入口会立即失败。Activity 和 Task 指标约束使用 `not valid`，可以保护新写入而不扫描旧行。Ability 表和 `ability_id` 在 Task 2 的维护窗口统一删除。

```sql
alter table goals add column if not exists life_area text;

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

- [ ] **Step 5：同步 canonical schema 和手工验证操作**

在 `supabase/schema.sql` 中使用同名有效约束；在验证脚本末尾加入：

```sql
alter table activities validate constraint activities_value_positive_check;
alter table activities validate constraint activities_metric_unit_check;
alter table tasks validate constraint tasks_planned_metric_unit_check;
```

Activity/Task 旧数据手工修正后执行这些验证；Goal 的 `life_area` 验证在 Task 2 切换完成后执行。

- [ ] **Step 6：运行数据库和 schema 契约测试**

Run: `npm run test:db && npm test -- tests/life-areas.test.ts tests/growth-tree-domain-schema.test.ts`

Expected: 全部 PASS。

- [ ] **Step 7：提交固定领域和数据库约束**

```bash
git add supabase/migrations/202608120001_growth_input_constraints.sql supabase/schema.sql supabase/operations/validate_growth_tree_constraints.sql supabase/tests/growth_tree_domain.sql src/domain/life-areas.ts tests/life-areas.test.ts tests/growth-tree-domain-schema.test.ts
git commit -m "feat: define fixed life area branches"
```

### Task 2：删除 Ability 并收口生产写入

**Files:**
- Create: `supabase/migrations/202608120002_fixed_life_area_writes.sql`
- Modify: `app/api/actions/life-event/route.ts`
- Modify: `src/actions/repository.ts`
- Modify: `src/domain/life-event-schema.ts`
- Modify: `src/actions/batch-preparation.ts`
- Modify: `src/actions/batch-resolution.ts`
- Modify: `src/actions/batch-validation.ts`
- Modify: `src/domain/aggregation.ts`
- Modify: `src/db/lifeos-read.ts`
- Modify: `src/domain/store.ts`
- Modify: `src/domain/seed.ts`
- Modify: `app/api/intake/route.ts`
- Modify: `src/ai/mock-parser.ts`
- Modify: `package.json`
- Modify: `supabase/schema.sql`
- Modify: `docs/custom-gpt-actions/openapi.yaml`
- Test: `tests/single-event-repository.test.ts`
- Test: `tests/batch-validation.test.ts`
- Test: `tests/batch-preparation.test.ts`
- Test: `tests/batch-resolution.test.ts`
- Test: `tests/custom-gpt-action-contract.test.ts`
- Test: `tests/action-context.test.ts`
- Test: `tests/aggregation.test.ts`
- Test: `tests/lifeos-read.test.ts`
- Test: `tests/store.test.ts`
- Test: `tests/mock-parser.test.ts`
- Create: `tests/intake-route.test.ts`
- Delete: `scripts/migrate-growth-model.ts`
- Delete: `tests/growth-model-migration.test.ts`

- [ ] **Step 1：写固定领域输入契约测试**

要求：生产输入不再接受 `type: "ability"`；长期和短期 Goal 都必须提交 `lifeArea`；Task 和 Activity 的 strict schema 拒绝 `lifeArea` 字段；metric schema 在 API 层就拒绝错误的类型/单位组合。SQL 测试同时证明缺少或使用非法 `life_area` 的 Goal 无法写入，并证明 active short-term Goal 不能提前拥有 Achievement。

```ts
expect(() => validateLifeEventBatchPayload({
  idempotencyKey: "batch-1",
  rawText: "创建能力",
  events: [{ type: "ability", title: "健身", confidence: 1 }]
})).toThrow();

expect(prepared.events[0]).toMatchObject({
  kind: "goal",
  goalType: "long_term",
  lifeArea: "health"
});
```

- [ ] **Step 2：写旧入口退役契约测试**

旧 `/api/actions/life-event` 不再执行多次 `.from(...).insert(...)`。测试要求它返回 `410 Gone` 并指向 `/api/actions/life-events`。

```ts
expect(response.status).toBe(410);
expect(await response.json()).toEqual({
  error: "single-event endpoint retired",
  replacement: "/api/actions/life-events"
});
```

- [ ] **Step 3：运行测试确认失败**

Run: `npm test -- tests/batch-validation.test.ts tests/batch-preparation.test.ts tests/single-event-repository.test.ts tests/custom-gpt-action-contract.test.ts`

Expected: FAIL，因为输入结构尚未要求固定领域，旧入口也仍执行非事务写入。

- [ ] **Step 4：删除 Ability 类型并更新输入与准备层**

从 `IntentType`、`LifeEventParseResult`、batch validation、prepared event、action context 和 resolution 中删除 Ability。所有 Goal 增加必填 `lifeArea: LifeAreaId`；metric 的 Zod schema同步强制 duration→minute/hour、count/milestone→count。PreparedEvent 直接携带领域：

```ts
type PreparedGoal = {
  kind: "goal";
  goalType: "long_term" | "short_term";
  lifeArea: LifeAreaId;
};
```

`Goal` 领域创建后属于身份的一部分，不能被同名新请求静默改变。Task 和 Activity 类型不包含 `lifeArea`，不会因为用户新增 Task 而改变分类。

- [ ] **Step 5：更新事务 RPC 并删除数据库 Ability 结构**

在项目负责人已手工给现有 Goal 填好 `life_area` 后应用 `202608120002_fixed_life_area_writes.sql`：

```sql
alter table goals add constraint goals_life_area_required_check check (
  life_area is not null
  and life_area in ('work', 'growth', 'health', 'life', 'finance', 'relationships', 'entertainment')
) not valid;

alter table goals drop constraint if exists goals_ability_fk;
alter table goals drop constraint if exists goals_ability_shape_check;
alter table goals drop column if exists ability_id;
drop table if exists abilities;
```

同一迁移重建 `record_life_event_batch`：删除 `ability` event kind；Goal insert 必须写 `life_area`；相同标题但不同 `goal_type` 或 `life_area` 必须报 identity conflict。同步删除 messages/inbox 的 `ability` 允许值和所有 RPC 返回中的 `abilityId`。

同步收紧 `enforce_achievement_short_goal()`：关联 Goal 除了必须为 short_term，还必须 `status = 'completed'` 且 `completed_at is not null`。

同一迁移执行 `drop function if exists apply_growth_model_mapping(jsonb, jsonb);`。历史 migration 文件保留作为数据库变更记录，但可执行映射脚本和 npm 命令删除，防止未来误运行。

迁移结束前执行 `alter table goals validate constraint goals_life_area_required_check;`。如果用户手工填写仍有遗漏，迁移必须失败并回滚，不能删除 Ability 后留下无法归类的 Goal。

- [ ] **Step 6：删除读取与内存模型中的 Ability**

`DashboardData`、`LifeOSState`、seed 和 Supabase read 不再包含 abilities。Goal 类型增加 `lifeArea: LifeAreaId`；数据库 reader 读取 `life_area` 并拒绝非法枚举。`category` 暂时保留为展示元数据，但树投影只能使用 `lifeArea`。

同步更新 mock parser：原来创建 Ability 的规则改为直接创建带 `lifeArea` 的 Goal；`/api/intake` 在 production 返回 404，只保留本地 demo 用途。

- [ ] **Step 7：退役生产入口并保留只读上下文代码**

将 route 改为固定返回 410；从 `repository.ts` 删除 `writeSupabaseLifeEvent`、`materializeSupabaseGoal` 等非事务写入代码。保留 `readActionContext`，因为批处理准备阶段仍需要它。

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

- [ ] **Step 8：从 OpenAPI 移除旧端点、Ability 事件并公开 lifeArea 枚举**

确保 GPT Action 只看见 `/api/actions/life-events`。Goal schema 对长期和短期目标都使用七值 `lifeArea` 枚举；OpenAPI 中不存在 Ability schema；Task 不接受领域分类。该端点通过 `record_life_event_batch` 在一个 PostgreSQL 事务中写入 message、goal、task、activity 和 inbox。

- [ ] **Step 9：运行路由、批处理、读取和数据库测试**

Run: `npm test -- tests/batch-validation.test.ts tests/batch-preparation.test.ts tests/batch-resolution.test.ts tests/action-batch-route.test.ts tests/batch-repository.test.ts tests/custom-gpt-action-contract.test.ts tests/action-context.test.ts tests/aggregation.test.ts tests/lifeos-read.test.ts tests/store.test.ts tests/mock-parser.test.ts tests/intake-route.test.ts && npm run test:db`

Expected: 全部 PASS；代码搜索不再发现生产 route 调用 `writeLifeEventFromAction`。

- [ ] **Step 10：提交固定领域事务写入收口**

```bash
git add supabase/migrations/202608120002_fixed_life_area_writes.sql supabase/schema.sql app/api/actions/life-event/route.ts app/api/intake/route.ts src/actions/repository.ts src/domain/types.ts src/domain/life-event-schema.ts src/actions/batch-preparation.ts src/actions/batch-resolution.ts src/actions/batch-validation.ts src/domain/aggregation.ts src/db/lifeos-read.ts src/domain/store.ts src/domain/seed.ts src/ai/mock-parser.ts package.json docs/custom-gpt-actions/openapi.yaml tests/batch-validation.test.ts tests/batch-preparation.test.ts tests/batch-resolution.test.ts tests/single-event-repository.test.ts tests/custom-gpt-action-contract.test.ts tests/action-context.test.ts tests/aggregation.test.ts tests/lifeos-read.test.ts tests/store.test.ts tests/mock-parser.test.ts tests/intake-route.test.ts
git rm scripts/migrate-growth-model.ts tests/growth-model-migration.test.ts
git commit -m "refactor: replace abilities with fixed life areas"
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
  maturity: number;
  activeDays: number;
  recentPoints: number;
  recentScore: number;
  stage: GrowthStage;
};

export const GROWTH_STAGE_THRESHOLDS = [0, 5, 15, 35, 70, 140] as const;
export const MATURITY_CURVE_K = 35;

export function maturityFromPoints(points: number): number {
  return -Math.expm1(-Math.max(0, points) / MATURITY_CURVE_K);
}
```

`Math.expm1` 在 points 很小时比 `1 - Math.exp(...)` 更稳定。所有输出使用有限数字，`maturity` 和 `recentScore` clamp 到 `[0, 1]`。领域指标等于该领域下所有长期和短期 Goal 的指标之和。即使领域没有任何数据，也必须输出零值指标，保证七根主树杈存在。

- [ ] **Step 4：实现并测试边界条件**

补充空数据、恰好跨阈值、未来日期不计入近期窗口、不同输入顺序输出相同的测试。成长曲线必须满足：

```ts
expect(maturityFromPoints(0)).toBe(0);
expect(maturityFromPoints(5)).toBeCloseTo(0.133, 3);
expect(maturityFromPoints(35)).toBeCloseTo(0.632, 3);
expect(maturityFromPoints(140)).toBeCloseTo(0.982, 3);
expect(maturityFromPoints(5) - maturityFromPoints(0)).toBeGreaterThan(
  maturityFromPoints(75) - maturityFromPoints(70)
);
```

还要循环验证 points 增加时 maturity 永不下降、始终小于等于 1。

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
expect(first.lifeAreas.map((item) => item.entityId)).toEqual(
  LIFE_AREA_IDS
);
```

另外验证新增 Task 不改变任何 life-area recipe；新增 Goal 只增加所属领域的目标枝参数，不改变七根主树杈的 `azimuth`。

- [ ] **Step 2：运行测试确认失败**

Run: `npm test -- tests/tree-recipe.test.ts`

Expected: FAIL，模块不存在。

- [ ] **Step 3：定义参数类型**

```ts
export type BranchRecipe = {
  entityType: "life_area" | "long_goal" | "short_goal";
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
  lifeAreas: BranchRecipe[];
  longGoals: BranchRecipe[];
  shortGoals: BranchRecipe[];
  canopy: { retention: number; saturation: number; youngLeafRatio: number };
};
```

- [ ] **Step 4：实现稳定参数映射**

采用以下范围，而不是让数据无限放大：

```ts
const lockedMaturity = maturityFromPoints(GROWTH_STAGE_THRESHOLDS[stage]);
trunk.height = lerp(2.8, 5.2, lockedMaturity);
trunk.radius = lerp(0.28, 0.62, lockedMaturity);
branch.length = lerp(0.8, 2.6, lockedMaturity);
branch.radius = lerp(0.07, 0.28, lockedMaturity);
canopy.retention = lerp(0.45, 1, recentScore);
```

使用阶段阈值对应的 `lockedMaturity`，而不是当前连续 maturity，确保未跨阶段的单次 Activity 只改变嫩叶和近期状态，不会让永久骨架每次发生微小位移。

七根主树杈的方向由 `LIFE_AREAS[].slot` 和预设方位表决定；Goal 子枝方向由 `seedFromId(entityId, "branch-azimuth")` 决定，不能根据数据库返回顺序决定。

第一版固定方位如下，角度围绕树干 Y 轴，`start` 是主树杈连接树干的高度比例。固定参数的目的是让七根枝互不重叠并形成前后层次；数据只能改变长度、粗细、弯曲和叶量。

| 领域 | azimuth | start |
|---|---:|---:|
| 工作 | -70° | 0.38 |
| 成长 | -20° | 0.50 |
| 健康 | 30° | 0.62 |
| 生活 | 80° | 0.74 |
| 财务 | 135° | 0.42 |
| 人际关系 | 195° | 0.56 |
| 娱乐 | 255° | 0.68 |

测试必须锁定这张表，后续视觉调整只能通过显式设计变更修改，不能因为增加 Task 或 Goal 自动变化。

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

生成基础骨架，再增加一个新 Activity、一个新 Task 和一个新 Goal：

```ts
expect(existingBranch(afterActivity)).toEqual(existingBranch(before));
expect(lifeAreaBranches(afterTask)).toEqual(lifeAreaBranches(before));
expect(lifeAreaBranches(afterGoal)).toEqual(lifeAreaBranches(before));
expect(afterGoal.branches).toContainEqual(
  expect.objectContaining({ entityId: "new-goal", parentEntityId: "health" })
);
```

- [ ] **Step 2：运行测试确认失败**

Run: `npm test -- tests/semantic-tree-skeleton.test.ts`

Expected: FAIL，模块不存在。

- [ ] **Step 3：定义骨架契约**

```ts
export type SemanticBranch = {
  entityType: "root" | "life_area" | "long_goal" | "short_goal";
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

根从原点向上。七根 life area 主树杈从主干的预设高度和方位出发；long goal 与 short goal 都从所属 life area 曲线上的稳定比例出发。Goal 控制点加入由实体 seed 决定的小幅弯曲，但终点始终向上，避免枝干倒插地面。

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
expect(model.branches.filter((b) => b.entityType === "life_area")).toHaveLength(7);
expect(model.branches.find((b) => b.entityId === "long-active")?.parentEntityId)
  .toBe("growth");
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
expect(mesh.userData.entityType).toBe("life_area");
expect(mesh.userData.entityId).toBe("health");
expect(layer.entityByUuid.get(mesh.uuid)?.entityId).toBe("health");
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

覆盖：空用户也显示七根固定领域主树杈；选择领域打开领域汇总；选择长期/短期 Goal 打开正确详情；选择 Activity 叶显示关联 Goal；果实面板仍只展示短期成果；未完成 Todo 不成为树对象。

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
- 七个领域、Goal 和 Activity 点击对象正确；
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

## 八、发布顺序

发布必须拆成两次，避免数据库和前端同时变化导致定位困难。

### 发布 A：数据约束与写入入口

1. 应用 `202608120001_growth_input_constraints.sql`，只新增可空 `goals.life_area`，不影响旧写入。
2. 项目负责人手工给每个现有 Goal 填入七个允许值之一的 `life_area`。
3. 准备好删除 Ability 的新版应用和 `202608120002_fixed_life_area_writes.sql`。
4. 进入短维护窗口，暂停 Action 写入。
5. 执行第二个迁移；它先验证所有 Goal 已有合法领域，再删除 `goals.ability_id`、`abilities` 和 Ability 事件/RPC 逻辑。验证失败则整笔回滚。
6. 立即部署只公开批量事务端点的新版应用，然后恢复写入。
7. 用真实用户创建一次性 Todo、长期目标 Todo、短期目标和 Activity，确认 Task 不负责领域分类。
8. 执行剩余 Activity/Task 约束的 `validate_growth_tree_constraints.sql`。

### 发布 B：程序树渲染

1. 先部署 metrics、recipe 和 skeleton 纯函数，不改变页面输出。
2. 在本地/预览环境切换到新 Three.js layer。
3. 完成桌面和移动端视觉验收。
4. 再部署生产前端。
5. 出现渲染问题时可回退前端提交，数据库事实和写入约束不需要回退。

## 九、风险与管理决策

| 风险 | 表现 | 控制办法 |
|---|---|---|
| 树形每次变化 | 新数据让旧枝换方向 | 所有方向只由 userId/entityId 稳定 seed 决定 |
| 数据量大导致卡顿 | 叶片和 Mesh 数过多 | 装饰叶 InstancedMesh、数量上限、几何分段预算 |
| 新旧写入不一致 | 某入口留下 message 却没留下 task | 退役非事务单事件入口，只保留 batch RPC |
| 不同指标不可比 | 1 小时和 1 次被简单相加 | 在 GrowthMetrics 层集中换算并设置单次上限 |
| 前期反馈太弱或后期失控 | 新用户看不到变化，或成熟树无限增大 | 使用 `1-e^(-points/35)` 负指数饱和曲线，并把永久几何锁定在阶段快照 |
| 低活跃惩罚感过强 | 用户回来看到秃树 | 永久骨架不退化，叶片最低保留 45% |
| 树好看但不可解释 | 用户不知道哪根枝是什么 | 每根语义枝保留实体 ID，点击打开现有详情 |
| 旧数据阻塞上线 | 新 CHECK 扫描历史数据失败 | 迁移使用 NOT VALID，用户清理后再 validate |
| 删除 Ability 遗漏依赖 | 构建或 RPC 仍读取 abilities/ability_id | 删除前用全仓 `rg` 清单审计，类型、SQL、OpenAPI 和测试同一任务收口 |

## 十、工作量与检查点

以一名熟悉 TypeScript/Three.js 的工程师为基准，建议安排 **9–13 个专注工程日**，不包含项目负责人手工修改生产数据的时间：

- 固定领域、Ability 删除、数据约束与写入收口：2–3 日；
- GrowthMetrics、TreeRecipe、语义骨架：3–4 日；
- Three.js 曲线几何、树冠与交互：3–4 日；
- 全量测试、移动端调优和发布：1–2 日。

管理检查点：

1. **检查点 1：写入可信**——非法数据测试全部通过后才进入树形开发。
2. **检查点 2：纯函数可信**——用 JSON 快照审查 recipe/skeleton，不先看漂亮画面。
3. **检查点 3：视觉可信**——确认 0、5、15、35、70、140 点六个阶段的变化前期明显、后期收敛，并检查低、中、高数据量的树形差异。
4. **检查点 4：交互可信**——逐个点击七个领域、long goal、short goal、Activity 和果实。
5. **检查点 5：发布可信**——数据库与前端分两次发布，每次均可独立回退。

## 十一、执行纪律

- 每个任务先写失败测试，再写最小实现。
- 每个任务完成后单独提交，不把十个任务压成一个大提交。
- 不在本计划中顺手重构无关代码。
- 不读取或输出 `.env.local`。
- 不运行历史映射脚本，不自动修改生产数据。
- 未通过对应检查点，不进入下一阶段。
