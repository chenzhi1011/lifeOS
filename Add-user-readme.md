# 添加用户并绑定个人 Custom GPT Action

本文用于当前个人开发和测试阶段。目标是创建一个 Supabase 用户，并让一个仅自己可见的 Custom GPT 通过独立 Action Token 只写入这个用户的数据。

> 这不是正式的多用户注册流程。不要把绑定了个人 Token 的 GPT 分享给其他人，也不要让 GPT 保存 Supabase 密码或 service-role key。

## 最终关系

```text
auth.users.id
  = profiles.user_id
  = action_credentials.user_id
  = /dashboard?userId=这里的 UUID
```

数据库只保存 Action Token 的 SHA-256 hash。明文 `los_...` Token 只填入 GPT Builder，并需要像密码一样保管。

## 准备工作

开始前确认：

- Supabase 已执行当前 [supabase/schema.sql](supabase/schema.sql)。
- Vercel 已配置 `NEXT_PUBLIC_SUPABASE_URL` 和 `SUPABASE_SERVICE_ROLE_KEY`。
- 你能访问 Supabase Dashboard、Vercel 项目和 ChatGPT GPT Builder。
- 本地终端位于项目根目录，并已安装 Node.js。

下面所有 `YOUR_...` 都是占位符，执行前必须替换。不要直接复制占位符写入数据库。

## 第一步：创建 Supabase Auth 用户

打开 Supabase Dashboard：

1. 选择正确的 Life OS 项目。
2. 进入 **Authentication → Users**。
3. 点击 **Add user**。
4. 个人测试可以创建邮箱用户；如果界面提供 **Create new user**，设置测试邮箱和强密码。若使用 **Send invitation**，通过收到的邮件完成账号确认。
5. 创建后复制用户的 UUID，也就是 `auth.users.id`。

Supabase 官方也支持由可信服务端通过 Admin API 创建或邀请用户，但不要在浏览器或 Custom GPT 中调用 Admin API。当前个人测试用 Dashboard 创建最简单。

将 UUID 临时记为：

```text
YOUR_SUPABASE_AUTH_USER_ID=00000000-0000-4000-8000-000000000000
```

不要在 SQL Editor 里直接 `insert into auth.users`。Auth 用户还涉及 identity 等内部数据，应该由 Supabase Auth Dashboard 或 Admin API 管理。

## 第二步：创建 Life OS Profile

Auth 用户只代表登录身份；Life OS 的业务表通过 `profiles` 识别用户。打开 **SQL Editor**，替换 UUID、名称和时区后执行：

```sql
insert into public.profiles (
  user_id,
  display_name,
  timezone,
  default_reminder_time
)
values (
  'UUID',
  '项目负责人',
  'Asia/Tokyo',
  '21:52'
)
on conflict (user_id) do update
set
  display_name = excluded.display_name,
  timezone = excluded.timezone,
  default_reminder_time = excluded.default_reminder_time;
```

验证 Auth 用户与 Profile 使用同一 UUID：

```sql
select
  u.id as auth_user_id,
  u.email,
  p.user_id as profile_user_id,
  p.display_name,
  p.timezone,
  p.default_reminder_time
from auth.users u
left join public.profiles p on p.user_id = u.id
where u.id = 'YOUR_SUPABASE_AUTH_USER_ID';
```

`profile_user_id` 不能是 null，并且必须等于 `auth_user_id`。

## 第三步：生成个人 Action Token

在项目根目录执行：

```bash
node scripts/generate-action-token.mjs personal-custom-gpt YOUR_SUPABASE_AUTH_USER_ID
```

终端会输出：

```json
{
  "name": "personal-custom-gpt",
  "userId": "YOUR_SUPABASE_AUTH_USER_ID",
  "token": "los_明文凭证",
  "tokenHash": "64位SHA-256哈希"
}
```

- `token`：只在下一步填入 GPT Builder。生成后妥善保存，数据库无法还原它。
- `tokenHash`：写入 Supabase 数据库。
- 不要把输出提交到 Git、粘贴到聊天记录或放入截图。

## 第四步：把 Token hash 绑定到用户

在 Supabase SQL Editor 执行下面的 SQL，只填写 `tokenHash`，不要填写明文 Token：

```sql
insert into public.action_credentials (
  user_id,
  name,
  token_hash,
  status
)
values (
  'YOUR_SUPABASE_AUTH_USER_ID',
  'personal-custom-gpt',
  'TOKEN_HASH_FROM_SCRIPT',
  'active'
);
```

检查绑定结果：

```sql
select
  id,
  user_id,
  name,
  status,
  created_at,
  last_used_at
from public.action_credentials
where user_id = 'YOUR_SUPABASE_AUTH_USER_ID'
order by created_at desc;
```

此时 `last_used_at` 为空是正常的，首次通过 Action 验证后才会更新。

## 第五步：先在终端验证绑定

用部署域名和刚才生成的明文 Token 调用 context：

```bash
curl https://YOUR_DOMAIN/api/actions/context \
  -H "Authorization: Bearer YOUR_LOS_TOKEN"
```

成功响应应满足：

- HTTP 状态为 200。
- `user.id` 等于 `YOUR_SUPABASE_AUTH_USER_ID`。
- `user.actionCredential` 等于 `personal-custom-gpt`。
- 新用户的 `goals`、`aliases` 和 `openTasks` 可以暂时是空数组。
- 数据库中该凭证的 `last_used_at` 已更新。

如果返回 401，依次检查：

1. Token 是否以 `los_` 开头，是否复制完整。
2. 数据库保存的是 tokenHash 而不是明文 Token。
3. `action_credentials.status` 是否为 `active`。
4. Vercel 是否连接到创建该凭证的同一个 Supabase 项目。
5. Vercel 是否已经重新部署最新环境变量。

## 第六步：绑定到 Custom GPT

在 GPT Builder 中：

1. 创建一个 GPT，并将可见性保持为 **Only me**。
2. 把 [docs/custom-gpt-actions/instructions.md](docs/custom-gpt-actions/instructions.md) 复制到 Instructions。
3. 添加 Action，粘贴 [docs/custom-gpt-actions/openapi.yaml](docs/custom-gpt-actions/openapi.yaml)。
4. 把 OpenAPI 中的 `https://YOUR_DOMAIN` 替换为实际部署域名。
5. Authentication 选择：
   - **API Key**
   - **Bearer**
   - 填入明文 `los_...` Token
6. 保存配置并保持 GPT 私有。

不要把 Supabase URL、用户 UUID、密码或 service-role key 写进 GPT Instructions。GPT 只需要由 Builder 安全保存的 Action Token。

## 第七步：验证写入和 Dashboard

先让 GPT 执行：

```text
创建一个一次性任务：明天买水，不提醒。
```

然后在 Supabase SQL Editor 检查最近记录：

```sql
select id, user_id, title, goal_id, status, due_at, created_at
from public.tasks
where user_id = 'YOUR_SUPABASE_AUTH_USER_ID'
order by created_at desc
limit 10;
```

所有记录的 `user_id` 都必须是 Token 绑定的 UUID。当前测试阶段可以用下面的页面查看树：

```text
https://YOUR_DOMAIN/dashboard?userId=YOUR_SUPABASE_AUTH_USER_ID
```

这个 URL 在当前代码中不需要 Supabase Session，但只是临时测试入口。知道 UUID 的人可能访问对应 Dashboard，因此不能作为正式用户鉴权方案。`GET /api/dashboard` 仍要求 Supabase Session。

## 为第二个测试用户创建绑定

每个测试用户都必须重复创建独立的：

- `auth.users` 用户
- `profiles` 记录
- `los_...` 明文 Token
- `action_credentials` 记录
- 私有 GPT 配置或独立 Action 凭证

不要让两个人共享同一个 Token，因为服务端无法区分是谁写入的数据。

## 撤销或轮换 Token

停止使用或怀疑泄露时立即撤销：

```sql
update public.action_credentials
set status = 'revoked'
where user_id = 'YOUR_SUPABASE_AUTH_USER_ID'
  and name = 'personal-custom-gpt';
```

轮换步骤：

1. 重新运行 token 生成脚本，使用新的凭证名称，例如 `personal-custom-gpt-2026-08`。
2. 把新 tokenHash 插入 `action_credentials`。
3. 在终端验证新 Token。
4. 更新 GPT Builder 中的 API Key。
5. 验证 GPT 可以读取 context。
6. 最后撤销旧凭证。

## 正式产品阶段需要替换什么

当前方案只解决个人测试：

```text
固定 Custom GPT Token → 固定 user_id
```

正式开放多用户时应改为：

- 网页通过 Supabase Session 注册和登录。
- `/dashboard` 不再接受生产环境的任意 `userId` fallback。
- 自建 AI 助手通过用户授权流程取得身份，不共享固定个人 Token。
- 服务端仍然保留统一 `ApiPrincipal → 应用服务 → RPC` 结构，数据库业务规则不需要重写。

Supabase 当前的 Auth 用户和 Dashboard 邀请流程可参考[官方 Users 文档](https://supabase.com/docs/guides/auth/users)。
