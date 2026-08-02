import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import {
  GROWTH_SCENE_CONFIG,
  type GrowthSceneAsset
} from "./scene-config";

export type AssetLoadDiagnostic = {
  code: "asset_load_failed";
  asset: GrowthSceneAsset;
  url: string;
  message: string;
};

export type GrowthEnvironmentLayer = {
  group: THREE.Group;
  fog: THREE.Fog;
  update: (elapsedSeconds: number) => void;
  dispose: () => void;
};

export type GrowthEnvironmentOptions = {
  onDiagnostic?: (diagnostic: AssetLoadDiagnostic) => void;
  modelUrls?: Record<GrowthSceneAsset, string | null>;
  loaderFactory?: () => GrowthEnvironmentLoader;
};

export type GrowthEnvironmentLoader = {
  load: (
    url: string,
    onLoad: (loaded: { scene: THREE.Group }) => void,
    onProgress: ((event: ProgressEvent<EventTarget>) => void) | undefined,
    onError: (error: unknown) => void
  ) => unknown;
};

function subduedColor(hex: number): THREE.Color {
  const color = new THREE.Color(hex);
  const hsl = { h: 0, s: 0, l: 0 };
  color.getHSL(hsl);
  color.setHSL(
    hsl.h,
    hsl.s * GROWTH_SCENE_CONFIG.backgroundSaturation,
    hsl.l
  );
  return color;
}

function disposeMaterial(
  material: THREE.Material,
  materials: Set<THREE.Material>,
  textures: Set<THREE.Texture>
): void {
  if (materials.has(material)) {
    return;
  }
  materials.add(material);
  for (const value of Object.values(material)) {
    if (value instanceof THREE.Texture && !textures.has(value)) {
      textures.add(value);
      value.dispose();
    }
  }
  material.dispose();
}

function disposeObjectResources(root: THREE.Object3D): void {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
  const instances = new Set<THREE.InstancedMesh>();
  const skeletons = new Set<THREE.Skeleton>();
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) {
      return;
    }
    if (object instanceof THREE.InstancedMesh && !instances.has(object)) {
      instances.add(object);
      object.dispose();
    }
    if (
      object instanceof THREE.SkinnedMesh &&
      object.skeleton &&
      !skeletons.has(object.skeleton)
    ) {
      skeletons.add(object.skeleton);
      object.skeleton.dispose();
    }
    if (!geometries.has(object.geometry)) {
      geometries.add(object.geometry);
      object.geometry.dispose();
    }
    const ownedMaterials = Array.isArray(object.material)
      ? object.material
      : [object.material];
    for (const material of ownedMaterials) {
      disposeMaterial(material, materials, textures);
    }
  });
}

export function createLake(): THREE.Mesh<
  THREE.PlaneGeometry,
  THREE.MeshStandardMaterial
> {
  const geometry = new THREE.PlaneGeometry(13, 18, 18, 24);
  geometry.rotateX(-Math.PI / 2);
  const positions = geometry.attributes.position;
  for (let index = 0; index < positions.count; index += 1) {
    const x = positions.getX(index);
    const z = positions.getZ(index);
    positions.setY(index, Math.sin(x * 0.72 + z * 0.38) * 0.025);
  }
  positions.needsUpdate = true;
  if (positions instanceof THREE.InterleavedBufferAttribute) {
    positions.data.setUsage(THREE.DynamicDrawUsage);
  } else {
    positions.setUsage(THREE.DynamicDrawUsage);
  }
  geometry.computeVertexNormals();

  const material = new THREE.MeshStandardMaterial({
    color: subduedColor(GROWTH_SCENE_CONFIG.colors.lake),
    roughness: 0.28,
    metalness: 0.04,
    transparent: true,
    opacity: 0.92,
    flatShading: true
  });
  const lake = new THREE.Mesh(geometry, material);
  lake.name = "growth-lake";
  lake.position.set(3.6, -0.08, -4.8);
  lake.receiveShadow = true;
  return lake;
}

function createMountain(
  radius: number,
  height: number,
  color: THREE.Color,
  x: number,
  z: number,
  rotation: number
): THREE.Mesh<THREE.ConeGeometry, THREE.MeshStandardMaterial> {
  const mountain = new THREE.Mesh(
    new THREE.ConeGeometry(radius, height, 6, 2),
    new THREE.MeshStandardMaterial({
      color,
      roughness: 0.98,
      flatShading: true
    })
  );
  mountain.position.set(x, height / 2 - 0.12, z);
  mountain.rotation.y = rotation;
  mountain.receiveShadow = true;
  return mountain;
}

export function createMountainLayers(): THREE.Group {
  const layers = new THREE.Group();
  layers.name = "growth-mountain-layers";
  const far = new THREE.Group();
  far.name = "mountains-far";
  const near = new THREE.Group();
  near.name = "mountains-near";
  const farColor = subduedColor(GROWTH_SCENE_CONFIG.colors.mountainFar);
  const nearColor = subduedColor(GROWTH_SCENE_CONFIG.colors.mountainNear);

  [
    [-11, 5.8, 6.8, 0.1],
    [-5.4, 6.8, 8.8, 0.45],
    [1.2, 7.4, 9.2, -0.18],
    [8.2, 6.4, 7.8, 0.25],
    [13, 5.6, 6.4, -0.32]
  ].forEach(([x, radius, height, rotation]) => {
    far.add(createMountain(radius!, height!, farColor, x!, -18, rotation!));
  });
  [
    [-9, 4.6, 5.3, -0.2],
    [-2.8, 5.1, 6.1, 0.2],
    [5, 4.8, 5.6, -0.34],
    [10.5, 4.2, 4.8, 0.18]
  ].forEach(([x, radius, height, rotation]) => {
    near.add(createMountain(radius!, height!, nearColor, x!, -12, rotation!));
  });
  layers.add(far, near);
  return layers;
}

function createForeground(): { group: THREE.Group; rocks: THREE.Group } {
  const group = new THREE.Group();
  group.name = "growth-foreground";
  const slopeGeometry = new THREE.CircleGeometry(9.5, 12);
  slopeGeometry.rotateX(-Math.PI / 2);
  const slopePositions = slopeGeometry.attributes.position;
  for (let index = 0; index < slopePositions.count; index += 1) {
    const x = slopePositions.getX(index);
    const z = slopePositions.getZ(index);
    slopePositions.setY(
      index,
      Math.cos(x * 0.44) * 0.11 + Math.sin(z * 0.56) * 0.08
    );
  }
  slopePositions.needsUpdate = true;
  slopeGeometry.computeVertexNormals();
  const slopeMaterial = new THREE.MeshStandardMaterial({
    color: 0x66834e,
    roughness: 0.98,
    flatShading: true
  });
  const slope = new THREE.Mesh(slopeGeometry, slopeMaterial);
  slope.scale.set(1.25, 0.82, 1);
  slope.position.set(-1.2, -0.02, 0.5);
  slope.receiveShadow = true;
  group.add(slope);

  const rocks = new THREE.Group();
  rocks.name = "growth-rocks-fallback";
  const rockMaterial = new THREE.MeshStandardMaterial({
    color: subduedColor(GROWTH_SCENE_CONFIG.colors.rock),
    roughness: 0.96,
    flatShading: true
  });
  [
    [-3.8, 0.38, 1.5, 0.8],
    [-2.8, 0.24, 2.1, 0.52],
    [0.65, 0.2, 2.8, 0.45],
    [1.35, 0.28, 1.9, 0.62]
  ].forEach(([x, y, z, scale], index) => {
    const rock = new THREE.Mesh(
      new THREE.DodecahedronGeometry(0.72, 0),
      rockMaterial
    );
    rock.position.set(x!, y!, z!);
    rock.scale.set(scale!, scale! * 0.72, scale! * 0.9);
    rock.rotation.set(0.12 * index, 0.48 * index, -0.08 * index);
    rock.castShadow = true;
    rock.receiveShadow = true;
    rocks.add(rock);
  });
  group.add(rocks);
  return { group, rocks };
}

function loadConfiguredModels(
  root: THREE.Group,
  fallbacks: Partial<Record<GrowthSceneAsset, THREE.Object3D>>,
  options: GrowthEnvironmentOptions,
  isDisposed: () => boolean
): void {
  const loader = options.loaderFactory?.() ?? new GLTFLoader();
  const models =
    options.modelUrls ??
    (GROWTH_SCENE_CONFIG.models as Record<
      GrowthSceneAsset,
      string | null
    >);

  for (const asset of Object.keys(models) as GrowthSceneAsset[]) {
    const url = models[asset];
    if (!url) {
      continue;
    }
    loader.load(
      url,
      (gltf) => {
        if (isDisposed()) {
          disposeObjectResources(gltf.scene);
          return;
        }
        gltf.scene.name = `growth-${asset}-model`;
        if (asset === "tree") {
          gltf.scene.position.x = GROWTH_SCENE_CONFIG.treeOffsetX;
          gltf.scene.userData.decorative = true;
          gltf.scene.traverse((object) => {
            object.userData.decorative = true;
            object.userData.selectable = false;
            if (object instanceof THREE.Mesh) {
              object.raycast = () => undefined;
            }
          });
        }
        fallbacks[asset] && (fallbacks[asset]!.visible = false);
        root.add(gltf.scene);
      },
      undefined,
      (error) => {
        if (isDisposed()) {
          return;
        }
        options.onDiagnostic?.({
          code: "asset_load_failed",
          asset,
          url,
          message: `Unable to load ${asset} model: ${String(error)}`
        });
      }
    );
  }
}

export function createGrowthEnvironment(
  options: GrowthEnvironmentOptions = {}
): GrowthEnvironmentLayer {
  const group = new THREE.Group();
  group.name = "growth-environment";
  const lake = createLake();
  const mountains = createMountainLayers();
  const foreground = createForeground();
  group.add(mountains, lake, foreground.group);

  let disposed = false;
  loadConfiguredModels(
    group,
    { mountains, rocks: foreground.rocks },
    options,
    () => disposed
  );

  const lakePositions = lake.geometry.attributes.position;
  const lakeBaseY = Array.from(
    { length: lakePositions.count },
    (_, index) => lakePositions.getY(index)
  );

  return {
    group,
    fog: new THREE.Fog(0xb8d5db, 14, 38),
    update(elapsedSeconds) {
      for (let index = 0; index < lakePositions.count; index += 1) {
        const x = lakePositions.getX(index);
        const z = lakePositions.getZ(index);
        lakePositions.setY(
          index,
          lakeBaseY[index]! +
            Math.sin(elapsedSeconds * 0.32 + x * 0.5 + z * 0.3) * 0.012
        );
      }
      lakePositions.needsUpdate = true;
    },
    dispose() {
      if (disposed) {
        return;
      }
      disposed = true;
      disposeObjectResources(group);
      group.clear();
    }
  };
}
