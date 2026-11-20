import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

export type SceneKind = "site" | "tools";
export type SceneHotspot = {
  id: string;
  label: string;
  description: string;
  position: [number, number, number];
};

export const sceneHotspots: Record<SceneKind, SceneHotspot[]> = {
  site: [
    {
      id: "documents",
      label: "Project office",
      description: "Review the controlled document kit.",
      position: [-5.2, 2.4, -2.2],
    },
    {
      id: "preparation",
      label: "Preparation zone",
      description: "Observe steel preparation and choose an ITP checkpoint.",
      position: [-1.9, 2.1, -1.1],
    },
    {
      id: "coating",
      label: "Coating zone",
      description: "Check the work area before application continues.",
      position: [2.5, 2.2, -2.2],
    },
    {
      id: "inspection",
      label: "Inspection station",
      description: "Assess the recorded evidence.",
      position: [0.4, 2.1, 2.4],
    },
    {
      id: "report",
      label: "Reporting desk",
      description: "Create the inspection record.",
      position: [5.1, 2.3, 2.1],
    },
  ],
  tools: [
    {
      id: "hygrometer",
      label: "Hygrometer",
      description: "Environmental condition instrument.",
      position: [-3.5, 2.1, 0],
    },
    {
      id: "profile",
      label: "Profile gauge",
      description: "Surface profile instrument.",
      position: [-1.1, 2.2, 0],
    },
    {
      id: "dft",
      label: "DFT gauge",
      description: "Dry film thickness instrument.",
      position: [1.2, 2.1, 0],
    },
    {
      id: "holiday",
      label: "Holiday detector",
      description: "Discontinuity inspection instrument.",
      position: [3.6, 2.2, 0],
    },
  ],
};

function addBox(
  parent: THREE.Object3D,
  size: [number, number, number],
  position: [number, number, number],
  color: THREE.ColorRepresentation,
  metalness = 0.1,
) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(...size),
    new THREE.MeshStandardMaterial({ color, metalness, roughness: 0.68 }),
  );
  mesh.position.set(...position);
  parent.add(mesh);
  return mesh;
}

function addCylinder(
  parent: THREE.Object3D,
  radiusTop: number,
  radiusBottom: number,
  height: number,
  position: [number, number, number],
  color: THREE.ColorRepresentation,
) {
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(radiusTop, radiusBottom, height, 24),
    new THREE.MeshStandardMaterial({ color, metalness: 0.5, roughness: 0.48 }),
  );
  mesh.position.set(...position);
  parent.add(mesh);
  return mesh;
}

function makeSite(scene: THREE.Scene) {
  addBox(scene, [15.5, 0.28, 9.2], [0, -0.16, 0], 0x193e5b);
  const grid = new THREE.GridHelper(15, 15, 0x497995, 0x31536d);
  grid.position.y = 0.01;
  scene.add(grid);

  // Project office and controlled-document desk.
  addBox(scene, [3.1, 2.2, 2.4], [-5.2, 1.1, -2.2], 0x577e92);
  addBox(scene, [3.45, 0.2, 2.75], [-5.2, 2.3, -2.2], 0x173550);
  addBox(scene, [0.72, 1.42, 0.09], [-4.1, 0.72, -0.95], 0x0d2a44);
  addBox(scene, [0.75, 0.48, 0.08], [-5.7, 1.4, -0.95], 0x8fc7dd);
  addBox(scene, [1.25, 0.12, 0.7], [-5.15, 0.84, 0.0], 0xb4c8cf);
  for (let i = 0; i < 4; i += 1)
    addBox(scene, [0.25, 0.06, 0.34], [-5.5 + i * 0.25, 0.94, 0.0], i === 3 ? 0xd79b5f : 0x2a6c96);

  // Steel preparation: pipe spool, supports and a worker silhouette.
  const pipe = addCylinder(scene, 0.76, 0.76, 3.6, [-1.8, 1.24, -1.1], 0xa9b5b9);
  pipe.rotation.z = Math.PI / 2;
  addBox(scene, [0.4, 0.9, 0.9], [-3.15, 0.45, -1.1], 0x465e6e);
  addBox(scene, [0.4, 0.9, 0.9], [-0.45, 0.45, -1.1], 0x465e6e);
  addCylinder(scene, 0.16, 0.2, 0.85, [-0.25, 0.63, -2.6], 0x2c76a3);
  addCylinder(scene, 0.16, 0.16, 0.23, [-0.25, 1.17, -2.6], 0xf2c982);

  // Coating area: test wall, visible stripe and safety barrier.
  addBox(scene, [2.7, 2.0, 0.36], [2.45, 1.05, -2.6], 0xb8c5c8);
  addBox(scene, [1.1, 1.85, 0.39], [3.2, 1.05, -2.59], 0x1778b4);
  for (const x of [0.9, 4.1]) {
    addCylinder(scene, 0.065, 0.065, 0.92, [x, 0.46, -0.35], 0xf0b34c);
  }
  addBox(scene, [3.2, 0.08, 0.08], [2.5, 0.77, -0.35], 0xf0b34c);

  // Inspection and report stations.
  addBox(scene, [2.5, 0.15, 1.25], [0.35, 0.8, 2.4], 0x8daab9);
  for (const x of [-0.55, 1.25]) addBox(scene, [0.12, 0.72, 0.12], [x, 0.38, 2.4], 0x42637a);
  addBox(scene, [0.82, 0.13, 0.6], [0.15, 0.96, 2.4], 0xe4d6aa);
  addBox(scene, [2.3, 1.8, 2.2], [5.1, 0.9, 2.0], 0x6b8494);
  addBox(scene, [1.25, 0.1, 0.66], [5.1, 1.23, 0.72], 0xd6e2e5);
  addBox(scene, [0.65, 0.04, 0.44], [5.1, 1.3, 0.72], 0xe7d3a5);
}

function makeTools(scene: THREE.Scene) {
  addBox(scene, [10.6, 0.36, 4.5], [0, 0.25, 0], 0x526e7d);
  addBox(scene, [10.6, 0.16, 4.5], [0, 0.5, 0], 0x9ab3bd);
  addBox(scene, [10.8, 3.2, 0.2], [0, 2.05, -2.18], 0x193d59);
  for (const x of [-4.2, -1.4, 1.4, 4.2])
    addBox(scene, [0.04, 2.7, 0.05], [x, 2.0, -2.05], 0x426e89);
  for (const x of [-3.5, -1.1, 1.2, 3.6])
    addCylinder(scene, 0.9, 0.94, 0.18, [x, 0.68, 0], 0x204a68);

  // Whirling hygrometer: paired shafts and rounded sensing heads.
  addBox(scene, [0.19, 0.86, 0.18], [-3.5, 1.19, 0], 0xd4e4e8);
  addBox(scene, [1.05, 0.1, 0.1], [-3.5, 1.63, 0], 0xc0d1d8);
  for (const x of [-3.98, -3.02]) addCylinder(scene, 0.16, 0.16, 0.28, [x, 1.65, 0], 0x3782a9);

  // Profile gauge: rugged case and projecting contact probe.
  addBox(scene, [0.94, 1.25, 0.36], [-1.1, 1.45, 0], 0x2577a5);
  addBox(scene, [0.65, 0.43, 0.03], [-1.1, 1.68, 0.2], 0x9ed8e8);
  addCylinder(scene, 0.065, 0.065, 0.44, [-1.1, 0.69, 0], 0xdce8e8);

  // DFT gauge: distinct generic handheld housing and dark display.
  addBox(scene, [0.92, 1.35, 0.32], [1.2, 1.43, 0], 0x164e7a);
  addBox(scene, [0.64, 0.52, 0.04], [1.2, 1.7, 0.18], 0xb6d7db);
  addCylinder(scene, 0.14, 0.14, 0.25, [1.2, 0.78, 0.03], 0xbfd5d9);

  // Holiday detector: box, probe wand and cable are generic silhouettes.
  addBox(scene, [1.12, 0.8, 0.6], [3.4, 1.12, -0.22], 0x1c6b96);
  addBox(scene, [0.62, 0.24, 0.04], [3.4, 1.24, 0.1], 0xb4d9e5);
  const wand = addCylinder(scene, 0.055, 0.055, 1.6, [4.14, 1.46, 0.25], 0xdce6e8);
  wand.rotation.z = -0.45;
}

function markerFor(hotspot: SceneHotspot) {
  const group = new THREE.Group();
  group.position.set(...hotspot.position);
  group.userData["hotspot"] = hotspot.id;
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.27, 0.035, 8, 28),
    new THREE.MeshBasicMaterial({ color: 0x74d7f7 }),
  );
  ring.rotation.x = Math.PI / 2;
  group.add(ring);
  const core = new THREE.Mesh(
    new THREE.SphereGeometry(0.105, 14, 10),
    new THREE.MeshBasicMaterial({ color: 0xe3f8ff }),
  );
  group.add(core);
  const hit = new THREE.Mesh(
    new THREE.SphereGeometry(0.48, 12, 8),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }),
  );
  group.add(hit);
  return { group, ring, core };
}

export function ThreeKnowledgeScene({
  kind,
  selectedId,
  onSelect,
}: {
  kind: SceneKind;
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const onSelectRef = useRef(onSelect);
  const selectedRef = useRef(selectedId);
  const focusRef = useRef<(id: string) => void>(() => {});
  const [mode, setMode] = useState<"3d" | "map">("3d");
  const [failed, setFailed] = useState(false);
  onSelectRef.current = onSelect;
  selectedRef.current = selectedId;

  useEffect(() => focusRef.current(selectedId), [selectedId]);

  useEffect(() => {
    if (mode !== "3d" || !hostRef.current) return;
    const host = hostRef.current;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "low-power" });
    } catch {
      setFailed(true);
      setMode("map");
      return;
    }

    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    host.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0d2c49);
    scene.fog = new THREE.Fog(0x0d2c49, 18, 42);
    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 80);
    camera.position.set(
      kind === "site" ? 12 : 0,
      kind === "site" ? 11 : 7,
      kind === "site" ? 16 : 14,
    );
    scene.add(new THREE.HemisphereLight(0xd3edff, 0x1f3749, 2.5));
    const sun = new THREE.DirectionalLight(0xffffff, 2.4);
    sun.position.set(-5, 12, 7);
    scene.add(sun);
    if (kind === "site") makeSite(scene);
    else makeTools(scene);

    const markers = sceneHotspots[kind].map((hotspot) => {
      const marker = markerFor(hotspot);
      scene.add(marker.group);
      return { ...marker, id: hotspot.id };
    });
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.065;
    controls.enablePan = false;
    controls.minDistance = kind === "site" ? 7 : 4;
    controls.maxDistance = kind === "site" ? 42 : 32;
    controls.maxPolarAngle = Math.PI * 0.49;
    controls.target.set(0, 0.7, 0);
    controls.update();

    let cameraGoal: THREE.Vector3 | null = null;
    let targetGoal: THREE.Vector3 | null = null;
    focusRef.current = (id) => {
      const hotspot = sceneHotspots[kind].find((entry) => entry.id === id);
      if (!hotspot) return;
      targetGoal = new THREE.Vector3(...hotspot.position);
      targetGoal.y = Math.max(0.8, targetGoal.y - 0.7);
      cameraGoal = targetGoal
        .clone()
        .add(
          new THREE.Vector3(
            kind === "site" ? 5.5 : 3.2,
            kind === "site" ? 5.6 : 3.5,
            kind === "site" ? 7 : 5.2,
          ),
        );
    };
    controls.addEventListener("start", () => {
      cameraGoal = null;
      targetGoal = null;
    });

    let compact: boolean | null = null;
    const resize = () => {
      const width = Math.max(1, host.clientWidth);
      const height = Math.max(1, host.clientHeight);
      const nextCompact = width < 620;
      if (compact !== nextCompact) {
        compact = nextCompact;
        camera.fov = nextCompact ? 55 : 42;
        camera.position.set(
          kind === "site" ? 12 : 0,
          kind === "site" ? 11 : 7,
          kind === "site" ? 16 : 14,
        );
        controls.target.set(0, 0.7, 0);
        cameraGoal = null;
        targetGoal = null;
      }
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(host);
    resize();

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let pointerStart: [number, number] | null = null;
    const pointerDown = (event: PointerEvent) => {
      pointerStart = [event.clientX, event.clientY];
    };
    const pointerUp = (event: PointerEvent) => {
      const start = pointerStart;
      pointerStart = null;
      if (!start || Math.hypot(event.clientX - start[0], event.clientY - start[1]) > 7) return;
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.set(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1,
      );
      raycaster.setFromCamera(pointer, camera);
      const hit = raycaster.intersectObjects(
        markers.map((marker) => marker.group),
        true,
      )[0];
      let object = hit?.object;
      while (object && !object.userData["hotspot"]) object = object.parent ?? undefined;
      if (object?.userData["hotspot"]) onSelectRef.current(object.userData["hotspot"] as string);
    };
    renderer.domElement.addEventListener("pointerdown", pointerDown);
    renderer.domElement.addEventListener("pointerup", pointerUp);

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    renderer.setAnimationLoop((time) => {
      if (cameraGoal && targetGoal) {
        camera.position.lerp(cameraGoal, reducedMotion ? 1 : 0.07);
        controls.target.lerp(targetGoal, reducedMotion ? 1 : 0.07);
        if (camera.position.distanceTo(cameraGoal) < 0.025) {
          cameraGoal = null;
          targetGoal = null;
        }
      }
      for (const marker of markers) {
        const active = selectedRef.current === marker.id;
        const pulse = reducedMotion
          ? 1
          : 1 + Math.sin(time * 0.003 + marker.group.position.x) * 0.12;
        marker.ring.scale.setScalar(active ? pulse * 1.45 : pulse);
        marker.core.scale.setScalar(active ? 1.25 : 1);
        (marker.ring.material as THREE.MeshBasicMaterial).color.setHex(
          active ? 0xffcd70 : 0x74d7f7,
        );
        marker.ring.rotation.z += reducedMotion ? 0 : 0.004;
      }
      controls.update();
      renderer.render(scene, camera);
    });

    return () => {
      focusRef.current = () => {};
      observer.disconnect();
      renderer.setAnimationLoop(null);
      renderer.domElement.removeEventListener("pointerdown", pointerDown);
      renderer.domElement.removeEventListener("pointerup", pointerUp);
      controls.dispose();
      scene.traverse((object) => {
        if (!(object instanceof THREE.Mesh || object instanceof THREE.LineSegments)) return;
        object.geometry.dispose();
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        materials.forEach((material) => material.dispose());
      });
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [kind, mode]);

  return (
    <div className="arc-scene-shell">
      <div className="arc-scene-topline">
        <span>
          {kind === "site"
            ? "Project site · training simulation"
            : "Instrument workbench · training simulation"}
        </span>
        <button
          type="button"
          onClick={() => setMode(mode === "3d" ? "map" : "3d")}
          disabled={failed && mode === "map"}
        >
          {mode === "3d" ? "Use 2D map" : failed ? "3D unavailable" : "Return to 3D"}
        </button>
      </div>
      {mode === "3d" ? (
        <div className="arc-scene-canvas" ref={hostRef}>
          <span className="arc-scene-hint">
            Drag to rotate · Scroll or pinch to zoom · Select a marker
          </span>
        </div>
      ) : (
        <div
          className={`arc-scene-map is-${kind}`}
          role="group"
          aria-label={kind === "site" ? "Project site map" : "Instrument workbench map"}
        >
          {sceneHotspots[kind].map((hotspot) => (
            <button
              key={hotspot.id}
              type="button"
              className={selectedId === hotspot.id ? "is-selected" : ""}
              onClick={() => onSelect(hotspot.id)}
            >
              <strong>{hotspot.label}</strong>
              <small>{hotspot.description}</small>
            </button>
          ))}
        </div>
      )}
      <div
        className="arc-scene-zones"
        role="group"
        aria-label={kind === "site" ? "Site locations" : "Workbench instruments"}
      >
        {sceneHotspots[kind].map((hotspot) => (
          <button
            key={hotspot.id}
            type="button"
            aria-pressed={selectedId === hotspot.id}
            onClick={() => onSelect(hotspot.id)}
          >
            {hotspot.label}
          </button>
        ))}
      </div>
    </div>
  );
}
