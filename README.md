# Life OS MVP

Life OS 把用户的 Todo、长期积累和短期成果转换成一棵可解释的 3D 成长树。

## 这个仓库怎么读

先分清三层：

1. 前端展示层：`app/` 和 `src/components/`
2. 业务与数据层：`src/domain/`、`src/application/`、`src/actions/`、`src/db/`
3. 数据底座：`supabase/`

如果你的目标是“看树长什么样”，优先读树渲染链路；如果你的目标是“看数据怎么进来”，优先读 API 和 domain 层。

## 当前业务模型

七个固定生活领域对应七根一级主树杈：工作、成长、健康、生活、财务、人际关系、娱乐。

- 一次性 Todo（买水、打扫）：不归入 Goal、不显示为树枝；完成后可增加近期水滴、小生物或花草。
- 长期 Goal（健身、弹琴、积累知识）：在所属领域主枝上生成长期目标枝，Activity 形成成长和叶片。
- 短期 Goal（考试、找工作）：在所属领域主枝上生成短期目标枝，完成后成为 Achievement，在果实面板查看。
- 未完成 Task 与 Reminder：保存在数据库并通过独立 API 查询，但不会改变树。

树的成熟度使用前快后慢的指数曲线。前期少量投入能明显成长，成熟后逐渐收敛，永久骨架不会因近期低活跃退化。

## 技术结构

```text
Session 前端 / AI Action
  → 统一应用服务
  → Zod 输入契约与目标解析
  → PostgreSQL 事务 RPC
  → Goal / Task / Activity / Reminder / Achievement
  → Dashboard 聚合
  → GrowthMetrics
  → TreeRecipe
  → Semantic Skeleton
  → Three.js TubeGeometry 场景
```

主要技术：Next.js 15、React 19、TypeScript、Three.js、Zod、Supabase PostgreSQL、Vitest。

## 前后端分工

前端负责：

- 登录后展示自己的 Dashboard
- 渲染 3D 树、果实面板、详情面板
- 通过 `/api/dashboard`、`/api/tasks`、`/api/reminders` 读取数据
- 通过 `/api/life-events` 写入网页端事件

后端负责：

- 身份识别：Supabase Session 或 Action Token
- 输入校验：Zod schema
- 业务规则：Goal、Task、Activity、Reminder 的一致性
- 数据聚合：把数据库记录转成树可以消费的 view model
- 最终约束：`supabase/schema.sql` 里的表约束和 RPC

## 本地运行

```bash
npm install
npm run dev
```

开发环境可打开：

- `http://localhost:3000/dashboard?userId=demo-user`：本地 demo 成长树
- `http://localhost:3000/mock`：本地 mock 输入

生产环境不接受 query/body 提供的 `userId`，身份必须来自验证过的 Supabase Session 或 Action Token。

## 页面路由和 API 路由

这个项目里 `/dashboard`、`/goals/[id]` 这类路径是页面路由，不是 API。

- 页面路由负责给浏览器直接打开的界面：`app/dashboard/page.tsx`、`app/goals/[id]/page.tsx`
- API 路由负责给页面和 Action 读写数据：`app/api/dashboard/route.ts`、`app/api/goals/[id]/route.ts`

因此：

- `/dashboard` 是网页页面，页面本身会去请求 `/api/dashboard`
- `/goals/[id]` 是网页页面，通常配合 `/api/goals/[id]` 获取或更新目标数据
- 真正带 `/api/` 前缀的，才是接口

## API

当前共有 10 个 API 路由。

| 方法与路径 | 用途 | 身份 |
| --- | --- | --- |
| `POST /api/life-events` | 网页批量写入 Life Event | Supabase Session |
| `POST /api/actions/life-events` | AI/自动化批量写入 | Action Token |
| `GET /api/actions/context` | AI 获取已有 Goal、别名和 open Task | Action Token |
| `GET /api/tasks` | 查询 Todo，默认 open | Supabase Session |
| `GET /api/reminders` | 查询 Reminder，默认 scheduled | Supabase Session |
| `POST /api/tasks/[id]/complete` | 完成 Task | Session 或 Action Token |
| `POST /api/goals/[id]/complete` | 完成 Goal/生成短期成果 | Session 或 Action Token |
| `GET /api/dashboard` | Dashboard 数据 | Supabase Session |
| `GET /api/goals/[id]` | Goal 详情 | Supabase Session |
| `POST /api/intake` | 仅开发环境 mock 输入 | 本地 demo |

旧的 `POST /api/actions/life-event` 已删除并返回普通 404。

## 数据库

最终结构以 [supabase/schema.sql](supabase/schema.sql) 为准。项目采用空库重建方式，不执行旧数据迁移；Ability 表与 `ability_id` 已删除，`goals.life_area` 创建时必填。

远程数据库重建会删除现有业务数据，必须在展示项目标识和表清单后另行明确批准。普通测试不会操作远程数据库。

## 验证

```bash
npm test
npm run typecheck
npm run build
npm run test:db
```

`test:db` 使用本地临时 PostgreSQL 验证最终 schema、约束和事务 RPC。

## 树渲染文件结构

树的渲染链路是下面这条：

```text
app/dashboard/page.tsx
→ src/components/GrowthTreeDashboard.tsx
→ src/components/GrowthTreeScene.tsx
→ src/components/RealisticGrowthTree.tsx
→ src/components/growth-tree/GrowthEnvironment.ts
→ src/components/growth-tree/VitalityElements.ts
→ src/components/growth-tree-semantic-geometry.ts
→ src/components/growth-tree-geometry.ts
→ src/domain/tree-visualization.ts
→ src/domain/tree-recipe.ts
→ src/domain/semantic-tree-skeleton.ts
```

职责大致是：

- `app/dashboard/page.tsx`：拿 session，拉 dashboard 数据
- `GrowthTreeDashboard.tsx`：页面壳、果实面板、详情面板、选择态
- `GrowthTreeScene.tsx`：Three.js 场景、相机、光照、点击交互
- `RealisticGrowthTree.tsx`：树干、树枝、叶子、装饰元素的组装
- `growth-tree/*`：环境、生命力粒子、场景参数
- `tree-visualization.ts`：把业务数据转换成树可画的结构
- `tree-recipe.ts`：决定树的骨架、层级、粗细、长度、成熟度
- `semantic-tree-skeleton.ts`：把 recipe 变成可渲染的几何骨架

## 推荐阅读顺序

```text
src/domain/aggregation.ts
→ src/domain/growth-metrics.ts
→ src/domain/tree-recipe.ts
→ src/domain/semantic-tree-skeleton.ts
→ src/domain/tree-visualization.ts
→ src/theme/healing-palette.ts
→ src/components/RealisticGrowthTree.tsx
→ src/components/GrowthTreeScene.tsx
```

详细说明见 [docs/code-reading-guide.md](docs/code-reading-guide.md)。Custom GPT 配置见 `docs/custom-gpt-actions/`。
