# Custom GPT Actions Setup

## Architecture

```text
Custom GPT
  -> Bearer action token
  -> Vercel /api/actions/context
  -> Vercel /api/actions/life-events
  -> Supabase
  -> /dashboard?userId=... reads Supabase and renders the 3D tree
```

The GPT never sends `userId`. Vercel derives `user_id` from the Bearer token.

The write endpoint accepts an ordered batch. Each Task must declare `path: one_off`
or `path: goal`; each Goal must declare `goalType: long_term` or
`goalType: short_term`. A one-off Task never gets a Goal. A long-term Goal requires
one of seven fixed life areas. When creating dependencies in one batch, put the Goal before its Tasks.

## Vercel Environment Variables

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

Dashboard does not use a fixed environment user ID. Open `/dashboard` and enter a user ID, or share a URL like `/dashboard?userId=YOUR_SUPABASE_AUTH_USER_ID`.

For local fallback only:

```env
ACTION_CREDENTIALS_JSON=[]
```

Do not put `SUPABASE_SERVICE_ROLE_KEY` in Custom GPT. It belongs only in Vercel.

## Generate A Credential

Run:

```bash
node scripts/generate-action-token.mjs zhi-custom-gpt YOUR_SUPABASE_AUTH_USER_ID
```

The script prints:

- `token`: give this once to the Custom GPT Action authentication setting.
- `tokenHash`: insert this into Supabase.

Example insert:

```sql
insert into action_credentials (user_id, name, token_hash, status)
values (
  'YOUR_SUPABASE_AUTH_USER_ID',
  'zhi-custom-gpt',
  'TOKEN_HASH_FROM_SCRIPT',
  'active'
);
```

For a friend, generate a separate token and insert a separate row mapped to that friend's `user_id`.

## Custom GPT Configuration

In GPT Builder:

1. Create a GPT.
2. Paste `docs/custom-gpt-actions/instructions.md` into Instructions.
3. Add an Action.
4. Paste `docs/custom-gpt-actions/openapi.yaml`.
5. Replace `https://YOUR-VERCEL-DOMAIN.vercel.app` with your deployed Vercel URL.
6. Authentication:
   - Type: API Key
   - Auth Type: Bearer
   - API Key: the generated `los_...` token

## Security Behavior

The Vercel API:

- Requires `Authorization: Bearer los_...`.
- Hashes the token with SHA-256.
- Looks up `action_credentials.token_hash`.
- Requires `status = active`.
- Applies basic in-memory rate limiting per token hash and IP.
- Rejects request bodies with `userId`.
- Rejects unknown fields.
- Rejects invalid confidence, metric values, invalid dates, and missing required fields.
- Rejects inconsistent `path`/Goal and missing or invalid `lifeArea` values.
- Routes missing or ambiguous Goal references to Inbox during preparation.

To revoke access:

```sql
update action_credentials
set status = 'revoked'
where name = 'friend-custom-gpt';
```
