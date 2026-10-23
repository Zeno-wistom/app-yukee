/**
 * G05「浅蹲跳一跳」纯逻辑：平台生成、蓄力→距离映射、落点判定、计分与通关。
 * 不依赖 DOM / 画布，键盘与摄像头共用同一套判定。
 *
 * 世界坐标：地面平面 (x, z)，x 轴投影到屏幕右上，z 轴投影到屏幕左上。
 * 每次跳跃只沿 +x（右上）或 +z（左上）一个轴前进，下一平台中心与当前平台
 * 中心在该轴上对齐（与原版一致：角色自动朝向下一平台，玩家只控制距离）。
 */

export type Axis = "x" | "z";
export type PlatformShape = "box" | "narrow" | "round";
export interface Platform {
  id: number;
  x: number;
  z: number;
  /** x 方向宽度 */
  w: number;
  /** z 方向深度 */
  d: number;
  /** 方块高度（只影响画面） */
  h: number;
  shape: PlatformShape;
  color: number;
  /** 加分平台：落上额外 +BONUS_SCORE */
  bonus: boolean;
  /** 从上一块到这一块的方向 */
  axis: Axis;
}

export const JUMP_CONFIG = {
  /** 最长蓄力（秒），超过封顶 */
  maxChargeSec: 1.5,
  /** 距离 = minDist + chargeSec * distPerSec（世界单位） */
  minDist: 0.35,
  distPerSec: 3.6,
  /** 平台间净空隙范围 */
  gapMin: 0.55,
  gapMax: 2.0,
  /** 前两跳的空隙上限（热身） */
  warmupGapMax: 1.2,
  /** 中心命中半径（世界单位） */
  perfectRadius: 0.24,
  /** 连续成功次数达到即通关 */
  targetJumps: 5,
  bonusScore: 5,
  /** 角色脚底半宽：落点在台面外但不超过它，判为「踩边」掉落（画面倾倒） */
  footRadius: 0.2,
} as const;

/** 轻量可复现随机数（mulberry32），测试可固定种子 */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const chargeToDistance = (chargeSec: number) =>
  JUMP_CONFIG.minDist + Math.max(0, Math.min(JUMP_CONFIG.maxChargeSec, chargeSec)) * JUMP_CONFIG.distPerSec;
/** 反算：跳到距离 dist 需要的蓄力秒数（测试与演示用） */
export const distanceToCharge = (dist: number) => (dist - JUMP_CONFIG.minDist) / JUMP_CONFIG.distPerSec;

const halfAlong = (p: Platform, axis: Axis) => (axis === "x" ? p.w : p.d) / 2;

export class PlatformGenerator {
  private random: () => number;
  private id = 0;
  private lastAxes: Axis[] = [];
  private lastColor = -1;
  constructor(seed = Date.now()) {
    this.random = rng(seed);
  }
  first(): Platform {
    return { id: this.id++, x: 0, z: 0, w: 2.0, d: 2.0, h: 1.0, shape: "box", color: this.color(), bonus: false, axis: "x" };
  }
  /** 下一块：方向在左上 / 右上间随机变化，但不会连续三次同向（避免笔直的路） */
  next(from: Platform, index: number): Platform {
    const r = this.random;
    let axis: Axis = r() < 0.5 ? "x" : "z";
    const n = this.lastAxes.length;
    if (n >= 2 && this.lastAxes[n - 1] === this.lastAxes[n - 2]) axis = this.lastAxes[n - 1] === "x" ? "z" : "x";
    // 第一跳一定换向：开局就看得出「交错」
    if (index === 1 && n === 0) axis = r() < 0.5 ? "x" : "z";
    this.lastAxes.push(axis);
    if (this.lastAxes.length > 4) this.lastAxes.shift();
    const roll = r();
    const shape: PlatformShape = index > 1 && roll < 0.18 ? "round" : index > 1 && roll < 0.38 ? "narrow" : "box";
    let w: number, d: number;
    if (shape === "round") {
      w = d = 1.5 + r() * 0.5;
    } else if (shape === "narrow") {
      // 窄长方形：沿前进方向更窄，落点更难
      const along = 1.15 + r() * 0.25,
        across = 1.9 + r() * 0.3;
      w = axis === "x" ? along : across;
      d = axis === "x" ? across : along;
    } else {
      w = d = 1.5 + r() * 0.7;
    }
    const bonus = index >= 2 && shape === "box" && r() < 0.16;
    const proto = { w, d } as Platform;
    // 热身：前两跳空隙较小，先熟悉蓄力手感；之后恢复完整范围
    const gapMax = index <= 2 ? JUMP_CONFIG.warmupGapMax : JUMP_CONFIG.gapMax;
    const gap = JUMP_CONFIG.gapMin + r() * (gapMax - JUMP_CONFIG.gapMin);
    const dist = halfAlong(from, axis) + gap + halfAlong(proto, axis);
    return {
      id: this.id++,
      x: from.x + (axis === "x" ? dist : 0),
      z: from.z + (axis === "z" ? dist : 0),
      w,
      d,
      h: 0.8 + r() * 0.5,
      shape,
      color: this.color(),
      bonus,
      axis,
    };
  }
  private color() {
    let c = Math.floor(this.random() * PLATFORM_COLORS.length);
    if (c === this.lastColor) c = (c + 1 + Math.floor(this.random() * (PLATFORM_COLORS.length - 1))) % PLATFORM_COLORS.length;
    this.lastColor = c;
    return c;
  }
}

/** 柔和配色：顶面色；侧面由渲染层按统一光照加深 */
export const PLATFORM_COLORS = ["#f4c9c3", "#bfe3d8", "#c8d6f2", "#f3ddb4", "#dacff0", "#d1e8c2", "#f2d2e4", "#cfe3ec"];

export function onTop(p: Platform, x: number, z: number, margin = 0) {
  if (p.shape === "round") return Math.hypot(x - p.x, z - p.z) <= p.w / 2 + margin;
  return Math.abs(x - p.x) <= p.w / 2 + margin && Math.abs(z - p.z) <= p.d / 2 + margin;
}

export type LandingKind = "stay" | "hit" | "perfect" | "short" | "long" | "edgeShort" | "edgeLong";
export interface Landing {
  kind: LandingKind;
  /** 落点世界坐标 */
  x: number;
  z: number;
  /** 跳跃距离 */
  dist: number;
  /** 落点到目标中心的距离（成功时） */
  offset: number;
}

/** 根据真实落点判定：留在原台 / 落上 / 中心 / 不够 / 过远（含踩边） */
export function resolveLanding(cur: Platform, next: Platform, fromX: number, fromZ: number, chargeSec: number): Landing {
  const axis = next.axis;
  const dist = chargeToDistance(chargeSec);
  const x = fromX + (axis === "x" ? dist : 0),
    z = fromZ + (axis === "z" ? dist : 0);
  const offset = Math.hypot(x - next.x, z - next.z);
  if (onTop(next, x, z)) return { kind: offset <= JUMP_CONFIG.perfectRadius ? "perfect" : "hit", x, z, dist, offset };
  if (onTop(cur, x, z)) return { kind: "stay", x, z, dist, offset };
  const along = axis === "x" ? x - next.x : z - next.z;
  const half = halfAlong(next, axis);
  const fr = JUMP_CONFIG.footRadius;
  if (along < 0) {
    // 在目标之前：贴近目标前沿算踩边，否则贴近当前台后沿也算踩边（从原台边缘倒下）
    const curAlong = axis === "x" ? x - cur.x : z - cur.z;
    const edgeOfNext = -along - half <= fr;
    const edgeOfCur = curAlong - halfAlong(cur, axis) <= fr;
    return { kind: edgeOfNext || edgeOfCur ? "edgeShort" : "short", x, z, dist, offset };
  }
  return { kind: along - half <= fr ? "edgeLong" : "long", x, z, dist, offset };
}

export const isSuccess = (k: LandingKind) => k === "hit" || k === "perfect";
export const isFail = (k: LandingKind) => k === "short" || k === "long" || k === "edgeShort" || k === "edgeLong";

/** 一局的计分状态 */
export class JumpRun {
  readonly gen: PlatformGenerator;
  platforms: Platform[] = [];
  /** 角色当前所在平台下标 */
  cur = 0;
  /** 角色当前世界坐标（落点，不一定在台面中心） */
  px = 0;
  pz = 0;
  score = 0;
  jumps = 0;
  combo = 0;
  over = false;
  cleared = false;
  last: Landing | null = null;
  constructor(seed?: number) {
    this.gen = new PlatformGenerator(seed);
    const first = this.gen.first();
    this.platforms.push(first);
    this.platforms.push(this.gen.next(first, 1));
    this.platforms.push(this.gen.next(this.platforms[1], 2));
  }
  get current() {
    return this.platforms[this.cur];
  }
  get target() {
    return this.platforms[this.cur + 1];
  }
  /** 执行一次跳跃，返回落点与得分；之后由画面播放动画 */
  jump(chargeSec: number): Landing & { gained: number } {
    if (this.over) throw new Error("run is over");
    const l = resolveLanding(this.current, this.target, this.px, this.pz, chargeSec);
    this.last = l;
    let gained = 0;
    this.px = l.x;
    this.pz = l.z;
    if (isSuccess(l.kind)) {
      this.cur++;
      this.jumps++;
      if (l.kind === "perfect") {
        this.combo++;
        gained = 2 * this.combo;
      } else {
        this.combo = 0;
        gained = 1;
      }
      if (this.current.bonus) gained += JUMP_CONFIG.bonusScore;
      this.score += gained;
      // 始终保留当前 + 下一块 + 一块预告
      while (this.platforms.length < this.cur + 3)
        this.platforms.push(this.gen.next(this.platforms[this.platforms.length - 1], this.platforms.length));
      if (this.jumps >= JUMP_CONFIG.targetJumps) {
        this.cleared = true;
        this.over = true;
      }
    } else if (isFail(l.kind)) {
      this.over = true;
      this.combo = 0;
    }
    return { ...l, gained };
  }
}
