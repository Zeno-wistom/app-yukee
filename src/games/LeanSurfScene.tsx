import { memo, useEffect, useRef, type MutableRefObject } from "react";
import type { LeanUpdate } from "../vision/leanPose";
import { drawSunSurf, layoutFor, type SunSurfAssets, type SunSurfState } from "./sunSurfScene";

/** 晴日河湾底图（用户提供的原画，原样使用）。 */
export const SUNLIT_BG = "/art/g03-sunlit-castle.png";

/** 视觉时间步上限：主线程偶发卡顿后，动画按正常节奏继续，而不是一次跳过整段（v3 为 100ms）。 */
const MAX_VISUAL_DT = 1 / 30;
/** 自适应渲染分辨率档位（相对 DPR 目标尺寸）。只降不升，避免来回切换造成重排。 */
const QUALITY_STEPS = [1, 0.85, 0.7];

/**
 * 临界阻尼弹簧：位置与速度都连续。姿态只有约 12Hz，
 * v3 的一阶指数平滑会在每个新样本到来时产生速度突变（「一顿一顿」），弹簧把它变成连续的滑行与惯性。
 */
function spring(pos: number, vel: number, target: number, omega: number, dt: number) {
  const x = pos - target;
  const e = Math.exp(-omega * dt);
  const nx = (x + (vel + omega * x) * dt) * e;
  const nv = (vel - omega * (vel + omega * x) * dt) * e;
  return [target + nx, nv] as const;
}

/**
 * 画面只消费动作会话；场景时钟仅在 running 且未丢失追踪时推进，
 * 暂停 / 软上限 / 看不到人时整个世界冻结。
 */
function LeanSurfScene({
  frame,
  running,
}: {
  frame: MutableRefObject<LeanUpdate>;
  running: MutableRefObject<boolean>;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const el = canvas.current!;
    const ctx = el.getContext("2d", { alpha: false })!;
    const assets: SunSurfAssets = { img: null, off: { c: null } };
    const img = new Image();
    img.decoding = "async";
    img.src = SUNLIT_BG;
    // 解码完成后再交给画布，避免首帧在主线程同步解码 2MB PNG
    img
      .decode()
      .catch(() => undefined)
      .then(() => {
        if (img.naturalWidth) assets.img = img;
      });
    let quality = 0;
    let sizeDirty = true,
      lastResizeAt = -1e9;
    const applySize = (now: number) => {
      const dpr = Math.min(2, window.devicePixelRatio || 1) * QUALITY_STEPS[quality];
      // clientWidth 是布局尺寸，不受门户投影变换影响
      let w = Math.max(1, Math.round(el.clientWidth * dpr)),
        h = Math.max(1, Math.round(el.clientHeight * dpr));
      if (w > 2200) {
        h = Math.round((h * 2200) / w);
        w = 2200;
      }
      lastResizeAt = now;
      sizeDirty = false;
      // 抖动 ≤2px 的尺寸变化不重新分配画布（重新分配会清空画布、重建全部缓存）
      if (Math.abs(el.width - w) <= 2 && Math.abs(el.height - h) <= 2) return;
      const prevW = el.width,
        prevCx = layoutFor(el.width, el.height).cx;
      el.width = w;
      el.height = h;
      const r = w / Math.max(1, prevW);
      s.x = layoutFor(w, h).cx + (s.x - prevCx) * r;
      vx *= r;
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
    let vx = 0,
      vu = 0;
    applySize(performance.now());
    s.x = layoutFor(el.width, el.height).cx;
    // ResizeObserver 只做标记；真正改尺寸放到绘制循环里、并限频（门户入场动画期间不会每帧重建画布）
    const observer = new ResizeObserver(() => {
      sizeDirty = true;
    });
    observer.observe(el);
    let raf = 0,
      last = performance.now(),
      wasReturning = false,
      slowMs = 0,
      sampleMs = 0;
    const draw = (now: number) => {
      const rawDt = (now - last) / 1000;
      last = now;
      const dt = Math.min(MAX_VISUAL_DT, rawDt);
      if (sizeDirty && now - lastResizeAt > 180) applySize(now);
      // 自适应分辨率：连续约 2 秒帧间隔 > 22ms 才降一档
      if (running.current && document.visibilityState === "visible") {
        sampleMs += rawDt * 1000;
        if (rawDt * 1000 > 22 && rawDt < 0.25) slowMs += rawDt * 1000;
        if (sampleMs > 2000) {
          if (slowMs / sampleMs > 0.6 && quality < QUALITY_STEPS.length - 1) {
            quality++;
            sizeDirty = true;
            lastResizeAt = -1e9;
          }
          sampleMs = 0;
          slowMs = 0;
        }
      }
      const v = frame.current;
      const L = layoutFor(el.width, el.height);
      const live = running.current && (v.tracking !== "lost" || v.complete);
      if (live) {
        s.t += dt;
        const dest = v.complete ? L.W * 0.4 : L.cx + v.u * L.laneDX;
        [s.x, vx] = spring(s.x, vx, dest, 9, dt);
        [s.u, vu] = spring(s.u, vu, v.u, 12, dt);
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
      const q = String(QUALITY_STEPS[quality]);
      if (el.dataset.quality !== q) el.dataset.quality = q;
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
      data-quality="1"
      aria-label="星海冲浪·晴日河湾：Yukee 踩着冲浪板在城堡下的河湾里左右滑行，接住从太阳落下的阳光，点亮天空中的彩虹"
    />
  );
}

/** HUD 每 80ms 重渲染一次；画布组件的 props 恒定，memo 避免无谓的协调。 */
export default memo(LeanSurfScene);
