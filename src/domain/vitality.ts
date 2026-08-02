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

function availableType(
  taskId: string,
  counts: Record<VitalityElementType, number>
): VitalityElementType | null {
  const preferred = Math.floor(seedFromId(taskId, "vitality-type") * typeOrder.length);
  for (let offset = 0; offset < typeOrder.length; offset += 1) {
    const type = typeOrder[(preferred + offset) % typeOrder.length]!;
    if (counts[type] < caps[type]) {
      return type;
    }
  }
  return null;
}

export function buildVitalityElements(
  tasks: Task[],
  asOf: Date
): VitalityElement[] {
  const window = utcWindow(asOf);
  const counts: Record<VitalityElementType, number> = {
    water: 0,
    creature: 0,
    flora: 0
  };
  const eligible = tasks
    .filter((task) => {
      if (
        task.goalId !== null ||
        task.status !== "completed" ||
        task.completedAt === null
      ) {
        return false;
      }
      const completedAt = Date.parse(task.completedAt);
      return completedAt >= window.start && completedAt <= window.end;
    })
    .sort((left, right) => left.id.localeCompare(right.id));
  const elements: VitalityElement[] = [];

  for (const task of eligible) {
    const type = availableType(task.id, counts);
    if (!type) {
      break;
    }
    counts[type] += 1;
    const radius = 1.1 + seedFromId(task.id, "vitality-radius") * 3.6;
    const angle = seedFromId(task.id, "vitality-angle") * Math.PI * 2;
    elements.push({
      id: `vitality-${task.id}`,
      taskId: task.id,
      type,
      source: "one_off_completion",
      position: {
        x: round(Math.cos(angle) * radius),
        y: round(type === "water" ? 1.2 + seedFromId(task.id, "vitality-height") * 2.4 : 0.08),
        z: round(Math.sin(angle) * radius)
      }
    });
  }

  return elements;
}
