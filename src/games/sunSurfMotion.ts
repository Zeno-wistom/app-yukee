import type { LeanUpdate } from "../vision/leanPose";
import type { SunLayout, SunSurfState } from "./sunSurfScene";

/** Display only. No scoring, camera input, or product state changes. */
export function stepSurfMotion(
  s: SunSurfState,
  v: LeanUpdate,
  elapsedMs: number,
  running: boolean,
  L: SunLayout,
) {
  const live =
    running && (v.complete || (v.tracking === "ok" && !v.recovering));
  // A stalled tab resumes with one small visual step; never replay the missing interval.
  const dt = Math.max(
    0,
    elapsedMs > 80 ? 1 / 60 : Math.min(50, elapsedMs) / 1000,
  );
  if (live) {
    s.t += dt;
    const dest = v.complete ? L.W * 0.4 : L.cx + v.u * L.laneDX;
    s.x += (dest - s.x) * (1 - Math.exp(-dt * 7));
    s.u += (v.u - s.u) * (1 - Math.exp(-dt * 10));
  }
  if (v.reps > s.reps) {
    s.catchT = s.t;
    s.catchSide = v.target === 1 ? -1 : 1;
    if (v.complete) s.completeT = s.t;
  }
  if (s.returning && !v.returning) s.spawnT = s.t;
  s.target = v.target;
  s.approach = v.approach;
  s.hold = v.hold;
  s.arrived = v.arrived;
  s.returning = v.returning;
  s.reps = v.reps;
  s.complete = v.complete;
  s.tracking = v.tracking;
  return live;
}
export function resizeSurfX(x: number, old: SunLayout, next: SunLayout) {
  return next.cx + ((x - old.cx) / Math.max(1, old.laneDX)) * next.laneDX;
}
export function surfChapter(reps: number) {
  return Math.min(2, Math.floor(Math.max(0, reps) / 2));
}
export const SURF_CHAPTERS = [
  "采集阳光 · 织出虹光",
  "唤醒瀑布 · 点亮河流",
  "送光城堡 · 彩虹相聚",
] as const;

export function surfJump(
  t: number,
  catchT: number,
  complete: boolean,
  completeT: number,
  k: number,
) {
  const age = t - catchT;
  if (age >= 0 && age < 0.55) return Math.sin((age / 0.55) * Math.PI) * 22 * k;
  return complete
    ? Math.sin(Math.max(0, t - completeT - 0.55) * 3.2) ** 2 * 12 * k
    : 0;
}
