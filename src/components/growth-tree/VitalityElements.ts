import * as THREE from "three";
import { seedFromId } from "@/src/domain/stable-seed";
import type {
  VitalityElement,
  VitalityElementType
} from "@/src/domain/vitality";
import type { SemanticLeaf } from "@/src/domain/semantic-tree-skeleton";
import { activityLeafSurfaceFrame } from "./activity-leaf-transform";

export type VitalityElementsLayer = {
  group: THREE.Group;
  updateVitalityElements: (elapsedSeconds: number) => void;
  dispose: () => void;
};

type InstanceRecord = {
  position: THREE.Vector3;
  leaf: SemanticLeaf | null;
  leafDistance: number;
  normal: THREE.Vector3 | null;
  phase: number;
  amplitude: number;
};

type InstanceLayer = {
  type: VitalityElementType;
  mesh: THREE.InstancedMesh;
  records: InstanceRecord[];
};

const caps: Record<VitalityElementType, number> = {
  water: 7,
  creature: 3,
  flora: 8
};

function geometryFor(type: VitalityElementType): THREE.BufferGeometry {
  if (type === "water") {
    // A tiny flattened bead that rests on a leaf instead of floating beside the tree.
    // 小而扁的半透明水珠，贴在叶面上，而不是悬浮在树旁。
    const geometry = new THREE.SphereGeometry(0.035, 12, 8);
    geometry.scale(0.9, 0.55, 0.9);
    return geometry;
  }
  if (type === "creature") {
    return new THREE.DodecahedronGeometry(0.16, 0);
  }
  return new THREE.ConeGeometry(0.09, 0.36, 5, 1);
}

function materialFor(type: VitalityElementType): THREE.Material {
  if (type === "water") {
    // Transparent highlight, not emissive blue plastic / 依靠透明高光表现水感，不再自发光。
    return new THREE.MeshPhysicalMaterial({
      color: 0x9bdde3,
      transparent: true,
      opacity: 0.55,
      roughness: 0.16,
      metalness: 0,
      clearcoat: 1,
      clearcoatRoughness: 0.08,
      depthWrite: false
    });
  }
  if (type === "creature") {
    // Friendly warm tone / 友好的暖色小生物
    return new THREE.MeshLambertMaterial({
      color: 0xe5c96d,
      flatShading: true
    });
  }
  return new THREE.MeshLambertMaterial({
    // Fresh plant green / 新鲜植物绿
    color: 0x7cae55,
    flatShading: true
  });
}

function recordsFor(
  type: VitalityElementType,
  elements: VitalityElement[],
  visibleLeaves: SemanticLeaf[]
): InstanceRecord[] {
  const availableLeaves = [...visibleLeaves];
  return elements.slice(0, type === "water" ? availableLeaves.length : undefined).map((element) => {
    if (type === "water") {
      const leafIndex = Math.min(
        availableLeaves.length - 1,
        Math.floor(seedFromId(element.id, "water-leaf") * availableLeaves.length)
      );
      const leaf = availableLeaves.splice(leafIndex, 1)[0]!;
      return {
        position: new THREE.Vector3(),
        leaf,
        leafDistance: .16,
        normal: new THREE.Vector3(),
        phase: 0,
        amplitude: 0
      };
    }
    return {
      position: new THREE.Vector3(
        element.position.x,
        element.position.y,
        element.position.z
      ),
      leaf: null,
      leafDistance: 0,
      normal: null,
      phase: seedFromId(element.id, "vitality-motion") * Math.PI * 2,
      amplitude: 0.025 + seedFromId(element.id, "vitality-amplitude") * 0.045
    };
  });
}

function createInstanceLayer(
  type: VitalityElementType,
  elements: VitalityElement[],
  visibleLeaves: SemanticLeaf[]
): InstanceLayer | null {
  const selected = elements
    .filter((element) => element.type === type)
    .slice(0, caps[type]);
  if (selected.length === 0 || (type === "water" && visibleLeaves.length === 0)) {
    return null;
  }
  const records = recordsFor(type, selected, visibleLeaves);
  const mesh = new THREE.InstancedMesh(
    geometryFor(type),
    materialFor(type),
    records.length
  );
  mesh.name = `vitality-${type}`;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.castShadow = type !== "water";
  mesh.receiveShadow = type !== "water";
  mesh.frustumCulled = false;
  return { type, mesh, records };
}

function setInstanceTransform(
  layer: InstanceLayer,
  index: number,
  elapsedSeconds: number,
  transform: THREE.Object3D
): void {
  const record = layer.records[index]!;
  transform.position.copy(record.position);
  transform.rotation.set(0, 0, 0);
  transform.scale.setScalar(1);

  if (layer.type === "water") {
    const surface = activityLeafSurfaceFrame(record.leaf!, record.leafDistance);
    const beadHalfHeight = .035 * .55;
    transform.position.copy(surface.position).addScaledVector(
      surface.normal,
      beadHalfHeight
    );
    transform.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      surface.normal
    );
  } else if (layer.type === "creature") {
    const pace = elapsedSeconds * 0.22 + record.phase;
    transform.position.x += Math.cos(pace) * record.amplitude;
    transform.position.z += Math.sin(pace) * record.amplitude;
    transform.position.y += 0.12 + Math.sin(pace * 1.6) * 0.018;
    transform.rotation.y = pace + Math.PI / 2;
  } else {
    transform.position.y += 0.18;
    transform.rotation.z =
      Math.sin(elapsedSeconds * 0.42 + record.phase) * 0.09;
    transform.scale.set(0.9, 0.9, 0.9);
  }

  transform.updateMatrix();
  layer.mesh.setMatrixAt(index, transform.matrix);
}

export function createVitalityElements(
  elements: VitalityElement[],
  leaves: SemanticLeaf[] = []
): VitalityElementsLayer {
  const group = new THREE.Group();
  group.name = "growth-vitality-elements";
  const visibleLeaves = leaves
    .filter((leaf) => leaf.visible)
    .sort((left, right) => left.activityId.localeCompare(right.activityId));
  const layers = (["water", "creature", "flora"] as const)
    .map((type) => createInstanceLayer(type, elements, visibleLeaves))
    .filter((layer): layer is InstanceLayer => layer !== null);
  for (const layer of layers) {
    group.add(layer.mesh);
  }
  const transform = new THREE.Object3D();

  const updateVitalityElements = (elapsedSeconds: number) => {
    for (const layer of layers) {
      for (let index = 0; index < layer.records.length; index += 1) {
        setInstanceTransform(layer, index, elapsedSeconds, transform);
      }
      layer.mesh.instanceMatrix.needsUpdate = true;
    }
  };
  updateVitalityElements(0);

  let disposed = false;
  return {
    group,
    updateVitalityElements,
    dispose() {
      if (disposed) {
        return;
      }
      disposed = true;
      for (const layer of layers) {
        layer.mesh.dispose();
        layer.mesh.geometry.dispose();
        if (Array.isArray(layer.mesh.material)) {
          layer.mesh.material.forEach((material) => material.dispose());
        } else {
          layer.mesh.material.dispose();
        }
      }
      group.clear();
    }
  };
}
