import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { CANOPY_TWIG_RADIUS, LEAF_PETIOLE_RADIUS, type SemanticBranch, type SemanticLeaf, type LeafTwig } from "@/src/domain/semantic-tree-skeleton";
import { HEALING_PALETTE } from "@/src/theme/healing-palette";
import { seedFromId } from "@/src/domain/stable-seed";
import type { TreeRecipe } from "@/src/domain/tree-recipe";
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
  const base = new THREE.Color(HEALING_PALETTE.trunk), light = new THREE.Color(HEALING_PALETTE.trunkLight), colors:number[]=[];
  for(let i=0;i<geometry.attributes.normal.count;i++){ const normal=new THREE.Vector3().fromBufferAttribute(geometry.attributes.normal,i); const c=base.clone().lerp(light,Math.max(0,normal.dot(new THREE.Vector3(-.4,.7,.5).normalize()))*.65); colors.push(c.r,c.g,c.b); }
  geometry.setAttribute("color",new THREE.Float32BufferAttribute(colors,3));
  const material=new THREE.MeshLambertMaterial({vertexColors:true});
  material.userData={baseColor:base.getHex(),hoverColor:light.getHex(),selectedColor:light.getHex()};
  const mesh=new THREE.Mesh(geometry,material); mesh.userData={entityType:branch.entityType,entityId:branch.entityId,goalId:branch.entityType.includes("goal")?branch.entityId:null,leafId:null}; mesh.castShadow=true; return mesh;
}
export function createSemanticLeafMesh(leaf: SemanticLeaf){ const shape=new THREE.Shape(); shape.moveTo(0,-.16); shape.quadraticCurveTo(.22,.05,0,.28); shape.quadraticCurveTo(-.22,.05,0,-.16);
  const material=new THREE.MeshLambertMaterial({color:HEALING_PALETTE.youngLeaf,side:THREE.DoubleSide}); material.userData={baseColor:new THREE.Color(HEALING_PALETTE.youngLeaf).getHex(),hoverColor:new THREE.Color(HEALING_PALETTE.matureLeaf).getHex(),selectedColor:new THREE.Color(HEALING_PALETTE.youngLeaf).getHex(),relatedColor:new THREE.Color(HEALING_PALETTE.matureLeaf).getHex()};
  const mesh=new THREE.Mesh(new THREE.ShapeGeometry(shape,6),material); mesh.position.copy(point(leaf.anchor)); mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),point(leaf.direction).normalize()); mesh.rotateY(leaf.roll); mesh.scale.setScalar(leaf.scale); mesh.userData={entityType:"activity",entityId:leaf.activityId,goalId:leaf.goalId,leafId:leaf.activityId}; return mesh; }

export type CanopyLeafPlacement = {
  id: string;
  twigId: string;
  nodeId: string;
  side: -1 | 0 | 1;
  attachment: { x: number; y: number; z: number };
  anchor: { x: number; y: number; z: number };
  direction: { x: number; y: number; z: number };
  roll: number;
  scale: number;
};

export type CanopyStructure = {
  twigs: LeafTwig[];
  petioles: LeafTwig[];
  leaves: CanopyLeafPlacement[];
};

const roundedPoint = (value: THREE.Vector3) => ({
  x: Number(value.x.toFixed(4)),
  y: Number(value.y.toFixed(4)),
  z: Number(value.z.toFixed(4))
});

export function buildCanopyStructure(
  branches: SemanticBranch[],
  recipe: TreeRecipe
): CanopyStructure {
  const candidates = branches.filter((branch) => branch.entityType !== "root");
  const twigs: LeafTwig[] = [];
  const petioles: LeafTwig[] = [];
  const leaves: CanopyLeafPlacement[] = [];
  const twigsPerBranch = 5 + Math.round(recipe.canopy.retention * 2);

  for (const branch of candidates) {
    const curve = new THREE.CubicBezierCurve3(
      ...branch.controlPoints.map(point) as [
        THREE.Vector3,
        THREE.Vector3,
        THREE.Vector3,
        THREE.Vector3
      ]
    );
    for (let slot = 0; slot < twigsPerBranch; slot += 1) {
      const id = `${branch.entityId}-canopy-twig-${slot}`;
      const progress = .58 + seedFromId(id, "along") * .36;
      const start = curve.getPoint(progress);
      const tangent = curve.getTangent(progress).normalize();
      const azimuth = seedFromId(id, "azimuth") * Math.PI * 2;
      const outward = new THREE.Vector3(
        tangent.x * .28 + Math.cos(azimuth) * .72,
        Math.max(.22, tangent.y * .3 + .48),
        tangent.z * .28 + Math.sin(azimuth) * .72
      ).normalize();
      const length = .32 + seedFromId(id, "length") * .28;
      const end = start.clone().addScaledVector(outward, length);
      const twig: LeafTwig = {
        id,
        parentEntityId: branch.entityId,
        controlPoints: [
          roundedPoint(start),
          roundedPoint(start.clone().addScaledVector(outward, length * .3).add(new THREE.Vector3(0, .025, 0))),
          roundedPoint(start.clone().addScaledVector(outward, length * .68).add(new THREE.Vector3(0, .035, 0))),
          roundedPoint(end)
        ],
        baseRadius: CANOPY_TWIG_RADIUS,
        tipRadius: CANOPY_TWIG_RADIUS
      };
      twigs.push(twig);

      const nodes = [
        { attachment: twig.controlPoints[1], tangentStart: twig.controlPoints[0], tangentEnd: twig.controlPoints[2] },
        { attachment: twig.controlPoints[2], tangentStart: twig.controlPoints[1], tangentEnd: twig.controlPoints[3] }
      ];
      for (let nodeIndex = 0; nodeIndex < nodes.length; nodeIndex += 1) {
        const node = nodes[nodeIndex]!;
        const tangentAtNode = point(node.tangentEnd)
          .sub(point(node.tangentStart))
          .normalize();
        let sideAxis = new THREE.Vector3()
          .crossVectors(tangentAtNode, new THREE.Vector3(0, 1, 0));
        if (sideAxis.lengthSq() < .0001) sideAxis.set(1, 0, 0);
        sideAxis.normalize();

        for (const side of [-1, 1] as const) {
          const leafId = `${id}-node-${nodeIndex}-side-${side}`;
          const direction = sideAxis.clone().multiplyScalar(side)
            .addScaledVector(tangentAtNode, .12)
            .add(new THREE.Vector3(0, -.28, 0))
            .normalize();
          if (direction.y > .02) direction.y = .02;
          direction.normalize();
          const petioleLength = .038 + seedFromId(leafId, "petiole") * .01;
          const attachment = point(node.attachment);
          const leafAnchor = attachment.clone().addScaledVector(
            direction,
            petioleLength
          );
          const petiole: LeafTwig = {
            id: `${leafId}-petiole`,
            parentEntityId: id,
            controlPoints: [
              roundedPoint(attachment),
              roundedPoint(attachment.clone().lerp(leafAnchor, .32)),
              roundedPoint(attachment.clone().lerp(leafAnchor, .68)),
              roundedPoint(leafAnchor)
            ],
            baseRadius: LEAF_PETIOLE_RADIUS,
            tipRadius: LEAF_PETIOLE_RADIUS
          };
          petioles.push(petiole);
          leaves.push({
            id: leafId,
            twigId: id,
            nodeId: `${id}-node-${nodeIndex}`,
            side,
            attachment: petiole.controlPoints[0],
            anchor: petiole.controlPoints[3],
            direction: roundedPoint(direction),
            roll: Number(((seedFromId(leafId, "roll") - .5) * .38).toFixed(4)),
            scale: Number((.48 + seedFromId(leafId, "scale") * .24).toFixed(4))
          });
        }
      }

    }
  }
  return { twigs, petioles, leaves };
}

function twigGeometry(twig: LeafTwig): THREE.BufferGeometry {
  return createUniformCurvedBranchGeometry({
    controlPoints: twig.controlPoints,
    radius: twig.baseRadius,
    longitudinalSegments: 5,
    radialSegments: 5
  });
}

export function createDecorativeCanopyTwigs(
  twigs: LeafTwig[]
): THREE.Mesh<THREE.BufferGeometry, THREE.MeshLambertMaterial> {
  const parts = twigs.map(twigGeometry);
  const geometry = parts.length > 0
    ? mergeGeometries(parts, false) ?? new THREE.BufferGeometry()
    : new THREE.BufferGeometry();
  for (const part of parts) part.dispose();
  const material = new THREE.MeshLambertMaterial({
    color: HEALING_PALETTE.trunkLight,
    flatShading: true
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = "decorative-canopy-twigs";
  mesh.userData.decorative = true;
  mesh.raycast = () => undefined;
  mesh.castShadow = true;
  return mesh;
}

export function createActivityLeafTwigMesh(
  leaf: SemanticLeaf
): THREE.Mesh<THREE.BufferGeometry, THREE.MeshLambertMaterial> {
  const parts = [twigGeometry(leaf.twig), twigGeometry(leaf.petiole)];
  const geometry = mergeGeometries(parts, false) ?? parts[0]!;
  for (const part of parts) {
    if (part !== geometry) part.dispose();
  }
  const mesh = new THREE.Mesh(
    geometry,
    new THREE.MeshLambertMaterial({
      color: HEALING_PALETTE.trunkLight,
      flatShading: true
    })
  );
  mesh.name = `activity-leaf-twig-${leaf.activityId}`;
  mesh.userData.decorative = true;
  mesh.raycast = () => undefined;
  mesh.castShadow = true;
  return mesh;
}

export function createDecorativeCanopy(branches: SemanticBranch[], recipe: TreeRecipe) {
  const structure = buildCanopyStructure(branches, recipe);
  const count = Math.min(1400, structure.leaves.length);
  const geometry = new THREE.SphereGeometry(.17, 5, 4);
  geometry.scale(.58, 1.2, .32);
  // Keep the instance origin at the leaf base so the visible blade grows out
  // of its twig node instead of hovering around it.
  // 将实例原点放在叶片根部，使叶身从细枝节点长出，而不是围绕节点悬浮。
  geometry.translate(0, .17 * 1.2, 0);
  const color = new THREE.Color(HEALING_PALETTE.dormantLeaf).lerp(new THREE.Color(HEALING_PALETTE.matureLeaf), .68 + recipe.canopy.vitality * .32);
  const material = new THREE.MeshLambertMaterial({ color, flatShading: true });
  const mesh = new THREE.InstancedMesh(geometry, material, count); mesh.name = "decorative-canopy"; mesh.userData.decorative = true; mesh.raycast = () => undefined;
  const transform = new THREE.Object3D(); let index = 0;
  for (const leaf of structure.leaves.slice(0, count)) {
    transform.position.set(leaf.anchor.x, leaf.anchor.y, leaf.anchor.z);
    transform.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      point(leaf.direction).normalize()
    );
    transform.rotateY(leaf.roll);
    transform.scale.setScalar(leaf.scale); transform.updateMatrix(); mesh.setMatrixAt(index, transform.matrix);
    const leafColor = seedFromId(leaf.id,"young") < recipe.canopy.youngLeafRatio
      ? new THREE.Color(HEALING_PALETTE.youngLeaf)
      : color;
    mesh.setColorAt(index, leafColor);
    index += 1;
  }
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  return mesh;
}
