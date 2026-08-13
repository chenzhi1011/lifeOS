import type { DashboardData } from "./aggregation";
import { seedFromId } from "./stable-seed";
import type { TreeRecipe, BranchRecipe } from "./tree-recipe";
import type { SceneVector } from "./tree-visualization";

export type SemanticBranch = { entityType: "root" | "life_area" | "long_goal" | "short_goal"; entityId: string; parentEntityId: string | null; controlPoints: readonly [SceneVector, SceneVector, SceneVector, SceneVector]; baseRadius: number; tipRadius: number; radialSegments: number };
export type SemanticLeaf = { activityId: string; goalId: string; anchor: SceneVector; rotation: SceneVector; scale: number; visible: boolean };
export type SemanticTreeSkeleton = { branches: SemanticBranch[]; leaves: SemanticLeaf[] };
const v = (x: number, y: number, z: number): SceneVector => ({ x: Number(x.toFixed(4)), y: Number(y.toFixed(4)), z: Number(z.toFixed(4)) });
function bezier(points: SemanticBranch["controlPoints"], t: number): SceneVector {
  const u = 1 - t; const [a, b, c, d] = points;
  return v(u ** 3 * a.x + 3 * u ** 2 * t * b.x + 3 * u * t ** 2 * c.x + t ** 3 * d.x,
    u ** 3 * a.y + 3 * u ** 2 * t * b.y + 3 * u * t ** 2 * c.y + t ** 3 * d.y,
    u ** 3 * a.z + 3 * u ** 2 * t * b.z + 3 * u * t ** 2 * c.z + t ** 3 * d.z);
}
function curve(recipe: BranchRecipe, start: SceneVector): SemanticBranch {
  const azimuth = recipe.azimuth * Math.PI / 180; const elevation = recipe.elevation * Math.PI / 180;
  const horizontal = Math.cos(elevation) * recipe.length; const end = v(start.x + Math.cos(azimuth) * horizontal, start.y + Math.sin(elevation) * recipe.length + .25, start.z + Math.sin(azimuth) * horizontal);
  const bend = (seedFromId(recipe.entityId, "curve") - .5) * recipe.gnarliness;
  return { entityType: recipe.entityType, entityId: recipe.entityId, parentEntityId: recipe.parentEntityId,
    controlPoints: [start, v(start.x + Math.cos(azimuth) * horizontal * .25 + bend, start.y + recipe.length * .28, start.z + Math.sin(azimuth) * horizontal * .25),
      v(end.x - Math.cos(azimuth) * horizontal * .28 - bend, end.y - recipe.length * .2, end.z - Math.sin(azimuth) * horizontal * .28), end],
    baseRadius: recipe.radius, tipRadius: Math.max(.025, recipe.radius * .35), radialSegments: 7 + recipe.stage };
}
export function buildSemanticTreeSkeleton(data: DashboardData, recipe: TreeRecipe, asOf: Date): SemanticTreeSkeleton {
  if (!Number.isFinite(asOf.getTime())) throw new Error("semantic skeleton requires a valid asOf date");
  const trunk: SemanticBranch = { entityType: "root", entityId: "root", parentEntityId: null,
    controlPoints: [v(0, 0, 0), v(.08, recipe.trunk.height * .34, -.04), v(-.1, recipe.trunk.height * .68, .06), v(0, recipe.trunk.height, 0)],
    baseRadius: recipe.trunk.radius, tipRadius: recipe.trunk.radius * .42, radialSegments: 10 };
  const branchById = new Map<string, SemanticBranch>([["root", trunk]]);
  const branches: SemanticBranch[] = [trunk];
  for (const item of recipe.lifeAreas) {
    const branch = curve(item, bezier(trunk.controlPoints, item.start)); branchById.set(item.entityId, branch); branches.push(branch);
  }
  for (const item of [...recipe.longGoals, ...recipe.shortGoals]) {
    const parent = branchById.get(item.parentEntityId); if (!parent) throw new Error(`missing semantic parent ${item.parentEntityId}`);
    const branch = curve(item, bezier(parent.controlPoints, item.start)); branchById.set(item.entityId, branch); branches.push(branch);
  }
  const recentIds = new Set(data.recentActivities.map((item) => item.id));
  const leaves = [...data.allActivities].sort((a, b) => a.id.localeCompare(b.id)).flatMap((activity): SemanticLeaf[] => {
    const parent = branchById.get(activity.goalId); if (!parent) return [];
    const rank = seedFromId(activity.id, "visibility"); const t = .58 + seedFromId(activity.id, "anchor") * .4;
    return [{ activityId: activity.id, goalId: activity.goalId, anchor: bezier(parent.controlPoints, t),
      rotation: v(seedFromId(activity.id, "rx") * .5, seedFromId(activity.id, "ry") * Math.PI * 2, (seedFromId(activity.id, "rz") - .5) * .8),
      scale: Number((.78 + seedFromId(activity.id, "scale") * .35).toFixed(4)), visible: recentIds.has(activity.id) && rank <= recipe.canopy.retention }];
  });
  return { branches, leaves };
}
