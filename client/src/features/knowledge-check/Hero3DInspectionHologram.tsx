import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { playScan, playClick } from "./audio";

interface InspectionPoint {
  id: string;
  title: string;
  code: string;
  stage: string;
  detail: string;
  position: [number, number, number];
}

const INSPECTION_POINTS: InspectionPoint[] = [
  {
    id: "anchor",
    title: "Surface Anchor Profile",
    code: "ISO 8503 / ASTM D4417",
    stage: "Preparation",
    detail:
      "50–75 µm angular blast profile required for mechanical adhesion. Check with surface profile gauge or replica tape.",
    position: [-1.4, 0.9, 0.8],
  },
  {
    id: "weld",
    title: "Weld Seam Stripe Coat",
    code: "SSPC-PA Guide 11",
    stage: "Application",
    detail:
      "Brush-applied stripe coat over weld seams, sharp edges, and crevices to prevent premature edge corrosion.",
    position: [0, 0.95, 0.75],
  },
  {
    id: "dft",
    title: "Dry Film Thickness (DFT)",
    code: "SSPC-PA 2 / ISO 19840",
    stage: "Quality Acceptance",
    detail:
      "Specified nominal DFT 250 µm. Check spot readings according to 80/20 rule (min 80% / max 120% per tier).",
    position: [1.3, 0.9, 0.8],
  },
];

export function Hero3DInspectionHologram({ onInspect }: { onInspect?: (pointId: string) => void }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [activePoint, setActivePoint] = useState<InspectionPoint>(INSPECTION_POINTS[0]!);
  const [isRotating, setIsRotating] = useState(true);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
        powerPreference: "low-power",
      });
    } catch {
      return;
    }

    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(
      40,
      container.clientWidth / container.clientHeight,
      0.1,
      50,
    );
    camera.position.set(0, 1.8, 4.4);

    // Cinematic industrial studio lighting
    const ambient = new THREE.AmbientLight(0xbad2e8, 1.2);
    scene.add(ambient);

    const keyLight = new THREE.DirectionalLight(0xffffff, 2.8);
    keyLight.position.set(4, 5, 3);
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0x38bdf8, 2.0);
    rimLight.position.set(-4, -2, -3);
    scene.add(rimLight);

    const rootGroup = new THREE.Group();
    scene.add(rootGroup);

    // 1. Heavy industrial flanged pipe spool
    // Pipe cylinder
    const pipeGeo = new THREE.CylinderGeometry(0.7, 0.7, 3.4, 36, 1, true);
    const pipeMat = new THREE.MeshStandardMaterial({
      color: 0x1e3a5f,
      roughness: 0.35,
      metalness: 0.7,
    });
    const pipe = new THREE.Mesh(pipeGeo, pipeMat);
    pipe.rotation.z = Math.PI / 2;
    rootGroup.add(pipe);

    // High-visibility safety topcoat stripe
    const stripeGeo = new THREE.CylinderGeometry(0.705, 0.705, 1.1, 36);
    const stripeMat = new THREE.MeshStandardMaterial({
      color: 0x0284c7, // vibrant HTS blue
      roughness: 0.25,
      metalness: 0.5,
    });
    const stripe = new THREE.Mesh(stripeGeo, stripeMat);
    stripe.rotation.z = Math.PI / 2;
    stripe.position.x = 0.5;
    rootGroup.add(stripe);

    // Pipe flanges (both ends)
    [-1.7, 1.7].forEach((xPos) => {
      const flangeGeo = new THREE.CylinderGeometry(1.0, 1.0, 0.14, 32);
      const flangeMat = new THREE.MeshStandardMaterial({
        color: 0x334e68,
        roughness: 0.4,
        metalness: 0.8,
      });
      const flange = new THREE.Mesh(flangeGeo, flangeMat);
      flange.rotation.z = Math.PI / 2;
      flange.position.x = xPos;
      rootGroup.add(flange);

      // Flange bolt heads
      for (let i = 0; i < 8; i++) {
        const angle = (i / 8) * Math.PI * 2;
        const boltGeo = new THREE.CylinderGeometry(0.045, 0.045, 0.18, 6);
        const boltMat = new THREE.MeshStandardMaterial({
          color: 0xd9e2ec,
          metalness: 0.9,
          roughness: 0.2,
        });
        const bolt = new THREE.Mesh(boltGeo, boltMat);
        bolt.rotation.z = Math.PI / 2;
        bolt.position.set(
          xPos + (xPos > 0 ? 0.08 : -0.08),
          Math.cos(angle) * 0.85,
          Math.sin(angle) * 0.85,
        );
        rootGroup.add(bolt);
      }
    });

    // Weld seam ring in center
    const weldGeo = new THREE.TorusGeometry(0.71, 0.035, 12, 48);
    const weldMat = new THREE.MeshStandardMaterial({
      color: 0x94a3b8,
      roughness: 0.6,
      metalness: 0.75,
    });
    const weld = new THREE.Mesh(weldGeo, weldMat);
    weld.rotation.y = Math.PI / 2;
    rootGroup.add(weld);

    // 2. Holographic laser scan ring
    const laserGeo = new THREE.RingGeometry(0.75, 0.82, 48);
    const laserMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.85,
    });
    const laserRing = new THREE.Mesh(laserGeo, laserMat);
    laserRing.rotation.y = Math.PI / 2;
    rootGroup.add(laserRing);

    // 3. Hotspot markers
    const markerMeshes: { id: string; group: THREE.Group; glow: THREE.Mesh }[] = [];
    INSPECTION_POINTS.forEach((pt) => {
      const g = new THREE.Group();
      g.position.set(...pt.position);
      g.userData["pointId"] = pt.id;

      const sphereGeo = new THREE.SphereGeometry(0.08, 16, 16);
      const sphereMat = new THREE.MeshStandardMaterial({
        color: 0x38bdf8,
        emissive: 0x0284c7,
        emissiveIntensity: 0.8,
        roughness: 0.2,
      });
      const sphere = new THREE.Mesh(sphereGeo, sphereMat);
      g.add(sphere);

      const pulseGeo = new THREE.RingGeometry(0.09, 0.13, 24);
      const pulseMat = new THREE.MeshBasicMaterial({
        color: 0x7dd3fc,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.7,
      });
      const pulse = new THREE.Mesh(pulseGeo, pulseMat);
      pulse.rotation.x = Math.PI / 2;
      g.add(pulse);

      rootGroup.add(g);
      markerMeshes.push({ id: pt.id, group: g, glow: pulse });
    });

    // Orbit controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.enableZoom = false;
    controls.enablePan = false;
    controls.minPolarAngle = Math.PI * 0.3;
    controls.maxPolarAngle = Math.PI * 0.65;
    controls.target.set(0, 0, 0);

    // Interaction via raycasting
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    const handlePointerDown = (e: MouseEvent | TouchEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      const clientX = "touches" in e ? e.touches[0]!.clientX : e.clientX;
      const clientY = "touches" in e ? e.touches[0]!.clientY : e.clientY;
      mouse.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(mouse, camera);
      const hits = raycaster.intersectObjects(rootGroup.children, true);
      for (const hit of hits) {
        let obj: THREE.Object3D | null = hit.object;
        while (obj && !obj.userData["pointId"]) {
          obj = obj.parent;
        }
        if (obj?.userData["pointId"]) {
          const pt = INSPECTION_POINTS.find((p) => p.id === obj!.userData["pointId"]);
          if (pt) {
            setActivePoint(pt);
            playScan();
            onInspect?.(pt.id);
            break;
          }
        }
      }
    };

    renderer.domElement.addEventListener("click", handlePointerDown);

    const handleResize = () => {
      if (!container) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };

    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(container);

    let laserDirection = 1;
    let animId: number;

    const animate = (time: number) => {
      animId = requestAnimationFrame(animate);

      // Auto rotation if not interacting
      if (isRotating) {
        rootGroup.rotation.y = Math.sin(time * 0.0006) * 0.45;
      }

      // Laser sweep back and forth
      laserRing.position.x += 0.015 * laserDirection;
      if (laserRing.position.x > 1.4) laserDirection = -1;
      if (laserRing.position.x < -1.4) laserDirection = 1;

      // Pulse markers
      markerMeshes.forEach((m) => {
        const scale = 1 + Math.sin(time * 0.005) * 0.2;
        m.glow.scale.set(scale, scale, 1);
      });

      controls.update();
      renderer.render(scene, camera);
    };

    animId = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(animId);
      resizeObserver.disconnect();
      renderer.domElement.removeEventListener("click", handlePointerDown);
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [isRotating, onInspect]);

  return (
    <div className="kc-hologram-card">
      <div className="kc-hologram-header">
        <div className="kc-hologram-tag">
          <span className="kc-hologram-dot" />
          <span>Interactive 3D Inspector Lab</span>
        </div>
        <button
          type="button"
          className="kc-hologram-toggle"
          onClick={() => {
            setIsRotating(!isRotating);
            playClick();
          }}
          aria-label={isRotating ? "Pause rotation" : "Resume auto-rotation"}
        >
          {isRotating ? "⏸ Pause spin" : "▶ Spin 3D"}
        </button>
      </div>

      <div className="kc-hologram-canvas-wrap" ref={containerRef}>
        <div className="kc-hologram-instructions">
          Drag to rotate · Click glowing blue checkpoints
        </div>
      </div>

      <div className="kc-hologram-details">
        <div className="kc-hologram-points-nav">
          {INSPECTION_POINTS.map((pt) => (
            <button
              key={pt.id}
              type="button"
              className={`kc-hologram-tab ${activePoint.id === pt.id ? "is-active" : ""}`}
              onClick={() => {
                setActivePoint(pt);
                playScan();
                onInspect?.(pt.id);
              }}
            >
              <span>{pt.stage}</span>
              <strong>{pt.title}</strong>
            </button>
          ))}
        </div>

        <div className="kc-hologram-info-box">
          <div className="kc-hologram-info-top">
            <h4>{activePoint.title}</h4>
            <span className="kc-hologram-code">{activePoint.code}</span>
          </div>
          <p>{activePoint.detail}</p>
        </div>
      </div>
    </div>
  );
}
