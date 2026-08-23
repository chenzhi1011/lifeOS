import type { Task } from "./types";
import { seedFromId } from "./stable-seed";

export type VitalityElementType = "water" | "creature" | "flora";

export type VitalityElement = {
  id: string;
  taskId: string;
  type: VitalityElementType;
  source: "one_off_completion";
  position: { x: number; y: number; z: number };
};

const typeOrder: VitalityElementType[] = ["water", "creature", "flora"];
const caps: Record<VitalityElementType, number> = {
  water: 7,
  creature: 3,
  flora: 8
};

function round(value: number): number {
  return Number(value.toFixed(3));
}

function utcWindow(asOf: Date): { start: number; end: number } {
  if (!Number.isFinite(asOf.getTime())) {
    throw new Error("vitality projection requires a valid asOf date");
  }
  const endDay = Date.UTC(
    asOf.getUTCFullYear(),
    asOf.getUTCMonth(),
    asOf.getUTCDate()
  );
  return {
    start: endDay - 29 * 86_400_000,
    end: endDay + 86_400_000 - 1
  };
}

export function typeFromId(taskId: string): VitalityElementType {
  const index = Math.floor(
    seedFromId(taskId, "vitality-type") * typeOrder.length
  );
  return typeOrder[index]!;
}

function completedTime(task: Task): number {
  const time = Date.parse(task.completedAt ?? "");
  return Number.isFinite(time) ? time : Number.NEGATIVE_INFINITY;
}

function elementFor(task: Task, type: VitalityElementType): VitalityElement {
  const radius = 1.1 + seedFromId(task.id, "vitality-radius") * 3.6;
  const angle = seedFromId(task.id, "vitality-angle") * Math.PI * 2;
  return {
    id: `vitality-${task.id}`,
    taskId: task.id,
    type,
    source: "one_off_completion",
    position: {
      x: round(Math.cos(angle) * radius),
      y: round(
        type === "water"
          ? 1.2 + seedFromId(task.id, "vitality-height") * 2.4
          : 0.08
      ),
      z: round(Math.sin(angle) * radius)
    }
  };
}

export function buildVitalityElements(
  tasks: Task[],
  asOf: Date
): VitalityElement[] {
  const window = utcWindow(asOf);
  const eligible = tasks
    .filter((task) => {
      if (
        task.goalId !== null ||
        task.status !== "completed" ||
        task.completedAt === null
      ) {
        return false;
      }
      return true;
    })
    .sort(
      (left, right) =>
        completedTime(right) - completedTime(left) ||
        left.id.localeCompare(right.id)
    )
    .filter((task) => {
      const completedAt = completedTime(task);
      return completedAt >= window.start && completedAt <= window.end;
    });

  return typeOrder.flatMap((type) =>
    eligible
      .filter((task) => typeFromId(task.id) === type)
      .slice(0, caps[type])
      .map((task) => elementFor(task, type))
  );
}
