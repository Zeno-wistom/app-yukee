import { useEffect, useRef, type MutableRefObject } from "react";
import type { LeanUpdate } from "../vision/leanPose";
import { drawSunSurf, layoutFor, type SunSurfAssets, type SunSurfState } from "./sunSurfScene";

/** 晴日河湾底图（用户提供的原画，原样使用）。 */
export const SUNLIT_BG = "/art/g03-sunlit-castle.png";

/**
 * 画面只消费动作会话；场景时钟仅在 running 且未丢失追踪时推进，
 * 暂停 / 软上限 / 看不到人时整个世界冻结。
 * 画布按实际显示尺寸 × DPR 分配像素（上限 2 倍、宽度上限 2200），不再靠 CSS cover 裁切。
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
    const assets: SunSurfAssets = { img: null, off: { c: null } };
    const img = new Image();
    img.decoding = "async";
    img.onload = () => {
      assets.img = img;
    };
    img.src = SUNLIT_BG;
    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      // clientWidth 是布局尺寸，不受门户的 3D 投影变换影响
      let w = Math.max(1, Math.round(el.clientWidth * dpr)),
        h = Math.max(1, Math.round(el.clientHeight * dpr));
      if (w > 2200) {
        h = Math.round((h * 2200) / w);
        w = 2200;
      }
      if (el.width !== w || el.height !== h) {
        const prevW = el.width,
          prevCx = layoutFor(el.width, el.height).cx;
        el.width = w;
        el.height = h;
        s.x = layoutFor(w, h).cx + (s.x - prevCx) * (w / Math.max(1, prevW));
      }
    };
    const s: SunSurfState = {
      t: 0,
      x: 0,
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
      spawnT: 0.3,
      completeT: 0,
      tracking: "ok",
    };
    resize();
    s.x = layoutFor(el.width, el.height).cx;
    const observer = new ResizeObserver(resize);
    observer.observe(el);
    let raf = 0,
      last = performance.now(),
      wasReturning = false;
    const draw = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const v = frame.current;
      const L = layoutFor(el.width, el.height);
      const live = running.current && (v.tracking !== "lost" || v.complete);
      if (live) {
        s.t += dt;
        // 横移 + 惯性：时间常数插值，与刷新率无关
        const dest = v.complete ? L.W * 0.4 : L.cx + v.u * L.laneDX;
        s.x += (dest - s.x) * (1 - Math.exp(-dt * 7));
        s.u += (v.u - s.u) * (1 - Math.exp(-dt * 10));
      }
      if (v.reps > s.reps) {
        s.catchT = s.t;
        s.catchSide = v.target === 1 ? -1 : 1;
        if (v.complete) s.completeT = s.t;
      }
      if (wasReturning && !v.returning) s.spawnT = s.t;
      wasReturning = v.returning;
      s.target = v.target;
      s.approach = v.approach;
      s.hold = v.hold;
      s.arrived = v.arrived;
      s.returning = v.returning;
      s.reps = v.reps;
      s.complete = v.complete;
      s.tracking = v.tracking;
      drawSunSurf(ctx, s, assets);
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
    };
  }, [frame, running]);
  return (
    <canvas
      className="lean-ocean"
      ref={canvas}
      width={1152}
      height={648}
      aria-label="星海冲浪·晴日河湾：Yukee 踩着冲浪板在城堡下的河湾里左右滑行，接住从太阳落下的阳光，点亮天空中的彩虹"
    />
  );
}
