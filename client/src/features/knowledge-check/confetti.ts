// Canvas Confetti Engine (Zero dependencies, pure performant canvas)

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  rotation: number;
  vRot: number;
  shape: "rect" | "circle";
  opacity: number;
}

const COLORS = [
  "#0759c8", // HTS blue
  "#38bdf8", // Sky blue
  "#f59e0b", // Amber/Gold
  "#10b981", // Emerald
  "#ec4899", // Pink
  "#8b5cf6", // Purple
];

export function triggerConfetti(originX = 0.5, originY = 0.6, particleCount = 75): void {
  if (typeof window === "undefined") return;

  const canvas = document.createElement("canvas");
  canvas.style.position = "fixed";
  canvas.style.inset = "0";
  canvas.style.width = "100vw";
  canvas.style.height = "100vh";
  canvas.style.pointerEvents = "none";
  canvas.style.zIndex = "999999";
  document.body.appendChild(canvas);

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    canvas.remove();
    return;
  }

  const width = (canvas.width = window.innerWidth);
  const height = (canvas.height = window.innerHeight);

  const startX = width * originX;
  const startY = height * originY;

  const particles: Particle[] = [];
  for (let i = 0; i < particleCount; i++) {
    const angle = Math.PI * 2 * (i / particleCount) + (Math.random() - 0.5) * 0.5;
    const speed = 6 + Math.random() * 12;
    particles.push({
      x: startX,
      y: startY,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 5, // shoot upward
      size: 6 + Math.random() * 8,
      color: COLORS[Math.floor(Math.random() * COLORS.length)]!,
      rotation: Math.random() * Math.PI * 2,
      vRot: (Math.random() - 0.5) * 0.25,
      shape: Math.random() > 0.4 ? "rect" : "circle",
      opacity: 1,
    });
  }

  let animationFrameId: number;
  const gravity = 0.28;
  const drag = 0.96;

  const animate = () => {
    ctx.clearRect(0, 0, width, height);

    let aliveCount = 0;
    for (const p of particles) {
      if (p.opacity <= 0.02) continue;
      aliveCount++;

      p.vx *= drag;
      p.vy = p.vy * drag + gravity;
      p.x += p.vx;
      p.y += p.vy;
      p.rotation += p.vRot;
      p.opacity -= 0.012;

      ctx.save();
      ctx.globalAlpha = Math.max(0, p.opacity);
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rotation);
      ctx.fillStyle = p.color;

      if (p.shape === "rect") {
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
      } else {
        ctx.beginPath();
        ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    if (aliveCount > 0) {
      animationFrameId = requestAnimationFrame(animate);
    } else {
      cancelAnimationFrame(animationFrameId);
      canvas.remove();
    }
  };

  animationFrameId = requestAnimationFrame(animate);
}
