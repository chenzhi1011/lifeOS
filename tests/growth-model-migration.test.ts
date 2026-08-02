import { existsSync, readFileSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  buildGrowthMigrationPlan,
  main,
  parseMigrationArgs,
  readMigrationEnvironment,
  runGrowthMigration,
  validateGrowthMapping,
  type GrowthSnapshot,
  type MigrationRepository
} from "@/scripts/migrate-growth-model";

const ids = {
  user: "00000000-0000-4000-8000-000000000001",
  goals: [
    "10000000-0000-4000-8000-000000000001",
    "10000000-0000-4000-8000-000000000002",
    "10000000-0000-4000-8000-000000000003",
    "10000000-0000-4000-8000-000000000004"
  ],
  tasks: [
    "20000000-0000-4000-8000-000000000001",
    "20000000-0000-4000-8000-000000000002"
  ],
  activities: ["30000000-0000-4000-8000-000000000001"],
  achievements: ["40000000-0000-4000-8000-000000000001"]
} as const;

function validMapping() {
  return {
    userId: ids.user,
    goals: [
      {
        legacyGoalId: ids.goals[0],
        goalType: "long_term",
        abilityTitle: "前端能力"
      },
      { legacyGoalId: ids.goals[1], goalType: "short_term" },
      {
        legacyGoalId: ids.goals[2],
        goalType: "long_term",
        abilityTitle: "健康能力"
      },
      { legacyGoalId: ids.goals[3], goalType: "short_term" }
    ],
    taskOverrides: [
      { taskId: ids.tasks[0], target: { kind: "one_off" } },
      {
        taskId: ids.tasks[1],
        target: { kind: "goal", targetGoalId: ids.goals[0] }
      }
    ],
    activityOverrides: [
      { activityId: ids.activities[0], targetGoalId: ids.goals[0] }
    ],
    achievementOverrides: [
      {
        achievementId: ids.achievements[0],
        targetGoalId: ids.goals[1]
      }
    ]
  };
}

function validSnapshot(): GrowthSnapshot {
  return {
    profiles: [{ userId: ids.user }],
    goals: ids.goals.map((id, index) => ({
      id,
      userId: ids.user,
      title: `legacy goal ${index + 1}`,
      goalType: null,
      abilityId: null
    })),
    tasks: [
      { id: ids.tasks[0], userId: ids.user, goalId: ids.goals[1] },
      { id: ids.tasks[1], userId: ids.user, goalId: ids.goals[0] }
    ],
    activities: [
      {
        id: ids.activities[0],
        userId: ids.user,
        goalId: ids.goals[0]
      }
    ],
    achievements: [
      {
        id: ids.achievements[0],
        userId: ids.user,
        shortGoalId: ids.goals[1]
      }
    ]
  };
}

describe("growth model migration", () => {
  it("exposes an import-safe pure mapping validator", () => {
    const scriptPath = path.resolve("scripts/migrate-growth-model.ts");
    expect(existsSync(scriptPath)).toBe(true);
    if (!existsSync(scriptPath)) {
      return;
    }
    const script = readFileSync(scriptPath, "utf8");
    expect(script).toContain("export function validateGrowthMapping");
  });

  it("exposes pure argument, environment, plan, and runner boundaries", () => {
    const script = readFileSync(
      path.resolve("scripts/migrate-growth-model.ts"),
      "utf8"
    );

    expect(script).toContain("export function parseMigrationArgs");
    expect(script).toContain("export function readMigrationEnvironment");
    expect(script).toContain("export function buildGrowthMigrationPlan");
    expect(script).toContain("export async function runGrowthMigration");
  });

  it("accepts the fixed mapping shape without rewriting its identifiers", () => {
    const parsed = validateGrowthMapping(validMapping());

    expect(parsed.userId).toBe(ids.user);
    expect(parsed.goals).toHaveLength(4);
    expect(parsed.achievementOverrides).toHaveLength(1);
  });

  it.each([
    ["invalid user uuid", () => ({ ...validMapping(), userId: "not-a-uuid" })],
    [
      "invalid nested uuid",
      () => ({
        ...validMapping(),
        goals: [
          ...validMapping().goals.slice(0, 3),
          { legacyGoalId: "bad", goalType: "short_term" }
        ]
      })
    ],
    [
      "blank long-term ability",
      () => ({
        ...validMapping(),
        goals: [
          { ...validMapping().goals[0], abilityTitle: "   " },
          ...validMapping().goals.slice(1)
        ]
      })
    ],
    [
      "short-term ability",
      () => ({
        ...validMapping(),
        goals: [
          validMapping().goals[0],
          { ...validMapping().goals[1], abilityTitle: "不允许" },
          ...validMapping().goals.slice(2)
        ]
      })
    ],
    [
      "missing fixed array",
      () => {
        const { achievementOverrides: _, ...mapping } = validMapping();
        return mapping;
      }
    ],
    [
      "unknown key",
      () => ({ ...validMapping(), rawMessage: "must not be accepted" })
    ]
  ])("rejects %s", (_, mapping) => {
    expect(() => validateGrowthMapping(mapping())).toThrow();
  });

  it.each([
    ["goal", "goals", "legacyGoalId"],
    ["task", "taskOverrides", "taskId"],
    ["activity", "activityOverrides", "activityId"],
    ["achievement", "achievementOverrides", "achievementId"]
  ] as const)("rejects duplicate %s source ids", (_, collection, field) => {
    const mapping = validMapping();
    const duplicate = {
      ...mapping,
      [collection]: [mapping[collection][0], mapping[collection][0]]
    };

    expect(() => validateGrowthMapping(duplicate)).toThrow(
      new RegExp(field, "i")
    );
  });

  it("requires every override target to reference a mapped goal", () => {
    const missingGoal = "90000000-0000-4000-8000-000000000009";

    expect(() =>
      validateGrowthMapping({
        ...validMapping(),
        taskOverrides: [
          {
            taskId: ids.tasks[0],
            target: { kind: "goal", targetGoalId: missingGoal }
          }
        ]
      })
    ).toThrow(/taskOverrides.*targetGoalId/i);
    expect(() =>
      validateGrowthMapping({
        ...validMapping(),
        activityOverrides: [
          { activityId: ids.activities[0], targetGoalId: missingGoal }
        ]
      })
    ).toThrow(/activityOverrides.*targetGoalId/i);
    expect(() =>
      validateGrowthMapping({
        ...validMapping(),
        achievementOverrides: [
          { achievementId: ids.achievements[0], targetGoalId: ids.goals[0] }
        ]
      })
    ).toThrow(/achievementOverrides.*short_term/i);
  });

  it("parses only the fixed absolute mapping CLI with optional apply", () => {
    expect(
      parseMigrationArgs(["--mapping", "/tmp/growth-mapping.json"])
    ).toEqual({ mappingPath: "/tmp/growth-mapping.json", apply: false });
    expect(
      parseMigrationArgs([
        "--mapping",
        "/tmp/growth-mapping.json",
        "--apply"
      ])
    ).toEqual({ mappingPath: "/tmp/growth-mapping.json", apply: true });

    expect(() => parseMigrationArgs([])).toThrow(/--mapping/i);
    expect(() =>
      parseMigrationArgs(["--mapping", "relative.json"])
    ).toThrow(/absolute/i);
    const secretArgument = "--force-secret-argument";
    let message = "";
    try {
      parseMigrationArgs(["--mapping", "/tmp/map.json", secretArgument]);
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    expect(message).toMatch(/unknown/i);
    expect(message).not.toContain(secretArgument);
  });

  it("reports only missing environment variable names", () => {
    const secretUrl = "https://secret-project.supabase.co";
    let message = "";
    try {
      readMigrationEnvironment({ NEXT_PUBLIC_SUPABASE_URL: secretUrl });
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }

    expect(message).toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(message).not.toContain(secretUrl);
    expect(
      readMigrationEnvironment({
        NEXT_PUBLIC_SUPABASE_URL: secretUrl,
        SUPABASE_SERVICE_ROLE_KEY: "service-secret"
      })
    ).toEqual({
      url: secretUrl,
      serviceRoleKey: "service-secret"
    });
  });

  it("builds a sanitized complete dry-run snapshot and explicit operations", () => {
    const plan = buildGrowthMigrationPlan(validMapping(), validSnapshot());

    expect(plan.beforeCounts).toEqual({
      profiles: 1,
      goals: 4,
      tasks: 2,
      activities: 1,
      achievements: 1
    });
    expect(plan.afterCounts).toEqual({
      profiles: 1,
      goals: 4,
      tasks: 2,
      activities: 1,
      achievements: 1
    });
    expect(plan.beforeCounts).not.toHaveProperty("abilities");
    expect(plan.afterCounts).not.toHaveProperty("abilities");
    expect(plan.expectedSnapshot.expectedGoalIds).toEqual([...ids.goals]);
    expect(plan.expectedSnapshot.expectedTaskIds).toEqual([...ids.tasks]);
    expect(plan.operations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "upsert_ability", title: "前端能力" }),
        expect.objectContaining({ kind: "classify_goal", entityId: ids.goals[0] }),
        expect.objectContaining({ kind: "redirect_task", entityId: ids.tasks[1] }),
        expect.objectContaining({ kind: "make_task_one_off", entityId: ids.tasks[0] }),
        expect.objectContaining({ kind: "redirect_activity", entityId: ids.activities[0] }),
        expect.objectContaining({ kind: "redirect_achievement", entityId: ids.achievements[0] })
      ])
    );
    expect(JSON.stringify(plan)).not.toContain("rawMessage");
    expect(JSON.stringify(plan)).not.toContain("service-secret");
  });

  it("plans a required redirect for an unclassified legacy achievement", () => {
    const snapshot = validSnapshot();
    snapshot.achievements[0] = {
      ...snapshot.achievements[0]!,
      shortGoalId: null
    };

    const plan = buildGrowthMigrationPlan(validMapping(), snapshot);

    expect(plan.operations).toContainEqual({
      kind: "redirect_achievement",
      entityId: ids.achievements[0],
      targetGoalId: ids.goals[1]
    });
  });

  it("rejects incomplete, unknown, and cross-user snapshots before apply", () => {
    const incompleteMapping = validMapping();
    incompleteMapping.goals = incompleteMapping.goals.slice(0, 3);
    expect(() =>
      buildGrowthMigrationPlan(incompleteMapping, validSnapshot())
    ).toThrow(/complete coverage.*goal/i);

    const missingTask = validSnapshot();
    missingTask.tasks = missingTask.tasks.slice(1);
    expect(() =>
      buildGrowthMigrationPlan(validMapping(), missingTask)
    ).toThrow(/taskOverrides.*taskId/i);

    const crossUser = validSnapshot();
    crossUser.activities[0] = {
      ...crossUser.activities[0]!,
      userId: "00000000-0000-4000-8000-000000000099"
    };
    expect(() =>
      buildGrowthMigrationPlan(validMapping(), crossUser)
    ).toThrow(/activities.*user/i);

    const missingTaskOverride = validMapping();
    missingTaskOverride.taskOverrides = missingTaskOverride.taskOverrides.slice(1);
    expect(() =>
      buildGrowthMigrationPlan(missingTaskOverride, validSnapshot())
    ).toThrow(/complete coverage.*task/i);

    const missingActivityOverride = validMapping();
    missingActivityOverride.activityOverrides = [];
    expect(() =>
      buildGrowthMigrationPlan(missingActivityOverride, validSnapshot())
    ).toThrow(/complete coverage.*activity/i);

    const missingAchievementOverride = validMapping();
    missingAchievementOverride.achievementOverrides = [];
    expect(() =>
      buildGrowthMigrationPlan(missingAchievementOverride, validSnapshot())
    ).toThrow(/complete coverage.*achievement/i);
  });

  it("keeps dry-run read-only and applies one guarded RPC payload only when asked", async () => {
    const repository: MigrationRepository = {
      readSnapshot: vi.fn().mockResolvedValue(validSnapshot()),
      applyGrowthMapping: vi.fn().mockResolvedValue({ applied: true })
    };

    const dryRun = await runGrowthMigration({
      mapping: validMapping(),
      apply: false,
      repository
    });
    expect(dryRun.mode).toBe("dry-run");
    expect(repository.readSnapshot).toHaveBeenCalledOnce();
    expect(repository.applyGrowthMapping).not.toHaveBeenCalled();

    const applied = await runGrowthMigration({
      mapping: validMapping(),
      apply: true,
      repository
    });
    expect(applied.mode).toBe("apply");
    expect(repository.applyGrowthMapping).toHaveBeenCalledOnce();
    expect(repository.applyGrowthMapping).toHaveBeenCalledWith({
      mapping: validateGrowthMapping(validMapping()),
      expectedSnapshot: applied.plan.expectedSnapshot
    });
  });

  it("keeps repository failures generic without exposing business identifiers", async () => {
    const secret = "private-row-90000000-0000-4000-8000-000000000009";
    const readFailure: MigrationRepository = {
      readSnapshot: vi.fn().mockRejectedValue(new Error(secret)),
      applyGrowthMapping: vi.fn()
    };
    await expect(
      runGrowthMigration({
        mapping: validMapping(),
        apply: false,
        repository: readFailure
      })
    ).rejects.toThrow("growth migration snapshot read failed");
    await runGrowthMigration({
      mapping: validMapping(),
      apply: false,
      repository: readFailure
    }).catch((error: unknown) => {
      expect(String(error)).not.toContain(secret);
    });

    const applyFailure: MigrationRepository = {
      readSnapshot: vi.fn().mockResolvedValue(validSnapshot()),
      applyGrowthMapping: vi.fn().mockRejectedValue(new Error(secret))
    };
    await expect(
      runGrowthMigration({
        mapping: validMapping(),
        apply: true,
        repository: applyFailure
      })
    ).rejects.toThrow("growth migration apply failed");
    await runGrowthMigration({
      mapping: validMapping(),
      apply: true,
      repository: applyFailure
    }).catch((error: unknown) => {
      expect(String(error)).not.toContain(secret);
    });
  });

  it("keeps mapping file and validation failures generic at the CLI boundary", async () => {
    const tempDirectory = await mkdtemp(
      path.join(os.tmpdir(), "life-os-growth-migration-")
    );
    const secretUuid = "90000000-0000-4000-8000-000000000009";
    const malformedPath = path.join(tempDirectory, "secret-invalid-json.json");
    const invalidMappingPath = path.join(tempDirectory, "secret-invalid-map.json");
    const missingPath = path.join(tempDirectory, "secret-missing-map.json");
    await writeFile(malformedPath, `{\"private\":\"${secretUuid}\"`, "utf8");
    await writeFile(
      invalidMappingPath,
      JSON.stringify({ ...validMapping(), userId: secretUuid, rawInput: secretUuid }),
      "utf8"
    );
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-secret");

    try {
      for (const mappingPath of [malformedPath, invalidMappingPath, missingPath]) {
        let message = "";
        try {
          await main(["--mapping", mappingPath]);
        } catch (error) {
          message = error instanceof Error ? error.message : String(error);
        }
        expect(message).toBe("mapping file is invalid or unreadable");
        expect(message).not.toContain(mappingPath);
        expect(message).not.toContain(secretUuid);
      }
    } finally {
      vi.unstubAllEnvs();
      await rm(tempDirectory, { recursive: true, force: true });
    }
  });

  it("loads env before creating a client and keeps the imported module inert", () => {
    const script = readFileSync(
      path.resolve("scripts/migrate-growth-model.ts"),
      "utf8"
    );
    const loadEnvIndex = script.indexOf("loadEnvConfig(process.cwd())");
    const clientIndex = script.indexOf("createClient(");

    expect(loadEnvIndex).toBeGreaterThan(-1);
    expect(clientIndex).toBeGreaterThan(loadEnvIndex);
    expect(script).toContain("pathToFileURL(process.argv[1])");
    expect(script).toContain("profiles");
    expect(script).toContain("goals");
    expect(script).toContain("tasks");
    expect(script).toContain("activities");
    expect(script).toContain("achievements");
    expect(script).toContain("apply_growth_model_mapping");
    expect(script).toMatch(
      /shortGoalId:\s*nullableString\(\s*row,\s*"short_goal_id",\s*"achievements"\s*\)/
    );
  });

  it("documents the five-table count scope and sensitive dry-run output", () => {
    const readme = readFileSync(path.resolve("README.md"), "utf8");

    expect(readme).toContain(
      "profiles/goals/tasks/activities/achievements"
    );
    expect(readme).toContain("upsert_ability");
    expect(readme).toContain("业务 ID 和 Ability title");
    expect(readme).toContain("不得提交或分享");
  });
});
