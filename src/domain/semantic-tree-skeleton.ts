import type { DashboardData } from "./aggregation";
import { seedFromId } from "./stable-seed";
import type { TreeRecipe, BranchRecipe } from "./tree-recipe";
import type { SceneVector } from "./tree-visualization";
import { treeBranchRadiusAt } from "./tree-branch-shape";
import { branchesCollide } from "./tree-branch-collision";

export type SemanticBranch = { entityType: "root" | "life_area" | "long_goal" | "short_goal"; entityId: string; parentEntityId: string | null; controlPoints: readonly [SceneVector, SceneVector, SceneVector, SceneVector]; baseRadius: number; tipRadius: number; radialSegments: number };
export type LeafTwig = { id: string; parentEntityId: string; controlPoints: readonly [SceneVector, SceneVector, SceneVector, SceneVector]; baseRadius: number; tipRadius: number; attachmentProgress?: number; directionSector?: 0 | 1 | 2 | 3 };
export const CANOPY_TWIG_RADIUS = .014;
export const LEAF_PETIOLE_RADIUS = .004;
export const MIN_ACTIVITY_LEAVES_PER_TWIG = 5;
export const MAX_ACTIVITY_LEAVES_PER_TWIG = 20;
export function activityLeafProgresses(lateralLeafCount: number): number[] {
  if (lateralLeafCount <= 0) return [];
  const spacing = (.95 - .2) / lateralLeafCount;
  return Array.from({ length: lateralLeafCount }, (_, index) =>
    Number((.2 + spacing * (index + 1)).toFixed(4))
  );
}
export type SemanticLeaf = { activityId: string; goalId: string; twigId: string; side: -1 | 0 | 1; terminal: boolean; twigProgress: number; petiole: LeafTwig; midrib: LeafTwig; anchor: SceneVector; direction: SceneVector; twigTangent: SceneVector; normal: SceneVector; roll: number; rotation: SceneVector; scale: number; visible: boolean };
export type SemanticTreeSkeleton = { branches: SemanticBranch[]; leafTwigs: LeafTwig[]; leaves: SemanticLeaf[] };
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

function cross(left: SceneVector, right: SceneVector): SceneVector {
  return v(
    left.y * right.z - left.z * right.y,
    left.z * right.x - left.x * right.z,
    left.x * right.y - left.y * right.x
  );
}

function limitTwigVerticalDirection(direction: SceneVector): SceneVector {
  const unit = normalized(direction);
  const minimumY = -Math.sin(Math.PI / 9);
  const maximumY = Math.sin(Math.PI / 3);
  const limitedY = Math.min(maximumY, Math.max(minimumY, unit.y));
  if (limitedY === unit.y) return unit;
  const horizontalLength = Math.hypot(unit.x, unit.z);
  const targetHorizontalLength = Math.sqrt(1 - limitedY ** 2);
  if (horizontalLength < .0001) {
    return v(targetHorizontalLength, limitedY, 0);
  }
  return v(
    unit.x / horizontalLength * targetHorizontalLength,
    limitedY,
    unit.z / horizontalLength * targetHorizontalLength
  );
}

function goalLeafTwig(
  parent: SemanticBranch,
  twigIndex: number,
  twigCount: number,
  leafCount: number,
  previousProgress: number | null
): LeafTwig {
  const minimumProgress = .25;
  const maximumProgress = .9;
  const stratumSize = (maximumProgress - minimumProgress) / twigCount;
  const stratumStart = minimumProgress + twigIndex * stratumSize;
  const stratumEnd = stratumStart + stratumSize;
  const twigId = `goal-leaf-twig-${parent.entityId}-${twigIndex}`;
  const randomOffset = .2 + seedFromId(twigId, "progress") * .6;
  const candidate = stratumStart + stratumSize * randomOffset;
  const minimumGap = Math.min(.12, stratumSize * .9);
  const progress = Number(Math.min(
    stratumEnd - .0001,
    previousProgress === null
      ? candidate
      : Math.max(candidate, previousProgress + minimumGap)
  ).toFixed(4));
  const start = bezier(parent.controlPoints, progress);
  const before = bezier(parent.controlPoints, Math.max(0, progress - .035));
  const tangent = normalized(v(
    start.x - before.x,
    start.y - before.y,
    start.z - before.z
  ));
  let sideAxis = cross(tangent, v(0, 1, 0));
  if (Math.hypot(sideAxis.x, sideAxis.y, sideAxis.z) < .0001) {
    sideAxis = v(1, 0, 0);
  }
  sideAxis = normalized(sideAxis);
  const verticalAxis = normalized(cross(sideAxis, tangent));
  const directionSector = (twigIndex % 4) as 0 | 1 | 2 | 3;
  const angle = directionSector * Math.PI / 2
    + (seedFromId(twigId, "direction-jitter") - .5) * Math.PI * 24 / 180;
  const outward = limitTwigVerticalDirection(v(
    sideAxis.x * Math.cos(angle) + verticalAxis.x * Math.sin(angle) + tangent.x * .18,
    Math.max(.08, sideAxis.y * Math.cos(angle) + verticalAxis.y * Math.sin(angle) + tangent.y * .18),
    sideAxis.z * Math.cos(angle) + verticalAxis.z * Math.sin(angle) + tangent.z * .18
  ));
  const fullLength = .56 + seedFromId(twigId, "length") * .16;
  const occupancy = Math.min(1, leafCount / MAX_ACTIVITY_LEAVES_PER_TWIG);
  const length = fullLength * (.35 + occupancy * .65);
  const end = v(
    start.x + outward.x * length,
    start.y + outward.y * length,
    start.z + outward.z * length
  );
  const twig: LeafTwig = {
    id: twigId,
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
    tipRadius: CANOPY_TWIG_RADIUS * .4,
    attachmentProgress: progress,
    directionSector
  };
  return twig;
}

function groupActivitiesForTwigs<T>(goalId: string, activities: T[]): T[][] {
  const groups: T[][] = [];
  let offset = 0;
  let twigIndex = 0;
  while (offset < activities.length) {
    const capacity = MIN_ACTIVITY_LEAVES_PER_TWIG + Math.floor(
      seedFromId(`${twigIndex}:${goalId}`, "twig-capacity")
        * (MAX_ACTIVITY_LEAVES_PER_TWIG - MIN_ACTIVITY_LEAVES_PER_TWIG + 1)
    );
    groups.push(activities.slice(offset, offset + capacity));
    offset += capacity;
    twigIndex += 1;
  }
  const remainder = groups.at(-1);
  if (
    groups.length > 1
    && remainder
    && remainder.length < MIN_ACTIVITY_LEAVES_PER_TWIG
  ) {
    const previous = groups.at(-2)!;
    const combined = [...previous, ...remainder];
    groups.splice(-2, 2);
    if (combined.length <= MAX_ACTIVITY_LEAVES_PER_TWIG) {
      groups.push(combined);
    } else {
      groups.push(
        combined.slice(0, combined.length - MIN_ACTIVITY_LEAVES_PER_TWIG),
        combined.slice(-MIN_ACTIVITY_LEAVES_PER_TWIG)
      );
    }
  }
  return groups;
}

function activityLeafOnTwig(
  activityId: string,
  goalId: string,
  twig: LeafTwig,
  progress: number,
  side: -1 | 0 | 1,
  terminal: boolean,
  visible: boolean
): SemanticLeaf {
  const attachment = bezier(twig.controlPoints, progress);
  const before = bezier(twig.controlPoints, Math.max(0, progress - .025));
  const after = bezier(twig.controlPoints, Math.min(1, progress + .025));
  const tangent = normalized(v(
    after.x - before.x,
    after.y - before.y,
    after.z - before.z
  ));
  let sideAxis = cross(tangent, v(0, 1, 0));
  if (Math.hypot(sideAxis.x, sideAxis.y, sideAxis.z) < .0001) {
    sideAxis = v(1, 0, 0);
  }
  sideAxis = normalized(sideAxis);
  const leafAngle = (terminal
    ? seedFromId(activityId, "terminal-leaf-angle") * 8
    : 30 + seedFromId(activityId, "leaf-angle") * 10) * Math.PI / 180;
  const directionSide = terminal
    ? (seedFromId(activityId, "terminal-leaf-side") < .5 ? -1 : 1)
    : side;
  const leafDirection = normalized(v(
    tangent.x * Math.cos(leafAngle) + sideAxis.x * directionSide * Math.sin(leafAngle),
    tangent.y * Math.cos(leafAngle) + sideAxis.y * directionSide * Math.sin(leafAngle),
    tangent.z * Math.cos(leafAngle) + sideAxis.z * directionSide * Math.sin(leafAngle)
  ));
  const leafNormal = normalized(v(
    -leafDirection.x * leafDirection.y,
    1 - leafDirection.y * leafDirection.y,
    -leafDirection.z * leafDirection.y
  ));
  const petioleLength = .022 + seedFromId(activityId, "petiole-length") * .013;
  const petioleEnd = v(
    attachment.x + leafDirection.x * petioleLength,
    attachment.y + leafDirection.y * petioleLength,
    attachment.z + leafDirection.z * petioleLength
  );
  const petiole: LeafTwig = {
    id: `activity-petiole-${activityId}`,
    parentEntityId: twig.id,
    controlPoints: [
      attachment,
      v(
        attachment.x + leafDirection.x * petioleLength * .33,
        attachment.y + leafDirection.y * petioleLength * .33,
        attachment.z + leafDirection.z * petioleLength * .33
      ),
      v(
        attachment.x + leafDirection.x * petioleLength * .67,
        attachment.y + leafDirection.y * petioleLength * .67,
        attachment.z + leafDirection.z * petioleLength * .67
      ),
      petioleEnd
    ],
    baseRadius: LEAF_PETIOLE_RADIUS,
    tipRadius: LEAF_PETIOLE_RADIUS
  };
  const scale = Number((.52 + seedFromId(activityId, "scale") * .2).toFixed(4));
  const midribLength = .36 * scale * .72;
  const tipDroop = .025 + seedFromId(activityId, "tip-droop") * .018;
  const midrib: LeafTwig = {
    id: `activity-midrib-${activityId}`,
    parentEntityId: petiole.id,
    controlPoints: [
      petioleEnd,
      v(
        petioleEnd.x + leafDirection.x * midribLength * .34 + leafNormal.x * .008,
        petioleEnd.y + leafDirection.y * midribLength * .34 + leafNormal.y * .008,
        petioleEnd.z + leafDirection.z * midribLength * .34 + leafNormal.z * .008
      ),
      v(
        petioleEnd.x + leafDirection.x * midribLength * .7 + leafNormal.x * .005,
        petioleEnd.y + leafDirection.y * midribLength * .7 + leafNormal.y * .005,
        petioleEnd.z + leafDirection.z * midribLength * .7 + leafNormal.z * .005
      ),
      v(
        petioleEnd.x + leafDirection.x * midribLength - leafNormal.x * tipDroop,
        petioleEnd.y + leafDirection.y * midribLength - leafNormal.y * tipDroop,
        petioleEnd.z + leafDirection.z * midribLength - leafNormal.z * tipDroop
      )
    ],
    baseRadius: LEAF_PETIOLE_RADIUS * .72,
    tipRadius: LEAF_PETIOLE_RADIUS * .42
  };
  return {
    activityId,
    goalId,
    twigId: twig.id,
    side,
    terminal,
    twigProgress: Number(progress.toFixed(4)),
    petiole,
    midrib,
    anchor: petioleEnd,
    direction: leafDirection,
    twigTangent: tangent,
    normal: leafNormal,
    roll: Number(((seedFromId(activityId, "roll") - .5) * .42).toFixed(4)),
    rotation: v(
      seedFromId(activityId, "rx") * .5,
      seedFromId(activityId, "ry") * Math.PI * 2,
      (seedFromId(activityId, "rz") - .5) * .8
    ),
    scale,
    visible
  };
}

type CurveAdjustment = {
  azimuthDelta: number;
  elevationDelta: number;
  lengthScale: number;
};

function goalBranchDirection(
  recipe: BranchRecipe,
  parent: SemanticBranch,
  adjustment: CurveAdjustment
): SceneVector {
  const before = bezier(parent.controlPoints, Math.max(0, recipe.start - .035));
  const after = bezier(parent.controlPoints, Math.min(1, recipe.start + .035));
  const tangent = normalized(v(
    after.x - before.x,
    after.y - before.y,
    after.z - before.z
  ));
  let radialAxis = cross(tangent, v(0, 1, 0));
  if (Math.hypot(radialAxis.x, radialAxis.y, radialAxis.z) < .0001) {
    radialAxis = v(1, 0, 0);
  }
  radialAxis = normalized(radialAxis);
  const aroundAxis = normalized(cross(radialAxis, tangent));
  const azimuth = (recipe.azimuth + adjustment.azimuthDelta) * Math.PI / 180;
  const departure = (recipe.elevation + adjustment.elevationDelta) * Math.PI / 180;
  const radial = v(
    radialAxis.x * Math.cos(azimuth) + aroundAxis.x * Math.sin(azimuth),
    radialAxis.y * Math.cos(azimuth) + aroundAxis.y * Math.sin(azimuth),
    radialAxis.z * Math.cos(azimuth) + aroundAxis.z * Math.sin(azimuth)
  );
  const direction = v(
    tangent.x * Math.cos(departure) + radial.x * Math.sin(departure),
    tangent.y * Math.cos(departure) + radial.y * Math.sin(departure) + .1,
    tangent.z * Math.cos(departure) + radial.z * Math.sin(departure)
  );
  if (direction.y < .08) direction.y = .08;
  return normalized(direction);
}

function curve(
  recipe: BranchRecipe,
  start: SceneVector,
  parent: SemanticBranch,
  adjustment: CurveAdjustment
): SemanticBranch {
  const azimuth = (recipe.azimuth + adjustment.azimuthDelta) * Math.PI / 180;
  const elevation = (recipe.elevation + adjustment.elevationDelta) * Math.PI / 180;
  const length = recipe.length * adjustment.lengthScale;
  const isGoalBranch = recipe.entityType !== "life_area";
  const direction = isGoalBranch
    ? goalBranchDirection(recipe, parent, adjustment)
    : normalized(v(
        Math.cos(azimuth) * Math.cos(elevation),
        Math.sin(elevation),
        Math.sin(azimuth) * Math.cos(elevation)
      ));
  const end = isGoalBranch
    ? v(
        start.x + direction.x * length,
        start.y + direction.y * length,
        start.z + direction.z * length
      )
    : v(
        start.x + direction.x * length,
        start.y + direction.y * length + .25,
        start.z + direction.z * length
      );
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
  const bendAxis = isGoalBranch
    ? normalized(cross(direction, v(0, 1, 0)))
    : v(1, 0, 0);
  return { entityType: recipe.entityType, entityId: recipe.entityId, parentEntityId: recipe.parentEntityId,
    controlPoints: isGoalBranch
      ? [
          start,
          v(
            start.x + direction.x * length * .25 + bendAxis.x * bend,
            start.y + direction.y * length * .25 + bendAxis.y * bend,
            start.z + direction.z * length * .25 + bendAxis.z * bend
          ),
          v(
            end.x - direction.x * length * .28 - bendAxis.x * bend,
            end.y - direction.y * length * .28 - bendAxis.y * bend,
            end.z - direction.z * length * .28 - bendAxis.z * bend
          ),
          end
        ]
      : [
          start,
          v(start.x + direction.x * length * .25 + bend, start.y + length * .28, start.z + direction.z * length * .25),
          v(end.x - direction.x * length * .28 - bend, end.y - length * .2, end.z - direction.z * length * .28),
          end
        ],
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
  const leafTwigs: LeafTwig[] = [];
  const leaves: SemanticLeaf[] = [];
  const activitiesByGoal = new Map<string, typeof data.allActivities>();
  for (const activity of [...data.allActivities].sort((left, right) =>
    left.occurredOn.localeCompare(right.occurredOn)
    || left.createdAt.localeCompare(right.createdAt)
    || left.id.localeCompare(right.id)
  )) {
    const grouped = activitiesByGoal.get(activity.goalId) ?? [];
    grouped.push(activity);
    activitiesByGoal.set(activity.goalId, grouped);
  }
  for (const [goalId, activities] of activitiesByGoal) {
    const parent = branchById.get(goalId);
    if (!parent) continue;
    const groups = groupActivitiesForTwigs(goalId, activities);
    let previousProgress: number | null = null;
    groups.forEach((group, twigIndex) => {
      const twig = goalLeafTwig(
        parent,
        twigIndex,
        groups.length,
        group.length,
        previousProgress
      );
      previousProgress = twig.attachmentProgress!;
      leafTwigs.push(twig);
      const visibleActivityIds = new Set(group
        .filter((activity) => recentIds.has(activity.id)
          && seedFromId(activity.id, "visibility") <= recipe.canopy.retention)
        .map((activity) => activity.id));
      const visibleActivities = group.filter((activity) =>
        visibleActivityIds.has(activity.id)
      );
      const terminalActivityId = visibleActivities.at(-1)?.id ?? group.at(-1)!.id;
      const visibleLateralIds = visibleActivities
        .filter((activity) => activity.id !== terminalActivityId)
        .map((activity) => activity.id);
      const lateralProgresses = activityLeafProgresses(visibleLateralIds.length);
      const lateralIndexById = new Map(
        visibleLateralIds.map((id, index) => [id, index])
      );
      group.forEach((activity) => {
        const visible = visibleActivityIds.has(activity.id);
        const terminal = activity.id === terminalActivityId;
        const lateralIndex = lateralIndexById.get(activity.id);
        const progress = terminal
          ? 1
          : lateralIndex === undefined
            ? .2
            : lateralProgresses[lateralIndex]!;
        const side: -1 | 0 | 1 = terminal
          ? 0
          : lateralIndex === undefined
            ? -1
            : lateralIndex % 2 === 0 ? -1 : 1;
        leaves.push(activityLeafOnTwig(
          activity.id,
          activity.goalId,
          twig,
          progress,
          side,
          terminal,
          visible
        ));
      });
    });
  }
  return { branches, leafTwigs, leaves };
}
