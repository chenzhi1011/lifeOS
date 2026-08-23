import type { DashboardData } from "./aggregation";
import { seedFromId } from "./stable-seed";
import type { TreeRecipe, BranchRecipe } from "./tree-recipe";
import type { SceneVector } from "./tree-visualization";
import { treeBranchRadiusAt } from "./tree-branch-shape";
import { branchesCollide } from "./tree-branch-collision";

export type SemanticBranch = { entityType: "root" | "life_area" | "long_goal" | "short_goal"; entityId: string; parentEntityId: string | null; controlPoints: readonly [SceneVector, SceneVector, SceneVector, SceneVector]; baseRadius: number; tipRadius: number; radialSegments: number };
export type LeafTwig = { id: string; parentEntityId: string; controlPoints: readonly [SceneVector, SceneVector, SceneVector, SceneVector]; baseRadius: number; tipRadius: number };
export const CANOPY_TWIG_RADIUS = .014;
export const LEAF_PETIOLE_RADIUS = .004;
export type SemanticLeaf = { activityId: string; goalId: string; twig: LeafTwig; petiole: LeafTwig; anchor: SceneVector; direction: SceneVector; roll: number; rotation: SceneVector; scale: number; visible: boolean };
export type SemanticTreeSkeleton = { branches: SemanticBranch[]; leaves: SemanticLeaf[] };
const v = (x: number, y: number, z: number): SceneVector => ({ x: Number(x.toFixed(4)), y: Number(y.toFixed(4)), z: Number(z.toFixed(4)) });
function bezier(points: SemanticBranch["controlPoints"], t: number): SceneVector {
  const u = 1 - t; const [a, b, c, d] = points;
  return v(u ** 3 * a.x + 3 * u ** 2 * t * b.x + 3 * u * t ** 2 * c.x + t ** 3 * d.x,
    u ** 3 * a.y + 3 * u ** 2 * t * b.y + 3 * u * t ** 2 * c.y + t ** 3 * d.y,
    u ** 3 * a.z + 3 * u ** 2 * t * b.z + 3 * u * t ** 2 * c.z + t ** 3 * d.z);
}

function normalized(vector: SceneVector): SceneVector {
  const length = Math.hypot(vector.x, vector.y, vector.z) || 1;
  return v(vector.x / length, vector.y / length, vector.z / length);
}

function leafTwig(
  activityId: string,
  parent: SemanticBranch,
  progress: number
): { twig: LeafTwig; petiole: LeafTwig; direction: SceneVector } {
  const start = bezier(parent.controlPoints, progress);
  const before = bezier(parent.controlPoints, Math.max(0, progress - .035));
  const tangent = normalized(v(
    start.x - before.x,
    start.y - before.y,
    start.z - before.z
  ));
  const azimuth = seedFromId(activityId, "twig-azimuth") * Math.PI * 2;
  const outward = normalized(v(
    tangent.x * .34 + Math.cos(azimuth) * .72,
    Math.max(.24, tangent.y * .35 + .48),
    tangent.z * .34 + Math.sin(azimuth) * .72
  ));
  const length = .34 + seedFromId(activityId, "twig-length") * .22;
  const end = v(
    start.x + outward.x * length,
    start.y + outward.y * length,
    start.z + outward.z * length
  );
  const twig: LeafTwig = {
    id: `activity-twig-${activityId}`,
    parentEntityId: parent.entityId,
    controlPoints: [
      start,
      v(
        start.x + outward.x * length * .28,
        start.y + outward.y * length * .22 + .025,
        start.z + outward.z * length * .28
      ),
      v(
        start.x + outward.x * length * .68,
        start.y + outward.y * length * .62 + .035,
        start.z + outward.z * length * .68
      ),
      end
    ],
    baseRadius: CANOPY_TWIG_RADIUS,
    tipRadius: CANOPY_TWIG_RADIUS
  };
  const leafDirection = normalized(v(
    Math.cos(azimuth) * .82 + outward.x * .18,
    -.24,
    Math.sin(azimuth) * .82 + outward.z * .18
  ));
  const petioleEnd = v(
    end.x + leafDirection.x * .045,
    end.y + leafDirection.y * .045,
    end.z + leafDirection.z * .045
  );
  const petiole: LeafTwig = {
    id: `activity-petiole-${activityId}`,
    parentEntityId: twig.id,
    controlPoints: [
      end,
      v(
        end.x + leafDirection.x * .015,
        end.y + leafDirection.y * .015,
        end.z + leafDirection.z * .015
      ),
      v(
        end.x + leafDirection.x * .03,
        end.y + leafDirection.y * .03,
        end.z + leafDirection.z * .03
      ),
      petioleEnd
    ],
    baseRadius: LEAF_PETIOLE_RADIUS,
    tipRadius: LEAF_PETIOLE_RADIUS
  };
  return { twig, petiole, direction: leafDirection };
}

type CurveAdjustment = {
  azimuthDelta: number;
  elevationDelta: number;
  lengthScale: number;
};

function curve(
  recipe: BranchRecipe,
  start: SceneVector,
  parent: SemanticBranch,
  adjustment: CurveAdjustment
): SemanticBranch {
  const azimuth = (recipe.azimuth + adjustment.azimuthDelta) * Math.PI / 180;
  const elevation = (recipe.elevation + adjustment.elevationDelta) * Math.PI / 180;
  const length = recipe.length * adjustment.lengthScale;
  const horizontal = Math.cos(elevation) * length; const end = v(start.x + Math.cos(azimuth) * horizontal, start.y + Math.sin(elevation) * length + .25, start.z + Math.sin(azimuth) * horizontal);
  const bend = (seedFromId(recipe.entityId, "curve") - .5) * recipe.gnarliness;
  // A child must be visibly narrower than its parent at the exact fork.
  // 子枝根部必须小于父枝分叉点的局部半径，避免粗管插入细枝。
  const parentRadiusAtFork = treeBranchRadiusAt(
    parent.baseRadius,
    parent.tipRadius,
    recipe.start
  );
  const childRatio = recipe.entityType === "life_area" ? .68 : .62;
  const baseRadius = Math.min(recipe.radius, parentRadiusAtFork * childRatio);
  return { entityType: recipe.entityType, entityId: recipe.entityId, parentEntityId: recipe.parentEntityId,
    controlPoints: [start, v(start.x + Math.cos(azimuth) * horizontal * .25 + bend, start.y + length * .28, start.z + Math.sin(azimuth) * horizontal * .25),
      v(end.x - Math.cos(azimuth) * horizontal * .28 - bend, end.y - length * .2, end.z - Math.sin(azimuth) * horizontal * .28), end],
    baseRadius, tipRadius: Math.max(.01, baseRadius * .35), radialSegments: 7 + recipe.stage };
}

function avoidanceAdjustments(entityId: string): CurveAdjustment[] {
  const preferredDirection = seedFromId(entityId, "collision-side") < .5 ? -1 : 1;
  const azimuthOffsets = [0, 10, -10, 20, -20, 35, -35, 50, -50, 70, -70]
    .map((offset) => offset === 0 ? 0 : offset * preferredDirection);
  const attempts: CurveAdjustment[] = [];
  for (const lengthScale of [1, .9, .78]) {
    for (const elevationDelta of [0, 10, -10, 20]) {
      for (const azimuthDelta of azimuthOffsets) {
        attempts.push({ azimuthDelta, elevationDelta, lengthScale });
      }
    }
  }
  return attempts.sort((left, right) => {
    const penalty = (item: CurveAdjustment) =>
      Math.abs(item.azimuthDelta)
      + Math.abs(item.elevationDelta) * 1.25
      + (1 - item.lengthScale) * 100;
    return penalty(left) - penalty(right);
  });
}

function collisionFreeCurve(
  recipe: BranchRecipe,
  parent: SemanticBranch,
  existingBranches: readonly SemanticBranch[]
): SemanticBranch {
  const start = bezier(parent.controlPoints, recipe.start);
  let fallback: SemanticBranch | null = null;
  for (const adjustment of avoidanceAdjustments(recipe.entityId)) {
    const candidate = curve(recipe, start, parent, adjustment);
    fallback ??= candidate;
    if (existingBranches.every((obstacle) =>
      !branchesCollide(candidate, obstacle)
    )) {
      return candidate;
    }
  }
  return fallback!;
}

export function buildSemanticTreeSkeleton(data: DashboardData, recipe: TreeRecipe, asOf: Date): SemanticTreeSkeleton {
  if (!Number.isFinite(asOf.getTime())) throw new Error("semantic skeleton requires a valid asOf date");
  const trunk: SemanticBranch = { entityType: "root", entityId: "root", parentEntityId: null,
    controlPoints: [v(0, 0, 0), v(.08, recipe.trunk.height * .34, -.04), v(-.1, recipe.trunk.height * .68, .06), v(0, recipe.trunk.height, 0)],
    baseRadius: recipe.trunk.radius, tipRadius: recipe.trunk.radius * .42, radialSegments: 10 };
  const branchById = new Map<string, SemanticBranch>([["root", trunk]]);
  const branches: SemanticBranch[] = [trunk];
  for (const item of recipe.lifeAreas) {
    const branch = collisionFreeCurve(item, trunk, branches); branchById.set(item.entityId, branch); branches.push(branch);
  }
  for (const item of [...recipe.longGoals, ...recipe.shortGoals]) {
    const parent = branchById.get(item.parentEntityId); if (!parent) throw new Error(`missing semantic parent ${item.parentEntityId}`);
    const branch = collisionFreeCurve(item, parent, branches); branchById.set(item.entityId, branch); branches.push(branch);
  }
  const recentIds = new Set(data.recentActivities.map((item) => item.id));
  const leaves = [...data.allActivities].sort((a, b) => a.id.localeCompare(b.id)).flatMap((activity): SemanticLeaf[] => {
    const parent = branchById.get(activity.goalId); if (!parent) return [];
    const rank = seedFromId(activity.id, "visibility"); const t = .62 + seedFromId(activity.id, "anchor") * .34;
    const { twig, petiole, direction } = leafTwig(activity.id, parent, t);
    return [{ activityId: activity.id, goalId: activity.goalId, twig, petiole, anchor: petiole.controlPoints[3], direction,
      roll: Number(((seedFromId(activity.id, "roll") - .5) * .5).toFixed(4)),
      rotation: v(seedFromId(activity.id, "rx") * .5, seedFromId(activity.id, "ry") * Math.PI * 2, (seedFromId(activity.id, "rz") - .5) * .8),
      scale: Number((.52 + seedFromId(activity.id, "scale") * .2).toFixed(4)), visible: recentIds.has(activity.id) && rank <= recipe.canopy.retention }];
  });
  return { branches, leaves };
}
