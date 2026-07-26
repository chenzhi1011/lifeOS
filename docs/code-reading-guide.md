# Code Reading Guide

这份文档用于理解 Life OS MVP 的项目结构、前后端入口、权限认证，以及推荐的代码阅读顺序。

建议按“产品数据流”阅读，不要按文件夹从上到下阅读。

## Project Structure

项目目录：

```text
/Users/chinshi/Desktop/life-os-mvp
```

核心分层：

```text
app/                  Next.js 路由层，前端页面和后端 API 都在这里
src/domain/           业务核心：Goal、Task、Activity、聚合逻辑、内存 store
src/ai/               自然语言解析层：mock parser、本地 LLM provider
src/actions/          Custom GPT Actions 的认证、校验、写入逻辑
src/db/               Supabase 连接和 Dashboard 读取逻辑
supabase/schema.sql   数据库表结构、索引、RLS
```

这个项目的主线是：

```text
聊天输入
  -> AI 解析
  -> 结构化写入
  -> Activity 长期累计
  -> Dashboard 读取聚合数据
  -> 3D 成长树展示
```

## Frontend Entry Points

主要前端页面有三个。

### Root

```text
app/page.tsx
```

根路径入口。当前只负责把 `/` 重定向到 `/dashboard`。

### Dashboard

```text
app/dashboard/page.tsx
```

Dashboard 首页。

行为：

- 如果 URL 没有 `userId`，显示一个输入 userId 的页面
- 如果 URL 有合法 `userId`，读取该用户的聚合数据
- 数据读取完成后，渲染 3D 成长树

3D 树组件：

```text
src/components/RealisticGrowthTree.tsx
```

这里负责 Three.js 场景初始化、真实树模型加载、草坪和阳光渲染、数据果实/花朵渲染、拖拽旋转、滚轮缩放、点击数据点展示局部数据。

### Local Mock Input

```text
app/mock/page.tsx
```

本地 mock 聊天入口。

它模拟未来的微信、自有 App、Telegram 或其他输入入口。用户在这里输入自然语言后，页面调用：

```text
POST /api/intake
```

Dashboard 和 mock 输入是分离的。Dashboard 只展示成长，不承担聊天输入。

## Backend API Entry Points

Next.js App Router 中，`app/api/**/route.ts` 就是后端 API。

### Local Intake API

```text
app/api/intake/route.ts
```

本地 mock 页面调用这个接口。

请求示例：

```json
{
  "userId": "demo-user",
  "source": "mock",
  "text": "今天学习 AWS 40 分钟"
}
```

职责：

- 接收本地 mock 输入
- 调用 AI provider 或规则解析器
- 标准化解析结果
- 写入内存 store 或 Supabase

### Dashboard Read API

```text
app/api/dashboard/route.ts
```

读取 Dashboard 聚合数据。

调用格式：

```text
GET /api/dashboard?userId=...
```

### Goal Detail Read API

```text
app/api/goals/[id]/route.ts
```

读取单个目标详情。

调用格式：

```text
GET /api/goals/[id]?userId=...
```

### Custom GPT Actions API

```text
app/api/actions/context/route.ts
app/api/actions/life-event/route.ts
```

这两个接口给 Custom GPT Action 调用，不是普通前端页面调用。

- `GET /api/actions/context`：让 GPT 获取当前用户已有目标上下文
- `POST /api/actions/life-event`：让 GPT 写入结构化 Life Event

## Domain Layer

业务核心从这里开始看：

```text
src/domain/types.ts
```

这里定义核心数据模型：

- `Goal`
- `Task`
- `Activity`
- `Reminder`
- `InboxItem`
- `Achievement`
- `LifeEventParseResult`

其中最重要的是 `Activity`。

这个产品不是“任务完成后删除”，而是把用户每天的投入沉淀为 Activity。任务可以驱动行动，但最终用于长期展示和累计的是 Activity。

继续看：

```text
src/domain/store.ts
```

这里是写入逻辑。它决定解析结果如何变成业务数据：

- 创建或关联 Goal
- 创建 Task
- 记录 Activity
- 创建 Reminder
- 低置信度内容进入 Inbox

再看：

```text
src/domain/aggregation.ts
```

这里是 Dashboard 和 Goal Detail 的聚合逻辑。

它负责计算：

- 累计值
- 活动次数
- 活跃天数
- 连续投入周数
- heatmap
- timeline
- goal stats

最后看：

```text
src/domain/tree-visualization.ts
```

这里把业务聚合数据转换成 3D 树需要的场景模型：

- 节点
- 分支
- 节点大小
- 节点亮度
- 最近活动
- 目标层级关系

## AI Parsing Layer

AI 解析部分建议按这个顺序看。

### Provider Boundary

```text
src/ai/providers.ts
```

这里决定使用哪个解析 provider。

当前支持：

- 内置规则解析器
- OpenAI 兼容的本地 LLM 接口

本地 LLM 请求失败、返回非成功状态、或者输出无法解析时，会回退到规则解析器。

### Rule Parser

```text
src/ai/mock-parser.ts
```

这是本地规则解析器，用于 MVP 阶段无外部模型时测试链路。

例如输入：

```text
今天学习 AWS 40 分钟
```

会解析成：

```json
{
  "type": "activity",
  "confidence": 0.86,
  "goal": {
    "title": "AWS",
    "category": "职业",
    "metricType": "duration"
  },
  "summary": "学习 AWS",
  "metric": {
    "type": "duration",
    "value": 40,
    "unit": "minute"
  }
}
```

### Normalization

```text
src/ai/normalize.ts
```

这里负责解析结果标准化和置信度处理。

如果分类置信度低，内容会进入 Inbox，等待用户后续确认。

## Database Layer

数据库 schema：

```text
supabase/schema.sql
```

重点表：

```text
profiles
messages
goals
goal_aliases
tasks
activities
reminders
inbox_items
achievements
action_credentials
```

关键关系：

- 每张业务表直接包含 `user_id`
- `messages` 保存原始输入和解析结果
- `goals` 保存目标树
- `tasks` 保存待完成动作
- `activities` 保存真正的长期积累记录
- `reminders` 保存提醒
- `inbox_items` 保存低置信度待确认项
- `achievements` 保存成就
- `action_credentials` 保存 Custom GPT token hash 到 userId 的映射

Supabase client：

```text
src/db/supabase.ts
```

Dashboard 读取：

```text
src/db/lifeos-read.ts
```

如果配置了 Supabase，Dashboard 从 Supabase 读取。否则回退到本地内存 store。

## Permission And Authentication

当前项目有两套权限边界：写入侧和读取侧。

### Write Side: Custom GPT Actions

写入权限主要在：

```text
src/actions/auth.ts
```

流程：

```text
Custom GPT 请求
  -> Authorization: Bearer los_xxx
  -> 后端提取 token
  -> SHA-256 hash
  -> 查询 action_credentials.token_hash
  -> 找到对应 user_id
  -> 后端用这个 user_id 写入数据
```

重点：

- GPT 不能自己传 `userId`
- 即使请求体里带了 `userId`，也会被拒绝
- 后端不保存原始 token，只保存 token hash
- 每个朋友应该有单独 token
- 撤销朋友权限时，把对应 `action_credentials.status` 改成 `revoked`

请求体校验：

```text
src/actions/validation.ts
```

这里用 Zod 限制字段、类型、metric 值、日期、confidence 等。

限流：

```text
src/actions/rate-limit.ts
```

对 token hash 和 IP 做基础内存限流。

请求处理：

```text
src/actions/request.ts
```

这里组合认证、限流、错误处理。

实际写入：

```text
src/actions/repository.ts
```

这里把 GPT 传来的结构化 Life Event 写入 Supabase 或本地 fallback。

### Read Side: Dashboard

读取侧当前在：

```text
src/dashboard/user-id.ts
```

它只做 userId 格式校验。

Dashboard 页面：

```text
app/dashboard/page.tsx
```

读取方式：

```text
/dashboard
```

打开 userId 输入页。

```text
/dashboard?userId=demo-user
```

查看本地 demo 数据。

```text
/dashboard?userId=SUPABASE_AUTH_UUID
```

查看某个 Supabase 用户的数据。

注意：这不是严格隐私认证。当前设计适合 MVP 和小范围朋友试用。知道 userId 的人可以查看对应 Dashboard。

后续如果要做公开/私密分享，应增加：

- Supabase Auth 登录态
- 或 `dashboard_share_tokens`
- 或按 Goal/Activity 级别做 visibility

## Recommended Reading Order

建议按下面顺序读代码：

```text
1. README.md
2. src/domain/types.ts
3. supabase/schema.sql
4. app/mock/page.tsx
5. app/api/intake/route.ts
6. src/ai/providers.ts
7. src/ai/mock-parser.ts
8. src/domain/store.ts
9. src/domain/aggregation.ts
10. src/domain/tree-visualization.ts
11. app/dashboard/page.tsx
12. src/components/RealisticGrowthTree.tsx
13. app/api/actions/life-event/route.ts
14. src/actions/request.ts
15. src/actions/auth.ts
16. src/actions/validation.ts
17. src/actions/repository.ts
18. src/db/lifeos-read.ts
```

这条主线最重要：

```text
/mock 输入一句话
  -> /api/intake
  -> AI 解析
  -> store/Supabase 写入
  -> /dashboard?userId=...
  -> aggregation
  -> 3D tree
```

理解这条链路后，再看 Custom GPT Actions：

```text
Custom GPT
  -> /api/actions/life-event
  -> action token 认证
  -> userId 映射
  -> Supabase 写入
  -> Dashboard 读取展示
```
