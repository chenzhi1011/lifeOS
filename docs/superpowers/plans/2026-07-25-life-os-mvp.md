# Life OS MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a runnable Next.js prototype for Life OS with an independent `/mock` input adapter, growth-focused `/dashboard`, goal detail pages, local LLM provider boundary, mock fallback parser, in-memory MVP store, and Supabase-ready schema.

**Architecture:** The app uses Next.js App Router. `/mock` calls `POST /api/intake`; intake normalizes natural-language input through a provider interface, writes to a local in-memory store for the prototype, and exposes dashboard read APIs. Supabase integration is represented by `supabase/schema.sql` with user-owned tables, RLS, indexes, and composite foreign keys.

**Tech Stack:** Next.js, React, TypeScript, Tailwind CSS, Vitest, Testing Library, Supabase PostgreSQL SQL schema, local OpenAI-compatible LLM endpoint with rule-based fallback.

---

## File Structure

- `package.json`: scripts and dependencies.
- `next.config.ts`: Next.js configuration.
- `tsconfig.json`: TypeScript configuration.
- `postcss.config.mjs`: Tailwind/PostCSS configuration.
- `tailwind.config.ts`: Tailwind content and theme configuration.
- `vitest.config.ts`: test configuration.
- `app/layout.tsx`: root shell.
- `app/page.tsx`: redirects to `/dashboard`.
- `app/globals.css`: app styling and growth tree visuals.
- `app/mock/page.tsx`: local mock input adapter UI.
- `app/dashboard/page.tsx`: growth tree dashboard.
- `app/goals/[id]/page.tsx`: goal detail UI.
- `app/api/intake/route.ts`: writes messages and derived records.
- `app/api/dashboard/route.ts`: reads tree, stats, recent activities, and inbox count.
- `app/api/goals/[id]/route.ts`: reads goal detail, child goals, stats, and activities.
- `src/domain/types.ts`: Life OS domain types and normalized AI output types.
- `src/domain/seed.ts`: demo user, seed goals, and activities.
- `src/domain/store.ts`: in-memory repository with user-scoped reads and writes.
- `src/domain/aggregation.ts`: dashboard, heatmap, streak, and intensity aggregation.
- `src/ai/providers.ts`: provider interface, local provider, mock provider, selection logic.
- `src/ai/mock-parser.ts`: deterministic parser for MVP sample inputs.
- `src/ai/normalize.ts`: safe validation and normalization helpers.
- `src/components/GrowthTree.tsx`: SVG/HTML growth tree visualization.
- `src/components/Heatmap.tsx`: contribution-style growth heatmap.
- `src/components/Timeline.tsx`: activity timeline.
- `src/components/MetricStrip.tsx`: compact dashboard metrics.
- `supabase/schema.sql`: PostgreSQL schema, RLS policies, indexes.
- `tests/aggregation.test.ts`: aggregation behavior.
- `tests/mock-parser.test.ts`: AI parser behavior.
- `tests/store.test.ts`: write rules and multi-user isolation.

---

### Task 1: Scaffold Next.js App

**Files:**
- Create: `package.json`
- Create: `next.config.ts`
- Create: `tsconfig.json`
- Create: `postcss.config.mjs`
- Create: `tailwind.config.ts`
- Create: `vitest.config.ts`
- Create: `app/layout.tsx`
- Create: `app/page.tsx`
- Create: `app/globals.css`

- [ ] **Step 1: Create package scripts and dependencies**

Create `package.json`:

```json
{
  "name": "life-os-mvp",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@next/env": "latest",
    "lucide-react": "latest",
    "next": "latest",
    "react": "latest",
    "react-dom": "latest",
    "zod": "latest"
  },
  "devDependencies": {
    "@testing-library/jest-dom": "latest",
    "@testing-library/react": "latest",
    "@types/node": "latest",
    "@types/react": "latest",
    "@types/react-dom": "latest",
    "autoprefixer": "latest",
    "jsdom": "latest",
    "postcss": "latest",
    "tailwindcss": "latest",
    "typescript": "latest",
    "vitest": "latest"
  }
}
```

- [ ] **Step 2: Create framework config**

Create `next.config.ts`:

```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true
};

export default nextConfig;
```

Create `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "es2022"],
    "allowJs": false,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

Create `postcss.config.mjs`:

```js
const config = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {}
  }
};

export default config;
```

Create `tailwind.config.ts`:

```ts
import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#1d2528",
        moss: "#4d7c59",
        leaf: "#7fb069",
        bark: "#8b5e3c",
        sun: "#d9a441",
        water: "#4f8ca8",
        soil: "#f4efe6"
      }
    }
  },
  plugins: []
};

export default config;
```

Create `vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    globals: true,
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"]
  }
});
```

- [ ] **Step 3: Create app shell**

Create `app/layout.tsx`:

```tsx
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Life OS MVP",
  description: "AI-driven personal growth accumulation system"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
```

Create `app/page.tsx`:

```tsx
import { redirect } from "next/navigation";

export default function HomePage() {
  redirect("/dashboard");
}
```

Create `app/globals.css`:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  color-scheme: light;
  background: #f4efe6;
  color: #1d2528;
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  min-height: 100vh;
  background:
    radial-gradient(circle at 12% 16%, rgba(127, 176, 105, 0.16), transparent 28%),
    linear-gradient(135deg, #f4efe6 0%, #ecf4ed 52%, #edf5f7 100%);
  font-family: Arial, Helvetica, sans-serif;
}

a {
  color: inherit;
  text-decoration: none;
}

button,
input,
textarea {
  font: inherit;
}
```

- [ ] **Step 4: Install dependencies**

Run:

```bash
npm install
```

Expected: `node_modules` and `package-lock.json` are created.

- [ ] **Step 5: Verify scaffold**

Run:

```bash
npm run typecheck
```

Expected: TypeScript completes without errors after dependencies install.

---

### Task 2: Define Domain Types and Seed Data

**Files:**
- Create: `src/domain/types.ts`
- Create: `src/domain/seed.ts`
- Test: `tests/store.test.ts`

- [ ] **Step 1: Write initial type and seed test**

Create `tests/store.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createInitialState } from "@/src/domain/seed";

describe("seed state", () => {
  it("creates demo data owned by the demo user", () => {
    const state = createInitialState();
    expect(state.currentUserId).toBe("demo-user");
    expect(state.goals.every((goal) => goal.userId === "demo-user")).toBe(true);
    expect(state.activities.every((activity) => activity.userId === "demo-user")).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm test -- tests/store.test.ts
```

Expected: fails because `src/domain/seed.ts` does not exist.

- [ ] **Step 3: Create domain types**

Create `src/domain/types.ts`:

```ts
export type IntentType = "task" | "activity" | "goal" | "reminder" | "inbox";
export type MetricType = "duration" | "count" | "milestone";
export type TaskStatus = "open" | "completed" | "cancelled";
export type RecordStatus = "processed" | "inbox" | "failed";
export type GoalStatus = "active" | "paused" | "completed";

export type Profile = {
  userId: string;
  displayName: string;
  createdAt: string;
};

export type Message = {
  id: string;
  userId: string;
  source: "mock" | "wechat" | "app" | "telegram";
  rawText: string;
  intentType: IntentType;
  confidence: number;
  parsedJson: LifeEventParseResult;
  status: RecordStatus;
  createdAt: string;
};

export type Goal = {
  id: string;
  userId: string;
  title: string;
  category: string;
  parentGoalId: string | null;
  metricType: MetricType;
  status: GoalStatus;
  createdAt: string;
};

export type GoalAlias = {
  id: string;
  userId: string;
  goalId: string;
  alias: string;
  createdAt: string;
};

export type Task = {
  id: string;
  userId: string;
  goalId: string | null;
  messageId: string;
  title: string;
  status: TaskStatus;
  dueAt: string | null;
  priority: "low" | "normal" | "high";
  createdAt: string;
  completedAt: string | null;
};

export type Activity = {
  id: string;
  userId: string;
  goalId: string;
  taskId: string | null;
  messageId: string;
  summary: string;
  metricType: MetricType;
  value: number;
  unit: "minute" | "hour" | "count";
  occurredOn: string;
  createdAt: string;
};

export type Reminder = {
  id: string;
  userId: string;
  taskId: string | null;
  messageId: string;
  remindAt: string;
  repeatRule: "none" | "daily" | "weekly";
  status: "scheduled" | "sent" | "cancelled";
  createdAt: string;
};

export type InboxItem = {
  id: string;
  userId: string;
  messageId: string;
  suggestedType: IntentType;
  suggestedJson: LifeEventParseResult;
  reason: string;
  status: "pending" | "resolved" | "dismissed";
  createdAt: string;
};

export type Achievement = {
  id: string;
  userId: string;
  goalId: string | null;
  title: string;
  metricType: MetricType;
  thresholdValue: number | null;
  achievedAt: string;
  createdAt: string;
};

export type LifeEventParseResult = {
  type: IntentType;
  confidence: number;
  goal?: {
    title: string;
    category: string;
    parentTitle?: string;
    metricType?: MetricType;
    aliases?: string[];
  };
  summary?: string;
  metric?: {
    type: MetricType;
    value: number;
    unit: "minute" | "hour" | "count";
  };
  date?: string;
  task?: {
    title: string;
    dueAt?: string | null;
    priority?: "low" | "normal" | "high";
  } | null;
  reminder?: {
    remindAt: string;
    repeatRule: "none" | "daily" | "weekly";
  } | null;
  rawText?: string;
  suggestedTypes?: IntentType[];
  reason?: string;
};

export type LifeOSState = {
  currentUserId: string;
  profiles: Profile[];
  messages: Message[];
  goals: Goal[];
  goalAliases: GoalAlias[];
  tasks: Task[];
  activities: Activity[];
  reminders: Reminder[];
  inboxItems: InboxItem[];
  achievements: Achievement[];
};
```

- [ ] **Step 4: Create seed data**

Create `src/domain/seed.ts`:

```ts
import type { Activity, Achievement, Goal, GoalAlias, LifeOSState, Profile } from "./types";

const now = "2026-07-25T09:00:00+09:00";
const userId = "demo-user";

const profiles: Profile[] = [
  { userId, displayName: "Zhi", createdAt: now }
];

const goals: Goal[] = [
  { id: "life", userId, title: "人生", category: "root", parentGoalId: null, metricType: "milestone", status: "active", createdAt: now },
  { id: "career", userId, title: "职业", category: "职业", parentGoalId: "life", metricType: "duration", status: "active", createdAt: now },
  { id: "health", userId, title: "健康", category: "健康", parentGoalId: "life", metricType: "count", status: "active", createdAt: now },
  { id: "wealth", userId, title: "财富", category: "财富", parentGoalId: "life", metricType: "milestone", status: "active", createdAt: now },
  { id: "interest", userId, title: "兴趣", category: "兴趣", parentGoalId: "life", metricType: "count", status: "active", createdAt: now },
  { id: "aws", userId, title: "AWS", category: "职业", parentGoalId: "career", metricType: "duration", status: "active", createdAt: now },
  { id: "ai", userId, title: "AI", category: "职业", parentGoalId: "career", metricType: "duration", status: "active", createdAt: now },
  { id: "job-change", userId, title: "转职", category: "职业", parentGoalId: "career", metricType: "milestone", status: "active", createdAt: now },
  { id: "muscle", userId, title: "增肌", category: "健康", parentGoalId: "health", metricType: "count", status: "active", createdAt: now },
  { id: "photo", userId, title: "摄影", category: "兴趣", parentGoalId: "interest", metricType: "count", status: "active", createdAt: now }
];

const goalAliases: GoalAlias[] = [
  { id: "alias-aws-1", userId, goalId: "aws", alias: "AWS DevOps", createdAt: now },
  { id: "alias-aws-2", userId, goalId: "aws", alias: "Terraform", createdAt: now },
  { id: "alias-ai-1", userId, goalId: "ai", alias: "大模型", createdAt: now },
  { id: "alias-muscle-1", userId, goalId: "muscle", alias: "练肩", createdAt: now }
];

const activities: Activity[] = [
  { id: "act-1", userId, goalId: "aws", taskId: null, messageId: "seed", summary: "学习 IAM", metricType: "duration", value: 40, unit: "minute", occurredOn: "2026-07-01", createdAt: now },
  { id: "act-2", userId, goalId: "aws", taskId: null, messageId: "seed", summary: "完成 Terraform 模块", metricType: "duration", value: 60, unit: "minute", occurredOn: "2026-07-03", createdAt: now },
  { id: "act-3", userId, goalId: "aws", taskId: null, messageId: "seed", summary: "AWS DevOps 模拟题", metricType: "duration", value: 90, unit: "minute", occurredOn: "2026-07-10", createdAt: now },
  { id: "act-4", userId, goalId: "ai", taskId: null, messageId: "seed", summary: "整理本地 LLM intake 方案", metricType: "duration", value: 50, unit: "minute", occurredOn: "2026-07-15", createdAt: now },
  { id: "act-5", userId, goalId: "muscle", taskId: null, messageId: "seed", summary: "练肩", metricType: "count", value: 1, unit: "count", occurredOn: "2026-07-18", createdAt: now },
  { id: "act-6", userId, goalId: "photo", taskId: null, messageId: "seed", summary: "街拍练习", metricType: "count", value: 1, unit: "count", occurredOn: "2026-07-20", createdAt: now }
];

const achievements: Achievement[] = [
  { id: "ach-1", userId, goalId: "aws", title: "AWS 累计学习超过 3 小时", metricType: "duration", thresholdValue: 180, achievedAt: "2026-07-10T20:00:00+09:00", createdAt: now },
  { id: "ach-2", userId, goalId: "muscle", title: "完成一次肩部训练", metricType: "count", thresholdValue: 1, achievedAt: "2026-07-18T20:00:00+09:00", createdAt: now }
];

export function createInitialState(): LifeOSState {
  return {
    currentUserId: userId,
    profiles: [...profiles],
    messages: [],
    goals: [...goals],
    goalAliases: [...goalAliases],
    tasks: [],
    activities: [...activities],
    reminders: [],
    inboxItems: [],
    achievements: [...achievements]
  };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run:

```bash
npm test -- tests/store.test.ts
```

Expected: `1 passed`.

---

### Task 3: Implement Mock Parser and Provider Boundary

**Files:**
- Create: `src/ai/mock-parser.ts`
- Create: `src/ai/providers.ts`
- Create: `src/ai/normalize.ts`
- Test: `tests/mock-parser.test.ts`

- [ ] **Step 1: Write parser tests**

Create `tests/mock-parser.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { parseWithMockRules } from "@/src/ai/mock-parser";

describe("parseWithMockRules", () => {
  it("parses duration activities", () => {
    const result = parseWithMockRules("今天学习 AWS 40 分钟", "2026-07-25T09:00:00+09:00");
    expect(result.type).toBe("activity");
    expect(result.goal?.title).toBe("AWS");
    expect(result.metric?.value).toBe(40);
    expect(result.metric?.unit).toBe("minute");
  });

  it("parses future tasks", () => {
    const result = parseWithMockRules("明天下午练肩", "2026-07-25T09:00:00+09:00");
    expect(result.type).toBe("task");
    expect(result.goal?.title).toBe("增肌");
    expect(result.task?.title).toBe("练肩");
  });

  it("routes ambiguous messages to inbox", () => {
    const result = parseWithMockRules("下周 Sansan", "2026-07-25T09:00:00+09:00");
    expect(result.type).toBe("inbox");
    expect(result.confidence).toBeLessThan(0.7);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm test -- tests/mock-parser.test.ts
```

Expected: fails because `src/ai/mock-parser.ts` does not exist.

- [ ] **Step 3: Implement mock parser**

Create `src/ai/mock-parser.ts`:

```ts
import type { LifeEventParseResult } from "@/src/domain/types";

function todayDate(timestamp: string): string {
  return timestamp.slice(0, 10);
}

function tomorrowIso(timestamp: string, hour = 15): string {
  const date = new Date(timestamp);
  date.setDate(date.getDate() + 1);
  date.setHours(hour, 0, 0, 0);
  return date.toISOString();
}

export function parseWithMockRules(text: string, timestamp: string): LifeEventParseResult {
  const normalized = text.trim();
  const minutes = normalized.match(/(\d+)\s*分钟/);

  if (/下周\s*Sansan/i.test(normalized)) {
    return {
      type: "inbox",
      confidence: 0.48,
      rawText: normalized,
      suggestedTypes: ["task", "goal"],
      reason: "可能是面试准备任务，也可能属于转职目标。"
    };
  }

  if (/想.*(AWS|Rust|AI|大模型|DevOps)/i.test(normalized) || /今年.*考.*AWS/i.test(normalized)) {
    const title = /Rust/i.test(normalized) ? "Rust" : /AI|大模型/i.test(normalized) ? "AI" : "AWS DevOps";
    return {
      type: "goal",
      confidence: 0.88,
      goal: {
        title,
        category: "职业",
        parentTitle: "职业",
        metricType: "duration",
        aliases: title === "AWS DevOps" ? ["AWS", "DevOps", "Terraform"] : [title]
      }
    };
  }

  if (/提醒/.test(normalized)) {
    return {
      type: "reminder",
      confidence: 0.86,
      goal: { title: "增肌", category: "健康" },
      task: { title: normalized.includes("练肩") ? "练肩" : normalized.replace(/提醒我/, "") },
      reminder: {
        remindAt: tomorrowIso(timestamp, 20),
        repeatRule: "none"
      }
    };
  }

  if (/明天|下周|周[一二三四五六日天]/.test(normalized) && !/今天.*(学习|完成|练|跑)/.test(normalized)) {
    const isTraining = /练肩|训练|健身/.test(normalized);
    return {
      type: "task",
      confidence: 0.9,
      goal: isTraining ? { title: "增肌", category: "健康" } : { title: "转职", category: "职业" },
      task: {
        title: isTraining ? "练肩" : normalized.replace(/^(明天|下周)/, "").trim(),
        dueAt: tomorrowIso(timestamp, isTraining ? 15 : 9),
        priority: "normal"
      }
    };
  }

  if (/今天.*(学习|完成|练|跑)/.test(normalized) || minutes) {
    const value = minutes ? Number(minutes[1]) : 1;
    const isDuration = Boolean(minutes);
    const isHealth = /练|跑|训练|健身/.test(normalized);
    const goalTitle = /Terraform|AWS|IAM|DevOps/i.test(normalized) ? "AWS" : isHealth ? "增肌" : "AI";
    return {
      type: "activity",
      confidence: 0.92,
      goal: {
        title: goalTitle,
        category: isHealth ? "健康" : "职业"
      },
      summary: normalized.replace(/^今天/, ""),
      metric: {
        type: isDuration ? "duration" : "count",
        value,
        unit: isDuration ? "minute" : "count"
      },
      date: todayDate(timestamp),
      task: null,
      reminder: null
    };
  }

  return {
    type: "inbox",
    confidence: 0.42,
    rawText: normalized,
    suggestedTypes: ["task", "activity", "goal"],
    reason: "无法可靠判断这是计划、已发生的活动，还是长期目标。"
  };
}
```

- [ ] **Step 4: Implement provider and normalization files**

Create `src/ai/normalize.ts`:

```ts
import type { LifeEventParseResult } from "@/src/domain/types";

export function normalizeParseResult(result: LifeEventParseResult, rawText: string): LifeEventParseResult {
  const confidence = Math.max(0, Math.min(1, Number(result.confidence) || 0));

  if (confidence < 0.7 || result.type === "inbox") {
    return {
      type: "inbox",
      confidence,
      rawText,
      suggestedTypes: result.suggestedTypes ?? [result.type],
      reason: result.reason ?? "置信度低，等待用户确认。"
    };
  }

  return { ...result, confidence };
}
```

Create `src/ai/providers.ts`:

```ts
import type { LifeEventParseResult } from "@/src/domain/types";
import { parseWithMockRules } from "./mock-parser";
import { normalizeParseResult } from "./normalize";

export type ProviderInput = {
  userId: string;
  text: string;
  source: string;
  timestamp: string;
};

export interface AIProvider {
  parseLifeEvent(input: ProviderInput): Promise<LifeEventParseResult>;
}

export const mockProvider: AIProvider = {
  async parseLifeEvent(input) {
    return normalizeParseResult(parseWithMockRules(input.text, input.timestamp), input.text);
  }
};

export const localProvider: AIProvider = {
  async parseLifeEvent(input) {
    const baseUrl = process.env.LOCAL_LLM_BASE_URL;
    const model = process.env.LOCAL_LLM_MODEL;

    if (!baseUrl || !model) {
      return mockProvider.parseLifeEvent(input);
    }

    try {
      const response = await fetch(`${baseUrl.replace(/\/$/, "")}/v1/chat/completions`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          model,
          messages: [
            {
              role: "system",
              content: "Return only valid JSON for Life OS. Classify as task, activity, goal, reminder, or inbox."
            },
            { role: "user", content: input.text }
          ],
          temperature: 0.1
        })
      });

      if (!response.ok) {
        return mockProvider.parseLifeEvent(input);
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content;
      const parsed = JSON.parse(content) as LifeEventParseResult;
      return normalizeParseResult(parsed, input.text);
    } catch {
      return mockProvider.parseLifeEvent(input);
    }
  }
};

export function getAIProvider(): AIProvider {
  return process.env.AI_PROVIDER === "local" ? localProvider : mockProvider;
}
```

- [ ] **Step 5: Run parser tests**

Run:

```bash
npm test -- tests/mock-parser.test.ts
```

Expected: parser tests pass.

---

### Task 4: Implement Store Write Rules

**Files:**
- Create: `src/domain/store.ts`
- Modify: `tests/store.test.ts`

- [ ] **Step 1: Add write-rule tests**

Replace `tests/store.test.ts` with:

```ts
import { describe, expect, it } from "vitest";
import { createInitialState } from "@/src/domain/seed";
import { createLifeOSStore } from "@/src/domain/store";

describe("Life OS store", () => {
  it("creates demo data owned by the demo user", () => {
    const state = createInitialState();
    expect(state.currentUserId).toBe("demo-user");
    expect(state.goals.every((goal) => goal.userId === "demo-user")).toBe(true);
    expect(state.activities.every((activity) => activity.userId === "demo-user")).toBe(true);
  });

  it("writes activity input into messages and activities", () => {
    const store = createLifeOSStore(createInitialState());
    const result = store.applyParseResult("demo-user", "mock", "今天学习 AWS 40 分钟", {
      type: "activity",
      confidence: 0.92,
      goal: { title: "AWS", category: "职业" },
      summary: "学习 AWS",
      metric: { type: "duration", value: 40, unit: "minute" },
      date: "2026-07-25"
    });

    expect(result.message.status).toBe("processed");
    expect(result.activity?.value).toBe(40);
    expect(store.getState().activities.some((activity) => activity.messageId === result.message.id)).toBe(true);
  });

  it("routes low-confidence parses into inbox", () => {
    const store = createLifeOSStore(createInitialState());
    const result = store.applyParseResult("demo-user", "mock", "下周 Sansan", {
      type: "inbox",
      confidence: 0.48,
      rawText: "下周 Sansan",
      suggestedTypes: ["task", "goal"],
      reason: "不确定"
    });

    expect(result.message.status).toBe("inbox");
    expect(result.inboxItem?.status).toBe("pending");
  });

  it("keeps users isolated", () => {
    const store = createLifeOSStore(createInitialState());
    expect(store.getDashboardData("other-user").goals).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
npm test -- tests/store.test.ts
```

Expected: fails because `src/domain/store.ts` does not exist.

- [ ] **Step 3: Implement store**

Create `src/domain/store.ts`:

```ts
import { createInitialState } from "./seed";
import type {
  Activity,
  Goal,
  InboxItem,
  IntentType,
  LifeEventParseResult,
  LifeOSState,
  Message,
  Reminder,
  Task
} from "./types";
import { buildDashboardData, buildGoalDetail } from "./aggregation";

type ApplyResult = {
  message: Message;
  goal?: Goal;
  activity?: Activity;
  task?: Task;
  reminder?: Reminder;
  inboxItem?: InboxItem;
};

let counter = 0;

function id(prefix: string): string {
  counter += 1;
  return `${prefix}-${counter}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

function defaultMetric(type: IntentType): "duration" | "count" | "milestone" {
  return type === "goal" ? "duration" : type === "activity" ? "duration" : "count";
}

export function createLifeOSStore(initialState: LifeOSState) {
  const state = initialState;

  function resolveGoal(userId: string, parsed: LifeEventParseResult): Goal | undefined {
    if (!parsed.goal) {
      return undefined;
    }

    const existing = state.goals.find(
      (goal) => goal.userId === userId && goal.title.toLowerCase() === parsed.goal?.title.toLowerCase()
    );
    if (existing) {
      return existing;
    }

    const parent = parsed.goal.parentTitle
      ? state.goals.find((goal) => goal.userId === userId && goal.title === parsed.goal?.parentTitle)
      : state.goals.find((goal) => goal.userId === userId && goal.title === parsed.goal?.category);

    const goal: Goal = {
      id: id("goal"),
      userId,
      title: parsed.goal.title,
      category: parsed.goal.category,
      parentGoalId: parent?.id ?? null,
      metricType: parsed.goal.metricType ?? defaultMetric(parsed.type),
      status: "active",
      createdAt: nowIso()
    };
    state.goals.push(goal);

    for (const alias of parsed.goal.aliases ?? []) {
      state.goalAliases.push({ id: id("alias"), userId, goalId: goal.id, alias, createdAt: nowIso() });
    }

    return goal;
  }

  function applyParseResult(userId: string, source: Message["source"], rawText: string, parsed: LifeEventParseResult): ApplyResult {
    const message: Message = {
      id: id("msg"),
      userId,
      source,
      rawText,
      intentType: parsed.type,
      confidence: parsed.confidence,
      parsedJson: parsed,
      status: parsed.type === "inbox" ? "inbox" : "processed",
      createdAt: nowIso()
    };
    state.messages.unshift(message);

    if (parsed.type === "inbox") {
      const inboxItem: InboxItem = {
        id: id("inbox"),
        userId,
        messageId: message.id,
        suggestedType: parsed.suggestedTypes?.[0] ?? "inbox",
        suggestedJson: parsed,
        reason: parsed.reason ?? "需要确认。",
        status: "pending",
        createdAt: nowIso()
      };
      state.inboxItems.unshift(inboxItem);
      return { message, inboxItem };
    }

    const goal = resolveGoal(userId, parsed);

    if (parsed.type === "goal") {
      return { message, goal };
    }

    if (parsed.type === "task" && parsed.task) {
      const task: Task = {
        id: id("task"),
        userId,
        goalId: goal?.id ?? null,
        messageId: message.id,
        title: parsed.task.title,
        status: "open",
        dueAt: parsed.task.dueAt ?? null,
        priority: parsed.task.priority ?? "normal",
        createdAt: nowIso(),
        completedAt: null
      };
      state.tasks.unshift(task);
      return { message, goal, task };
    }

    if (parsed.type === "activity" && goal && parsed.metric) {
      const activity: Activity = {
        id: id("act"),
        userId,
        goalId: goal.id,
        taskId: null,
        messageId: message.id,
        summary: parsed.summary ?? rawText,
        metricType: parsed.metric.type,
        value: parsed.metric.value,
        unit: parsed.metric.unit,
        occurredOn: parsed.date ?? nowIso().slice(0, 10),
        createdAt: nowIso()
      };
      state.activities.unshift(activity);
      return { message, goal, activity };
    }

    if (parsed.type === "reminder" && parsed.reminder) {
      let task: Task | undefined;
      if (parsed.task) {
        task = {
          id: id("task"),
          userId,
          goalId: goal?.id ?? null,
          messageId: message.id,
          title: parsed.task.title,
          status: "open",
          dueAt: parsed.task.dueAt ?? null,
          priority: parsed.task.priority ?? "normal",
          createdAt: nowIso(),
          completedAt: null
        };
        state.tasks.unshift(task);
      }

      const reminder: Reminder = {
        id: id("reminder"),
        userId,
        taskId: task?.id ?? null,
        messageId: message.id,
        remindAt: parsed.reminder.remindAt,
        repeatRule: parsed.reminder.repeatRule,
        status: "scheduled",
        createdAt: nowIso()
      };
      state.reminders.unshift(reminder);
      return { message, goal, task, reminder };
    }

    return { message, goal };
  }

  return {
    getState: () => state,
    applyParseResult,
    getDashboardData: (userId: string) => buildDashboardData(state, userId),
    getGoalDetail: (userId: string, goalId: string) => buildGoalDetail(state, userId, goalId)
  };
}

export const lifeOSStore = createLifeOSStore(createInitialState());
```

- [ ] **Step 4: Run tests**

Run:

```bash
npm test -- tests/store.test.ts
```

Expected: tests pass after Task 5 creates aggregation functions. If this task runs before Task 5, the failure should only be missing `src/domain/aggregation.ts`.

---

### Task 5: Implement Aggregation for Growth Tree, Timeline, and Heatmap

**Files:**
- Create: `src/domain/aggregation.ts`
- Test: `tests/aggregation.test.ts`

- [ ] **Step 1: Write aggregation tests**

Create `tests/aggregation.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildDashboardData } from "@/src/domain/aggregation";
import { createInitialState } from "@/src/domain/seed";

describe("dashboard aggregation", () => {
  it("builds user-scoped goal stats", () => {
    const data = buildDashboardData(createInitialState(), "demo-user");
    const aws = data.goalStats.find((stat) => stat.goalId === "aws");
    expect(aws?.activityCount).toBe(3);
    expect(aws?.totalValue).toBe(190);
    expect(aws?.intensity).toBeGreaterThan(0);
  });

  it("builds heatmap points by date", () => {
    const data = buildDashboardData(createInitialState(), "demo-user");
    expect(data.heatmap.some((point) => point.date === "2026-07-01" && point.count === 1)).toBe(true);
  });

  it("does not leak another user's data", () => {
    const data = buildDashboardData(createInitialState(), "other-user");
    expect(data.goalStats).toHaveLength(0);
    expect(data.recentActivities).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm test -- tests/aggregation.test.ts
```

Expected: fails because `src/domain/aggregation.ts` does not exist.

- [ ] **Step 3: Implement aggregation**

Create `src/domain/aggregation.ts`:

```ts
import type { Activity, Goal, LifeOSState } from "./types";

export type GoalGrowthStat = {
  userId: string;
  goalId: string;
  totalValue: number;
  activityCount: number;
  activeDays: number;
  lastActivityOn: string | null;
  streakWeeks: number;
  intensity: number;
};

export type HeatmapPoint = {
  date: string;
  count: number;
  value: number;
};

export type DashboardData = {
  goals: Goal[];
  goalStats: GoalGrowthStat[];
  recentActivities: Activity[];
  heatmap: HeatmapPoint[];
  inboxCount: number;
};

export type GoalDetailData = {
  goal: Goal | null;
  children: Goal[];
  stat: GoalGrowthStat | null;
  recentActivities: Activity[];
  heatmap: HeatmapPoint[];
};

function uniqueDates(activities: Activity[]): number {
  return new Set(activities.map((activity) => activity.occurredOn)).size;
}

function streakWeeks(activities: Activity[]): number {
  const weeks = new Set(
    activities.map((activity) => {
      const date = new Date(`${activity.occurredOn}T00:00:00Z`);
      const firstDay = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
      const day = Math.floor((date.getTime() - firstDay.getTime()) / 86400000);
      return `${date.getUTCFullYear()}-${Math.floor(day / 7)}`;
    })
  );
  return Math.min(weeks.size, 52);
}

function buildStatsForGoals(userId: string, goals: Goal[], activities: Activity[]): GoalGrowthStat[] {
  const maxTotal = Math.max(1, ...goals.map((goal) => activities.filter((activity) => activity.goalId === goal.id).reduce((sum, activity) => sum + activity.value, 0)));

  return goals.map((goal) => {
    const goalActivities = activities.filter((activity) => activity.goalId === goal.id);
    const totalValue = goalActivities.reduce((sum, activity) => sum + activity.value, 0);
    const lastActivityOn = goalActivities.map((activity) => activity.occurredOn).sort().at(-1) ?? null;
    const activityCount = goalActivities.length;
    const activeDays = uniqueDates(goalActivities);
    const weeks = streakWeeks(goalActivities);
    const intensity = Math.min(1, Number(((totalValue / maxTotal) * 0.7 + Math.min(activityCount / 20, 1) * 0.3).toFixed(2)));

    return { userId, goalId: goal.id, totalValue, activityCount, activeDays, lastActivityOn, streakWeeks: weeks, intensity };
  });
}

function buildHeatmap(activities: Activity[]): HeatmapPoint[] {
  const byDate = new Map<string, HeatmapPoint>();
  for (const activity of activities) {
    const point = byDate.get(activity.occurredOn) ?? { date: activity.occurredOn, count: 0, value: 0 };
    point.count += 1;
    point.value += activity.value;
    byDate.set(activity.occurredOn, point);
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

export function buildDashboardData(state: LifeOSState, userId: string): DashboardData {
  const goals = state.goals.filter((goal) => goal.userId === userId);
  const activities = state.activities.filter((activity) => activity.userId === userId);

  return {
    goals,
    goalStats: buildStatsForGoals(userId, goals, activities),
    recentActivities: [...activities].sort((a, b) => b.occurredOn.localeCompare(a.occurredOn)).slice(0, 8),
    heatmap: buildHeatmap(activities),
    inboxCount: state.inboxItems.filter((item) => item.userId === userId && item.status === "pending").length
  };
}

export function buildGoalDetail(state: LifeOSState, userId: string, goalId: string): GoalDetailData {
  const dashboard = buildDashboardData(state, userId);
  const goal = dashboard.goals.find((item) => item.id === goalId) ?? null;
  const childIds = dashboard.goals.filter((item) => item.parentGoalId === goalId).map((item) => item.id);
  const relatedIds = new Set([goalId, ...childIds]);
  const recentActivities = state.activities
    .filter((activity) => activity.userId === userId && relatedIds.has(activity.goalId))
    .sort((a, b) => b.occurredOn.localeCompare(a.occurredOn));

  return {
    goal,
    children: dashboard.goals.filter((item) => item.parentGoalId === goalId),
    stat: dashboard.goalStats.find((stat) => stat.goalId === goalId) ?? null,
    recentActivities,
    heatmap: buildHeatmap(recentActivities)
  };
}
```

- [ ] **Step 4: Run aggregation and store tests**

Run:

```bash
npm test -- tests/aggregation.test.ts tests/store.test.ts
```

Expected: both test files pass.

---

### Task 6: Implement API Routes

**Files:**
- Create: `app/api/intake/route.ts`
- Create: `app/api/dashboard/route.ts`
- Create: `app/api/goals/[id]/route.ts`

- [ ] **Step 1: Create intake route**

Create `app/api/intake/route.ts`:

```ts
import { NextResponse } from "next/server";
import { getAIProvider } from "@/src/ai/providers";
import { lifeOSStore } from "@/src/domain/store";

export async function POST(request: Request) {
  const body = await request.json();
  const text = String(body.text ?? "").trim();
  const userId = String(body.userId ?? "demo-user");
  const source = body.source === "mock" ? "mock" : "mock";

  if (!text) {
    return NextResponse.json({ error: "text is required" }, { status: 400 });
  }

  const timestamp = new Date().toISOString();
  const parsed = await getAIProvider().parseLifeEvent({ userId, text, source, timestamp });
  const writeResult = lifeOSStore.applyParseResult(userId, source, text, parsed);

  return NextResponse.json({ parsed, writeResult });
}
```

- [ ] **Step 2: Create dashboard route**

Create `app/api/dashboard/route.ts`:

```ts
import { NextResponse } from "next/server";
import { lifeOSStore } from "@/src/domain/store";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const userId = url.searchParams.get("userId") ?? "demo-user";
  return NextResponse.json(lifeOSStore.getDashboardData(userId));
}
```

- [ ] **Step 3: Create goal detail route**

Create `app/api/goals/[id]/route.ts`:

```ts
import { NextResponse } from "next/server";
import { lifeOSStore } from "@/src/domain/store";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const url = new URL(request.url);
  const userId = url.searchParams.get("userId") ?? "demo-user";
  return NextResponse.json(lifeOSStore.getGoalDetail(userId, id));
}
```

- [ ] **Step 4: Typecheck routes**

Run:

```bash
npm run typecheck
```

Expected: routes typecheck cleanly.

---

### Task 7: Build Dashboard Components

**Files:**
- Create: `src/components/MetricStrip.tsx`
- Create: `src/components/Heatmap.tsx`
- Create: `src/components/Timeline.tsx`
- Create: `src/components/GrowthTree.tsx`

- [ ] **Step 1: Create MetricStrip**

Create `src/components/MetricStrip.tsx`:

```tsx
type Metric = {
  label: string;
  value: string;
  detail: string;
};

export function MetricStrip({ metrics }: { metrics: Metric[] }) {
  return (
    <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {metrics.map((metric) => (
        <div key={metric.label} className="rounded-lg border border-black/10 bg-white/70 p-4 shadow-sm">
          <p className="text-sm text-black/60">{metric.label}</p>
          <p className="mt-2 text-2xl font-semibold text-ink">{metric.value}</p>
          <p className="mt-1 text-sm text-black/55">{metric.detail}</p>
        </div>
      ))}
    </section>
  );
}
```

- [ ] **Step 2: Create Heatmap**

Create `src/components/Heatmap.tsx`:

```tsx
import type { HeatmapPoint } from "@/src/domain/aggregation";

export function Heatmap({ points }: { points: HeatmapPoint[] }) {
  const byDate = new Map(points.map((point) => [point.date, point]));
  const today = new Date("2026-07-25T00:00:00");
  const days = Array.from({ length: 70 }, (_, index) => {
    const date = new Date(today);
    date.setDate(today.getDate() - (69 - index));
    return date.toISOString().slice(0, 10);
  });

  return (
    <section className="rounded-lg border border-black/10 bg-white/70 p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-base font-semibold text-ink">Growth Heatmap</h2>
        <span className="text-xs text-black/50">recent 10 weeks</span>
      </div>
      <div className="grid grid-flow-col grid-rows-7 gap-1 overflow-x-auto">
        {days.map((date) => {
          const point = byDate.get(date);
          const level = Math.min(4, point ? Math.ceil(point.count) : 0);
          const color = ["bg-black/5", "bg-leaf/25", "bg-leaf/45", "bg-moss/70", "bg-moss"][level];
          return <div key={date} title={`${date}: ${point?.count ?? 0}`} className={`h-3 w-3 rounded-sm ${color}`} />;
        })}
      </div>
    </section>
  );
}
```

- [ ] **Step 3: Create Timeline**

Create `src/components/Timeline.tsx`:

```tsx
import type { Activity } from "@/src/domain/types";

export function Timeline({ activities }: { activities: Activity[] }) {
  return (
    <section className="rounded-lg border border-black/10 bg-white/70 p-4 shadow-sm">
      <h2 className="text-base font-semibold text-ink">Timeline</h2>
      <div className="mt-4 space-y-3">
        {activities.map((activity) => (
          <div key={activity.id} className="grid grid-cols-[92px_1fr_auto] items-center gap-3 border-b border-black/5 pb-3 last:border-0">
            <span className="text-sm text-black/50">{activity.occurredOn}</span>
            <span className="text-sm font-medium text-ink">{activity.summary}</span>
            <span className="rounded-md bg-soil px-2 py-1 text-xs text-black/60">
              {activity.value} {activity.unit}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Create GrowthTree**

Create `src/components/GrowthTree.tsx`:

```tsx
import Link from "next/link";
import type { GoalGrowthStat } from "@/src/domain/aggregation";
import type { Goal } from "@/src/domain/types";

export function GrowthTree({ goals, stats }: { goals: Goal[]; stats: GoalGrowthStat[] }) {
  const statByGoal = new Map(stats.map((stat) => [stat.goalId, stat]));
  const root = goals.find((goal) => goal.id === "life") ?? goals[0];
  const branches = goals.filter((goal) => goal.parentGoalId === root?.id);
  const leaves = goals.filter((goal) => goal.parentGoalId && goal.parentGoalId !== root?.id);

  return (
    <section className="rounded-lg border border-black/10 bg-white/75 p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-ink">Growth Tree</h2>
          <p className="text-sm text-black/55">枝干粗细和叶子密度来自 Activity 聚合。</p>
        </div>
      </div>
      <div className="mt-5 grid gap-4 lg:grid-cols-[1.1fr_.9fr]">
        <div className="relative min-h-[360px] overflow-hidden rounded-lg bg-gradient-to-b from-[#edf7f3] to-[#f7efe1]">
          <div className="absolute bottom-8 left-1/2 h-44 w-6 -translate-x-1/2 rounded-full bg-bark" />
          {branches.map((branch, index) => {
            const angle = -55 + index * 35;
            const stat = statByGoal.get(branch.id);
            const thickness = 10 + Math.round((stat?.intensity ?? 0.1) * 18);
            return (
              <Link
                href={`/goals/${branch.id}`}
                key={branch.id}
                className="absolute bottom-44 left-1/2 origin-bottom rounded-full bg-bark/80 transition hover:bg-bark"
                style={{
                  height: 150,
                  width: thickness,
                  transform: `translateX(-50%) rotate(${angle}deg)`
                }}
                title={branch.title}
              >
                <span className="absolute -top-8 left-1/2 -translate-x-1/2 rounded-md bg-white/85 px-2 py-1 text-xs font-medium text-ink shadow-sm">
                  {branch.title}
                </span>
              </Link>
            );
          })}
          {leaves.map((leaf, index) => {
            const stat = statByGoal.get(leaf.id);
            const size = 42 + Math.round((stat?.intensity ?? 0.1) * 52);
            const left = 18 + (index * 17) % 66;
            const top = 18 + (index * 23) % 48;
            return (
              <Link
                href={`/goals/${leaf.id}`}
                key={leaf.id}
                className="absolute flex items-center justify-center rounded-full bg-leaf text-center text-xs font-semibold text-white shadow-sm transition hover:scale-105"
                style={{ width: size, height: size, left: `${left}%`, top: `${top}%`, opacity: 0.72 + (stat?.intensity ?? 0) * 0.28 }}
              >
                {leaf.title}
              </Link>
            );
          })}
        </div>
        <div className="space-y-3">
          {leaves.map((goal) => {
            const stat = statByGoal.get(goal.id);
            return (
              <Link href={`/goals/${goal.id}`} key={goal.id} className="block rounded-lg border border-black/10 bg-white/80 p-3 hover:border-moss/40">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-ink">{goal.title}</span>
                  <span className="text-sm text-black/50">{Math.round((stat?.intensity ?? 0) * 100)}%</span>
                </div>
                <div className="mt-2 h-2 rounded-full bg-black/10">
                  <div className="h-2 rounded-full bg-moss" style={{ width: `${Math.max(5, Math.round((stat?.intensity ?? 0) * 100))}%` }} />
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 5: Typecheck components**

Run:

```bash
npm run typecheck
```

Expected: components typecheck cleanly.

---

### Task 8: Build Pages

**Files:**
- Create: `app/mock/page.tsx`
- Create: `app/dashboard/page.tsx`
- Create: `app/goals/[id]/page.tsx`

- [ ] **Step 1: Create `/mock` page**

Create `app/mock/page.tsx`:

```tsx
"use client";

import { Send } from "lucide-react";
import { useState } from "react";

const samples = [
  "今天学习 AWS 40 分钟",
  "明天下午练肩",
  "我今年想考 AWS DevOps",
  "周三晚上提醒我练肩",
  "下周 Sansan"
];

export default function MockPage() {
  const [text, setText] = useState(samples[0]);
  const [result, setResult] = useState<unknown>(null);
  const [loading, setLoading] = useState(false);

  async function submit() {
    setLoading(true);
    const response = await fetch("/api/intake", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ userId: "demo-user", source: "mock", text })
    });
    setResult(await response.json());
    setLoading(false);
  }

  return (
    <main className="mx-auto grid min-h-screen max-w-6xl gap-6 px-5 py-6 lg:grid-cols-[.9fr_1.1fr]">
      <section className="rounded-lg border border-black/10 bg-white/75 p-5 shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-wide text-moss">Input Adapter</p>
        <h1 className="mt-2 text-2xl font-semibold text-ink">Local Mock Chat</h1>
        <p className="mt-2 text-sm text-black/60">测试阶段用这个窗口模拟微信、自有 App 或 Telegram。Dashboard 不承担输入。</p>
        <div className="mt-5 space-y-2">
          {samples.map((sample) => (
            <button key={sample} className="block w-full rounded-md border border-black/10 bg-soil px-3 py-2 text-left text-sm hover:border-moss/50" onClick={() => setText(sample)}>
              {sample}
            </button>
          ))}
        </div>
        <textarea className="mt-5 min-h-32 w-full rounded-lg border border-black/15 bg-white p-3 outline-none focus:border-moss" value={text} onChange={(event) => setText(event.target.value)} />
        <button className="mt-3 inline-flex items-center gap-2 rounded-md bg-moss px-4 py-2 text-sm font-semibold text-white hover:bg-[#3f684b]" onClick={submit} disabled={loading}>
          <Send size={16} />
          {loading ? "Parsing..." : "Send to Intake"}
        </button>
      </section>
      <section className="rounded-lg border border-black/10 bg-[#17201d] p-5 text-white shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">AI JSON + Write Result</h2>
          <a className="text-sm text-white/70 underline" href="/dashboard">Open Dashboard</a>
        </div>
        <pre className="mt-4 max-h-[72vh] overflow-auto rounded-lg bg-black/30 p-4 text-xs leading-relaxed">
          {result ? JSON.stringify(result, null, 2) : "Send a message to see structured output."}
        </pre>
      </section>
    </main>
  );
}
```

- [ ] **Step 2: Create `/dashboard` page**

Create `app/dashboard/page.tsx`:

```tsx
import { GrowthTree } from "@/src/components/GrowthTree";
import { Heatmap } from "@/src/components/Heatmap";
import { MetricStrip } from "@/src/components/MetricStrip";
import { Timeline } from "@/src/components/Timeline";
import { lifeOSStore } from "@/src/domain/store";

export default function DashboardPage() {
  const data = lifeOSStore.getDashboardData("demo-user");
  const totalActivities = data.recentActivities.length;
  const totalValue = data.goalStats.reduce((sum, stat) => sum + stat.totalValue, 0);
  const activeGoals = data.goalStats.filter((stat) => stat.activityCount > 0).length;

  return (
    <main className="mx-auto max-w-7xl space-y-5 px-5 py-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-moss">Life OS</p>
          <h1 className="mt-1 text-3xl font-semibold text-ink">Growth Dashboard</h1>
          <p className="mt-2 text-sm text-black/60">只展示成长沉淀。输入入口在 /mock，未来替换为微信或其他应用。</p>
        </div>
        <a className="rounded-md border border-black/10 bg-white/70 px-3 py-2 text-sm font-medium text-ink hover:border-moss/40" href="/mock">
          Open Mock Input
        </a>
      </header>
      <MetricStrip
        metrics={[
          { label: "Active Goals", value: String(activeGoals), detail: "goals with accumulated activity" },
          { label: "Recent Activities", value: String(totalActivities), detail: "latest visible records" },
          { label: "Accumulated Value", value: String(totalValue), detail: "minutes and counts combined for MVP" },
          { label: "Inbox", value: String(data.inboxCount), detail: "low-confidence inputs" }
        ]}
      />
      <GrowthTree goals={data.goals} stats={data.goalStats} />
      <div className="grid gap-5 lg:grid-cols-[.85fr_1.15fr]">
        <Heatmap points={data.heatmap} />
        <Timeline activities={data.recentActivities} />
      </div>
    </main>
  );
}
```

- [ ] **Step 3: Create goal detail page**

Create `app/goals/[id]/page.tsx`:

```tsx
import Link from "next/link";
import { Heatmap } from "@/src/components/Heatmap";
import { Timeline } from "@/src/components/Timeline";
import { lifeOSStore } from "@/src/domain/store";

export default async function GoalPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = lifeOSStore.getGoalDetail("demo-user", id);

  if (!data.goal) {
    return (
      <main className="mx-auto max-w-4xl px-5 py-10">
        <p>Goal not found.</p>
        <Link className="underline" href="/dashboard">Back to dashboard</Link>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-6xl space-y-5 px-5 py-6">
      <Link className="text-sm text-moss underline" href="/dashboard">Back to dashboard</Link>
      <header className="rounded-lg border border-black/10 bg-white/75 p-5 shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-wide text-moss">{data.goal.category}</p>
        <h1 className="mt-1 text-3xl font-semibold text-ink">{data.goal.title}</h1>
        <div className="mt-4 grid gap-3 sm:grid-cols-4">
          <div><p className="text-sm text-black/50">Total</p><p className="text-xl font-semibold">{data.stat?.totalValue ?? 0}</p></div>
          <div><p className="text-sm text-black/50">Activities</p><p className="text-xl font-semibold">{data.stat?.activityCount ?? 0}</p></div>
          <div><p className="text-sm text-black/50">Active Days</p><p className="text-xl font-semibold">{data.stat?.activeDays ?? 0}</p></div>
          <div><p className="text-sm text-black/50">Streak Weeks</p><p className="text-xl font-semibold">{data.stat?.streakWeeks ?? 0}</p></div>
        </div>
      </header>
      <Heatmap points={data.heatmap} />
      <Timeline activities={data.recentActivities} />
    </main>
  );
}
```

- [ ] **Step 4: Typecheck pages**

Run:

```bash
npm run typecheck
```

Expected: pages typecheck cleanly.

---

### Task 9: Add Supabase Schema

**Files:**
- Create: `supabase/schema.sql`

- [ ] **Step 1: Create schema**

Create `supabase/schema.sql`:

```sql
create extension if not exists pgcrypto;

create table profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now()
);

create table external_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(user_id) on delete cascade,
  provider text not null check (provider in ('mock', 'wechat', 'telegram', 'app')),
  external_user_id text not null,
  created_at timestamptz not null default now(),
  unique (provider, external_user_id),
  unique (user_id, id)
);

create table goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(user_id) on delete cascade,
  title text not null,
  category text not null,
  parent_goal_id uuid,
  metric_type text not null check (metric_type in ('duration', 'count', 'milestone')),
  status text not null default 'active' check (status in ('active', 'paused', 'completed')),
  created_at timestamptz not null default now(),
  unique (user_id, id),
  unique (user_id, title),
  foreign key (user_id, parent_goal_id) references goals(user_id, id)
);

create table goal_aliases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(user_id) on delete cascade,
  goal_id uuid not null,
  alias text not null,
  created_at timestamptz not null default now(),
  unique (user_id, id),
  unique (user_id, alias),
  foreign key (user_id, goal_id) references goals(user_id, id) on delete cascade
);

create table messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(user_id) on delete cascade,
  source text not null check (source in ('mock', 'wechat', 'app', 'telegram')),
  raw_text text not null,
  intent_type text not null check (intent_type in ('task', 'activity', 'goal', 'reminder', 'inbox')),
  confidence numeric not null check (confidence >= 0 and confidence <= 1),
  parsed_json jsonb not null,
  status text not null check (status in ('processed', 'inbox', 'failed')),
  created_at timestamptz not null default now(),
  unique (user_id, id)
);

create table tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(user_id) on delete cascade,
  goal_id uuid,
  message_id uuid not null,
  title text not null,
  status text not null default 'open' check (status in ('open', 'completed', 'cancelled')),
  due_at timestamptz,
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high')),
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (user_id, id),
  foreign key (user_id, goal_id) references goals(user_id, id),
  foreign key (user_id, message_id) references messages(user_id, id)
);

create table activities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(user_id) on delete cascade,
  goal_id uuid not null,
  task_id uuid,
  message_id uuid not null,
  summary text not null,
  metric_type text not null check (metric_type in ('duration', 'count', 'milestone')),
  value numeric not null,
  unit text not null check (unit in ('minute', 'hour', 'count')),
  occurred_on date not null,
  created_at timestamptz not null default now(),
  unique (user_id, id),
  foreign key (user_id, goal_id) references goals(user_id, id),
  foreign key (user_id, task_id) references tasks(user_id, id),
  foreign key (user_id, message_id) references messages(user_id, id)
);

create table reminders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(user_id) on delete cascade,
  task_id uuid,
  message_id uuid not null,
  remind_at timestamptz not null,
  repeat_rule text not null default 'none' check (repeat_rule in ('none', 'daily', 'weekly')),
  status text not null default 'scheduled' check (status in ('scheduled', 'sent', 'cancelled')),
  created_at timestamptz not null default now(),
  unique (user_id, id),
  foreign key (user_id, task_id) references tasks(user_id, id),
  foreign key (user_id, message_id) references messages(user_id, id)
);

create table inbox_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(user_id) on delete cascade,
  message_id uuid not null,
  suggested_type text not null check (suggested_type in ('task', 'activity', 'goal', 'reminder', 'inbox')),
  suggested_json jsonb not null,
  reason text not null,
  status text not null default 'pending' check (status in ('pending', 'resolved', 'dismissed')),
  created_at timestamptz not null default now(),
  unique (user_id, id),
  foreign key (user_id, message_id) references messages(user_id, id)
);

create table achievements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(user_id) on delete cascade,
  goal_id uuid,
  title text not null,
  metric_type text not null check (metric_type in ('duration', 'count', 'milestone')),
  threshold_value numeric,
  achieved_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (user_id, id),
  foreign key (user_id, goal_id) references goals(user_id, id)
);

create index idx_messages_user_created on messages (user_id, created_at desc);
create index idx_goals_user_parent on goals (user_id, parent_goal_id);
create index idx_goal_aliases_user_alias on goal_aliases (user_id, alias);
create index idx_tasks_user_status_due on tasks (user_id, status, due_at);
create index idx_activities_user_date on activities (user_id, occurred_on desc);
create index idx_activities_user_goal_date on activities (user_id, goal_id, occurred_on desc);
create index idx_reminders_user_status_time on reminders (user_id, status, remind_at);
create index idx_inbox_items_user_status on inbox_items (user_id, status, created_at desc);

create view goal_growth_stats as
select
  g.user_id,
  g.id as goal_id,
  coalesce(sum(a.value), 0) as total_value,
  count(a.id) as activity_count,
  count(distinct a.occurred_on) as active_days,
  max(a.occurred_on) as last_activity_on,
  least(count(distinct date_trunc('week', a.occurred_on::timestamp)), 52) as streak_weeks,
  least(1, (coalesce(sum(a.value), 0) / greatest(1, max(coalesce(sum(a.value), 0)) over (partition by g.user_id)))) as intensity
from goals g
left join activities a on a.user_id = g.user_id and a.goal_id = g.id
group by g.user_id, g.id;

alter table profiles enable row level security;
alter table external_accounts enable row level security;
alter table goals enable row level security;
alter table goal_aliases enable row level security;
alter table messages enable row level security;
alter table tasks enable row level security;
alter table activities enable row level security;
alter table reminders enable row level security;
alter table inbox_items enable row level security;
alter table achievements enable row level security;

create policy profiles_own_rows on profiles using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy external_accounts_own_rows on external_accounts using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy goals_own_rows on goals using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy goal_aliases_own_rows on goal_aliases using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy messages_own_rows on messages using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy tasks_own_rows on tasks using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy activities_own_rows on activities using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy reminders_own_rows on reminders using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy inbox_items_own_rows on inbox_items using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy achievements_own_rows on achievements using (user_id = auth.uid()) with check (user_id = auth.uid());
```

- [ ] **Step 2: Review schema syntax**

Run:

```bash
rg -n "resource_owners|visibility|public|private|unlisted" supabase/schema.sql
```

Expected: no matches.

---

### Task 10: Verify End-to-End Prototype

**Files:**
- Modify only files with errors found during verification.

- [ ] **Step 1: Run all tests**

Run:

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 2: Run typecheck**

Run:

```bash
npm run typecheck
```

Expected: no TypeScript errors.

- [ ] **Step 3: Run production build**

Run:

```bash
npm run build
```

Expected: Next.js build succeeds.

- [ ] **Step 4: Start dev server**

Run:

```bash
npm run dev
```

Expected: local URL is printed, normally `http://localhost:3000`.

- [ ] **Step 5: Manual browser verification**

Open:

```text
http://localhost:3000/mock
http://localhost:3000/dashboard
http://localhost:3000/goals/aws
```

Expected:

- `/mock` sends sample text and shows structured JSON.
- `/dashboard` has no chat input and shows growth tree, metrics, heatmap, and timeline.
- `/goals/aws` shows AWS detail stats and activity timeline.
- Sending `今天学习 AWS 40 分钟` from `/mock` changes dashboard data after refresh.

---

## Self-Review

Spec coverage:

- Local mock input adapter is covered by Tasks 6 and 8.
- Independent dashboard is covered by Tasks 7 and 8.
- Local LLM provider with mock fallback is covered by Task 3.
- Multi-user owned tables and RLS are covered by Task 9.
- Activity ledger, task writes, inbox writes, and goal creation are covered by Tasks 2, 4, and 5.
- Growth tree aggregation is covered by Tasks 5 and 7.
- Supabase schema is covered by Task 9.

Placeholder scan:

- The plan intentionally avoids unresolved placeholders. Deferred product areas are described in the design spec and excluded from implementation tasks.

Type consistency:

- Domain fields use camelCase in TypeScript and snake_case in SQL.
- `userId`, `goalId`, `messageId`, `taskId`, `occurredOn`, and `createdAt` are consistent across TypeScript files.
- API routes return data generated by `lifeOSStore`, which uses the aggregation module consumed by UI components.

