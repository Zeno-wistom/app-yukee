export type CollectionKind = "starlight" | "fireflies" | "meteor";
const COLLECTIONS: CollectionKind[] = [
  "starlight",
  "fireflies",
  "meteor",
  "starlight",
  "fireflies",
];
export function moonCollectionKind(reps: number): CollectionKind {
  return COLLECTIONS[Math.min(4, Math.max(0, reps))];
}
export type Point = { x: number; y: number };
export type LightTargets = {
  left: Point;
  right: Point;
  mast: Point;
  lamp: Point;
};

// 出生区属于全场景，与船体坐标无关；避开月面以及船/甲板所在的左下区域。
const SOURCES: Point[] = [
  { x: 85, y: 80 },
  { x: 240, y: 55 },
  { x: 400, y: 96 },
  { x: 535, y: 55 },
  { x: 790, y: 70 },
  { x: 880, y: 125 },
  { x: 750, y: 195 },
  { x: 560, y: 145 },
  { x: 65, y: 255 },
  { x: 130, y: 330 },
  { x: 200, y: 215 },
  { x: 80, y: 405 },
  { x: 885, y: 255 },
  { x: 820, y: 345 },
  { x: 925, y: 405 },
  { x: 755, y: 370 },
  { x: 85, y: 475 },
  { x: 650, y: 465 },
  { x: 775, y: 490 },
  { x: 910, y: 490 },
  { x: 165, y: 125 },
  { x: 335, y: 40 },
  { x: 445, y: 170 },
  { x: 850, y: 200 },
  { x: 38, y: 350 },
  { x: 920, y: 315 },
  { x: 610, y: 210 },
  { x: 715, y: 425 },
];

export const FIREFLY_SOURCES = SOURCES;
export type Firefly = {
  kind: CollectionKind;
  source: Point;
  position: Point;
  start: Point;
  progress: number;
  phase: "ambient" | "flight" | "dock" | "store";
  nextAt: number;
  side: "left" | "right";
  ambientAge: number;
  dockAge: number;
};

export function bezier(
  start: Point,
  end: Point,
  bend: number,
  t: number,
): Point {
  const dx = end.x - start.x,
    dy = end.y - start.y;
  const normalX = -dy * bend,
    normalY = dx * bend;
  const a = {
    x: start.x + dx * 0.28 + normalX,
    y: start.y + dy * 0.28 + normalY,
  };
  const b = {
    x: start.x + dx * 0.72 + normalX * 0.5,
    y: start.y + dy * 0.72 + normalY * 0.5,
  };
  const u = 1 - t;
  return {
    x:
      u * u * u * start.x +
      3 * u * u * t * a.x +
      3 * u * t * t * b.x +
      t * t * t * end.x,
    y:
      u * u * u * start.y +
      3 * u * u * t * a.y +
      3 * u * t * t * b.y +
      t * t * t * end.y,
  };
}

/** 纯显示时钟：不读写业务状态，也不产生计分；暂停时不推进时钟，不补播。 */
export class MoonFireflyField {
  time = 0;
  activeTime = 0;
  reps = 0;
  rewardAge = 2000;
  particles: Firefly[] = SOURCES.map((source, i) => ({
    kind: "starlight",
    source,
    position: { ...source },
    start: { ...source },
    progress: 0,
    phase: "ambient",
    nextAt: 180 + i * 115,
    side: i % 2 ? "right" : "left",
    ambientAge: 1000,
    dockAge: 0,
  }));

  step(
    dt: number,
    open: number,
    charged: boolean,
    reps: number,
    finished: boolean,
    targets: LightTargets,
  ) {
    // 页面失焦/恢复或推理卡顿不能让粒子瞬间越过整个轨迹。
    const elapsed = Math.max(0, Math.min(dt, 50));
    if (!elapsed) return;
    this.time += elapsed;
    if (open > 0.14) this.activeTime += elapsed * (finished ? 2 : 1);
    this.rewardAge += elapsed;
    if (reps > this.reps) {
      this.reps = reps;
      this.rewardAge = 0;
      for (const p of this.particles)
        if (p.phase === "dock") {
          p.phase = "store";
          p.progress = 0;
          p.start = { ...p.position };
        }
    }
    for (const [i, p] of this.particles.entries()) {
      const target = targets[p.side];
      if (p.phase === "ambient") {
        p.ambientAge += elapsed;
        p.kind = moonCollectionKind(reps);
        const sky = p.kind !== "fireflies";
        const sx = p.kind === "meteor" ? 560 + ((i * 47) % 340) : p.source.x;
        const sy = sky ? 35 + ((i * 23) % 125) : p.source.y;
        const follow = 1 - Math.exp(-elapsed / 300);
        p.position.x +=
          (sx + Math.sin(this.time / (2200 + i * 80) + i) * 7 - p.position.x) *
          follow;
        p.position.y +=
          (sy + Math.cos(this.time / (1900 + i * 65) + i) * 5 - p.position.y) *
          follow;
        if (open > 0.14 && this.activeTime >= p.nextAt) {
          p.phase = "flight";
          p.start = { ...p.position };
          p.progress = 0;
        }
      } else if (p.phase === "flight") {
        p.progress = Math.min(
          1,
          p.progress +
            (elapsed * (0.35 + open * 0.85 + (finished ? 0.4 : 0))) /
              ((p.kind === "meteor" ? 1400 : 2000) + (i % 6) * 260),
        );
        p.position = bezier(
          p.start,
          target,
          (i % 2 ? 1 : -1) * (0.12 + (i % 4) * 0.05),
          p.progress,
        );
        if (p.progress >= 1) {
          p.phase = "dock";
          p.progress = 0;
          p.dockAge = 0;
        }
      } else if (p.phase === "dock") {
        p.dockAge += elapsed;
        const center = open < 0.4 ? targets.mast : target;
        const k = 1 - Math.exp(-elapsed / 160);
        p.position.x +=
          (center.x + Math.sin(this.time / 500 + i) * 5 - p.position.x) * k;
        p.position.y +=
          (center.y + Math.cos(this.time / 650 + i) * 4 - p.position.y) * k;
        // 只有真实回位加分才能进入储存奖励；未完成时仅在帆面柔和蓄光。
        if (!charged && open < 0.1 && p.dockAge > 3000) this.reset(p, i);
      } else {
        p.progress = Math.min(1, p.progress + elapsed / 900);
        p.position = bezier(p.start, targets.lamp, 0.1, p.progress);
        if (p.progress >= 1) this.reset(p, i);
      }
    }
  }
  private reset(p: Firefly, i: number) {
    p.phase = "ambient";
    p.progress = 0;
    p.nextAt = this.activeTime + 1500 + (i % 7) * 280;
    p.ambientAge = 0;
    // 切换出生区时由渲染层淡出/淡入，不把返回路线误画成收集。
    p.position = { ...p.source };
  }
}
