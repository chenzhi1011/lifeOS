import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import * as THREE from "three";
import { describe, expect, it } from "vitest";
import {
  createGrowthEnvironment,
  createLake,
  createMountainLayers,
  type AssetLoadDiagnostic,
  type GrowthEnvironmentLoader,
  type GrowthEnvironmentOptions
} from "@/src/components/growth-tree/GrowthEnvironment";
import {
  createVitalityElements,
  type VitalityElementsLayer
} from "@/src/components/growth-tree/VitalityElements";
import { GROWTH_SCENE_CONFIG } from "@/src/components/growth-tree/scene-config";
import type {
  VitalityElement,
  VitalityElementType
} from "@/src/domain/vitality";
import { vi } from "vitest";

function source(relativePath: string): string {
  const absolutePath = path.resolve(relativePath);
  return existsSync(absolutePath) ? readFileSync(absolutePath, "utf8") : "";
}

type LoadedScene = { scene: THREE.Group };
function deferredLoader() {
  let onLoad: ((loaded: LoadedScene) => void) | null = null;
  let onError: ((error: unknown) => void) | null = null;
  const loader: GrowthEnvironmentLoader = {
    load: vi.fn((_, nextOnLoad, __, nextOnError) => {
      onLoad = nextOnLoad;
      onError = nextOnError;
    })
  };
  return {
    loader,
    succeed(scene: THREE.Group) {
      if (!onLoad) {
        throw new Error("loader success callback was not registered");
      }
      onLoad({ scene });
    },
    fail(error: unknown) {
      if (!onError) {
        throw new Error("loader error callback was not registered");
      }
      onError(error);
    }
  };
}

function vitalityElement(
  type: VitalityElementType,
  index: number
): VitalityElement {
  return {
    id: `${type}-${index}`,
    taskId: `task-${type}-${index}`,
    type,
    source: "one_off_completion",
    position: {
      x: index * 0.17,
      y: type === "water" ? 1.4 + index * 0.03 : 0.08,
      z: index * -0.11
    }
  };
}

function instanceMesh(
  layer: VitalityElementsLayer,
  type: VitalityElementType
): THREE.InstancedMesh {
  const mesh = layer.group.getObjectByName(`vitality-${type}`);
  expect(mesh).toBeInstanceOf(THREE.InstancedMesh);
  return mesh as THREE.InstancedMesh;
}

function matrixSnapshot(mesh: THREE.InstancedMesh): number[] {
  return Array.from(mesh.instanceMatrix.array);
}

function attributeUsage(
  attribute: THREE.BufferAttribute | THREE.InterleavedBufferAttribute
): number {
  return attribute instanceof THREE.InterleavedBufferAttribute
    ? attribute.data.usage
    : attribute.usage;
}

describe("growth tree environment contract", () => {
  const environment = source(
    "src/components/growth-tree/GrowthEnvironment.ts"
  );
  const vitality = source(
    "src/components/growth-tree/VitalityElements.ts"
  );
  const config = source("src/components/growth-tree/scene-config.ts");
  const scene = source("src/components/GrowthTreeScene.tsx");
  const visualVerification = source("scripts/verify-3d-dashboard.mjs");

  it("provides layered procedural environment factories", () => {
    expect(environment).toContain("createLake");
    expect(environment).toContain("createMountainLayers");
    expect(environment).toContain("flatShading: true");
    expect(environment).toContain("GLTFLoader");
    expect(environment).toContain("asset_load_failed");
    expect(environment).not.toContain("background-image");
  });

  it("creates a dynamic Lambert lake and flat-shaded mountain layers", () => {
    const lake = createLake();
    const mountains = createMountainLayers();
    const mountainMeshes: THREE.Mesh[] = [];
    mountains.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        mountainMeshes.push(object);
      }
    });

    expect(attributeUsage(lake.geometry.attributes.position)).toBe(
      THREE.DynamicDrawUsage
    );
    expect(lake.material).toBeInstanceOf(THREE.MeshLambertMaterial);
    expect(mountainMeshes.length).toBeGreaterThan(2);
    expect(
      mountainMeshes.every(
        (mesh) =>
          mesh.material instanceof THREE.MeshLambertMaterial &&
          mesh.material.flatShading
      )
    ).toBe(true);

    lake.geometry.dispose();
    lake.material.dispose();
    mountains.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        object.geometry.dispose();
        if (Array.isArray(object.material)) {
          object.material.forEach((material) => material.dispose());
        } else {
          object.material.dispose();
        }
      }
    });
  });

  it("loads an external tree as decoration without hiding the interactive tree", () => {
    const deferred = deferredLoader();
    const visibilityChange = vi.fn();
    const environment = createGrowthEnvironment({
      modelUrls: { tree: "/tree.glb", mountains: null, rocks: null },
      loaderFactory: () => deferred.loader,
      onTreeModelVisibilityChange: visibilityChange
    } as GrowthEnvironmentOptions & {
      onTreeModelVisibilityChange: typeof visibilityChange;
    });
    const decorativeTree = new THREE.Group();
    decorativeTree.add(
      new THREE.Mesh(
        new THREE.BoxGeometry(1, 2, 1),
        new THREE.MeshStandardMaterial()
      )
    );

    expect(deferred.loader.load).toHaveBeenCalledOnce();
    deferred.succeed(decorativeTree);

    expect(environment.group.getObjectByName("growth-tree-model")).toBe(
      decorativeTree
    );
    expect(decorativeTree.userData.decorative).toBe(true);
    expect(visibilityChange).not.toHaveBeenCalled();
    decorativeTree.updateMatrixWorld(true);
    const decorativeHits = new THREE.Raycaster(
      new THREE.Vector3(GROWTH_SCENE_CONFIG.treeOffsetX, 0, 5),
      new THREE.Vector3(0, 0, -1)
    ).intersectObject(decorativeTree, true);
    expect(decorativeHits).toEqual([]);
    environment.dispose();
  });

  it("keeps procedural fallback and reports one diagnostic for model failure", () => {
    const deferred = deferredLoader();
    const diagnostics: AssetLoadDiagnostic[] = [];
    const environment = createGrowthEnvironment({
      modelUrls: { tree: null, mountains: "/mountains.glb", rocks: null },
      loaderFactory: () => deferred.loader,
      onDiagnostic: (diagnostic) => diagnostics.push(diagnostic)
    });
    const fallback = environment.group.getObjectByName(
      "growth-mountain-layers"
    );

    deferred.fail(new Error("offline"));
    expect(fallback?.visible).toBe(true);
    expect(diagnostics).toMatchObject([
      { code: "asset_load_failed", asset: "mountains" }
    ]);

    environment.dispose();
    deferred.fail(new Error("late error"));
    expect(diagnostics).toHaveLength(1);
  });

  it("disposes loaded instance, skeleton, and shared resources exactly once", () => {
    const deferred = deferredLoader();
    const environment = createGrowthEnvironment({
      modelUrls: { tree: null, mountains: null, rocks: "/rocks.glb" },
      loaderFactory: () => deferred.loader
    });
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const material = new THREE.MeshStandardMaterial();
    const instance = new THREE.InstancedMesh(geometry, material, 1);
    const sharedMesh = new THREE.Mesh(geometry, material);
    const skeleton = new THREE.Skeleton([new THREE.Bone()]);
    const skinned = new THREE.SkinnedMesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial()
    );
    skinned.add(skeleton.bones[0]!);
    skinned.bind(skeleton);
    const model = new THREE.Group();
    model.add(instance, sharedMesh, skinned);
    const instanceDispose = vi.spyOn(instance, "dispose");
    const skeletonDispose = vi.spyOn(skeleton, "dispose");
    const geometryDispose = vi.spyOn(geometry, "dispose");
    const materialDispose = vi.spyOn(material, "dispose");

    deferred.succeed(model);
    environment.dispose();
    environment.dispose();

    expect(instanceDispose).toHaveBeenCalledOnce();
    expect(skeletonDispose).toHaveBeenCalledOnce();
    expect(geometryDispose).toHaveBeenCalledOnce();
    expect(materialDispose).toHaveBeenCalledOnce();
  });

  it("disposes a model that succeeds after its environment was disposed", () => {
    const deferred = deferredLoader();
    const environment = createGrowthEnvironment({
      modelUrls: { tree: "/tree.glb", mountains: null, rocks: null },
      loaderFactory: () => deferred.loader
    });
    const instance = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial(),
      1
    );
    const model = new THREE.Group();
    model.add(instance);
    const instanceDispose = vi.spyOn(instance, "dispose");

    environment.dispose();
    deferred.succeed(model);

    expect(instanceDispose).toHaveBeenCalledOnce();
    expect(environment.group.children).not.toContain(model);
  });

  it("centralizes approved composition, assets, and performance", () => {
    expect(config).toContain("treeOffsetX: -1.2");
    expect(config).not.toContain("colors:");
    expect(config).toContain("tree: null");
    expect(config).toContain("mountains: null");
    expect(config).toContain("rocks: null");
    expect(config).toContain("maxPixelRatio: 1.75");
    expect(config).toContain("shadows: true");
    expect(config).toContain('lakeReflection: "simple"');
  });

  it("uses deterministic instancing and updates vitality from the scene RAF", () => {
    expect(vitality).toContain("InstancedMesh");
    expect(vitality).toContain("updateVitalityElements");
    expect(vitality).not.toContain("Math.random");
    expect(scene).toContain("updateVitalityElements(elapsedSeconds)");
    expect(scene).toContain("GROWTH_SCENE_CONFIG.performance.maxPixelRatio");
    expect(scene).toContain("GROWTH_SCENE_CONFIG.treeOffsetX");
    expect(scene).not.toContain("externalTreeVisible");
    expect(scene).not.toContain("onTreeModelVisibilityChange");
    expect(scene).not.toContain("layer.group.visible");
    expect(scene).not.toContain("bg-[radial-gradient");
  });

  it("caps deterministic vitality instances and only animates eligible elements", () => {
    const elements = [
      ...Array.from({ length: 10 }, (_, index) =>
        vitalityElement("water", index)
      ),
      ...Array.from({ length: 5 }, (_, index) =>
        vitalityElement("creature", index)
      ),
      ...Array.from({ length: 11 }, (_, index) =>
        vitalityElement("flora", index)
      )
    ];
    const first = createVitalityElements(elements);
    const second = createVitalityElements(elements);
    const firstWater = instanceMesh(first, "water");
    const firstCreature = instanceMesh(first, "creature");
    const firstFlora = instanceMesh(first, "flora");

    expect([firstWater.count, firstCreature.count, firstFlora.count]).toEqual([
      7, 3, 8
    ]);
    expect(
      first.group.children.every(
        (child) =>
          child instanceof THREE.InstancedMesh &&
          child.instanceMatrix.usage === THREE.DynamicDrawUsage
      )
    ).toBe(true);
    for (const type of ["water", "creature", "flora"] as const) {
      expect(matrixSnapshot(instanceMesh(first, type))).toEqual(
        matrixSnapshot(instanceMesh(second, type))
      );
    }

    const waterBefore = matrixSnapshot(firstWater);
    const creatureBefore = matrixSnapshot(firstCreature);
    const floraBefore = matrixSnapshot(firstFlora);
    const waterMaterial = firstWater.material as THREE.MeshStandardMaterial;
    const waterHighlightBefore = waterMaterial.emissiveIntensity;
    first.updateVitalityElements(7);

    expect(matrixSnapshot(firstWater)).toEqual(waterBefore);
    expect(waterMaterial.emissiveIntensity).not.toBe(waterHighlightBefore);
    expect(matrixSnapshot(firstCreature)).not.toEqual(creatureBefore);
    expect(matrixSnapshot(firstFlora)).not.toEqual(floraBefore);

    first.dispose();
    second.dispose();
  });

  it("disposes every vitality instance and owned resource once", () => {
    const layer = createVitalityElements([
      vitalityElement("water", 0),
      vitalityElement("creature", 0),
      vitalityElement("flora", 0)
    ]);
    const spies = layer.group.children.map((child) => {
      const mesh = child as THREE.InstancedMesh;
      return {
        mesh: vi.spyOn(mesh, "dispose"),
        geometry: vi.spyOn(mesh.geometry, "dispose"),
        material: vi.spyOn(mesh.material as THREE.Material, "dispose")
      };
    });

    layer.dispose();
    layer.dispose();

    for (const spy of spies) {
      expect(spy.mesh).toHaveBeenCalledOnce();
      expect(spy.geometry).toHaveBeenCalledOnce();
      expect(spy.material).toHaveBeenCalledOnce();
    }
  });

  it("keeps desktop controls and mobile overflow checks in visual verification", () => {
    expect(visualVerification).toContain("果实面板");
    expect(visualVerification).toContain("近期生命力");
    expect(scene).toContain("data-scene-ready");
    expect(visualVerification).toContain("data-scene-ready");
    expect(visualVerification).toContain("newCDPSession");
    expect(visualVerification).toContain("Page.getLayoutMetrics");
    expect(visualVerification).toContain("contentSize.width");
    expect(visualVerification).toContain("withStageTimeout");
    expect(visualVerification).toContain("screenshot:start");
    expect(visualVerification).toContain("screenshot:end");
    expect(visualVerification).toMatch(
      /finally\s*{[\s\S]*await page\.close\(\)/
    );
    expect(visualVerification.indexOf("page.screenshot")).toBeGreaterThan(-1);
    expect(visualVerification.indexOf("page.screenshot")).toBeLessThan(
      visualVerification.indexOf("Page.getLayoutMetrics")
    );
    expect(visualVerification).not.toContain("page.evaluate(");
    expect(visualVerification).not.toContain("fullPage: true");
    expect(visualVerification).not.toContain("waitForTimeout(800)");
    expect(visualVerification).not.toContain("drawImage");
    expect(visualVerification).not.toContain("getImageData");
    expect(visualVerification).toContain("dashboard-3d-desktop.png");
    expect(visualVerification).toContain("dashboard-3d-mobile.png");
  });
});
