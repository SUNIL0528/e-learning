import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { playSpray, playClick } from "./audio";

interface Props {
  tipCode: string;
  fanAngle: number; // e.g. 50
  orifice: number; // e.g. 0.017
  onTestSpray?: () => void;
}

export function ThreeSpraySimulator({ tipCode, fanAngle, orifice, onTestSpray }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isSpraying, setIsSpraying] = useState(false);
  const [paintColor, setPaintColor] = useState("#0759c8");
  const isSprayingRef = useRef(isSpraying);
  isSprayingRef.current = isSpraying;

  // Theoretical calculations for spray pattern
  const standOffCm = 30; // standard 30cm (12 inches)
  const fanWidthCm = Math.round(2 * standOffCm * Math.tan((fanAngle * Math.PI) / 360));
  const flowRateLpm = (orifice * 70).toFixed(2); // approximate l/min at 140 bar
  const estimatedWftMicrons = Math.round((Number(flowRateLpm) / (fanWidthCm * 0.01 * 0.4)) * 1.5);

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
    camera.position.set(0, 1.6, 3.8);

    // Studio Lighting
    const ambient = new THREE.AmbientLight(0xbad2e8, 1.4);
    scene.add(ambient);

    const keyLight = new THREE.DirectionalLight(0xffffff, 2.6);
    keyLight.position.set(3, 5, 4);
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0x38bdf8, 1.8);
    rimLight.position.set(-3, -2, -3);
    scene.add(rimLight);

    const rootGroup = new THREE.Group();
    scene.add(rootGroup);

    // --- 1. INDUSTRIAL AIRLESS SPRAY GUN MODEL ---
    const gunGroup = new THREE.Group();
    gunGroup.position.set(-1.1, 0.1, 0);
    gunGroup.rotation.y = Math.PI * 0.55;
    rootGroup.add(gunGroup);

    // Gun Handle
    const handleGeo = new THREE.CylinderGeometry(0.08, 0.07, 0.75, 16);
    const handleMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.6,
      metalness: 0.2,
    });
    const handle = new THREE.Mesh(handleGeo, handleMat);
    handle.rotation.z = -0.22;
    handle.position.set(-0.15, -0.25, 0);
    gunGroup.add(handle);

    // Hose swivel fitting
    const swivel = new THREE.Mesh(
      new THREE.CylinderGeometry(0.05, 0.05, 0.18, 12),
      new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.9, roughness: 0.2 })
    );
    swivel.position.set(-0.24, -0.68, 0);
    gunGroup.add(swivel);

    // Gun Barrel Body
    const barrelGeo = new THREE.BoxGeometry(0.7, 0.15, 0.14);
    const barrelMat = new THREE.MeshStandardMaterial({
      color: 0x475569,
      metalness: 0.85,
      roughness: 0.25,
    });
    const barrel = new THREE.Mesh(barrelGeo, barrelMat);
    barrel.position.set(0.1, 0.14, 0);
    gunGroup.add(barrel);

    // Trigger
    const triggerGeo = new THREE.BoxGeometry(0.04, 0.24, 0.07);
    const triggerMat = new THREE.MeshStandardMaterial({ color: 0x0284c7, metalness: 0.5, roughness: 0.4 });
    const trigger = new THREE.Mesh(triggerGeo, triggerMat);
    trigger.position.set(0.05, -0.05, 0);
    gunGroup.add(trigger);

    // Safety Tip Guard (Bright Safety Orange)
    const guardGeo = new THREE.CylinderGeometry(0.12, 0.14, 0.22, 16);
    const guardMat = new THREE.MeshStandardMaterial({
      color: 0xea580c,
      roughness: 0.35,
      metalness: 0.3,
    });
    const guard = new THREE.Mesh(guardGeo, guardMat);
    guard.rotation.z = Math.PI / 2;
    guard.position.set(0.52, 0.14, 0);
    gunGroup.add(guard);

    // Carbide Tip Cylinder
    const tipMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.04, 0.04, 0.14, 16),
      new THREE.MeshStandardMaterial({ color: 0xd97706, metalness: 0.9, roughness: 0.15 })
    );
    tipMesh.rotation.z = Math.PI / 2;
    tipMesh.position.set(0.62, 0.14, 0);
    gunGroup.add(tipMesh);

    // --- 2. STEEL TARGET WORKPIECE (I-BEAM SECTION) ---
    const targetGroup = new THREE.Group();
    targetGroup.position.set(1.2, 0, 0);
    rootGroup.add(targetGroup);

    // Flange back plate
    const steelGeo = new THREE.BoxGeometry(0.15, 2.0, 1.8);
    const steelMat = new THREE.MeshStandardMaterial({
      color: 0x334e68,
      metalness: 0.8,
      roughness: 0.5,
    });
    const steelPlate = new THREE.Mesh(steelGeo, steelMat);
    targetGroup.add(steelPlate);

    // Coated wet film deposit oval patch
    const patchGeo = new THREE.RingGeometry(0, 0.65, 32);
    const patchMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(paintColor),
      roughness: 0.12, // high wet gloss
      metalness: 0.3,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.9,
    });
    const wetPatch = new THREE.Mesh(patchGeo, patchMat);
    wetPatch.rotation.y = -Math.PI / 2;
    wetPatch.position.x = -0.08;
    targetGroup.add(wetPatch);

    // --- 3. ATOMIZED SPRAY CONE PARTICLE SYSTEM ---
    const particleCount = 450;
    const particleGeo = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);
    const velocities = new Float32Array(particleCount * 3);

    for (let i = 0; i < particleCount; i++) {
      positions[i * 3] = 0;
      positions[i * 3 + 1] = 0;
      positions[i * 3 + 2] = 0;
    }

    particleGeo.setAttribute("position", new THREE.BufferAttribute(positions, 3));

    const particleMat = new THREE.PointsMaterial({
      color: new THREE.Color(paintColor),
      size: 0.045,
      transparent: true,
      opacity: 0.85,
    });

    const sprayParticles = new THREE.Points(particleGeo, particleMat);
    sprayParticles.position.set(-0.45, 0.14, 0);
    rootGroup.add(sprayParticles);
    sprayParticles.visible = false;

    // Reset particles function
    const resetParticle = (i: number) => {
      const halfAngleRad = ((fanAngle / 2) * Math.PI) / 180;
      const spreadY = (Math.random() - 0.5) * 2 * Math.sin(halfAngleRad);
      const spreadZ = (Math.random() - 0.5) * 0.15; // flat fan thickness
      const speed = 4.2 + Math.random() * 2.5;

      positions[i * 3] = 0;
      positions[i * 3 + 1] = 0;
      positions[i * 3 + 2] = 0;

      velocities[i * 3] = speed;
      velocities[i * 3 + 1] = spreadY * speed;
      velocities[i * 3 + 2] = spreadZ * speed;
    };

    for (let i = 0; i < particleCount; i++) {
      resetParticle(i);
      positions[i * 3] = Math.random() * 1.6;
    }

    // Orbit Controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.minDistance = 2.2;
    controls.maxDistance = 6.0;
    controls.target.set(0, 0.1, 0);

    const handleResize = () => {
      if (!container) return;
      camera.aspect = container.clientWidth / container.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(container.clientWidth, container.clientHeight);
    };

    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(container);

    let animId: number;
    let lastTime = performance.now();

    const animate = (currentTime: number) => {
      animId = requestAnimationFrame(animate);
      const dt = Math.min(0.05, (currentTime - lastTime) / 1000);
      lastTime = currentTime;

      const active = isSprayingRef.current;
      sprayParticles.visible = active;

      if (active) {
        // Trigger pull animation
        trigger.rotation.z = -0.15;
        // Pulse wet patch scale
        const targetScaleY = Math.min(1.4, (fanAngle / 50) * 1.1);
        wetPatch.scale.set(1, targetScaleY, 1);

        // Update particle positions
        const pos = particleGeo.attributes["position"]!.array as Float32Array;
        for (let i = 0; i < particleCount; i++) {
          pos[i * 3] += velocities[i * 3]! * dt;
          pos[i * 3 + 1] += velocities[i * 3 + 1]! * dt;
          pos[i * 3 + 2] += velocities[i * 3 + 2]! * dt;

          // Reached steel plate
          if (pos[i * 3]! >= 1.65) {
            resetParticle(i);
          }
        }
        particleGeo.attributes["position"]!.needsUpdate = true;
      } else {
        trigger.rotation.z = 0;
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
  }, [fanAngle, orifice, paintColor]);

  const toggleSpray = () => {
    playSpray();
    setIsSpraying(true);
    onTestSpray?.();
    setTimeout(() => {
      setIsSpraying(false);
    }, 1200);
  };

  return (
    <div className="arc-3d-spray-sim">
      <div className="arc-spray-sim-top">
        <div className="arc-spray-badge">
          <span className="arc-spray-dot" />
          <span>3D Airless Atomization Simulator</span>
        </div>
        <div className="arc-spray-tip-pill">
          Tip Code: <strong>{tipCode}</strong> ({fanAngle}° · {orifice}" orifice)
        </div>
      </div>

      <div className="arc-spray-canvas-wrap" ref={containerRef}>
        <div className="arc-scene-hint">
          Orbit 360° · Press "Test Spray" to see atomized fan & wet film deposition
        </div>
      </div>

      <div className="arc-spray-controls">
        <div className="arc-spray-metrics">
          <div className="arc-spray-metric-box">
            <span>Fan Width at 30cm</span>
            <strong>~{fanWidthCm} cm</strong>
            <small>({Math.round(fanWidthCm / 2.54)} inches)</small>
          </div>
          <div className="arc-spray-metric-box">
            <span>Estimated Flow Rate</span>
            <strong>{flowRateLpm} L/min</strong>
            <small>@ 140 bar pressure</small>
          </div>
          <div className="arc-spray-metric-box">
            <span>Estimated Wet Film</span>
            <strong>{estimatedWftMicrons} µm</strong>
            <small>per pass</small>
          </div>
        </div>

        <div className="arc-spray-actions">
          <div className="arc-spray-colors">
            <span>Coating Color:</span>
            {["#0759c8", "#10b981", "#ef4444", "#f59e0b", "#64748b"].map((c) => (
              <button
                key={c}
                type="button"
                className={`arc-color-dot ${paintColor === c ? "is-selected" : ""}`}
                style={{ background: c }}
                onClick={() => {
                  setPaintColor(c);
                  playClick();
                }}
                aria-label={`Select paint color ${c}`}
              />
            ))}
          </div>

          <button
            type="button"
            className={`arc-test-spray-btn ${isSpraying ? "is-active" : ""}`}
            onClick={toggleSpray}
            disabled={isSpraying}
          >
            {isSpraying ? "💨 Spraying..." : "⚡ Pull Spray Trigger"}
          </button>
        </div>
      </div>
    </div>
  );
}
