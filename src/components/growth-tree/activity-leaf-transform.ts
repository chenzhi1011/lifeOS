import * as THREE from "three";
import type { SemanticLeaf } from "@/src/domain/semantic-tree-skeleton";

export const ACTIVITY_LEAF_SURFACE_SECTIONS = [
  { distance: 0, halfWidth: 0, height: 0 },
  { distance: .08, halfWidth: .09, height: .006 },
  { distance: .18, halfWidth: .145, height: .014 },
  { distance: .28, halfWidth: .1, height: .004 },
  { distance: .36, halfWidth: 0, height: -.045 }
] as const;

function vector(value: { x: number; y: number; z: number }): THREE.Vector3 {
  return new THREE.Vector3(value.x, value.y, value.z);
}

export function activityLeafMatrix(leaf: SemanticLeaf): THREE.Matrix4 {
  const longAxis = vector(leaf.direction).normalize();
  const normalAxis = vector(leaf.normal).normalize();
  const widthAxis = new THREE.Vector3()
    .crossVectors(longAxis, normalAxis)
    .normalize();
  normalAxis.crossVectors(widthAxis, longAxis).normalize();
  const basis = new THREE.Matrix4().makeBasis(widthAxis, longAxis, normalAxis);
  const transform = new THREE.Object3D();
  transform.position.copy(vector(leaf.anchor));
  transform.quaternion.setFromRotationMatrix(basis);
  transform.rotateY(leaf.roll);
  transform.scale.setScalar(leaf.scale);
  transform.updateMatrix();
  return transform.matrix.clone();
}

function surfaceSample(distance: number): { height: number; slope: number } {
  const clamped = THREE.MathUtils.clamp(distance, 0, .36);
  for (let index = 0; index < ACTIVITY_LEAF_SURFACE_SECTIONS.length - 1; index += 1) {
    const start = ACTIVITY_LEAF_SURFACE_SECTIONS[index]!;
    const end = ACTIVITY_LEAF_SURFACE_SECTIONS[index + 1]!;
    if (clamped <= end.distance) {
      const span = end.distance - start.distance;
      const progress = span === 0 ? 0 : (clamped - start.distance) / span;
      return {
        height: THREE.MathUtils.lerp(start.height, end.height, progress),
        slope: span === 0 ? 0 : (end.height - start.height) / span
      };
    }
  }
  return { height: -.045, slope: 0 };
}

export function activityLeafSurfaceFrame(
  leaf: SemanticLeaf,
  distance: number
): { position: THREE.Vector3; normal: THREE.Vector3 } {
  const sample = surfaceSample(distance);
  const matrix = activityLeafMatrix(leaf);
  const position = new THREE.Vector3(0, distance, sample.height)
    .applyMatrix4(matrix);
  const normalMatrix = new THREE.Matrix3().getNormalMatrix(matrix);
  const normal = new THREE.Vector3(0, -sample.slope, 1)
    .applyMatrix3(normalMatrix)
    .normalize();
  return { position, normal };
}
