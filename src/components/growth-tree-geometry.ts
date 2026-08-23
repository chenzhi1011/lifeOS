import * as THREE from "three";
import type {
  GrowthTreeLeaf,
  GrowthTreeWoodSegment,
  SceneVector
} from "@/src/domain/tree-visualization";

function toVector3(vector: SceneVector): THREE.Vector3 {
  return new THREE.Vector3(vector.x, vector.y, vector.z);
}

function woodColors(segment: GrowthTreeWoodSegment): {
  base: number;
  hover: number;
  selected: number;
} {
  if (segment.entityType === "long_goal" && segment.status === "completed") {
    return { base: 0x705c49, hover: 0x705c49, selected: 0x91765c };
  }
  if (segment.status === "paused") {
    return { base: 0x665f59, hover: 0x7a7169, selected: 0x94877b };
  }
  if (segment.entityType === "root") {
    return { base: 0xaa805c, hover: 0xc09269, selected: 0xd1a06c };
  }
  return { base: 0x9b704c, hover: 0xb7875d, selected: 0xd1a06c };
}

export function createWoodSegmentMesh(
  segment: GrowthTreeWoodSegment
): THREE.Mesh<THREE.CylinderGeometry, THREE.MeshLambertMaterial> {
  const start = toVector3(segment.start);
  const end = toVector3(segment.end);
  const direction = end.clone().sub(start);
  const length = direction.length();
  const colors = woodColors(segment);
  const material = new THREE.MeshLambertMaterial({ color: colors.base });
  material.userData.baseColor = colors.base;
  material.userData.hoverColor = colors.hover;
  material.userData.selectedColor = colors.selected;
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
  mesh.userData.leafId = null;
  mesh.userData.goalId =
    segment.entityType === "long_goal" || segment.entityType === "short_goal"
      ? segment.entityId
      : null;
  mesh.userData.baseColor = colors.base;

  return mesh;
}

export function createActivityLeafMesh(
  leaf: GrowthTreeLeaf
): THREE.Mesh<THREE.ShapeGeometry, THREE.MeshLambertMaterial> {
  const shape = new THREE.Shape();
  shape.moveTo(0, -0.22);
  shape.bezierCurveTo(0.22, -0.12, 0.24, 0.14, 0, 0.3);
  shape.bezierCurveTo(-0.24, 0.14, -0.22, -0.12, 0, -0.22);

  const material = new THREE.MeshLambertMaterial({
    color: 0x68b947,
    side: THREE.DoubleSide
  });
  material.userData.baseColor = 0x68b947;
  material.userData.hoverColor = 0x7dcc51;
  material.userData.selectedColor = 0xb8ef75;
  material.userData.relatedColor = 0x7dcc51;
  const mesh = new THREE.Mesh(new THREE.ShapeGeometry(shape, 8), material);

  mesh.position.set(leaf.position.x, leaf.position.y, leaf.position.z);
  mesh.rotation.set(leaf.rotation.x, leaf.rotation.y, leaf.rotation.z);
  mesh.scale.setScalar(leaf.scale);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.name = `activity-leaf-${leaf.activityId}`;
  mesh.userData.entityType = "activity";
  mesh.userData.entityId = leaf.activityId;
  mesh.userData.goalId = leaf.goalId;
  mesh.userData.leafId = leaf.activityId;
  mesh.userData.baseColor = 0x68b947;

  return mesh;
}
