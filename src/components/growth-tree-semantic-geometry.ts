import * as THREE from "three";
import type { SemanticBranch, SemanticLeaf } from "@/src/domain/semantic-tree-skeleton";
import { HEALING_PALETTE } from "@/src/theme/healing-palette";
import { seedFromId } from "@/src/domain/stable-seed";
import type { TreeRecipe } from "@/src/domain/tree-recipe";
import { createNaturalBranchGeometry } from "./growth-tree-branch-geometry";

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
  const base = new THREE.Color(HEALING_PALETTE.trunk), light = new THREE.Color(HEALING_PALETTE.trunkLight), colors:number[]=[];
  for(let i=0;i<geometry.attributes.normal.count;i++){ const normal=new THREE.Vector3().fromBufferAttribute(geometry.attributes.normal,i); const c=base.clone().lerp(light,Math.max(0,normal.dot(new THREE.Vector3(-.4,.7,.5).normalize()))*.65); colors.push(c.r,c.g,c.b); }
  geometry.setAttribute("color",new THREE.Float32BufferAttribute(colors,3));
  const material=new THREE.MeshLambertMaterial({vertexColors:true});
  material.userData={baseColor:base.getHex(),hoverColor:light.getHex(),selectedColor:light.getHex()};
  const mesh=new THREE.Mesh(geometry,material); mesh.userData={entityType:branch.entityType,entityId:branch.entityId,goalId:branch.entityType.includes("goal")?branch.entityId:null,leafId:null}; mesh.castShadow=true; return mesh;
}
export function createSemanticLeafMesh(leaf: SemanticLeaf){ const shape=new THREE.Shape(); shape.moveTo(0,-.16); shape.quadraticCurveTo(.22,.05,0,.28); shape.quadraticCurveTo(-.22,.05,0,-.16);
  const material=new THREE.MeshLambertMaterial({color:HEALING_PALETTE.youngLeaf,side:THREE.DoubleSide}); material.userData={baseColor:new THREE.Color(HEALING_PALETTE.youngLeaf).getHex(),hoverColor:new THREE.Color(HEALING_PALETTE.matureLeaf).getHex(),selectedColor:new THREE.Color(HEALING_PALETTE.youngLeaf).getHex(),relatedColor:new THREE.Color(HEALING_PALETTE.matureLeaf).getHex()};
  const mesh=new THREE.Mesh(new THREE.ShapeGeometry(shape,6),material); mesh.position.copy(point(leaf.anchor)); mesh.rotation.set(leaf.rotation.x,leaf.rotation.y,leaf.rotation.z); mesh.scale.setScalar(leaf.scale); mesh.userData={entityType:"activity",entityId:leaf.activityId,goalId:leaf.goalId,leafId:leaf.activityId}; return mesh; }

export function createDecorativeCanopy(branches: SemanticBranch[], recipe: TreeRecipe) {
  const candidates = branches.filter((branch) => branch.entityType !== "root");
  const perBranch = Math.max(28, Math.round(28 + recipe.canopy.retention * 26));
  const count = Math.min(1400, candidates.length * perBranch);
  const geometry = new THREE.SphereGeometry(.22, 5, 4); geometry.scale(.7, 1.25, .45);
  const color = new THREE.Color(HEALING_PALETTE.dormantLeaf).lerp(new THREE.Color(HEALING_PALETTE.matureLeaf), .68 + recipe.canopy.vitality * .32);
  const material = new THREE.MeshLambertMaterial({ color, flatShading: true });
  const mesh = new THREE.InstancedMesh(geometry, material, count); mesh.name = "decorative-canopy"; mesh.userData.decorative = true; mesh.raycast = () => undefined;
  const transform = new THREE.Object3D(); let index = 0;
  for (const branch of candidates) for (let slot = 0; slot < perBranch && index < count; slot += 1) {
    const id = `${branch.entityId}-${slot}`;
    const curve = new THREE.CubicBezierCurve3(...branch.controlPoints.map(point) as [THREE.Vector3,THREE.Vector3,THREE.Vector3,THREE.Vector3]);
    const anchor = curve.getPoint(.55 + seedFromId(id,"along") * .45);
    transform.position.set(anchor.x + (seedFromId(id,"x")-.5)*1.6, anchor.y + (seedFromId(id,"y")-.28)*1.05, anchor.z + (seedFromId(id,"z")-.5)*1.6);
    transform.rotation.set(seedFromId(id,"rx")*.6, seedFromId(id,"ry")*Math.PI*2, (seedFromId(id,"rz")-.5)*.8);
    transform.scale.setScalar(.82 + seedFromId(id,"scale")*.62); transform.updateMatrix(); mesh.setMatrixAt(index, transform.matrix);
    const leafColor = seedFromId(id,"young") < recipe.canopy.youngLeafRatio
      ? new THREE.Color(HEALING_PALETTE.youngLeaf)
      : color;
    mesh.setColorAt(index, leafColor);
    index += 1;
  }
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  return mesh;
}
