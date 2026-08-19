import type { SceneVector } from "./tree-visualization";
import { treeBranchRadiusAt } from "./tree-branch-shape";

export type CollisionBranch = {
  entityId: string;
  parentEntityId: string | null;
  controlPoints: readonly [SceneVector, SceneVector, SceneVector, SceneVector];
  baseRadius: number;
  tipRadius: number;
};

type Sample = {
  point: SceneVector;
  progress: number;
  radius: number;
};

type Segment = {
  start: Sample;
  end: Sample;
};

const subtract = (a: SceneVector, b: SceneVector): SceneVector => ({
  x: a.x - b.x,
  y: a.y - b.y,
  z: a.z - b.z
});
const addScaled = (a: SceneVector, b: SceneVector, scale: number): SceneVector => ({
  x: a.x + b.x * scale,
  y: a.y + b.y * scale,
  z: a.z + b.z * scale
});
const dot = (a: SceneVector, b: SceneVector): number =>
  a.x * b.x + a.y * b.y + a.z * b.z;
const lengthSquared = (value: SceneVector): number => dot(value, value);

function bezierPoint(
  points: CollisionBranch["controlPoints"],
  progress: number
): SceneVector {
  const inverse = 1 - progress;
  const [a, b, c, d] = points;
  return {
    x: inverse ** 3 * a.x + 3 * inverse ** 2 * progress * b.x
      + 3 * inverse * progress ** 2 * c.x + progress ** 3 * d.x,
    y: inverse ** 3 * a.y + 3 * inverse ** 2 * progress * b.y
      + 3 * inverse * progress ** 2 * c.y + progress ** 3 * d.y,
    z: inverse ** 3 * a.z + 3 * inverse ** 2 * progress * b.z
      + 3 * inverse * progress ** 2 * c.z + progress ** 3 * d.z
  };
}

function sampleBranch(branch: CollisionBranch, sampleCount: number): Segment[] {
  const samples = Array.from({ length: sampleCount + 1 }, (_, index): Sample => {
    const progress = index / sampleCount;
    return {
      point: bezierPoint(branch.controlPoints, progress),
      progress,
      radius: treeBranchRadiusAt(branch.baseRadius, branch.tipRadius, progress)
    };
  });
  return samples.slice(0, -1).map((start, index) => ({
    start,
    end: samples[index + 1]!
  }));
}

/** Return the squared shortest distance between two finite 3D segments. */
function segmentDistanceSquared(
  firstStart: SceneVector,
  firstEnd: SceneVector,
  secondStart: SceneVector,
  secondEnd: SceneVector
): number {
  const firstDirection = subtract(firstEnd, firstStart);
  const secondDirection = subtract(secondEnd, secondStart);
  const betweenStarts = subtract(firstStart, secondStart);
  const firstLength = lengthSquared(firstDirection);
  const secondLength = lengthSquared(secondDirection);
  const directionsDot = dot(firstDirection, secondDirection);
  const firstOffset = dot(firstDirection, betweenStarts);
  const secondOffset = dot(secondDirection, betweenStarts);
  const epsilon = 1e-9;
  let firstProgress = 0;
  let secondProgress = 0;

  if (firstLength <= epsilon && secondLength <= epsilon) {
    return lengthSquared(betweenStarts);
  }
  if (firstLength <= epsilon) {
    secondProgress = Math.min(1, Math.max(0, secondOffset / secondLength));
  } else if (secondLength <= epsilon) {
    firstProgress = Math.min(1, Math.max(0, -firstOffset / firstLength));
  } else {
    const denominator = firstLength * secondLength - directionsDot ** 2;
    if (denominator > epsilon) {
      firstProgress = Math.min(1, Math.max(0,
        (directionsDot * secondOffset - firstOffset * secondLength) / denominator
      ));
    }
    secondProgress = (directionsDot * firstProgress + secondOffset) / secondLength;
    if (secondProgress < 0) {
      secondProgress = 0;
      firstProgress = Math.min(1, Math.max(0, -firstOffset / firstLength));
    } else if (secondProgress > 1) {
      secondProgress = 1;
      firstProgress = Math.min(1, Math.max(0,
        (directionsDot - firstOffset) / firstLength
      ));
    }
  }

  const firstClosest = addScaled(firstStart, firstDirection, firstProgress);
  const secondClosest = addScaled(secondStart, secondDirection, secondProgress);
  return lengthSquared(subtract(firstClosest, secondClosest));
}

export function branchesCollide(
  candidate: CollisionBranch,
  obstacle: CollisionBranch,
  options: {
    sampleCount?: number;
    clearance?: number;
  } = {}
): boolean {
  if (candidate.entityId === obstacle.entityId) {
    return false;
  }
  const sampleCount = Math.max(6, Math.round(options.sampleCount ?? 18));
  const clearance = options.clearance ?? 0.025;
  const candidateSegments = sampleBranch(candidate, sampleCount);
  const obstacleSegments = sampleBranch(obstacle, sampleCount);
  const obstacleIsParent = candidate.parentEntityId === obstacle.entityId;
  const sharesParent = candidate.parentEntityId !== null
    && candidate.parentEntityId === obstacle.parentEntityId;
  let hasExitedParent = !obstacleIsParent;

  for (const candidateSegment of candidateSegments) {
    let segmentCollides = false;
    for (const obstacleSegment of obstacleSegments) {
      if (
        sharesParent
        && candidateSegment.end.progress <= .28
        && obstacleSegment.end.progress <= .28
      ) {
        continue;
      }
      const candidateRadius = Math.max(
        candidateSegment.start.radius,
        candidateSegment.end.radius
      );
      const obstacleRadius = Math.max(
        obstacleSegment.start.radius,
        obstacleSegment.end.radius
      );
      const requiredDistance = candidateRadius + obstacleRadius + clearance;
      const distanceSquared = segmentDistanceSquared(
        candidateSegment.start.point,
        candidateSegment.end.point,
        obstacleSegment.start.point,
        obstacleSegment.end.point
      );
      if (distanceSquared < requiredDistance ** 2) {
        segmentCollides = true;
        break;
      }
    }
    if (obstacleIsParent && !hasExitedParent) {
      if (!segmentCollides) {
        hasExitedParent = true;
      }
      continue;
    }
    if (segmentCollides) {
      return true;
    }
  }
  return obstacleIsParent && !hasExitedParent;
}
