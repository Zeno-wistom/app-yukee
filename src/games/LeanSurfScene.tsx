import { useEffect, useRef, type MutableRefObject } from "react";
import type { LeanUpdate } from "../vision/leanPose";
import { drawStarSea, layoutFor, type StarSeaState } from "./starSeaScene";

/**
 * 画面只消费动作会话；场景时钟仅在 running 且未丢失追踪时推进，
 * 暂停 / 软上限 / 看不到人时整个世界冻结（星星、浪、云都停）。
 */
export default function LeanSurfScene({
  frame,
  running,
}: {
  frame: MutableRefObject<LeanUpdate>;
  running: MutableRefObject<boolean>;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const el = canvas.current!;
    const ctx = el.getContext("2d")!;
    const L = layoutFor(el.width, el.height);
    let raf = 0,
      last = performance.now();
    const s: StarSeaState = {
      t: 0,
      x: L.cx,
      u: 0,
      target: -1,
      approach: 0,
      hold: 0,
      arrived: false,
      returning: false,
      reps: 0,
      complete: false,
      catchT: -10,
      catchSide: -1,
      spawnT: 0.4,
      completeT: 0,
      tracking: "ok",
    };
    let wasReturning = false;
    const draw = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const v = frame.current;
      const live = running.current && (v.tracking !== "lost" || v.complete);
      if (live) {
        s.t += dt;
        // 角色跟随侧倾量：轻微动作就能看到明显位移（满量程约 255px）。
        const dest = L.cx + (v.complete ? 0 : v.u) * L.laneDX;
        s.x += (dest - s.x) * (1 - Math.exp(-dt * 7));
      }
      if (v.reps > s.reps) {
        s.catchT = s.t;
        s.catchSide = v.target === 1 ? -1 : 1;
        if (v.complete) s.completeT = s.t;
      }
      // 回中后，下一颗星从海天线飞来
      if (wasReturning && !v.returning) s.spawnT = s.t;
      wasReturning = v.returning;
      s.u = live ? s.u + (v.u - s.u) * (1 - Math.exp(-dt * 10)) : s.u;
      s.target = v.target;
      s.approach = v.approach;
      s.hold = v.hold;
      s.arrived = v.arrived;
      s.returning = v.returning;
      s.reps = v.reps;
      s.complete = v.complete;
      s.tracking = v.tracking;
      drawStarSea(ctx, s);
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [frame, running]);
  return (
    <canvas
      className="lean-ocean"
      ref={canvas}
      width={1152}
      height={648}
      aria-label="星海冲浪：Yukee 踩着发光冲浪板，在月光海面上左右滑行接住星星，远处灯塔随进度点亮"
    />
  );
}
