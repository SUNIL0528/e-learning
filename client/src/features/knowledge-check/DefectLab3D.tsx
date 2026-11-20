import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { playScan, playCorrect, playWrong, playClick, playLevelUp } from "./audio";
import { awardXp, recordStreak, unlockAchievement } from "./gamification";
import { triggerConfetti } from "./confetti";
import type { GameRecord } from "./ModuleOneArcade";

interface DefectItem {
  id: string;
  name: string;
  icon: string;
  severity: "Critical" | "Major" | "Cosmetic";
  layer: string;
  symptom: string;
  rootCause: string;
  correctiveAction: string;
  position: [number, number, number];
}

const DEFECTS: DefectItem[] = [
  {
    id: "pinhole",
    name: "Pinhole / Holiday",
    icon: "🕳️",
    severity: "Critical",
    layer: "Through all layers to steel",
    symptom: "Microscopic void or capillary opening exposing bare steel to moisture and salts.",
    rootCause:
      "Air/solvent entrapment during spraying, or sharp steel peaks exceeding dry film thickness.",
    correctiveAction:
      "Locate with high-voltage holiday detector, abrade surrounding area, and apply touch-up coat.",
    position: [-1.2, 0.45, 0.6],
  },
  {
    id: "blistering",
    name: "Osmotic Blistering",
    icon: "🫧",
    severity: "Critical",
    layer: "Between Primer & Steel",
    symptom: "Dome-shaped swellings or bubbles in the coating containing liquid.",
    rootCause:
      "Soluble salts (chlorides/sulfates) left on steel before coating, drawing moisture through osmosis.",
    correctiveAction:
      "Full re-blast of affected area after thorough pressure washing to remove soluble salts.",
    position: [0.0, 0.5, 0.2],
  },
  {
    id: "sags",
    name: "Runs and Sags",
    icon: "💧",
    severity: "Major",
    layer: "Intermediate Epoxy Coat",
    symptom: "Downward flow of wet coating creating thick curtain-like ridges.",
    rootCause:
      "Excessive wet film thickness (WFT), excessive thinner, or gun held too close to the surface.",
    correctiveAction: "Brush out immediately while wet, or sand flush after full cure and recoat.",
    position: [1.3, 0.4, 0.5],
  },
  {
    id: "dry-spray",
    name: "Dry Spray",
    icon: "💨",
    severity: "Major",
    layer: "Polyurethane Topcoat",
    symptom: "Rough, sandy, porous surface texture with dull low-gloss appearance.",
    rootCause:
      "Spray gun held too far away, spray angle too acute, or ambient wind drying droplets mid-air.",
    correctiveAction:
      "Lightly sand to remove dry particles and reapply topcoat within specified recoat window.",
    position: [0.8, 0.45, -0.6],
  },
];

const LAYERS = [
  { id: "all", name: "Complete System (3-Coat)" },
  { id: "primer", name: "1. Zinc Primer (75 µm)" },
  { id: "intermediate", name: "2. Epoxy MIO (125 µm)" },
  { id: "topcoat", name: "3. Polyurethane (50 µm)" },
];

export function DefectLab3D({
  record,
  save,
  userId,
}: {
  record: GameRecord;
  save: (next: GameRecord) => void;
  userId: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [activeDefect, setActiveDefect] = useState<DefectItem>(DEFECTS[0]!);
  const [selectedLayer, setSelectedLayer] = useState("all");
  const [diagnosedDefects, setDiagnosedDefects] = useState<string[]>(() => {
    return Object.keys(record.matches).filter((k) => k.startsWith("defect:"));
  });
  const [quizAnswer, setQuizAnswer] = useState<string | null>(null);

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
    scene.background = new THREE.Color(0x0a1c2e);

    const camera = new THREE.PerspectiveCamera(
      40,
      container.clientWidth / container.clientHeight,
      0.1,
      50,
    );
    camera.position.set(0, 2.8, 4.2);

    // Studio Lighting
    const ambient = new THREE.AmbientLight(0xbad2e8, 1.4);
    scene.add(ambient);

    const sun = new THREE.DirectionalLight(0xffffff, 2.5);
    sun.position.set(4, 6, 4);
    scene.add(sun);

    const blueLight = new THREE.PointLight(0x38bdf8, 3, 8);
    blueLight.position.set(-2, 2, 2);
    scene.add(blueLight);

    const rootGroup = new THREE.Group();
    scene.add(rootGroup);

    // 1. Steel Specimen Base Plate (Industrial Steel)
    const plateGeo = new THREE.BoxGeometry(3.6, 0.2, 2.2);
    const steelMat = new THREE.MeshStandardMaterial({
      color: 0x334e68,
      metalness: 0.85,
      roughness: 0.45,
    });
    const steelPlate = new THREE.Mesh(plateGeo, steelMat);
    rootGroup.add(steelPlate);

    // 2. Primer Layer (Zinc Grey / Green)
    const primerGeo = new THREE.BoxGeometry(3.61, 0.05, 2.21);
    const primerMat = new THREE.MeshStandardMaterial({
      color: 0x627d98,
      metalness: 0.5,
      roughness: 0.7,
      transparent: true,
      opacity: 0.95,
    });
    const primerMesh = new THREE.Mesh(primerGeo, primerMat);
    primerMesh.position.y = 0.125;
    rootGroup.add(primerMesh);

    // 3. Intermediate Epoxy Layer (MIO Iron Grey)
    const epoxyGeo = new THREE.BoxGeometry(3.62, 0.06, 2.22);
    const epoxyMat = new THREE.MeshStandardMaterial({
      color: 0x486581,
      metalness: 0.6,
      roughness: 0.55,
      transparent: true,
      opacity: 0.95,
    });
    const epoxyMesh = new THREE.Mesh(epoxyGeo, epoxyMat);
    epoxyMesh.position.y = 0.18;
    rootGroup.add(epoxyMesh);

    // 4. Polyurethane Topcoat (Gloss HTS Blue)
    const topcoatGeo = new THREE.BoxGeometry(3.63, 0.05, 2.23);
    const topcoatMat = new THREE.MeshStandardMaterial({
      color: 0x0759c8,
      metalness: 0.4,
      roughness: 0.18,
      transparent: true,
      opacity: 0.95,
    });
    const topcoatMesh = new THREE.Mesh(topcoatGeo, topcoatMat);
    topcoatMesh.position.y = 0.235;
    rootGroup.add(topcoatMesh);

    // Layer visibility toggle
    if (selectedLayer === "primer") {
      epoxyMesh.visible = false;
      topcoatMesh.visible = false;
    } else if (selectedLayer === "intermediate") {
      epoxyMesh.visible = true;
      topcoatMesh.visible = false;
    } else {
      epoxyMesh.visible = true;
      topcoatMesh.visible = true;
    }

    // 5. 3D Defect Markers & Geometries
    const defectMarkers: { id: string; group: THREE.Group }[] = [];

    DEFECTS.forEach((d) => {
      const g = new THREE.Group();
      g.position.set(...d.position);
      g.userData["defectId"] = d.id;

      // Defect visual anomaly on surface
      if (d.id === "pinhole") {
        // Dark hole down to substrate
        const hole = new THREE.Mesh(
          new THREE.CylinderGeometry(0.06, 0.02, 0.15, 16),
          new THREE.MeshBasicMaterial({ color: 0x000000 }),
        );
        hole.position.y = -0.05;
        g.add(hole);
      } else if (d.id === "blistering") {
        // Blister dome
        const dome = new THREE.Mesh(
          new THREE.SphereGeometry(0.16, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.5),
          new THREE.MeshStandardMaterial({ color: 0x486581, roughness: 0.3, metalness: 0.4 }),
        );
        dome.position.y = -0.02;
        g.add(dome);
      } else if (d.id === "sags") {
        // Sagging ridge
        const sag = new THREE.Mesh(
          new THREE.CylinderGeometry(0.08, 0.04, 0.4, 12),
          new THREE.MeshStandardMaterial({ color: 0x05469e, roughness: 0.2 }),
        );
        sag.rotation.z = Math.PI / 2;
        g.add(sag);
      } else if (d.id === "dry-spray") {
        // Granular rough patch
        const patch = new THREE.Mesh(
          new THREE.BoxGeometry(0.4, 0.04, 0.4),
          new THREE.MeshStandardMaterial({ color: 0x38bdf8, roughness: 0.95, metalness: 0.1 }),
        );
        g.add(patch);
      }

      // Floating Hologram Target Pin
      const pin = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.12, 0),
        new THREE.MeshStandardMaterial({
          color: 0xf59e0b,
          emissive: 0xd97706,
          emissiveIntensity: 0.8,
          wireframe: false,
        }),
      );
      pin.position.y = 0.25;
      g.add(pin);

      rootGroup.add(g);
      defectMarkers.push({ id: d.id, group: g });
    });

    // Orbit controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.minDistance = 2.5;
    controls.maxDistance = 7;
    controls.maxPolarAngle = Math.PI * 0.48; // don't go below floor
    controls.target.set(0, 0.2, 0);

    // Raycast interaction
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    const handleClick = (e: MouseEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(mouse, camera);
      const hits = raycaster.intersectObjects(rootGroup.children, true);
      for (const hit of hits) {
        let obj: THREE.Object3D | null = hit.object;
        while (obj && !obj.userData["defectId"]) {
          obj = obj.parent;
        }
        if (obj?.userData["defectId"]) {
          const def = DEFECTS.find((d) => d.id === obj!.userData["defectId"]);
          if (def) {
            setActiveDefect(def);
            setQuizAnswer(null);
            playScan();
            break;
          }
        }
      }
    };

    renderer.domElement.addEventListener("click", handleClick);

    const handleResize = () => {
      if (!container) return;
      camera.aspect = container.clientWidth / container.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(container.clientWidth, container.clientHeight);
    };

    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(container);

    let animId: number;
    const animate = (time: number) => {
      animId = requestAnimationFrame(animate);

      // Rotate pins and hover
      defectMarkers.forEach((m) => {
        const pin = m.group.children[1];
        if (pin) {
          pin.rotation.y += 0.02;
          pin.position.y = 0.25 + Math.sin(time * 0.004 + m.group.position.x) * 0.04;
        }
      });

      controls.update();
      renderer.render(scene, camera);
    };

    animId = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(animId);
      resizeObserver.disconnect();
      renderer.domElement.removeEventListener("click", handleClick);
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [selectedLayer]);

  // Handle Defect Diagnosis Quiz Action
  const diagnose = (selectedAction: string) => {
    setQuizAnswer(selectedAction);
    const isCorrect = selectedAction === activeDefect.correctiveAction;
    if (isCorrect) {
      playCorrect();
      awardXp(userId, 35, `Diagnosed: ${activeDefect.name}`);
      recordStreak(userId, true);

      const nextDiagnosed = Array.from(new Set([...diagnosedDefects, activeDefect.id]));
      setDiagnosedDefects(nextDiagnosed);

      const nextMatches = { ...record.matches, [`defect:${activeDefect.id}`]: "diagnosed" };
      const allDone = nextDiagnosed.length >= DEFECTS.length;
      if (allDone) {
        triggerConfetti(0.5, 0.4, 80);
        playLevelUp();
        unlockAchievement(userId, "defect_analyst");
      }

      save({
        ...record,
        matches: nextMatches,
        completed: allDone,
        best: Math.max(record.best, nextDiagnosed.length * 25),
      });
    } else {
      playWrong();
      recordStreak(userId, false);
    }
  };

  return (
    <div className="arc-defect-lab">
      {/* Lab Header */}
      <div className="arc-defect-header">
        <div>
          <span className="arc-lab-badge">3D Coating Failure Simulator</span>
          <h3>Micro-Defect & Layer Inspector</h3>
          <p>
            Orbit the coated steel test specimen. Click any pulsing amber checkpoint to inspect the
            coating failure in 3D and select the correct field corrective action.
          </p>
        </div>
        <div className="arc-lab-progress-box">
          <span>Diagnosed</span>
          <strong>
            {diagnosedDefects.length} / {DEFECTS.length}
          </strong>
        </div>
      </div>

      {/* Layer Toggle Controls */}
      <div className="arc-layer-bar">
        <span>Cross-Section View:</span>
        <div className="arc-layer-chips">
          {LAYERS.map((l) => (
            <button
              key={l.id}
              type="button"
              className={`arc-layer-chip ${selectedLayer === l.id ? "is-selected" : ""}`}
              onClick={() => {
                setSelectedLayer(l.id);
                playClick();
              }}
            >
              {l.name}
            </button>
          ))}
        </div>
      </div>

      {/* 3D Scene Viewport */}
      <div className="arc-defect-canvas-container" ref={containerRef}>
        <div className="arc-scene-hint">
          Drag to orbit 360° · Scroll to zoom into defect · Click amber pins
        </div>
      </div>

      {/* Defect Investigation Dossier */}
      <div className="arc-defect-dossier" key={activeDefect.id}>
        <div className="arc-dossier-top">
          <div className="arc-dossier-title">
            <span className="arc-dossier-icon">{activeDefect.icon}</span>
            <div>
              <h4>{activeDefect.name}</h4>
              <span className={`arc-severity-badge is-${activeDefect.severity.toLowerCase()}`}>
                {activeDefect.severity} Defect · {activeDefect.layer}
              </span>
            </div>
          </div>
          {diagnosedDefects.includes(activeDefect.id) && (
            <span className="arc-solved-badge">✓ Diagnosed (+35 XP)</span>
          )}
        </div>

        <div className="arc-dossier-grid">
          <div className="arc-dossier-card">
            <strong>Field Symptom</strong>
            <p>{activeDefect.symptom}</p>
          </div>
          <div className="arc-dossier-card">
            <strong>Root Cause Analysis</strong>
            <p>{activeDefect.rootCause}</p>
          </div>
        </div>

        {/* Diagnosis Multiple Choice */}
        <div className="arc-dossier-quiz">
          <strong>Select Required Corrective Action:</strong>
          <div className="arc-quiz-options">
            {[
              activeDefect.correctiveAction,
              "Ignore defect and apply topcoat over it immediately",
              "Heat with blowtorch until blisters dissolve",
            ]
              .sort(() => (activeDefect.id === "pinhole" ? 1 : -1)) // stable variation
              .map((action) => {
                const isSelected = quizAnswer === action;
                const isRight = action === activeDefect.correctiveAction;
                return (
                  <button
                    key={action}
                    type="button"
                    disabled={Boolean(quizAnswer)}
                    className={`arc-quiz-btn ${isSelected ? (isRight ? "is-right" : "is-wrong") : ""}`}
                    onClick={() => diagnose(action)}
                  >
                    <span>{action}</span>
                    {isSelected && <em>{isRight ? "✓ Correct" : "✗ Review specification"}</em>}
                  </button>
                );
              })}
          </div>

          {quizAnswer && (
            <div
              className={`arc-round-feedback ${quizAnswer === activeDefect.correctiveAction ? "is-correct" : ""}`}
            >
              {quizAnswer === activeDefect.correctiveAction
                ? "Excellent analysis! You applied the correct NACE/AMPP repair procedure."
                : "Standard specification requires controlled repair as documented above."}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
