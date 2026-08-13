import * as THREE from "three";
import type { SemanticBranch, SemanticLeaf } from "@/src/domain/semantic-tree-skeleton";
import { HEALING_PALETTE } from "@/src/theme/healing-palette";

const point = (v: {x:number;y:number;z:number}) => new THREE.Vector3(v.x,v.y,v.z);
export function createSemanticBranchMesh(branch: SemanticBranch) {
  const curve = new THREE.CubicBezierCurve3(...branch.controlPoints.map(point) as [THREE.Vector3,THREE.Vector3,THREE.Vector3,THREE.Vector3]);
  const geometry = new THREE.TubeGeometry(curve, branch.entityType === "root" ? 28 : 14, branch.baseRadius, Math.min(10, branch.radialSegments), false);
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
