import * as THREE from "three";
import { seedFromId } from "@/src/domain/stable-seed";
import type {
  VitalityElement,
  VitalityElementType
} from "@/src/domain/vitality";

export type VitalityElementsLayer = {
  group: THREE.Group;
  updateVitalityElements: (elapsedSeconds: number) => void;
  dispose: () => void;
};

type InstanceRecord = {
  position: THREE.Vector3;
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
    const geometry = new THREE.SphereGeometry(0.15, 8, 6);
    geometry.scale(0.78, 1.25, 0.78);
    return geometry;
  }
  if (type === "creature") {
    return new THREE.DodecahedronGeometry(0.16, 0);
  }
  return new THREE.ConeGeometry(0.09, 0.36, 5, 1);
}

function materialFor(type: VitalityElementType): THREE.MeshStandardMaterial {
  if (type === "water") {
    return new THREE.MeshStandardMaterial({
      color: 0xa8dfe2,
      emissive: 0x477f85,
      emissiveIntensity: 0.12,
      roughness: 0.24,
      transparent: true,
      opacity: 0.9,
      flatShading: true
    });
  }
  if (type === "creature") {
    return new THREE.MeshStandardMaterial({
      color: 0xe5c96d,
      roughness: 0.78,
      flatShading: true
    });
  }
  return new THREE.MeshStandardMaterial({
    color: 0x7cae55,
    roughness: 0.9,
    flatShading: true
  });
}

function recordsFor(elements: VitalityElement[]): InstanceRecord[] {
  return elements.map((element) => ({
    position: new THREE.Vector3(
      element.position.x,
      element.position.y,
      element.position.z
    ),
    phase: seedFromId(element.id, "vitality-motion") * Math.PI * 2,
    amplitude: 0.025 + seedFromId(element.id, "vitality-amplitude") * 0.045
  }));
}

function createInstanceLayer(
  type: VitalityElementType,
  elements: VitalityElement[]
): InstanceLayer | null {
  const selected = elements
    .filter((element) => element.type === type)
    .slice(0, caps[type]);
  if (selected.length === 0) {
    return null;
  }
  const mesh = new THREE.InstancedMesh(
    geometryFor(type),
    materialFor(type),
    selected.length
  );
  mesh.name = `vitality-${type}`;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.castShadow = type !== "water";
  mesh.receiveShadow = type !== "water";
  mesh.frustumCulled = false;
  return { type, mesh, records: recordsFor(selected) };
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
    // Water remains still; only its shared material highlight changes over time.
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
  elements: VitalityElement[]
): VitalityElementsLayer {
  const group = new THREE.Group();
  group.name = "growth-vitality-elements";
  const layers = (["water", "creature", "flora"] as const)
    .map((type) => createInstanceLayer(type, elements))
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
      if (
        layer.type === "water" &&
        layer.mesh.material instanceof THREE.MeshStandardMaterial
      ) {
        layer.mesh.material.emissiveIntensity =
          0.11 + Math.sin(elapsedSeconds * 0.38) * 0.025;
      }
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
