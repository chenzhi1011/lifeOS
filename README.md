# Life OS MVP

Life OS 是一个 AI 驱动的个人成长积累系统。用户不整理任务列表，只通过聊天入口发送自然语言；系统把零散输入解析成结构化数据，并在独立 Dashboard 中展示长期积累。

这个项目当前是 MVP 原型：

- 输入入口：本地 `/mock` 页面，后续可替换为微信、自有 App、Telegram 或 Custom GPT Actions
- AI 层：默认规则解析器，也支持 OpenAI 兼容的本地 LLM
- 数据层：未配置 Supabase 时使用内存数据；配置 Supabase 后读写 PostgreSQL
- 展示层：`/dashboard` 是独立 3D 成长树页面，不承担聊天输入

## Core Idea

这不是 Todo App。核心对象不是待办事项，而是 `Activity`。

```text
一句自然语言输入
  -> AI 识别意图
  -> 写入 Goal / Task / Activity / Reminder / Inbox
  -> Activity 长期累计
  -> Dashboard 渲染成长树
```

任务可以被完成，但真正沉淀下来的是活动记录。例如：

```text
今天学习 AWS 40 分钟
```

会变成：

```json
{
  "type": "activity",
  "goal": "AWS",
  "category": "职业",
  "summary": "学习 AWS",
  "metric": {
    "type": "duration",
    "value": 40,
    "unit": "minute"
  }
}
```

## Features

- 真实 3D 成长树：阳光、草坪、树模型、果实和花朵由目标与活动累计驱动
- 自然语言输入：识别 `goal`、`task`、`activity`、`reminder`、`inbox`
- 本地 mock 输入：测试阶段模拟微信或 App 的聊天入口
- Custom GPT Actions：让自己的 GPT 调用 Vercel API 写入数据库
- Supabase 多用户数据结构：每张业务表直接包含 `user_id`
- Dashboard userId 输入：朋友打开 `/dashboard` 后输入自己的 userId 查看
- 目标详情页：展示累计值、活动次数、活跃天数、连续周数、热力图和时间线
- 安全边界：GPT 写入接口使用 Bearer token，后端从 token 映射 userId，拒绝请求体自带 userId

## Tech Stack

- Next.js 15 App Router
- React 19
- TypeScript
- Tailwind CSS
- Three.js
- Zod
- Vitest
- Playwright
- Supabase PostgreSQL
- Vercel

## Local Development

### Requirements

- Node.js 20+
- npm

### Install And Run

```bash
npm install
npm run dev
```

Open:

- `http://localhost:3000/dashboard`：输入 userId 后查看 Dashboard
- `http://localhost:3000/dashboard?userId=demo-user`：直接查看本地 demo 数据
- `http://localhost:3000/mock`：本地 mock 聊天输入

### Useful Commands

```bash
npm test
npm run typecheck
npm run build
npm run dev
```

3D Dashboard 验证：

```bash
LIFE_OS_DASHBOARD_URL="http://localhost:3000/dashboard?userId=demo-user" \
node scripts/verify-3d-dashboard.mjs
```

截图会写入 `test-results/`。

## Environment Variables

本地默认不需要环境变量。没有 Supabase 时，系统使用内存数据和 demo seed。

连接 Supabase/Vercel 时需要：

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

本地测试 Custom GPT Action token 时可选：

```env
ACTION_CREDENTIALS_JSON=[]
```

Dashboard 不使用固定环境变量指定用户。访问 `/dashboard` 时输入 userId，或使用 `/dashboard?userId=...`。

## Main Routes

| Route | Purpose |
| --- | --- |
| `/dashboard` | 输入 userId 后查看 3D 成长树 |
| `/dashboard?userId=demo-user` | 本地 demo Dashboard |
| `/mock` | 本地 mock 聊天入口 |
| `/goals/[id]?userId=...` | 单个目标详情 |
| `POST /api/intake` | 本地 mock 输入写入 |
| `GET /api/dashboard?userId=...` | Dashboard 聚合数据 |
| `GET /api/goals/[id]?userId=...` | 目标详情聚合数据 |
| `GET /api/actions/context` | Custom GPT 获取用户上下文 |
| `POST /api/actions/life-event` | Custom GPT 写入结构化 Life Event |

## Data Flow

### Local Mock

```text
/mock
  -> POST /api/intake
  -> AI provider or rule parser
  -> memory store or Supabase
  -> /dashboard?userId=demo-user
```

Example:

```json
{
  "userId": "demo-user",
  "source": "mock",
  "text": "今天学习 AWS 40 分钟"
}
```

### Custom GPT

```text
Custom GPT
  -> Bearer action token
  -> Vercel /api/actions/context
  -> Vercel /api/actions/life-event
  -> Supabase
  -> /dashboard?userId=...
```

GPT 请求体不发送 `userId`。后端根据 Bearer token 查询 `action_credentials`，得到对应用户。

更多配置见：

```text
docs/custom-gpt-actions/setup.md
docs/custom-gpt-actions/openapi.yaml
docs/custom-gpt-actions/instructions.md
```

代码阅读指南见：

```text
docs/code-reading-guide.md
```

## Supabase Setup

1. 创建 Supabase project
2. 在 SQL Editor 执行：

```text
supabase/schema.sql
```

3. 创建 Supabase Auth 用户，复制该用户的 UUID
4. 生成 Custom GPT token：

```bash
node scripts/generate-action-token.mjs zhi-custom-gpt YOUR_SUPABASE_AUTH_USER_ID
```

5. 把脚本输出的 `tokenHash` 写入 `action_credentials`
6. 把脚本输出的原始 `token` 填入 Custom GPT Action 的 Bearer API Key

### Existing data growth-model migration

已有数据不能根据标题自动猜测长期/短期分类。先在仓库外准备固定格式的 mapping JSON；该文件可能包含用户和业务记录 ID，**不要提交到 Git**。

先运行只读 dry-run。输出中的 before/after counts 只覆盖脚本实际读取的 `profiles/goals/tasks/activities/achievements` 五张表；Ability 不做额外读取或数量推测，需要创建、复用或重新激活的意图统一以 `upsert_ability` 操作列出。

```bash
npm run migrate:growth-model -- --mapping /absolute/path/mapping.json
```

逐项核对输出里的 user、before/after 数量和每一条 Goal、Task、Activity、Achievement 操作。dry-run 输出本身包含业务 ID 和 Ability title，必须只在仓库外的受限位置保存，**不得提交或分享**。只有用户再次明确批准这份具体 mapping 后，才可以运行写入：

```bash
npm run migrate:growth-model -- --mapping /absolute/path/mapping.json --apply
```

`--apply` 会把 dry-run 快照和 mapping 一次交给仅 `service_role` 可执行的事务 RPC；只要期间 ID 或数量变化，整批就会回滚。写入后保存返回结果并重新核对数据库计数。确认映射正确后，再单独执行：

```text
supabase/operations/validate_growth_tree_constraints.sql
```

约束验证不包含在普通 migration 中，也不能在人工 mapping 确认前执行。

## Vercel Deploy

推荐流程：

1. Commit 当前项目
2. Push 到 GitHub
3. 在 Vercel 导入 GitHub repo
4. 配置环境变量：

```env
NEXT_PUBLIC_SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
```

5. Deploy
6. 把 Custom GPT Action OpenAPI 里的 server URL 改成 Vercel 域名

## Project Structure

```text
life-os-mvp/
├── app/
│   ├── api/
│   │   ├── actions/                 # Custom GPT Actions API
│   │   ├── dashboard/route.ts       # Dashboard 聚合 API
│   │   ├── goals/[id]/route.ts      # Goal detail API
│   │   └── intake/route.ts          # 本地 mock intake API
│   ├── dashboard/page.tsx           # 3D Dashboard
│   ├── goals/[id]/page.tsx          # Goal detail page
│   ├── mock/page.tsx                # 本地 mock 输入页
│   └── page.tsx                     # 根路径跳转
├── src/
│   ├── actions/                     # GPT Action 认证、限流、校验、写入
│   ├── ai/                          # AI provider 和规则解析
│   ├── components/                  # 3D 树、热力图、时间线等组件
│   ├── dashboard/                   # Dashboard userId 校验
│   ├── db/                          # Supabase client 和读取逻辑
│   └── domain/                      # 核心领域模型、聚合、store
├── docs/custom-gpt-actions/         # GPT Actions 配置文档
├── scripts/                         # token 生成和 3D 验证脚本
├── supabase/schema.sql              # 数据库 schema、索引和 RLS
└── tests/                           # Vitest tests
```

## Current Security Model

写入侧：

- Custom GPT Actions 必须带 `Authorization: Bearer los_...`
- 后端只保存 token hash，不保存原始 token
- 后端从 token 推导 userId
- 请求体里的 `userId` 会被拒绝
- 有基础 rate limit 和 Zod schema 校验

读取侧：

- Dashboard 当前通过输入或 URL query 的 `userId` 读取数据
- 这适合 MVP 和小范围朋友试用
- 这不是隐私访问控制；知道 userId 的人可以查看对应 Dashboard

后续如果要做公开/私密分享，应增加 `dashboard_share_tokens` 或 Supabase Auth 登录态，而不是直接暴露 raw userId。

## Current Limitations

- 微信、Telegram、日历同步和推送提醒尚未实现
- 规则解析器只覆盖常见中文测试样例
- 3D 树目前是程序化几何生成，还不是游戏级树模型资产
- Dashboard 读取权限还没有做私密分享控制
- Achievement 自动生成规则还需要后续补充
