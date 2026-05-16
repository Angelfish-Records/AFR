import * as React from "react";
import { createReactionVeinsAmbientTheme } from "@/components/home-visualiser/reactionVeinsAmbient";

const TARGET_FPS = 30;
const FRAME_INTERVAL_MS = 1000 / TARGET_FPS;
const DESKTOP_DPR_CAP = 1.5;
const MOBILE_DPR_CAP = 1;
const MOBILE_BREAKPOINT_PX = 768;

function getSyntheticEnergy(time: number): number {
  const slowBreath = 0.07 * Math.sin(time * 0.23);
  const deepPulse = 0.035 * Math.sin(time * 0.071 + 1.7);
  const longDrift = 0.025 * Math.sin(time * 0.029 + 4.1);

  return clamp01(0.22 + slowBreath + deepPulse + longDrift);
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function getDprCap(width: number): number {
  return width < MOBILE_BREAKPOINT_PX ? MOBILE_DPR_CAP : DESKTOP_DPR_CAP;
}

function getCanvasContext(
  canvas: HTMLCanvasElement,
): WebGL2RenderingContext | null {
  return canvas.getContext("webgl2", {
    alpha: false,
    antialias: false,
    depth: false,
    stencil: false,
    preserveDrawingBuffer: false,
    powerPreference: "high-performance",
  });
}

export default function HomeVisualiserBackground() {
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const [webglFailed, setWebglFailed] = React.useState(false);

  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    const maybeGl = getCanvasContext(canvas);

    if (!maybeGl) {
      setWebglFailed(true);
      return;
    }

    const gl: WebGL2RenderingContext = maybeGl;
    const theme = createReactionVeinsAmbientTheme();
    let disposed = false;
    let animationFrameId: number | null = null;
    let lastFrameTime = 0;
    let width = 0;
    let height = 0;

    try {
      theme.init(gl);
    } catch (err) {
      console.error("Home visualiser failed to initialise.", err);
      setWebglFailed(true);
      return;
    }

    function resizeCanvas(): void {
      if (!canvas) return;

      const rect = canvas.getBoundingClientRect();
      const cssWidth = Math.max(1, Math.floor(rect.width));
      const cssHeight = Math.max(1, Math.floor(rect.height));
      const cappedDpr = Math.min(
        window.devicePixelRatio || 1,
        getDprCap(cssWidth),
      );

      width = Math.max(1, Math.floor(cssWidth * cappedDpr));
      height = Math.max(1, Math.floor(cssHeight * cappedDpr));

      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }

      gl.viewport(0, 0, width, height);
    }

    function render(nowMs: number): void {
      if (disposed) return;

      const now = nowMs || performance.now();

      if (!reducedMotion && now - lastFrameTime < FRAME_INTERVAL_MS) {
        animationFrameId = window.requestAnimationFrame(render);
        return;
      }

      lastFrameTime = now;
      resizeCanvas();

      const time = now * 0.001;

      try {
        theme.render(gl, {
          width,
          height,
          time,
          energy: reducedMotion ? 0.18 : getSyntheticEnergy(time),
        });
      } catch (err) {
        console.error("Home visualiser render failed.", err);
        setWebglFailed(true);
        disposed = true;
        theme.dispose(gl);
        return;
      }

      if (!reducedMotion && document.visibilityState === "visible") {
        animationFrameId = window.requestAnimationFrame(render);
      }
    }

    function handleVisibilityChange(): void {
      if (disposed || reducedMotion) return;

      if (document.visibilityState === "visible") {
        lastFrameTime = 0;
        animationFrameId = window.requestAnimationFrame(render);
      } else if (animationFrameId !== null) {
        window.cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
      }
    }

    resizeCanvas();
    animationFrameId = window.requestAnimationFrame(render);

    window.addEventListener("resize", resizeCanvas);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      disposed = true;

      if (animationFrameId !== null) {
        window.cancelAnimationFrame(animationFrameId);
      }

      window.removeEventListener("resize", resizeCanvas);
      document.removeEventListener("visibilitychange", handleVisibilityChange);

      theme.dispose(gl);
    };
  }, []);

  return (
    <div
      className={
        webglFailed
          ? "home-visualiser-bg home-visualiser-bg--fallback"
          : "home-visualiser-bg"
      }
      aria-hidden="true"
    >
      <canvas ref={canvasRef} />
      <div className="home-visualiser-veil" />
    </div>
  );
}
