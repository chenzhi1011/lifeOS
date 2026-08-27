import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { type SemanticBranch, type SemanticLeaf, type LeafTwig } from "@/src/domain/semantic-tree-skeleton";
import { HEALING_PALETTE } from "@/src/theme/healing-palette";
import { createNaturalBranchGeometry, createUniformCurvedBranchGeometry } from "./growth-tree-branch-geometry";

const point = (v: {x:number;y:number;z:number}) => new THREE.Vector3(v.x,v.y,v.z);

// Geometry detail by semantic level / 按语义层级设置几何细节：主干最厚重，细枝最轻巧。
const BRANCH_GEOMETRY_PROFILE = {
  root: { longitudinalSegments: 30, radialSegments: 12, irregularity: .045, twist: .16 },
  life_area: { longitudinalSegments: 18, radialSegments: 9, irregularity: .065, twist: .24 },
  long_goal: { longitudinalSegments: 12, radialSegments: 7, irregularity: .08, twist: .3 },
  short_goal: { longitudinalSegments: 12, radialSegments: 7, irregularity: .08, twist: .3 }
} as const;

export function createSemanticBranchMesh(branch: SemanticBranch) {
  const profile = BRANCH_GEOMETRY_PROFILE[branch.entityType];
  // Build a tapered swept mesh instead of a fixed-radius tube.
  // 使用连续渐细的扫掠网格，避免“弯曲圆柱”和裸露断面。
  const geometry = createNaturalBranchGeometry({
    entityId: branch.entityId,
    controlPoints: branch.controlPoints,
    baseRadius: branch.baseRadius,
    tipRadius: branch.tipRadius,
    ...profile
  });
  const material=new THREE.MeshLambertMaterial({color:HEALING_PALETTE.trunk});
  const base=material.color;
  material.userData={baseColor:base.getHex(),hoverColor:new THREE.Color(HEALING_PALETTE.trunkHover).getHex(),selectedColor:new THREE.Color(HEALING_PALETTE.trunkSelected).getHex()};
  const mesh=new THREE.Mesh(geometry,material); mesh.userData={entityType:branch.entityType,entityId:branch.entityId,goalId:branch.entityType.includes("goal")?branch.entityId:null,leafId:null}; mesh.castShadow=true; return mesh;
}
export function createSemanticLeafMesh(leaf: SemanticLeaf){ const shape=new THREE.Shape(); shape.moveTo(0,-.16); shape.quadraticCurveTo(.22,.05,0,.28); shape.quadraticCurveTo(-.22,.05,0,-.16);
  const material=new THREE.MeshLambertMaterial({color:HEALING_PALETTE.youngLeaf,side:THREE.DoubleSide}); material.userData={baseColor:new THREE.Color(HEALING_PALETTE.youngLeaf).getHex(),hoverColor:new THREE.Color(HEALING_PALETTE.matureLeaf).getHex(),selectedColor:new THREE.Color(HEALING_PALETTE.youngLeaf).getHex(),relatedColor:new THREE.Color(HEALING_PALETTE.matureLeaf).getHex()};
  const mesh=new THREE.Mesh(new THREE.ShapeGeometry(shape,6),material); mesh.position.copy(point(leaf.anchor)); mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),point(leaf.direction).normalize()); mesh.rotateY(leaf.roll); mesh.scale.setScalar(leaf.scale); mesh.userData={entityType:"activity",entityId:leaf.activityId,goalId:leaf.goalId,leafId:leaf.activityId}; return mesh; }

export function createActivityLeafGeometry(): THREE.BufferGeometry {
  const sections = [
    { distance: 0, halfWidth: 0, height: 0 },
    { distance: .08, halfWidth: .09, height: .006 },
    { distance: .18, halfWidth: .145, height: .014 },
    { distance: .28, halfWidth: .1, height: .004 },
    { distance: .36, halfWidth: 0, height: -.045 }
  ];
  const positions = sections.flatMap((section) => [
    -section.halfWidth, section.distance, section.height,
    section.halfWidth, section.distance, section.height
  ]);
  const indices: number[] = [];
  for (let index = 0; index < sections.length - 1; index += 1) {
    const left = index * 2;
    const right = left + 1;
    const nextLeft = left + 2;
    const nextRight = left + 3;
    indices.push(left, right, nextRight, left, nextRight, nextLeft);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

export function createActivityLeafInstances(
  leaves: SemanticLeaf[]
): THREE.InstancedMesh<THREE.BufferGeometry, THREE.MeshLambertMaterial> {
  const geometry = createActivityLeafGeometry();
  const material = new THREE.MeshLambertMaterial({
    color: HEALING_PALETTE.youngLeaf,
    side: THREE.DoubleSide,
    vertexColors: false
  });
  material.userData = {
    baseColor: new THREE.Color(HEALING_PALETTE.youngLeaf).getHex(),
    hoverColor: new THREE.Color(HEALING_PALETTE.matureLeaf).getHex(),
    selectedColor: new THREE.Color(HEALING_PALETTE.youngLeaf).getHex(),
    relatedColor: new THREE.Color(HEALING_PALETTE.matureLeaf).getHex()
  };
  const mesh = new THREE.InstancedMesh(geometry, material, leaves.length);
  mesh.name = "activity-leaf-instances";
  const transform = new THREE.Object3D();
  const baseColor = new THREE.Color(HEALING_PALETTE.youngLeaf);
  leaves.forEach((leaf, index) => {
    transform.position.copy(point(leaf.anchor));
    const longAxis = point(leaf.direction).normalize();
    const normalAxis = point(leaf.normal).normalize();
    const widthAxis = new THREE.Vector3()
      .crossVectors(longAxis, normalAxis)
      .normalize();
    normalAxis.crossVectors(widthAxis, longAxis).normalize();
    const basis = new THREE.Matrix4().makeBasis(
      widthAxis,
      longAxis,
      normalAxis
    );
    transform.quaternion.setFromRotationMatrix(basis);
    transform.rotateY(leaf.roll);
    transform.scale.setScalar(leaf.scale);
    transform.updateMatrix();
    mesh.setMatrixAt(index, transform.matrix);
    mesh.setColorAt(index, baseColor);
  });
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.castShadow = true;
  return mesh;
}

function twigGeometry(twig: LeafTwig): THREE.BufferGeometry {
  const isGoalLeafTwig = twig.attachmentProgress !== undefined;
  return createUniformCurvedBranchGeometry({
    controlPoints: twig.controlPoints,
    radius: twig.baseRadius,
    tipRadius: twig.tipRadius,
    taperStart: isGoalLeafTwig ? .95 : undefined,
    longitudinalSegments: isGoalLeafTwig ? 20 : 5,
    radialSegments: 5
  });
}

export function createActivityLeafTwigBatch(
  twigs: LeafTwig[],
  leaves: SemanticLeaf[]
): THREE.Mesh<THREE.BufferGeometry, THREE.MeshLambertMaterial> {
  const parts = [
    ...twigs.map(twigGeometry),
    ...leaves.map((leaf) => twigGeometry(leaf.petiole)),
    ...leaves.map((leaf) => twigGeometry(leaf.midrib))
  ];
  const geometry = parts.length > 0
    ? mergeGeometries(parts, false) ?? new THREE.BufferGeometry()
    : new THREE.BufferGeometry();
  for (const part of parts) part.dispose();
  const mesh = new THREE.Mesh(
    geometry,
    new THREE.MeshLambertMaterial({
      color: HEALING_PALETTE.trunk,
      flatShading: true
    })
  );
  mesh.name = "activity-leaf-twigs";
  mesh.userData.decorative = true;
  mesh.userData.sharedTwigCount = twigs.length;
  mesh.userData.petioleCount = leaves.length;
  mesh.userData.midribCount = leaves.length;
  mesh.raycast = () => undefined;
  mesh.castShadow = true;
  return mesh;
}
