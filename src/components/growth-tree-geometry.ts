import * as THREE from "three";
import type {
  GrowthTreeLeaf,
  GrowthTreeWoodSegment,
  SceneVector
} from "@/src/domain/tree-visualization";

function toVector3(vector: SceneVector): THREE.Vector3 {
  return new THREE.Vector3(vector.x, vector.y, vector.z);
}

export function createWoodSegmentMesh(
  segment: GrowthTreeWoodSegment
): THREE.Mesh<THREE.CylinderGeometry, THREE.MeshStandardMaterial> {
  const start = toVector3(segment.start);
  const end = toVector3(segment.end);
  const direction = end.clone().sub(start);
  const length = direction.length();
  const color = segment.entityType === "root" ? 0xaa805c : 0x9b704c;
  const material = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.88,
    metalness: 0
  });
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(
      segment.thickness * 0.72,
      segment.thickness,
      length,
      12
    ),
    material
  );

  mesh.position.copy(start.clone().add(end).multiplyScalar(0.5));
  mesh.quaternion.setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    direction.normalize()
  );
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.name = `${segment.entityType}-wood-${segment.entityId}`;
  mesh.userData.entityType = segment.entityType;
  mesh.userData.entityId = segment.entityId;
  mesh.userData.goalId =
    segment.entityType === "long_goal" || segment.entityType === "short_goal"
      ? segment.entityId
      : null;
  mesh.userData.baseColor = color;

  return mesh;
}

export function createActivityLeafMesh(
  leaf: GrowthTreeLeaf
): THREE.Mesh<THREE.ShapeGeometry, THREE.MeshStandardMaterial> {
  const shape = new THREE.Shape();
  shape.moveTo(0, -0.22);
  shape.bezierCurveTo(0.22, -0.12, 0.24, 0.14, 0, 0.3);
  shape.bezierCurveTo(-0.24, 0.14, -0.22, -0.12, 0, -0.22);

  const material = new THREE.MeshStandardMaterial({
    color: 0x68b947,
    roughness: 0.72,
    metalness: 0,
    side: THREE.DoubleSide
  });
  const mesh = new THREE.Mesh(new THREE.ShapeGeometry(shape, 8), material);

  mesh.position.set(leaf.position.x, leaf.position.y, leaf.position.z);
  mesh.rotation.set(leaf.rotation.x, leaf.rotation.y, leaf.rotation.z);
  mesh.scale.setScalar(leaf.scale);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.name = `activity-leaf-${leaf.activityId}`;
  mesh.userData.goalId = leaf.goalId;
  mesh.userData.leafId = leaf.activityId;
  mesh.userData.baseColor = 0x68b947;

  return mesh;
}
