import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import {
  GROWTH_SCENE_CONFIG,
  type GrowthSceneAsset
} from "./scene-config";
import { HEALING_PALETTE } from "@/src/theme/healing-palette";
import {
  createIslandTerrainGeometry,
  islandHeightAt,
  ISLAND_TERRAIN_CONFIG
} from "../growth-tree-island-geometry";
import {
  createWaterSurfaceGeometry,
  WATER_SURFACE_CONFIG
} from "../growth-tree-water-geometry";
import {
  createWaterRippleMaterial,
  setWaterRainEnabled,
  updateWaterRippleTime
} from "../growth-tree-water-material";
import { createArchipelagoGeometry } from "../growth-tree-archipelago-geometry";
import {
  createAtmosphericHaze,
  updateAtmosphericHaze
} from "../growth-tree-atmospheric-haze";
import {
  createGrowthTreeRain,
  setGrowthTreeRainEnabled,
  updateGrowthTreeRain
} from "../growth-tree-rain";

export type AssetLoadDiagnostic = {
  code: "asset_load_failed";
  asset: GrowthSceneAsset;
  url: string;
  message: string;
};

export type GrowthEnvironmentLayer = {
  group: THREE.Group;
  fog: THREE.Fog;
  setRainEnabled: (enabled: boolean) => void;
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
  THREE.BufferGeometry,
  THREE.MeshLambertMaterial
> {
  // This is only the visible upper water surface: no sphere bottom, back face,
  // or side wall is generated. The center stays flat and only the far edge
  // curves down, keeping the shoreline connected while retaining a round world.
  // 这里只生成可见的水面上表层，不生成球体底部、背面或侧壁。中央保持
  // 水平，只有远端向下弯曲，既贴合岛岸，也保留圆形小世界的感觉。
  const geometry = createWaterSurfaceGeometry();
  const material = createWaterRippleMaterial();
  const lake = new THREE.Mesh(geometry, material);
  lake.name = "growth-lake";
  lake.position.set(
    ISLAND_TERRAIN_CONFIG.worldX,
    WATER_SURFACE_CONFIG.worldY,
    ISLAND_TERRAIN_CONFIG.worldZ
  );
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
): THREE.Mesh<THREE.ConeGeometry, THREE.MeshLambertMaterial> {
  // Low-poly mountains create a calm backdrop and keep the tree as the visual anchor.
  // 低多边形群山负责安静背景，把视觉中心留给树。
  const mountain = new THREE.Mesh(
    new THREE.ConeGeometry(radius, height, 6, 2),
    new THREE.MeshLambertMaterial({
      color,
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
  // Far layer for depth, near layer for foreground contrast.
  // 远山负责纵深，近山负责前景层次。
  const far = new THREE.Group();
  far.name = "mountains-far";
  const near = new THREE.Group();
  near.name = "mountains-near";
  const farColor = new THREE.Color("#9AA7B3");
  const nearColor = new THREE.Color("#788795");

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

export function createArchipelago(): THREE.Mesh<
  THREE.BufferGeometry,
  THREE.MeshLambertMaterial
> {
  const mesh = new THREE.Mesh(
    createArchipelagoGeometry(),
    new THREE.MeshLambertMaterial({
      vertexColors: true,
      flatShading: true,
      // Distance is already expressed by muted green vertex colors. Disabling
      // scene fog keeps horizon islands green instead of washing them to white.
      // 远近层次由低饱和绿色顶点色表达；关闭雾混合，避免远岛被洗成白色。
      fog: false
    })
  );
  mesh.name = "growth-archipelago-terrain";
  mesh.position.set(
    ISLAND_TERRAIN_CONFIG.worldX,
    0,
    ISLAND_TERRAIN_CONFIG.worldZ
  );
  mesh.receiveShadow = true;
  return mesh;
}

function createForeground(): { group: THREE.Group; rocks: THREE.Group } {
  const group = new THREE.Group();
  group.name = "growth-foreground";
  // Foreground slope and rocks ground the tree so the scene does not feel like it is floating.
  // 前景坡地和石块用来“托住”树，让场景不悬空。
  const slopeGeometry = createIslandTerrainGeometry();
  const slopeMaterial = new THREE.MeshLambertMaterial({
    // Main grass color / 主草地颜色
    color: HEALING_PALETTE.grass,
    flatShading: true
  });
  const slope = new THREE.Mesh(slopeGeometry, slopeMaterial);
  slope.name = "growth-island-terrain";
  slope.position.set(
    ISLAND_TERRAIN_CONFIG.worldX,
    0,
    ISLAND_TERRAIN_CONFIG.worldZ
  );
  slope.receiveShadow = true;
  group.add(slope, createArchipelago());

  const rocks = new THREE.Group();
  rocks.name = "growth-rocks-fallback";
  const rockMaterial = new THREE.MeshLambertMaterial({
    // Soil and stone tones / 土地与石块色调
    color: HEALING_PALETTE.soil,
    flatShading: true
  });
  [
    [-3.8, 1.5, 0.8],
    [-2.8, 2.1, 0.52],
    [0.65, 2.8, 0.45],
    [1.35, 1.9, 0.62]
  ].forEach(([x, z, scale], index) => {
    const rock = new THREE.Mesh(
      new THREE.DodecahedronGeometry(0.72, 0),
      rockMaterial
    );
    const terrainY = islandHeightAt(
      x! - ISLAND_TERRAIN_CONFIG.worldX,
      z! - ISLAND_TERRAIN_CONFIG.worldZ
    );
    const halfRockHeight = 0.72 * scale! * 0.72;
    rock.position.set(x!, terrainY + halfRockHeight, z!);
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
  // If GLB models are available, use them; otherwise keep the fallback scenic layers.
  // 如果能加载 GLB 模型就优先使用，否则保留当前的场景兜底层。
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
  const atmosphericHaze = createAtmosphericHaze();
  const rain = createGrowthTreeRain();
  const lake = createLake();
  const mountains = createMountainLayers();
  const foreground = createForeground();
  group.add(atmosphericHaze, mountains, lake, foreground.group, rain.lines);

  let disposed = false;
  loadConfiguredModels(
    group,
    { mountains, rocks: foreground.rocks },
    options,
    () => disposed
  );

  return {
    group,
    fog: new THREE.Fog(HEALING_PALETTE.fog, 14, 38),
    setRainEnabled(enabled) {
      setGrowthTreeRainEnabled(rain, enabled);
      setWaterRainEnabled(lake.material, enabled);
    },
    update(elapsedSeconds) {
      updateAtmosphericHaze(atmosphericHaze.material, elapsedSeconds);
      updateWaterRippleTime(lake.material, elapsedSeconds);
      updateGrowthTreeRain(rain, elapsedSeconds);
    },
    dispose() {
      if (disposed) {
        return;
      }
      disposed = true;
      rain.dispose();
      disposeObjectResources(group);
      group.clear();
    }
  };
}
