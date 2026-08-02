"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import type { DashboardData } from "@/src/domain/aggregation";
import {
  clearTreeSelection,
  selectTreeLeaf,
  selectTreeWood,
  type GrowthTreeSelection
} from "@/src/domain/tree-interaction";
import {
  buildGrowthTreeViewModel,
  type GrowthTreeLeaf,
  type GrowthTreeWoodSegment
} from "@/src/domain/tree-visualization";
import { GrowthTreeDetailsPanel } from "./GrowthTreeDetailsPanel";
import {
  createActivityLeafMesh,
  createWoodSegmentMesh
} from "./growth-tree-geometry";

type RealisticGrowthTreeProps = {
  data: DashboardData;
};

type WoodMesh = THREE.Mesh<
  THREE.CylinderGeometry,
  THREE.MeshStandardMaterial
>;
type LeafMesh = THREE.Mesh<THREE.ShapeGeometry, THREE.MeshStandardMaterial>;

function setPointerFromEvent(
  pointer: THREE.Vector2,
  event: PointerEvent,
  element: HTMLCanvasElement
): void {
  const rect = element.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
}

export function RealisticGrowthTree({ data }: RealisticGrowthTreeProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const woodMeshesRef = useRef<WoodMesh[]>([]);
  const leafMeshesRef = useRef<LeafMesh[]>([]);
  const asOf = useMemo(() => new Date(), []);
  const sceneModel = useMemo(
    () => buildGrowthTreeViewModel(data, asOf),
    [asOf, data]
  );
  const woodSegments = useMemo(
    () => [
      sceneModel.root,
      ...sceneModel.abilityBranches,
      ...sceneModel.longGoalTwigs,
      ...sceneModel.shortGoalBranches
    ],
    [sceneModel]
  );
  const [selection, setSelection] = useState<GrowthTreeSelection>(() =>
    clearTreeSelection()
  );

  const selectedSegment =
    woodSegments.find(
      (segment) =>
        segment.entityType === selection.entityType &&
        segment.entityId === selection.entityId
    ) ?? null;
  const selectedLeaf =
    sceneModel.activityLeaves.find(
      (leaf) => leaf.activityId === selection.leafId
    ) ?? null;

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) {
      return;
    }

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      preserveDrawingBuffer: true
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    renderer.setClearColor(0x9edcff, 1);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x9edcff);
    scene.fog = new THREE.Fog(0xcef4ff, 18, 42);

    const camera = new THREE.PerspectiveCamera(
      45,
      mount.clientWidth / mount.clientHeight,
      0.1,
      100
    );
    camera.position.set(0, 3.4, 9.6);

    const world = new THREE.Group();
    scene.add(world);

    const hemisphere = new THREE.HemisphereLight(0xdff6ff, 0x5e8f39, 2.15);
    scene.add(hemisphere);

    const sun = new THREE.DirectionalLight(0xfff0b5, 4.8);
    sun.position.set(-5.8, 9, 4.5);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.near = 0.5;
    sun.shadow.camera.far = 32;
    sun.shadow.camera.left = -8;
    sun.shadow.camera.right = 8;
    sun.shadow.camera.top = 8;
    sun.shadow.camera.bottom = -8;
    scene.add(sun);

    const fill = new THREE.DirectionalLight(0xbfe7ff, 1.1);
    fill.position.set(5, 4, -5);
    scene.add(fill);

    const grassCanvas = document.createElement("canvas");
    grassCanvas.width = 256;
    grassCanvas.height = 256;
    const grassContext = grassCanvas.getContext("2d");
    if (grassContext) {
      grassContext.fillStyle = "#3f6f35";
      grassContext.fillRect(0, 0, 256, 256);
      for (let index = 0; index < 900; index += 1) {
        const shade = 38 + (index % 40);
        grassContext.fillStyle = `rgba(${shade}, ${82 + (index % 38)}, ${34 + (index % 24)}, 0.34)`;
        const x = (index * 47) % 256;
        const y = (index * 83) % 256;
        grassContext.fillRect(x, y, 1 + (index % 3), 5 + (index % 7));
      }
    }
    const grassTexture = new THREE.CanvasTexture(grassCanvas);
    grassTexture.wrapS = THREE.RepeatWrapping;
    grassTexture.wrapT = THREE.RepeatWrapping;
    grassTexture.repeat.set(18, 18);

    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(18, 96),
      new THREE.MeshStandardMaterial({
        map: grassTexture,
        color: 0x567348,
        roughness: 0.97
      })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    world.add(ground);

    const meadowRing = new THREE.Mesh(
      new THREE.TorusGeometry(5.4, 0.012, 8, 180),
      new THREE.MeshBasicMaterial({
        color: 0xe7ffb8,
        transparent: true,
        opacity: 0.26
      })
    );
    meadowRing.position.y = 0.025;
    meadowRing.rotation.x = Math.PI / 2;
    world.add(meadowRing);

    const selectableWood: WoodMesh[] = [];
    const woodByObject = new Map<string, GrowthTreeWoodSegment>();
    for (const segment of woodSegments) {
      const mesh = createWoodSegmentMesh(segment);
      selectableWood.push(mesh);
      woodByObject.set(mesh.uuid, segment);
      world.add(mesh);
    }
    woodMeshesRef.current = selectableWood;

    const selectableLeaves: LeafMesh[] = [];
    const leafByObject = new Map<string, GrowthTreeLeaf>();
    for (const leaf of sceneModel.activityLeaves) {
      const mesh = createActivityLeafMesh(leaf);
      selectableLeaves.push(mesh);
      leafByObject.set(mesh.uuid, leaf);
      world.add(mesh);
    }
    leafMeshesRef.current = selectableLeaves;

    const pollenGeometry = new THREE.BufferGeometry();
    const pollenPositions: number[] = [];
    const vitality = Math.min(1, sceneModel.vitalityElements.length / 18);
    const pollenCount = 120 + Math.round(vitality * 160);
    for (let index = 0; index < pollenCount; index += 1) {
      const radius = 2.2 + (index % 31) * 0.09;
      const angle = index * 2.399963229728653;
      pollenPositions.push(
        Math.cos(angle) * radius,
        0.5 + (index % 90) * 0.032,
        Math.sin(angle) * radius
      );
    }
    pollenGeometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(pollenPositions, 3)
    );
    const pollen = new THREE.Points(
      pollenGeometry,
      new THREE.PointsMaterial({
        color: 0xfff0a8,
        size: 0.028,
        transparent: true,
        opacity: 0.58,
        depthWrite: false
      })
    );
    scene.add(pollen);

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let dragging = false;
    let lastX = 0;
    let lastY = 0;
    let pointerTravel = 0;
    let rotationVelocity = 0.0018;

    const onPointerDown = (event: PointerEvent) => {
      dragging = true;
      lastX = event.clientX;
      lastY = event.clientY;
      pointerTravel = 0;
      renderer.domElement.setPointerCapture(event.pointerId);
    };

    const onPointerMove = (event: PointerEvent) => {
      setPointerFromEvent(pointer, event, renderer.domElement);
      if (!dragging) {
        return;
      }

      const deltaX = event.clientX - lastX;
      const deltaY = event.clientY - lastY;
      pointerTravel += Math.hypot(deltaX, deltaY);
      world.rotation.y += deltaX * 0.006;
      rotationVelocity = deltaX * 0.00045;
      lastX = event.clientX;
      lastY = event.clientY;
    };

    const onPointerUp = (event: PointerEvent) => {
      dragging = false;
      if (renderer.domElement.hasPointerCapture(event.pointerId)) {
        renderer.domElement.releasePointerCapture(event.pointerId);
      }
      if (pointerTravel > 5) {
        return;
      }

      setPointerFromEvent(pointer, event, renderer.domElement);
      raycaster.setFromCamera(pointer, camera);

      const woodHit = raycaster.intersectObjects(selectableWood, false)[0];
      if (woodHit) {
        const segment = woodByObject.get(woodHit.object.uuid);
        if (segment) {
          setSelection((current) =>
            selectTreeWood(current, segment)
          );
          return;
        }
      }

      const leafHit = raycaster.intersectObjects(selectableLeaves, false)[0];
      if (leafHit) {
        const leaf = leafByObject.get(leafHit.object.uuid);
        if (leaf) {
          setSelection((current) => selectTreeLeaf(current, leaf));
          return;
        }
      }

      setSelection(clearTreeSelection());
    };

    const onPointerCancel = (event: PointerEvent) => {
      dragging = false;
      if (renderer.domElement.hasPointerCapture(event.pointerId)) {
        renderer.domElement.releasePointerCapture(event.pointerId);
      }
    };

    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      camera.position.z = THREE.MathUtils.clamp(
        camera.position.z + event.deltaY * 0.006,
        5.2,
        12
      );
      camera.position.y = THREE.MathUtils.clamp(
        camera.position.y + event.deltaY * 0.001,
        2.4,
        4.8
      );
    };

    const onResize = () => {
      const width = mount.clientWidth;
      const height = mount.clientHeight;
      renderer.setSize(width, height);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };

    renderer.domElement.addEventListener("pointerdown", onPointerDown);
    renderer.domElement.addEventListener("pointermove", onPointerMove);
    renderer.domElement.addEventListener("pointerup", onPointerUp);
    renderer.domElement.addEventListener("pointercancel", onPointerCancel);
    renderer.domElement.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("resize", onResize);

    let frame = 0;
    let animationId = 0;
    const animate = () => {
      frame += 0.012;
      world.rotation.y += rotationVelocity;
      rotationVelocity *= 0.986;
      pollen.rotation.y -= 0.0012;
      pollen.position.y = Math.sin(frame * 1.2) * 0.045;
      meadowRing.rotation.z += 0.0016;
      camera.lookAt(0, 2.5, 0);
      renderer.render(scene, camera);
      animationId = requestAnimationFrame(animate);
    };
    animate();

    return () => {
      cancelAnimationFrame(animationId);
      renderer.domElement.removeEventListener("pointerdown", onPointerDown);
      renderer.domElement.removeEventListener("pointermove", onPointerMove);
      renderer.domElement.removeEventListener("pointerup", onPointerUp);
      renderer.domElement.removeEventListener("pointercancel", onPointerCancel);
      renderer.domElement.removeEventListener("wheel", onWheel);
      window.removeEventListener("resize", onResize);

      selectableWood.forEach((mesh) => {
        mesh.geometry.dispose();
        mesh.material.dispose();
      });
      selectableLeaves.forEach((mesh) => {
        mesh.geometry.dispose();
        mesh.material.dispose();
      });
      ground.geometry.dispose();
      ground.material.dispose();
      meadowRing.geometry.dispose();
      meadowRing.material.dispose();
      pollen.geometry.dispose();
      pollen.material.dispose();
      grassTexture.dispose();
      renderer.dispose();
      woodMeshesRef.current = [];
      leafMeshesRef.current = [];
      if (mount.contains(renderer.domElement)) {
        mount.removeChild(renderer.domElement);
      }
    };
  }, [sceneModel, woodSegments]);

  useEffect(() => {
    woodMeshesRef.current.forEach((mesh) => {
      const selected =
        mesh.userData.entityType === selection.entityType &&
        mesh.userData.entityId === selection.entityId;
      mesh.material.color.setHex(
        selected ? 0xd1a06c : (mesh.userData.baseColor as number)
      );
      mesh.material.emissive.setHex(selected ? 0x4a2f14 : 0x000000);
      mesh.material.emissiveIntensity = selected ? 0.2 : 0;
    });

    leafMeshesRef.current.forEach((mesh) => {
      const enabled =
        (selection.entityType === "long_goal" ||
          selection.entityType === "short_goal") &&
        mesh.userData.goalId === selection.entityId;
      const selected = mesh.userData.leafId === selection.leafId;
      mesh.material.color.setHex(
        selected ? 0xb8ef75 : enabled ? 0x7dcc51 : 0x4d853a
      );
      mesh.material.emissive.setHex(selected ? 0x315d18 : 0x000000);
      mesh.material.emissiveIntensity = selected ? 0.24 : 0;
    });
  }, [selection]);

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#9edcff] text-[#17351d]">
      <div
        className="absolute inset-0"
        data-testid="realistic-growth-tree-canvas"
        ref={mountRef}
      />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_74%_16%,rgba(255,244,170,0.7),transparent_15%),linear-gradient(180deg,rgba(255,255,255,0.08),rgba(55,134,45,0.08)_72%,rgba(31,99,33,0.24))]" />
      <GrowthTreeDetailsPanel
        leaf={selectedLeaf}
        segment={selectedSegment}
        vitality={Math.min(1, sceneModel.vitalityElements.length / 18)}
      />
    </main>
  );
}
