"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { GrowthTreeSelection } from "@/src/domain/tree-interaction";
import type {
  ActivityLeaf,
  GrowthTreeViewModel,
  TreeWood
} from "@/src/domain/tree-visualization";
import {
  createRealisticGrowthTreeLayer,
  resolveTreeMaterialColor,
  type RealisticGrowthTreeLayer,
  type TreeSelectionTarget
} from "./RealisticGrowthTree";
import {
  beginPointerGesture,
  cancelPointerGesture,
  endPointerGesture,
  movePointerGesture,
  type PointerGestureState
} from "./growth-tree-pointer";
import {
  createGrowthEnvironment,
  type AssetLoadDiagnostic,
  type GrowthEnvironmentLayer
} from "./growth-tree/GrowthEnvironment";
import {
  createVitalityElements,
  type VitalityElementsLayer
} from "./growth-tree/VitalityElements";
import { GROWTH_SCENE_CONFIG } from "./growth-tree/scene-config";
import { HEALING_PALETTE } from "@/src/theme/healing-palette";
import {
  GROWTH_TREE_CAMERA_LIMITS,
  resolveMaximumPolarAngle
} from "./growth-tree-camera-constraints";
import { RAINY_SCENE_FILTER } from "./growth-tree-rain";

type GrowthTreeSceneProps = {
  viewModel: GrowthTreeViewModel;
  selection: GrowthTreeSelection;
  onSelectWood: (wood: Pick<TreeWood, "entityType" | "entityId">) => void;
  onSelectLeaf: (leaf: Pick<ActivityLeaf, "activityId" | "goalId">) => void;
  onClearSelection: () => void;
};

type SceneRuntime = {
  scene: THREE.Scene;
  environment: GrowthEnvironmentLayer | null;
  layer: RealisticGrowthTreeLayer | null;
  vitality: VitalityElementsLayer | null;
  hoveredUuid: string | null;
};

function pointerFromEvent(
  pointer: THREE.Vector2,
  event: PointerEvent,
  element: HTMLCanvasElement
): void {
  const rect = element.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
}

function meshMaterial(object: THREE.Object3D): THREE.MeshLambertMaterial | null {
  if (!(object instanceof THREE.Mesh)) {
    return null;
  }
  return object.material instanceof THREE.MeshLambertMaterial
    ? object.material
    : null;
}

function targetIsSelected(
  target: TreeSelectionTarget,
  selection: GrowthTreeSelection
): boolean {
  if (target.kind === "leaf") {
    return target.leafId === selection.leafId;
  }
  return (
    target.entityType === selection.entityType &&
    target.entityId === selection.entityId
  );
}

function updateLayerMaterials(
  layer: RealisticGrowthTreeLayer,
  selection: GrowthTreeSelection,
  hoveredUuid: string | null
): void {
  // Repaint the tree by interaction state / 根据交互状态重新上色
  for (const object of layer.selectable) {
    const target = layer.entityByUuid.get(object.uuid);
    const material = meshMaterial(object);
    if (!target || !material) {
      continue;
    }
    const hovered = object.uuid === hoveredUuid;
    const selected = targetIsSelected(target, selection);
    const related =
      target.kind === "leaf" &&
      (selection.entityType === "long_goal" ||
        selection.entityType === "short_goal") &&
      target.goalId === selection.entityId;
    const baseColor =
      target.kind === "leaf"
        ? new THREE.Color(HEALING_PALETTE.youngLeaf).getHex()
        : (material.userData.baseColor as number);
    // Leaves stay greener; wood keeps its trunk palette.
    // 叶子更偏绿色，树干保持木质主色。
    const leafHighlight = new THREE.Color(HEALING_PALETTE.matureLeaf).getHex();
    const color = resolveTreeMaterialColor(
      {
        baseColor,
        hoverColor:
          target.kind === "leaf"
            ? leafHighlight
            : (material.userData.hoverColor as number),
        selectedColor:
          target.kind === "leaf"
            ? leafHighlight
            : (material.userData.selectedColor as number),
        relatedColor:
          target.kind === "leaf"
            ? leafHighlight
            : (material.userData.relatedColor as number | undefined)
      },
      { selected, hovered, related }
    );
    material.color.setHex(color);
    material.emissive.setHex(
      selected ? (target.kind === "leaf" ? 0x315d18 : 0x4a2f14) : 0x000000
    );
    material.emissiveIntensity = selected ? 0.18 : 0;
  }
}

function selectedTarget(
  layer: RealisticGrowthTreeLayer,
  raycaster: THREE.Raycaster
): TreeSelectionTarget | null {
  const hit = raycaster.intersectObjects(layer.selectable, false)[0];
  return hit ? (layer.entityByUuid.get(hit.object.uuid) ?? null) : null;
}

export function GrowthTreeScene({
  viewModel,
  selection,
  onSelectWood,
  onSelectLeaf,
  onClearSelection
}: GrowthTreeSceneProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const runtimeRef = useRef<SceneRuntime | null>(null);
  const [assetDiagnostics, setAssetDiagnostics] = useState<
    AssetLoadDiagnostic[]
  >([]);
  // TODO: Replace this temporary manual switch with the future weather,
  // user-state, or Life OS condition.
  // TODO：未来根据天气、用户状态或 Life OS 业务条件自动控制天气。
  const [rainEnabled, setRainEnabled] = useState(true);
  const selectionRef = useRef(selection);
  const onSelectWoodRef = useRef(onSelectWood);
  const onSelectLeafRef = useRef(onSelectLeaf);
  const onClearSelectionRef = useRef(onClearSelection);
  selectionRef.current = selection;
  onSelectWoodRef.current = onSelectWood;
  onSelectLeafRef.current = onSelectLeaf;
  onClearSelectionRef.current = onClearSelection;

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) {
      return;
    }

    // Renderer / 相机 / 光照 together define the visual tone of the scene.
    // 渲染器 / 相机 / 光照共同决定整个画面的气质。
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setClearColor(0x000000, 0);
    renderer.domElement.style.transition = "filter 320ms ease";
    renderer.domElement.style.filter = rainEnabled ? RAINY_SCENE_FILTER : "none";
    renderer.shadowMap.enabled = GROWTH_SCENE_CONFIG.performance.shadows;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = null;
    // Fog softens distance and keeps the scene dreamy instead of flat.
    // 雾效用来柔化远景，让画面更治愈，而不是生硬平面。
    scene.fog = new THREE.Fog(HEALING_PALETTE.fog, 14, 38);
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
    const treeOrbitTarget = GROWTH_SCENE_CONFIG.treeOrbitTarget;
    const initialCameraOffset = GROWTH_SCENE_CONFIG.initialCameraOffset;
    camera.position.set(
      treeOrbitTarget.x + initialCameraOffset.x,
      treeOrbitTarget.y + initialCameraOffset.y,
      treeOrbitTarget.z + initialCameraOffset.z
    );
    const controls = new OrbitControls(camera, renderer.domElement);
    // Camera framing is slightly off-center so the tree has depth and breathing room.
    // 相机略微偏心构图，让树有层次，也留出画面呼吸感。
    controls.enableDamping = true;
    controls.target.set(
      GROWTH_SCENE_CONFIG.treeOrbitTarget.x,
      GROWTH_SCENE_CONFIG.treeOrbitTarget.y,
      GROWTH_SCENE_CONFIG.treeOrbitTarget.z
    );
    controls.minDistance = GROWTH_TREE_CAMERA_LIMITS.minimumDistance;
    controls.maxDistance = GROWTH_TREE_CAMERA_LIMITS.maximumDistance;
    // Users may orbit horizontally, but cannot pan around the angle limits.
    // 用户可以水平绕树观察，但不能通过平移绕过俯仰限制。
    controls.enablePan = false;
    controls.minAzimuthAngle = GROWTH_TREE_CAMERA_LIMITS.minimumAzimuthAngle;
    controls.maxAzimuthAngle = GROWTH_TREE_CAMERA_LIMITS.maximumAzimuthAngle;
    controls.minPolarAngle = GROWTH_TREE_CAMERA_LIMITS.minimumPolarAngle;
    controls.maxPolarAngle = resolveMaximumPolarAngle({
      distance: camera.position.distanceTo(controls.target),
      targetY: controls.target.y
    });

    // Sky light / 天光：给树冠和地面一个柔和的整体色调。
    scene.add(new THREE.HemisphereLight(0xdff6ff, 0x5e8f39, 2.15));
    const sun = new THREE.DirectionalLight(HEALING_PALETTE.sun, 4.8);
    sun.position.set(-5.8, 9, 4.5);
    sun.castShadow = true;
    scene.add(sun);
    const fill = new THREE.DirectionalLight(0xbfe7ff, 1.1);
    fill.position.set(5, 4, -5);
    scene.add(fill);

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const runtime: SceneRuntime = {
      scene,
      environment: null,
      layer: null,
      vitality: null,
      hoveredUuid: null
    };
    runtimeRef.current = runtime;
    // Environment layer handles mountains, lake, slope, and model fallbacks.
    // 环境层负责群山、湖泊、地形坡面和模型兜底。
    const environment = createGrowthEnvironment({
      onDiagnostic(diagnostic) {
        setAssetDiagnostics((current) =>
          current.some(
            (entry) =>
              entry.asset === diagnostic.asset && entry.url === diagnostic.url
          )
            ? current
            : [...current, diagnostic]
        );
      }
    });
    runtime.environment = environment;
    environment.setRainEnabled(rainEnabled);
    scene.add(environment.group);
    let pointerGesture: PointerGestureState | null = null;

    const resize = () => {
      const width = Math.max(1, mount.clientWidth);
      const height = Math.max(1, mount.clientHeight);
      renderer.setPixelRatio(
        Math.min(
          window.devicePixelRatio || 1,
          GROWTH_SCENE_CONFIG.performance.maxPixelRatio
        )
      );
      renderer.setSize(width, height);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };
    const raycast = (event: PointerEvent): TreeSelectionTarget | null => {
      const layer = runtime.layer;
      if (!layer) {
        return null;
      }
      pointerFromEvent(pointer, event, renderer.domElement);
      raycaster.setFromCamera(pointer, camera);
      return selectedTarget(layer, raycaster);
    };
    const capturePointer = (pointerId: number) => {
      try {
        renderer.domElement.setPointerCapture(pointerId);
      } catch {
        // The pointer may already have ended before capture is established.
      }
    };
    const releasePointer = (pointerId: number) => {
      try {
        if (renderer.domElement.hasPointerCapture(pointerId)) {
          renderer.domElement.releasePointerCapture(pointerId);
        }
      } catch {
        // Losing capture during controls cleanup is safe to ignore.
      }
    };
    const onPointerDown = (event: PointerEvent) => {
      const nextGesture = beginPointerGesture(pointerGesture, event);
      if (nextGesture === pointerGesture) {
        return;
      }
      pointerGesture = nextGesture;
      if (pointerGesture) {
        capturePointer(pointerGesture.pointerId);
      }
    };
    const onPointerMove = (event: PointerEvent) => {
      pointerGesture = movePointerGesture(pointerGesture, event);
      const layer = runtime.layer;
      if (!layer) {
        return;
      }
      pointerFromEvent(pointer, event, renderer.domElement);
      raycaster.setFromCamera(pointer, camera);
      const hit = raycaster.intersectObjects(layer.selectable, false)[0];
      const nextHoveredUuid = hit?.object.uuid ?? null;
      if (runtime.hoveredUuid !== nextHoveredUuid) {
        runtime.hoveredUuid = nextHoveredUuid;
        updateLayerMaterials(layer, selectionRef.current, nextHoveredUuid);
      }
    };
    const onPointerUp = (event: PointerEvent) => {
      const completed = endPointerGesture(pointerGesture, event);
      pointerGesture = completed.state;
      if (!completed.matched) {
        return;
      }
      releasePointer(event.pointerId);
      if (!completed.isClick) {
        return;
      }
      const target = raycast(event);
      if (!target) {
        onClearSelectionRef.current();
      } else if (target.kind === "leaf") {
        onSelectLeafRef.current({
          activityId: target.leafId!,
          goalId: target.goalId!
        });
      } else {
        onSelectWoodRef.current({
          entityType: target.entityType as TreeWood["entityType"],
          entityId: target.entityId
        });
      }
    };
    const onPointerCancel = (event: PointerEvent) => {
      const cancelled = cancelPointerGesture(pointerGesture, event.pointerId);
      pointerGesture = cancelled.state;
      if (cancelled.matched) {
        releasePointer(event.pointerId);
      }
    };
    const onPointerLeave = () => {
      runtime.hoveredUuid = null;
      if (runtime.layer) {
        updateLayerMaterials(runtime.layer, selectionRef.current, null);
      }
    };

    resize();
    renderer.domElement.addEventListener("pointerdown", onPointerDown);
    renderer.domElement.addEventListener("pointermove", onPointerMove);
    renderer.domElement.addEventListener("pointerup", onPointerUp);
    renderer.domElement.addEventListener("pointercancel", onPointerCancel);
    renderer.domElement.addEventListener("pointerleave", onPointerLeave);
    window.addEventListener("resize", resize);

    let animationId = 0;
    const startedAt = performance.now() / 1_000;
    const animate = (timestamp: number) => {
      const elapsedSeconds = timestamp / 1_000 - startedAt;
      runtime.environment?.update(elapsedSeconds);
      runtime.vitality?.updateVitalityElements(elapsedSeconds);
      // Zoom changes the lowest safe orbit angle, so recompute it every frame.
      // 缩放会改变安全仰视角，因此每帧根据距离重新计算，防止相机穿地。
      controls.maxPolarAngle = resolveMaximumPolarAngle({
        distance: camera.position.distanceTo(controls.target),
        targetY: controls.target.y
      });
      controls.update();
      renderer.render(scene, camera);
      if (
        runtime.environment &&
        runtime.layer &&
        runtime.vitality &&
        renderer.domElement.getAttribute("data-scene-ready") !== "true"
      ) {
        renderer.domElement.setAttribute("data-scene-ready", "true");
        renderer.domElement.setAttribute(
          "data-scene-objects",
          JSON.stringify({
            lake: scene.getObjectByName("growth-lake") ? 1 : 0,
            mountains: scene.getObjectByName("growth-mountain-layers") ? 1 : 0,
            tree: runtime.layer.stats.maxRadialSegments > 0
              ? viewModel.branches.length
              : 0,
            leaves: {
              decorative: runtime.layer.stats.decorativeLeaves,
              activity: runtime.layer.stats.activityLeaves
            },
            vitality: runtime.vitality.group.children.reduce(
              (count, object) =>
                count +
                (object instanceof THREE.InstancedMesh ? object.count : 0),
              0
            )
          })
        );
      }
      animationId = requestAnimationFrame(animate);
    };
    animationId = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(animationId);
      renderer.domElement.removeEventListener("pointerdown", onPointerDown);
      renderer.domElement.removeEventListener("pointermove", onPointerMove);
      renderer.domElement.removeEventListener("pointerup", onPointerUp);
      renderer.domElement.removeEventListener("pointercancel", onPointerCancel);
      renderer.domElement.removeEventListener("pointerleave", onPointerLeave);
      window.removeEventListener("resize", resize);
      if (runtime.layer) {
        scene.remove(runtime.layer.group);
        runtime.layer.dispose();
        runtime.layer = null;
      }
      if (runtime.vitality) {
        scene.remove(runtime.vitality.group);
        runtime.vitality.dispose();
        runtime.vitality = null;
      }
      if (runtime.environment) {
        scene.remove(runtime.environment.group);
        runtime.environment.dispose();
        runtime.environment = null;
      }
      controls.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.removeAttribute("data-scene-ready");
      renderer.domElement.removeAttribute("data-scene-objects");
      runtimeRef.current = null;
      if (mount.contains(renderer.domElement)) {
        mount.removeChild(renderer.domElement);
      }
    };
  }, []);

  useEffect(() => {
    runtimeRef.current?.environment?.setRainEnabled(rainEnabled);
    const canvas = mountRef.current?.querySelector("canvas");
    if (canvas) {
      canvas.style.filter = rainEnabled ? RAINY_SCENE_FILTER : "none";
    }
  }, [rainEnabled]);

  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!runtime) {
      return;
    }
    if (runtime.layer) {
      runtime.scene.remove(runtime.layer.group);
      runtime.layer.dispose();
    }
    const layer = createRealisticGrowthTreeLayer(viewModel);
    layer.group.position.x = GROWTH_SCENE_CONFIG.treeOffsetX;
    runtime.layer = layer;
    runtime.hoveredUuid = null;
    runtime.scene.add(layer.group);
    const vitality = createVitalityElements(viewModel.vitalityElements);
    runtime.vitality = vitality;
    runtime.scene.add(vitality.group);
    updateLayerMaterials(layer, selectionRef.current, null);
    return () => {
      if (runtime.layer === layer) {
        runtime.scene.remove(layer.group);
        layer.dispose();
        runtime.layer = null;
      }
      if (runtime.vitality === vitality) {
        runtime.scene.remove(vitality.group);
        vitality.dispose();
        runtime.vitality = null;
      }
    };
  }, [viewModel]);

  useEffect(() => {
    const runtime = runtimeRef.current;
    if (runtime?.layer) {
      updateLayerMaterials(
        runtime.layer,
        selection,
        runtime.hoveredUuid
      );
    }
  }, [selection, viewModel]);

  return (
    <div className="growth-scene-sky relative min-h-screen overflow-hidden text-[var(--healing-ui-text)]">
      <div
        className="absolute inset-0"
        data-testid="realistic-growth-tree-canvas"
        ref={mountRef}
      />
      <div
        aria-label="近期生命力"
        className="pointer-events-none absolute bottom-4 left-4 rounded-full border border-[#365c43]/20 bg-[#f4f6e9]/85 px-3 py-2 text-xs font-medium text-[#294a34] shadow-md backdrop-blur"
        role="status"
      >
        近期生命力 · 水滴 {viewModel.vitalityElements.filter((item) => item.type === "water").length} · 小生物 {viewModel.vitalityElements.filter((item) => item.type === "creature").length} · 花草 {viewModel.vitalityElements.filter((item) => item.type === "flora").length}
      </div>
      <button
        aria-checked={rainEnabled}
        aria-label="细雨"
        className="absolute bottom-4 right-4 z-20 inline-flex items-center gap-2 rounded-full border border-[#315d3a]/20 bg-[#fff8ea]/88 px-3 py-2 text-xs font-semibold text-[#59483a] shadow-md backdrop-blur transition hover:bg-[#fff8ea] focus:outline-none focus:ring-2 focus:ring-[#315d3a]"
        onClick={() => setRainEnabled((enabled) => !enabled)}
        role="switch"
        type="button"
      >
        <span
          aria-hidden="true"
          className={`relative h-5 w-9 rounded-full transition ${
            rainEnabled ? "bg-[#6f9fba]" : "bg-[#b9b5a9]"
          }`}
        >
          <span
            className={`absolute top-0.5 h-4 w-4 rounded-full bg-[#fff8ea] shadow-sm transition-transform ${
              rainEnabled ? "translate-x-[18px]" : "translate-x-0.5"
            }`}
          />
        </span>
        细雨
      </button>
      {assetDiagnostics.length > 0 ? (
        <aside
          aria-label="资源加载提示"
          className="absolute bottom-16 left-4 max-w-xs rounded-xl border border-[#8a632a]/25 bg-[#fff8df]/92 px-3 py-2 text-xs text-[#65491f] shadow-md backdrop-blur"
          role="status"
        >
          {assetDiagnostics.map((diagnostic) => (
            <p key={`${diagnostic.asset}-${diagnostic.url}`}>
              asset_load_failed：{diagnostic.asset} 模型加载失败，已使用默认场景。
            </p>
          ))}
        </aside>
      ) : null}
    </div>
  );
}
