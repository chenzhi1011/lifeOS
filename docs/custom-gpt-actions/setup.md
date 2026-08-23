# Custom GPT Actions Setup

## 使用范围

这套 Custom GPT Action 只用于项目负责人个人使用和开发测试。它不是正式的多用户登录方案，不应把配置了个人 Token 的 GPT 分享给其他人。

```text
个人 Custom GPT
  → 固定 Bearer Token（los_...）
  → action_credentials.token_hash
  → 唯一 user_id
  → Life OS 应用服务与 Supabase
```

Custom GPT 不使用 Supabase Session，也不发送 `userId`。浏览器登录和 AI Action 是两种独立认证适配器，最终都转换为服务端可信的 userId。

## 部署环境

Vercel 至少需要：

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

`SUPABASE_SERVICE_ROLE_KEY` 只能保存在服务端环境变量中，绝不能放入 Custom GPT、OpenAPI 文件或公开仓库。

本地无 Supabase 时可以使用 `ACTION_CREDENTIALS_JSON` 做临时测试，但生产部署应使用数据库中的 `action_credentials`。

## 创建并绑定个人用户

完整步骤见根目录 [Add-user-readme.md](../../Add-user-readme.md)，包括：

1. 创建 Supabase Auth 用户。
2. 创建对应的 `profiles`。
3. 生成 Action Token。
4. 把 Token hash 绑定到该用户。
5. 验证 context 接口。

## 在 GPT Builder 中配置

1. 创建或打开一个仅自己可见的 GPT。
2. 把 [instructions.md](instructions.md) 的内容复制到 GPT Instructions。
3. 添加一个 Action。
4. 复制 [openapi.yaml](openapi.yaml)，把 `https://YOUR_DOMAIN` 替换成实际 Vercel 域名，例如 `https://life-os.example.com`。
5. 设置 Authentication：
   - Authentication Type：API Key
   - Auth Type：Bearer
   - API Key：绑定用户时生成的明文 `los_...` Token
6. 保存后保持 GPT 为 Only me，不要公开或通过链接分享。

当前 OpenAPI 暴露 4 个操作：

| operationId | HTTP 接口 | 用途 |
| --- | --- | --- |
| `getLifeContext` | `GET /api/actions/context` | 获取 Goal、别名和 open Task |
| `recordLifeEvents` | `POST /api/actions/life-events` | 批量创建 Goal、Task、Activity 或 Inbox |
| `completeLifeTask` | `POST /api/tasks/{id}/complete` | 完成 Task，必要时生成 Activity |
| `completeLifeGoal` | `POST /api/goals/{id}/complete` | 完成 Goal，短期 Goal 生成 Achievement |

## 部署后验证

先直接验证 Token。不要把真实 Token 写入 shell 历史、截图或 issue；下面的值必须替换：

```bash
curl https://YOUR_DOMAIN/api/actions/context \
  -H "Authorization: Bearer YOUR_LOS_TOKEN"
```

成功时应返回与 Token 绑定用户一致的 `user.id`、时区、Goal、Alias 和 open Task。然后在 GPT 中分别测试：

1. “新增一个一次性任务：明天买水，不提醒。”
2. “创建长期目标：每周健身，属于健康领域，按分钟累计。”
3. “给健身目标新增任务：明晚跑步 30 分钟。”
4. 查询 context 后明确完成该 Task。

每一步都应看到 Action 成功响应，数据库记录的 `user_id` 必须始终等于 Token 绑定的用户。

## 当前 Dashboard 访问方式

测试阶段可以打开：

```text
https://YOUR_DOMAIN/dashboard?userId=YOUR_SUPABASE_AUTH_USER_ID
```

当前页面在生产环境也接受 UUID，并直接读取对应用户数据。这是临时测试入口，不是认证机制：知道 UUID 的人可能查看该用户的 Dashboard。正式多用户阶段应恢复 Supabase Session 验证并移除生产环境的 `userId` fallback。

注意：`GET /api/dashboard` 仍然要求 Supabase Session；放开的只是 `/dashboard` 页面，不是 Dashboard API。

## 安全行为和撤销

服务端会：

- 要求 `Authorization: Bearer los_...`。
- 对 Token 做 SHA-256 后查询 `action_credentials.token_hash`。
- 只接受 `status = active` 的凭证。
- 从凭证取得 userId，拒绝客户端自行指定身份。
- 对 Token hash 和 IP 做基础内存限流。
- 通过 Zod 和数据库事务约束校验写入。

Token 泄露或停止测试时，在 Supabase SQL Editor 执行：

```sql
update public.action_credentials
set status = 'revoked'
where user_id = 'YOUR_SUPABASE_AUTH_USER_ID'
  and name = 'personal-custom-gpt';
```

轮换 Token 时先生成并验证新凭证，再撤销旧凭证。不要在数据库中保存明文 Token。

## 常见错误

| 状态 | 含义 | 检查项 |
| --- | --- | --- |
| 401 | Token 缺失、错误或已撤销 | GPT Authentication、`action_credentials`、Vercel 环境变量 |
| 400 | Action 参数不符合当前契约 | GPT Instructions、日期时区、Goal 引用、metric/unit |
| 409 | 幂等键被不同请求复用 | 修正请求后换一个新的 idempotencyKey |
| 429 | 命中限流 | 等待限流窗口，不要连续重试 |
| 500/503 | 服务端或数据库写入失败 | Vercel Log、Supabase Log、schema/RPC 是否部署 |
