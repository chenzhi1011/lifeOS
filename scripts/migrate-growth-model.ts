import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { loadEnvConfig } from "@next/env";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

const uuid = z.string().uuid();
const longGoalMapping = z
  .object({
    legacyGoalId: uuid,
    goalType: z.literal("long_term"),
    abilityTitle: z.string().trim().min(1).max(120)
  })
  .strict();
const shortGoalMapping = z
  .object({
    legacyGoalId: uuid,
    goalType: z.literal("short_term")
  })
  .strict();
const taskTarget = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("one_off") }).strict(),
  z.object({ kind: z.literal("goal"), targetGoalId: uuid }).strict()
]);
const growthMappingSchema = z
  .object({
    userId: uuid,
    goals: z.array(
      z.discriminatedUnion("goalType", [longGoalMapping, shortGoalMapping])
    ),
    taskOverrides: z.array(
      z.object({ taskId: uuid, target: taskTarget }).strict()
    ),
    activityOverrides: z.array(
      z.object({ activityId: uuid, targetGoalId: uuid }).strict()
    ),
    achievementOverrides: z.array(
      z.object({ achievementId: uuid, targetGoalId: uuid }).strict()
    )
  })
  .strict();

export type GrowthMapping = z.infer<typeof growthMappingSchema>;

export type GrowthSnapshot = {
  profiles: Array<{ userId: string }>;
  goals: Array<{
    id: string;
    userId: string;
    title: string;
    goalType: "long_term" | "short_term" | null;
    abilityId: string | null;
  }>;
  tasks: Array<{ id: string; userId: string; goalId: string | null }>;
  activities: Array<{ id: string; userId: string; goalId: string }>;
  achievements: Array<{
    id: string;
    userId: string;
    shortGoalId: string | null;
  }>;
};

type EntityCounts = {
  profiles: number;
  goals: number;
  tasks: number;
  activities: number;
  achievements: number;
};

export type ExpectedSnapshot = {
  expectedProfileIds: string[];
  expectedGoalIds: string[];
  expectedTaskIds: string[];
  expectedActivityIds: string[];
  expectedAchievementIds: string[];
  counts: EntityCounts;
};

export type GrowthMigrationOperation =
  | { kind: "upsert_ability"; title: string }
  | {
      kind: "classify_goal";
      entityId: string;
      goalType: "long_term" | "short_term";
      abilityTitle?: string;
    }
  | { kind: "make_task_one_off"; entityId: string }
  | { kind: "redirect_task"; entityId: string; targetGoalId: string }
  | { kind: "redirect_activity"; entityId: string; targetGoalId: string }
  | {
      kind: "redirect_achievement";
      entityId: string;
      targetGoalId: string;
    };

export type GrowthMigrationPlan = {
  beforeCounts: EntityCounts;
  afterCounts: EntityCounts;
  expectedSnapshot: ExpectedSnapshot;
  operations: GrowthMigrationOperation[];
};

export type MigrationRepository = {
  readSnapshot(userId: string): Promise<GrowthSnapshot>;
  applyGrowthMapping(payload: {
    mapping: GrowthMapping;
    expectedSnapshot: ExpectedSnapshot;
  }): Promise<unknown>;
};

class SafeCliError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SafeCliError";
  }
}

function requireUnique(
  values: string[],
  field: "legacyGoalId" | "taskId" | "activityId" | "achievementId"
): void {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) {
      throw new Error(`duplicate ${field}: ${value}`);
    }
    seen.add(value);
  }
}

export function validateGrowthMapping(input: unknown): GrowthMapping {
  const mapping = growthMappingSchema.parse(input);
  requireUnique(
    mapping.goals.map((goal) => goal.legacyGoalId),
    "legacyGoalId"
  );
  requireUnique(
    mapping.taskOverrides.map((override) => override.taskId),
    "taskId"
  );
  requireUnique(
    mapping.activityOverrides.map((override) => override.activityId),
    "activityId"
  );
  requireUnique(
    mapping.achievementOverrides.map((override) => override.achievementId),
    "achievementId"
  );

  const goalsById = new Map(
    mapping.goals.map((goal) => [goal.legacyGoalId, goal])
  );
  for (const override of mapping.taskOverrides) {
    if (
      override.target.kind === "goal" &&
      !goalsById.has(override.target.targetGoalId)
    ) {
      throw new Error(
        `taskOverrides targetGoalId is not mapped: ${override.target.targetGoalId}`
      );
    }
  }
  for (const override of mapping.activityOverrides) {
    if (!goalsById.has(override.targetGoalId)) {
      throw new Error(
        `activityOverrides targetGoalId is not mapped: ${override.targetGoalId}`
      );
    }
  }
  for (const override of mapping.achievementOverrides) {
    const target = goalsById.get(override.targetGoalId);
    if (target?.goalType !== "short_term") {
      throw new Error(
        `achievementOverrides targetGoalId must reference a mapped short_term goal: ${override.targetGoalId}`
      );
    }
  }
  return mapping;
}

export function parseMigrationArgs(args: string[]): {
  mappingPath: string;
  apply: boolean;
} {
  let mappingPath: string | undefined;
  let apply = false;

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--mapping") {
      if (mappingPath !== undefined) {
        throw new Error("--mapping may only be provided once");
      }
      const value = args[index + 1];
      if (!value || value.startsWith("--")) {
        throw new Error("--mapping requires an absolute JSON file path");
      }
      mappingPath = value;
      index += 1;
      continue;
    }
    if (argument === "--apply") {
      if (apply) {
        throw new Error("--apply may only be provided once");
      }
      apply = true;
      continue;
    }
    throw new SafeCliError("unknown migration argument");
  }

  if (!mappingPath) {
    throw new SafeCliError("--mapping is required");
  }
  if (!path.isAbsolute(mappingPath)) {
    throw new SafeCliError("--mapping must be an absolute path");
  }
  return { mappingPath, apply };
}

export function readMigrationEnvironment(
  environment: Record<string, string | undefined>
): { url: string; serviceRoleKey: string } {
  const url = environment.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceRoleKey = environment.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const missing = [
    !url ? "NEXT_PUBLIC_SUPABASE_URL" : undefined,
    !serviceRoleKey ? "SUPABASE_SERVICE_ROLE_KEY" : undefined
  ].filter((value): value is string => Boolean(value));

  if (missing.length > 0) {
    throw new SafeCliError(
      `missing environment variables: ${missing.join(", ")}`
    );
  }
  return { url: url as string, serviceRoleKey: serviceRoleKey as string };
}

function sortedIds(rows: Array<{ id: string }>): string[] {
  return rows.map((row) => row.id).sort();
}

function assertSameIds(
  actual: string[],
  expected: string[],
  message: string
): void {
  const left = [...actual].sort();
  const right = [...expected].sort();
  if (
    left.length !== right.length ||
    left.some((value, index) => value !== right[index])
  ) {
    throw new Error(message);
  }
}

export function buildGrowthMigrationPlan(
  input: unknown,
  snapshot: GrowthSnapshot
): GrowthMigrationPlan {
  const mapping = validateGrowthMapping(input);
  if (
    snapshot.profiles.length !== 1 ||
    snapshot.profiles[0]?.userId !== mapping.userId
  ) {
    throw new Error("profiles snapshot must contain exactly the mapped user");
  }

  const collections: Array<
    [string, Array<{ userId: string }>]
  > = [
    ["goals", snapshot.goals],
    ["tasks", snapshot.tasks],
    ["activities", snapshot.activities],
    ["achievements", snapshot.achievements]
  ];
  for (const [name, rows] of collections) {
    if (rows.some((row) => row.userId !== mapping.userId)) {
      throw new Error(`${name} snapshot contains a different user`);
    }
  }

  const taskIds = new Set(snapshot.tasks.map((task) => task.id));
  const activityIds = new Set(
    snapshot.activities.map((activity) => activity.id)
  );
  const achievementIds = new Set(
    snapshot.achievements.map((achievement) => achievement.id)
  );
  for (const override of mapping.taskOverrides) {
    if (!taskIds.has(override.taskId)) {
      throw new Error(`taskOverrides taskId is absent from snapshot: ${override.taskId}`);
    }
  }
  for (const override of mapping.activityOverrides) {
    if (!activityIds.has(override.activityId)) {
      throw new Error(
        `activityOverrides activityId is absent from snapshot: ${override.activityId}`
      );
    }
  }
  for (const override of mapping.achievementOverrides) {
    if (!achievementIds.has(override.achievementId)) {
      throw new Error(
        `achievementOverrides achievementId is absent from snapshot: ${override.achievementId}`
      );
    }
  }

  assertSameIds(
    mapping.goals.map((goal) => goal.legacyGoalId),
    snapshot.goals.map((goal) => goal.id),
    "complete coverage of goals is required"
  );
  assertSameIds(
    mapping.taskOverrides.map((override) => override.taskId),
    snapshot.tasks.map((task) => task.id),
    "complete coverage of tasks is required"
  );
  assertSameIds(
    mapping.activityOverrides.map((override) => override.activityId),
    snapshot.activities.map((activity) => activity.id),
    "complete coverage of activity records is required"
  );
  assertSameIds(
    mapping.achievementOverrides.map((override) => override.achievementId),
    snapshot.achievements.map((achievement) => achievement.id),
    "complete coverage of achievements is required"
  );

  const abilityTitles = [
    ...new Set(
      mapping.goals.flatMap((goal) =>
        goal.goalType === "long_term" ? [goal.abilityTitle] : []
      )
    )
  ].sort();
  const operations: GrowthMigrationOperation[] = [
    ...abilityTitles.map(
      (title): GrowthMigrationOperation => ({ kind: "upsert_ability", title })
    ),
    ...mapping.goals.map(
      (goal): GrowthMigrationOperation =>
        goal.goalType === "long_term"
          ? {
              kind: "classify_goal",
              entityId: goal.legacyGoalId,
              goalType: goal.goalType,
              abilityTitle: goal.abilityTitle
            }
          : {
              kind: "classify_goal",
              entityId: goal.legacyGoalId,
              goalType: goal.goalType
            }
    ),
    ...mapping.taskOverrides.map(
      (override): GrowthMigrationOperation =>
        override.target.kind === "one_off"
          ? { kind: "make_task_one_off", entityId: override.taskId }
          : {
              kind: "redirect_task",
              entityId: override.taskId,
              targetGoalId: override.target.targetGoalId
            }
    ),
    ...mapping.activityOverrides.map(
      (override): GrowthMigrationOperation => ({
        kind: "redirect_activity",
        entityId: override.activityId,
        targetGoalId: override.targetGoalId
      })
    ),
    ...mapping.achievementOverrides.map(
      (override): GrowthMigrationOperation => ({
        kind: "redirect_achievement",
        entityId: override.achievementId,
        targetGoalId: override.targetGoalId
      })
    )
  ];
  const counts = {
    profiles: snapshot.profiles.length,
    goals: snapshot.goals.length,
    tasks: snapshot.tasks.length,
    activities: snapshot.activities.length,
    achievements: snapshot.achievements.length
  };
  const expectedSnapshot: ExpectedSnapshot = {
    expectedProfileIds: [mapping.userId],
    expectedGoalIds: sortedIds(snapshot.goals),
    expectedTaskIds: sortedIds(snapshot.tasks),
    expectedActivityIds: sortedIds(snapshot.activities),
    expectedAchievementIds: sortedIds(snapshot.achievements),
    counts
  };
  return {
    beforeCounts: counts,
    afterCounts: counts,
    expectedSnapshot,
    operations
  };
}

export async function runGrowthMigration(options: {
  mapping: unknown;
  apply: boolean;
  repository: MigrationRepository;
}): Promise<{
  mode: "dry-run" | "apply";
  plan: GrowthMigrationPlan;
  result?: unknown;
}> {
  const mapping = validateGrowthMapping(options.mapping);
  let snapshot: GrowthSnapshot;
  try {
    snapshot = await options.repository.readSnapshot(mapping.userId);
  } catch {
    throw new Error("growth migration snapshot read failed");
  }
  const plan = buildGrowthMigrationPlan(mapping, snapshot);
  if (!options.apply) {
    return { mode: "dry-run", plan };
  }
  let result: unknown;
  try {
    result = await options.repository.applyGrowthMapping({
      mapping,
      expectedSnapshot: plan.expectedSnapshot
    });
  } catch {
    throw new Error("growth migration apply failed");
  }
  return { mode: "apply", plan, result };
}

function initializeCliEnvironment(): void {
  loadEnvConfig(process.cwd());
}

type SupabaseRow = Record<string, unknown>;

function requiredString(row: SupabaseRow, key: string, table: string): string {
  const value = row[key];
  if (typeof value !== "string") {
    throw new Error(`invalid ${table} snapshot`);
  }
  return value;
}

function nullableString(
  row: SupabaseRow,
  key: string,
  table: string
): string | null {
  const value = row[key];
  if (value !== null && typeof value !== "string") {
    throw new Error(`invalid ${table} snapshot`);
  }
  return value;
}

function createMigrationRepository(
  url: string,
  serviceRoleKey: string
): MigrationRepository {
  const client = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  async function selectRows(
    table: "profiles" | "goals" | "tasks" | "activities" | "achievements",
    columns: string,
    userId: string
  ): Promise<SupabaseRow[]> {
    const { data, error } = await client
      .from(table)
      .select(columns)
      .eq("user_id", userId);
    if (error || !data) {
      throw new Error(`unable to read ${table} snapshot`);
    }
    return data as unknown as SupabaseRow[];
  }

  return {
    async readSnapshot(userId) {
      const [profiles, goals, tasks, activities, achievements] =
        await Promise.all([
          selectRows("profiles", "user_id", userId),
          selectRows(
            "goals",
            "id,user_id,title,goal_type,ability_id",
            userId
          ),
          selectRows("tasks", "id,user_id,goal_id", userId),
          selectRows("activities", "id,user_id,goal_id", userId),
          selectRows(
            "achievements",
            "id,user_id,short_goal_id",
            userId
          )
        ]);
      return {
        profiles: profiles.map((row) => ({
          userId: requiredString(row, "user_id", "profiles")
        })),
        goals: goals.map((row) => {
          const goalType = nullableString(row, "goal_type", "goals");
          if (
            goalType !== null &&
            goalType !== "long_term" &&
            goalType !== "short_term"
          ) {
            throw new Error("invalid goals snapshot");
          }
          return {
            id: requiredString(row, "id", "goals"),
            userId: requiredString(row, "user_id", "goals"),
            title: requiredString(row, "title", "goals"),
            goalType,
            abilityId: nullableString(row, "ability_id", "goals")
          };
        }),
        tasks: tasks.map((row) => ({
          id: requiredString(row, "id", "tasks"),
          userId: requiredString(row, "user_id", "tasks"),
          goalId: nullableString(row, "goal_id", "tasks")
        })),
        activities: activities.map((row) => ({
          id: requiredString(row, "id", "activities"),
          userId: requiredString(row, "user_id", "activities"),
          goalId: requiredString(row, "goal_id", "activities")
        })),
        achievements: achievements.map((row) => ({
          id: requiredString(row, "id", "achievements"),
          userId: requiredString(row, "user_id", "achievements"),
          shortGoalId: nullableString(
            row,
            "short_goal_id",
            "achievements"
          )
        }))
      };
    },
    async applyGrowthMapping(payload) {
      const { data, error } = await client.rpc("apply_growth_model_mapping", {
        p_mapping: payload.mapping,
        p_expected_snapshot: payload.expectedSnapshot
      });
      if (error) {
        throw new Error("growth model mapping RPC failed");
      }
      return data;
    }
  };
}

export async function main(args = process.argv.slice(2)): Promise<void> {
  initializeCliEnvironment();
  const parsedArgs = parseMigrationArgs(args);
  const environment = readMigrationEnvironment(process.env);
  let mapping: GrowthMapping;
  try {
    mapping = validateGrowthMapping(
      JSON.parse(await readFile(parsedArgs.mappingPath, "utf8")) as unknown
    );
  } catch {
    throw new SafeCliError("mapping file is invalid or unreadable");
  }
  let output: Awaited<ReturnType<typeof runGrowthMigration>>;
  try {
    output = await runGrowthMigration({
      mapping,
      apply: parsedArgs.apply,
      repository: createMigrationRepository(
        environment.url,
        environment.serviceRoleKey
      )
    });
  } catch {
    throw new SafeCliError(
      parsedArgs.apply
        ? "growth migration apply failed"
        : "growth migration dry-run failed"
    );
  }
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch((error: unknown) => {
    const message =
      error instanceof SafeCliError ? error.message : "growth migration failed";
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  });
}
