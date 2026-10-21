import { useEffect, useRef, type MutableRefObject } from "react";
import type { LeanUpdate } from "../vision/leanPose";
import { drawSurfBackdrop, drawSurfRider, surfStar } from "./leanSurfArt";

/** Only confirmed action state drives collection; animation never scores. */
export default function LeanSurfScene({
  frame,
}: {
  frame: MutableRefObject<LeanUpdate>;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const el = canvas.current!,
      c = el.getContext("2d")!;
    let raf = 0,
      x = 480,
      tilt = 0,
      previousReps = 0,
      collectAt = -100,
      collectSide = -1,
      lastMs = 0;
    const resize = () => {
      const dpr = Math.min(3, window.devicePixelRatio || 1),
        box = el.getBoundingClientRect();
      el.width = Math.max(1, Math.round(box.width * dpr));
      el.height = Math.max(1, Math.round(box.height * dpr));
    };
    const observer = new ResizeObserver(resize);
    observer.observe(el);
    resize();
    const draw = () => {
      const v = frame.current,
        t = v.effectiveMs / 1000,
        dt = Math.max(0, Math.min(0.12, (v.effectiveMs - lastMs) / 1000));
      lastMs = v.effectiveMs;
      if (v.tracking === "ok" && !v.recovering && !v.complete) {
        x += (480 + v.u * 260 - x) * (1 - Math.exp(-dt / 0.18));
        tilt += (v.u * 0.12 - tilt) * (1 - Math.exp(-dt / 0.22));
      }
      // Logical 16:9 composition with uniform cover; backing store follows the visible pixels.
      const scale = Math.max(el.width / 960, el.height / 540);
      c.setTransform(
        scale,
        0,
        0,
        scale,
        (el.width - 960 * scale) / 2,
        (el.height - 540 * scale) / 2,
      );
      drawSurfBackdrop(c, t);
      const depth = 0.18 + 0.82 * v.approach,
        tx = 480 + v.target * 240 * depth,
        ty = 248 + depth * 123;
      if (!v.complete) {
        c.save();
        c.globalAlpha = 0.35 + 0.65 * v.approach;
        c.strokeStyle = v.arrived ? "#9bf3d4" : "#f4d99b88";
        c.lineWidth = 1.8;
        c.beginPath();
        c.ellipse(tx, ty + 38, 64 * depth, 15 * depth, 0, 0, Math.PI * 2);
        c.stroke();
        c.shadowColor = v.arrived ? "#9bf3d4" : "#f4d99b";
        c.shadowBlur = 18;
        c.fillStyle = v.arrived ? "#9bf3d4" : "#f4d99b";
        surfStar(
          c,
          tx,
          ty + Math.sin(t * 1.4) * 3,
          v.arrived ? 13 : 22 * depth,
        );
        c.shadowBlur = 0;
        if (!v.cruising) {
          c.strokeStyle = v.arrived ? "#9bf3d4" : "#f4d99b";
          c.lineWidth = 3;
          c.beginPath();
          c.arc(tx, ty, 31, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * v.hold);
          c.stroke();
        }
        c.restore();
      }
      if (v.reps > previousReps) {
        collectAt = t;
        collectSide = -v.target;
        previousReps = v.reps;
      }
      const absorb = (t - collectAt) / 0.85;
      if (absorb >= 0 && absorb < 1) {
        for (let i = 0; i < 9; i++) {
          const p = Math.min(1, absorb + i * 0.025);
          c.globalAlpha = 1 - p;
          c.fillStyle = i % 2 ? "#aaf8da" : "#fff0bd";
          surfStar(
            c,
            480 + collectSide * 240 * (1 - p) + Math.sin(i * 2) * 30 * p,
            371 - p * 210,
            Math.max(2, 10 * (1 - p)),
          );
        }
        c.globalAlpha = 1;
      }
      // Wake is anchored to the board, wide and soft, with a clear physical origin.
      for (let i = 0; i < 19; i++) {
        const d = (t * 0.55 + i / 19) % 1;
        c.strokeStyle = `rgba(129,246,216,${(1 - d) * 0.21})`;
        c.lineWidth = 1.5;
        c.beginPath();
        c.ellipse(
          x - v.u * d * 45,
          414 + d * 143,
          57 + d * 67,
          5 + d * 7,
          0,
          0,
          Math.PI,
        );
        c.stroke();
      }
      c.save();
      c.translate(x, 410);
      drawSurfRider(c, v.u, t, tilt);
      c.restore();
      raf = requestAnimationFrame(draw);
    };
    draw();
    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
    };
  }, [frame]);
  return (
    <canvas
      className="lean-ocean"
      ref={canvas}
      width={960}
      height={540}
      aria-label="Yukee 在层叠远岛与星光海面间，驾青绿冲浪板轻缓前行"
    />
  );
}
