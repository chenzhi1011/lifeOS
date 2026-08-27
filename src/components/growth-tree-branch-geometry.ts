import * as THREE from "three";
import { seedFromId } from "@/src/domain/stable-seed";
import type { SceneVector } from "@/src/domain/tree-visualization";
import { treeBranchRadiusAt } from "@/src/domain/tree-branch-shape";

/** controlPoints
    ↓
决定树枝往哪里弯
baseRadius
    ↓
树枝根部粗细
tipRadius
    ↓
树枝末端粗细
longitudinalSegments
    ↓
沿树枝长度方向切多少段
越大越平滑
radialSegments
    ↓
一个截面用多少个点
比如 6 = 六边形感
12 = 更圆
irregularity
    ↓
树枝表面不规则程度
twist
    ↓
截面沿树枝前进时旋转多少 **/
export type NaturalBranchGeometryOptions = {
  entityId: string;
  controlPoints: readonly [SceneVector, SceneVector, SceneVector, SceneVector];
  baseRadius: number;
  tipRadius: number;
  longitudinalSegments: number;
  radialSegments: number;
  irregularity: number;
  twist: number;
};

export type NaturalBranchProfile = {
  ringRadii: number[];
  ringCount: number;
  radialSegments: number;
  baseVertexCount: number;
  tipVertexCount: number;
};

export type UniformCurvedBranchGeometryOptions = {
  controlPoints: readonly [SceneVector, SceneVector, SceneVector, SceneVector];
  radius: number;
  tipRadius?: number;
  taperStart?: number;
  longitudinalSegments: number;
  radialSegments: number;
};

function vector(value: SceneVector): THREE.Vector3 {
  return new THREE.Vector3(value.x, value.y, value.z);
}

function requireFinitePositive(name: string, value: number): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} must be a finite positive number`);
  }
}

function validateProfileOptions(options: NaturalBranchGeometryOptions): void {
  requireFinitePositive("baseRadius", options.baseRadius);
  requireFinitePositive("tipRadius", options.tipRadius);
  for (const name of [
    "longitudinalSegments",
    "radialSegments",
    "irregularity",
    "twist"
  ] as const) {
    if (!Number.isFinite(options[name])) {
      throw new Error(`${name} must be finite`);
    }
  }
}

function validateControlPoints(
  controlPoints: NaturalBranchGeometryOptions["controlPoints"]
): void {
  const valid = controlPoints.every((item) =>
    Number.isFinite(item.x) && Number.isFinite(item.y) && Number.isFinite(item.z)
  );
  if (!valid) {
    throw new Error("controlPoints must contain only finite coordinates");
  }
}

function normalizedCounts(options: NaturalBranchGeometryOptions): {
  ringCount: number;
  radialSegments: number;
} {
  return {
    ringCount: Math.max(2, Math.round(options.longitudinalSegments)),
    radialSegments: Math.max(3, Math.round(options.radialSegments))
  };
}

// 先确定树枝粗细变化
export function getNaturalBranchProfile(
  options: NaturalBranchGeometryOptions
): NaturalBranchProfile {
  validateProfileOptions(options);
  const { ringCount, radialSegments } = normalizedCounts(options);
  const ringRadii = Array.from({ length: ringCount }, (_, index) => {
    const along = index / ringCount;
    return treeBranchRadiusAt(
      options.baseRadius,
      options.tipRadius,
      along
    );
  });

  return {
    ringRadii,
    ringCount,
    radialSegments,
    baseVertexCount: 1,
    tipVertexCount: 1
  };
}

function initialNormal(tangent: THREE.Vector3): THREE.Vector3 {
  const reference = Math.abs(tangent.y) < 0.9
    ? new THREE.Vector3(0, 1, 0)
    : new THREE.Vector3(1, 0, 0);
  return reference
    .sub(tangent.clone().multiplyScalar(reference.dot(tangent)))
    .normalize();
}

function transportNormal(
  previous: THREE.Vector3,
  tangent: THREE.Vector3
): THREE.Vector3 {
  const transported = previous
    .clone()
    .sub(tangent.clone().multiplyScalar(previous.dot(tangent)));
  return transported.lengthSq() > 1e-8
    ? transported.normalize()
    : initialNormal(tangent);
}

/** Constant-radius capped curve for fine twigs and petioles. / 细枝和叶柄专用的等半径封口弯管。 */
export function createUniformCurvedBranchGeometry(
  options: UniformCurvedBranchGeometryOptions
): THREE.BufferGeometry {
  validateControlPoints(options.controlPoints);
  requireFinitePositive("radius", options.radius);
  if (options.tipRadius !== undefined) {
    requireFinitePositive("tipRadius", options.tipRadius);
  }
  const longitudinalSegments = Math.max(1, Math.round(options.longitudinalSegments));
  const radialSegments = Math.max(3, Math.round(options.radialSegments));
  const ringCount = longitudinalSegments + 1;
  const curve = new THREE.CubicBezierCurve3(
    ...options.controlPoints.map(vector) as [THREE.Vector3, THREE.Vector3, THREE.Vector3, THREE.Vector3]
  );
  const positions: number[] = [];
  const indices: number[] = [];
  let normal: THREE.Vector3 | null = null;
  for (let ring = 0; ring < ringCount; ring += 1) {
    const along = ring / longitudinalSegments;
    const center = curve.getPoint(along);
    const tangent = curve.getTangent(along).normalize();
    normal = normal ? transportNormal(normal, tangent) : initialNormal(tangent);
    const binormal = new THREE.Vector3().crossVectors(tangent, normal).normalize();
    const taperStart = options.taperStart ?? .7;
    const taperProgress = Math.max(
      0,
      Math.min(1, (along - taperStart) / (1 - taperStart))
    );
    const smoothTaper = taperProgress * taperProgress * (3 - 2 * taperProgress);
    const radius = options.tipRadius === undefined
      ? options.radius
      : options.radius + (options.tipRadius - options.radius) * smoothTaper;
    for (let side = 0; side < radialSegments; side += 1) {
      const angle = side / radialSegments * Math.PI * 2;
      const position = center.clone()
        .addScaledVector(normal, Math.cos(angle) * radius)
        .addScaledVector(binormal, Math.sin(angle) * radius);
      positions.push(position.x, position.y, position.z);
    }
  }
  for (let ring = 0; ring < ringCount - 1; ring += 1) {
    const current = ring * radialSegments;
    const next = (ring + 1) * radialSegments;
    for (let side = 0; side < radialSegments; side += 1) {
      const following = (side + 1) % radialSegments;
      indices.push(current + side, next + following, next + side, current + side, current + following, next + following);
    }
  }
  const baseCenter = positions.length / 3;
  const base = curve.getPoint(0);
  positions.push(base.x, base.y, base.z);
  for (let side = 0; side < radialSegments; side += 1) indices.push(baseCenter, (side + 1) % radialSegments, side);
  const tipCenter = positions.length / 3;
  const tip = curve.getPoint(1);
  positions.push(tip.x, tip.y, tip.z);
  const lastRing = (ringCount - 1) * radialSegments;
  for (let side = 0; side < radialSegments; side += 1) indices.push(lastRing + side, lastRing + (side + 1) % radialSegments, tipCenter);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

/**
 * Sweep irregular rings along a curved branch path.
 * 沿弯曲路径扫掠不规则截面环，生成连续渐细的自然枝干。
 */
export function createNaturalBranchGeometry(
  options: NaturalBranchGeometryOptions
): THREE.BufferGeometry {
  validateControlPoints(options.controlPoints);
  const profile = getNaturalBranchProfile(options);
  const curve = new THREE.CubicBezierCurve3(
    ...options.controlPoints.map(vector) as [
      THREE.Vector3,
      THREE.Vector3,
      THREE.Vector3,
      THREE.Vector3
    ]
  );
  const positions: number[] = [];
  const indices: number[] = [];
  let normal: THREE.Vector3 | null = null;

  for (let ring = 0; ring < profile.ringCount; ring += 1) {
    const along = ring / profile.ringCount;
    const center = curve.getPoint(along);
    const tangent = curve.getTangent(along).normalize();
    normal = normal
      ? transportNormal(normal, tangent)
      : initialNormal(tangent);
    const binormal = new THREE.Vector3().crossVectors(tangent, normal).normalize();

    for (let side = 0; side < profile.radialSegments; side += 1) {
      const angle = side / profile.radialSegments * Math.PI * 2
        + options.twist * along;
      const noise = seedFromId(
        options.entityId,
        `branch-ring-${ring}-side-${side}`
      );
      const radius = profile.ringRadii[ring]!
        * (1 + (noise * 2 - 1) * options.irregularity);
      const offset = normal.clone().multiplyScalar(Math.cos(angle) * radius)
        .add(binormal.clone().multiplyScalar(Math.sin(angle) * radius));
      const position = center.clone().add(offset);
      positions.push(position.x, position.y, position.z);
    }
  }

  for (let ring = 0; ring < profile.ringCount - 1; ring += 1) {
    const current = ring * profile.radialSegments;
    const next = (ring + 1) * profile.radialSegments;
    for (let side = 0; side < profile.radialSegments; side += 1) {
      const following = (side + 1) % profile.radialSegments;
      indices.push(
        current + side,
        next + following,
        next + side,
        current + side,
        current + following,
        next + following
      );
    }
  }

  const baseCenterIndex = positions.length / 3;
  const base = curve.getPoint(0);
  positions.push(base.x, base.y, base.z);
  for (let side = 0; side < profile.radialSegments; side += 1) {
    indices.push(
      baseCenterIndex,
      (side + 1) % profile.radialSegments,
      side
    );
  }

  const tipIndex = positions.length / 3;
  const tip = curve.getPoint(1);
  positions.push(tip.x, tip.y, tip.z);
  const lastRingStart = (profile.ringCount - 1) * profile.radialSegments;
  for (let side = 0; side < profile.radialSegments; side += 1) {
    indices.push(
      lastRingStart + side,
      lastRingStart + (side + 1) % profile.radialSegments,
      tipIndex
    );
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3)
  );
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}
