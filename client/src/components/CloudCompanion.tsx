import { useEffect, useState } from "react";
import cloudWatch from "@/assets/cloud-watch.jpg";

type CloudCompanionProps = { eyesClosed?: boolean };

export function CloudCompanion({ eyesClosed = false }: CloudCompanionProps) {
  const [pupilX, setPupilX] = useState(0);
  const [pupilY, setPupilY] = useState(0);
  const [blinking, setBlinking] = useState(false);

  useEffect(() => {
    const followPointer = (event: MouseEvent) => {
      setPupilX(Math.max(-6, Math.min(6, ((event.clientX / window.innerWidth) - 0.5) * 16)));
      setPupilY(Math.max(-4, Math.min(4, ((event.clientY / window.innerHeight) - 0.5) * 10)));
    };
    window.addEventListener("mousemove", followPointer);
    return () => window.removeEventListener("mousemove", followPointer);
  }, []);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let blinkTimeout: number | undefined;
    const interval = window.setInterval(() => {
      setBlinking(true);
      blinkTimeout = window.setTimeout(() => setBlinking(false), 200);
    }, 3000);
    return () => {
      window.clearInterval(interval);
      window.clearTimeout(blinkTimeout);
    };
  }, []);

  const closed = eyesClosed || blinking;

  return (
    <div className="auth-cloud" role="img" aria-label={eyesClosed ? "Cloud closes its eyes while you enter your password" : "Cloud watches the pointer"}>
      <img src={cloudWatch} alt="" aria-hidden="true" />
      {["left", "right"].map((side) => (
        <span key={side} className={`auth-cloud-eye auth-cloud-eye-${side}${closed ? " is-closed" : ""}`}>
          {!closed && <span className="auth-cloud-pupil" style={{ transform: `translate(${pupilX}px, ${pupilY}px)` }} />}
        </span>
      ))}
    </div>
  );
}
