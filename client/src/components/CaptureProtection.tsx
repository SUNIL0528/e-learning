import { useEffect, useState } from "react";

/**
 * Best-effort protection for course content. Browsers do not expose a reliable
 * API for detecting OS screenshots or third-party screen recorders, so this
 * covers the content when the course window/tab loses focus or is hidden.
 */
export function CaptureProtection() {
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    const conceal = () => setHidden(true);
    const restore = () => {
      if (document.visibilityState === "visible" && document.hasFocus()) {
        setHidden(false);
      }
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") conceal();
      else restore();
    };

    window.addEventListener("blur", conceal);
    window.addEventListener("focus", restore);
    window.addEventListener("beforeprint", conceal);
    window.addEventListener("afterprint", restore);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("blur", conceal);
      window.removeEventListener("focus", restore);
      window.removeEventListener("beforeprint", conceal);
      window.removeEventListener("afterprint", restore);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  if (!hidden) return null;

  return (
    <div
      className="fixed inset-0 z-[100] grid place-items-center bg-ink text-paper"
      role="status"
      aria-live="polite"
    >
      <div className="px-6 text-center">
        <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-clay">
          Course protected
        </div>
        <p className="mt-2 text-sm text-paper/70">Return to the course window to continue.</p>
      </div>
    </div>
  );
}
