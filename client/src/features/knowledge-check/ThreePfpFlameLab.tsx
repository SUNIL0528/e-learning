import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { playScan, playSpark, playClick } from "./audio";

type LabMode = "pfp" | "flame-spray";

interface SteelProfile {
  id: string;
  name: string;
  hpOverA: number; // m^-1
  description: string;
  requiredDftMm: number;
}

const STEEL_PROFILES: SteelProfile[] = [
  {
    id: "hss-square",
    name: "Closed Square Tube (HSS 200x200x8)",
    hpOverA: 130,
    description: "Easiest to spray uniformly. Lower Hp/A heats more slowly, requiring moderate intumescent thickness.",
    requiredDftMm: 1.25,
  },
  {
    id: "i-beam",
    name: "Universal I-Beam (UB 305x165x40)",
    hpOverA: 215,
    description: "High perimeter exposed on 4 sides with re-entrant corners. Heats rapidly, requiring high PFP DFT.",
    requiredDftMm: 2.10,
  },
  {
    id: "l-angle",
    name: "Unequal L-Angle (L 150x90x10)",
    hpOverA: 280,
    description: "Slender cross-section with thin edges. Extreme Hp/A ratio requires maximum fireproofing thickness.",
    requiredDftMm: 2.85,
  },
];

export function ThreePfpFlameLab({ onComplete }: { onComplete?: () => void }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [labMode, setLabMode] = useState<LabMode>("pfp");
  const [activeProfile, setActiveProfile] = useState<SteelProfile>(STEEL_PROFILES[0]!);
  const [isFireActive, setIsFireActive] = useState(false);
  const [flameDistanceMm, setFlameDistanceMm] = useState(125); // optimal 100-150mm

  const isFireRef = useRef(isFireActive);
  isFireRef.current = isFireActive;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "low-power" });
    } catch {
      return;
    }

    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a1c2e);

    const camera = new THREE.PerspectiveCamera(40, container.clientWidth / container.clientHeight, 0.1, 50);
    camera.position.set(0, 1.8, 4.2);

    const ambient = new THREE.AmbientLight(0xbad2e8, 1.3);
    scene.add(ambient);

    const keyLight = new THREE.DirectionalLight(0xffffff, 2.5);
    keyLight.position.set(4, 5, 4);
    scene.add(keyLight);

    const orangeLight = new THREE.PointLight(0xf97316, 0, 10);
    orangeLight.position.set(0, 0.5, 1.5);
    scene.add(orangeLight);

    const rootGroup = new THREE.Group();
    scene.add(rootGroup);

    // Dynamic Steel Mesh
    let steelMesh: THREE.Object3D;
    let charMesh: THREE.Mesh | null = null;

    if (labMode === "pfp") {
      const pId = activeProfile.id;
      if (pId === "hss-square") {
        // Hollow square tube
        const tubeGeo = new THREE.BoxGeometry(0.8, 2.2, 0.8);
        const tubeMat = new THREE.MeshStandardMaterial({ color: 0x334e68, roughness: 0.4, metalness: 0.8 });
        steelMesh = new THREE.Mesh(tubeGeo, tubeMat);
      } else if (pId === "i-beam") {
        // I-Beam assembly
        const g = new THREE.Group();
        const mat = new THREE.MeshStandardMaterial({ color: 0x334e68, roughness: 0.4, metalness: 0.8 });
        // Web
        const web = new THREE.Mesh(new THREE.BoxGeometry(0.12, 2.2, 1.0), mat);
        g.add(web);
        // Top flange
        const topFlange = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.12, 1.0), mat);
        topFlange.position.y = 1.05;
        g.add(topFlange);
        // Bottom flange
        const botFlange = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.12, 1.0), mat);
        botFlange.position.y = -1.05;
        g.add(botFlange);
        steelMesh = g;
      } else {
        // L-Angle
        const g = new THREE.Group();
        const mat = new THREE.MeshStandardMaterial({ color: 0x334e68, roughness: 0.4, metalness: 0.8 });
        const leg1 = new THREE.Mesh(new THREE.BoxGeometry(0.12, 2.2, 0.9), mat);
        leg1.position.z = -0.45;
        g.add(leg1);
        const leg2 = new THREE.Mesh(new THREE.BoxGeometry(0.7, 2.2, 0.12), mat);
        leg2.position.x = 0.35;
        g.add(leg2);
        steelMesh = g;
      }
      rootGroup.add(steelMesh);

      // Intumescent Char Layer Mesh
      const charGeo = new THREE.BoxGeometry(0.86, 2.26, 0.86);
      const charMat = new THREE.MeshStandardMaterial({
        color: 0x18181b,
        roughness: 0.95,
        metalness: 0.1,
        transparent: true,
        opacity: 0,
      });
      charMesh = new THREE.Mesh(charGeo, charMat);
      rootGroup.add(charMesh);
    } else {
      // Flame Spray Lab
      // Coated steel pipe
      const pipeGeo = new THREE.CylinderGeometry(0.55, 0.55, 2.4, 32);
      const pipeMat = new THREE.MeshStandardMaterial({ color: 0x475569, metalness: 0.7, roughness: 0.4 });
      steelMesh = new THREE.Mesh(pipeGeo, pipeMat);
      rootGroup.add(steelMesh);

      // Flame torch nozzle
      const torchG = new THREE.Group();
      torchG.position.set(0, 0, (flameDistanceMm / 100) * 1.2);
      torchG.rotation.x = Math.PI / 2;

      const nozzle = new THREE.Mesh(
        new THREE.CylinderGeometry(0.08, 0.14, 0.4, 16),
        new THREE.MeshStandardMaterial({ color: 0xd97706, metalness: 0.9, roughness: 0.2 })
      );
      torchG.add(nozzle);

      // Flame plume
      const flameGeo = new THREE.ConeGeometry(0.14, 0.8, 16);
      const flameMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.85 });
      const flame = new THREE.Mesh(flameGeo, flameMat);
      flame.rotation.x = Math.PI;
      flame.position.y = 0.55;
      torchG.add(flame);

      rootGroup.add(torchG);
    }

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.minDistance = 2.4;
    controls.maxDistance = 6.5;

    const handleResize = () => {
      if (!container) return;
      camera.aspect = container.clientWidth / container.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(container.clientWidth, container.clientHeight);
    };

    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(container);

    let animId: number;
    let charScale = 1.0;

    const animate = (time: number) => {
      animId = requestAnimationFrame(animate);

      if (labMode === "pfp" && charMesh) {
        if (isFireRef.current) {
          // Heat up & expand intumescent char 50x in volume (scale to ~1.45 linear)
          charScale = Math.min(1.42, charScale + 0.008);
          (charMesh.material as THREE.MeshStandardMaterial).opacity = Math.min(0.96, (charScale - 1) * 2.5);
          orangeLight.intensity = 2.5 + Math.sin(time * 0.02) * 1.2;
        } else {
          charScale = Math.max(1.0, charScale - 0.015);
          (charMesh.material as THREE.MeshStandardMaterial).opacity = Math.max(0, (charScale - 1) * 2.5);
          orangeLight.intensity = 0;
        }
        charMesh.scale.set(charScale, 1.01, charScale);
      }

      controls.update();
      renderer.render(scene, camera);
    };

    animId = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(animId);
      resizeObserver.disconnect();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [labMode, activeProfile, flameDistanceMm]);

  return (
    <div className="arc-3d-pfp-lab">
      <div className="arc-pfp-top">
        <div className="arc-pfp-mode-tabs">
          <button
            type="button"
            className={`arc-pfp-tab ${labMode === "pfp" ? "is-active" : ""}`}
            onClick={() => {
              setLabMode("pfp");
              playClick();
            }}
          >
            🔥 Passive Fire Protection (PFP & Hp/A)
          </button>
          <button
            type="button"
            className={`arc-pfp-tab ${labMode === "flame-spray" ? "is-active" : ""}`}
            onClick={() => {
              setLabMode("flame-spray");
              playClick();
            }}
          >
            ⚡ 3,000°C Thermal Flame Spraying
          </button>
        </div>
      </div>

      <div className="arc-pfp-canvas-container" ref={containerRef}>
        <div className="arc-scene-hint">
          {labMode === "pfp"
            ? "Orbit 360° · Switch structural profile & click 'Simulate Fire Heat Flux'"
            : "Orbit 360° · Calibrate stand-off distance to 100–150 mm"}
        </div>
      </div>

      {labMode === "pfp" ? (
        <div className="arc-pfp-controls">
          <div className="arc-pfp-profile-row">
            <span>Select Structural Steel Profile:</span>
            <div className="arc-profile-buttons">
              {STEEL_PROFILES.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className={`arc-profile-btn ${activeProfile.id === p.id ? "is-selected" : ""}`}
                  onClick={() => {
                    setActiveProfile(p);
                    setIsFireActive(false);
                    playClick();
                  }}
                >
                  <strong>{p.name.split(" ")[0]}</strong>
                  <small>Hp/A: {p.hpOverA} m⁻¹</small>
                </button>
              ))}
            </div>
          </div>

          <div className="arc-pfp-stats-grid">
            <div className="arc-pfp-stat">
              <span>Section Factor (Hp/A)</span>
              <strong>{activeProfile.hpOverA} m⁻¹</strong>
              <small>{activeProfile.hpOverA > 200 ? "High heating rate" : "Moderate heating rate"}</small>
            </div>
            <div className="arc-pfp-stat">
              <span>Required Intumescent DFT</span>
              <strong>{activeProfile.requiredDftMm} mm</strong>
              <small>For 60-min fire resistance rating</small>
            </div>
            <div className="arc-pfp-stat">
              <span>Intumescent Volume Expansion</span>
              <strong style={{ color: isFireActive ? "#f97316" : "#38bdf8" }}>
                {isFireActive ? "50x Insulating Char" : "1x Base Dry Film"}
              </strong>
              <small>{isFireActive ? "Critical steel temp delayed" : "Ambient temperature"}</small>
            </div>
          </div>

          <div className="arc-pfp-fire-action">
            <button
              type="button"
              className={`arc-fire-btn ${isFireActive ? "is-burning" : ""}`}
              onClick={() => {
                if (!isFireActive) playSpark();
                setIsFireActive(!isFireActive);
                onComplete?.();
              }}
            >
              {isFireActive ? "🛑 Extinguish Fire Test" : "🔥 Simulate Fire Heat Flux (~1000°C)"}
            </button>
            <p>{activeProfile.description}</p>
          </div>
        </div>
      ) : (
        <div className="arc-flame-controls">
          <div className="arc-flame-distance-box">
            <div className="arc-flame-dist-labels">
              <span>Gun Stand-Off Distance: <strong>{flameDistanceMm} mm</strong></span>
              <span className={`arc-dist-status ${flameDistanceMm >= 100 && flameDistanceMm <= 150 ? "is-optimal" : "is-warning"}`}>
                {flameDistanceMm >= 100 && flameDistanceMm <= 150 ? "✓ Optimal (100–150 mm)" : "⚠️ Out of specification"}
              </span>
            </div>
            <input
              type="range"
              min="60"
              max="240"
              value={flameDistanceMm}
              onChange={(e) => {
                setFlameDistanceMm(Number(e.target.value));
                playScan();
              }}
              className="arc-dist-slider"
            />
          </div>

          <div className="arc-flame-stats-grid">
            <div className="arc-pfp-stat">
              <span>Oxy-Fuel Flame Temp</span>
              <strong>~3,000 °C</strong>
              <small>Oxygen + Acetylene / Propane</small>
            </div>
            <div className="arc-pfp-stat">
              <span>Feedstock Wire</span>
              <strong>Zinc / Aluminum (TSA / TSZ)</strong>
              <small>Continuous wire drive feed</small>
            </div>
            <div className="arc-pfp-stat">
              <span>Substrate Cleanliness</span>
              <strong>Sa 3 (White Metal)</strong>
              <small>Minimum 75 µm sharp angular profile</small>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
