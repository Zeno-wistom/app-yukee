/**
 * G05 浅蹲跳一跳：云海浮岛像素世界（Canvas 2D 等轴投影）。
 *
 * 分层：
 *   1. 背景层：public/art/g05-sky-ruins.webp（纯背景，无平台），缓存到离屏画布，随镜头做很小的视差；
 *      其上叠加程序化的动态元素：漂移的像素云带、水晶闪光、瀑布水光（数量克制，不进入中间游玩区）。
 *   2. 世界层：平台 / 浮岛底座 / Yukee / 粒子特效 绘制到低分辨率离屏画布，再无平滑放大 → 与背景同一像素语言。
 *   3. 文字层：「完美 +N」等反馈在主画布上绘制（保证清晰）。
 * 所有平台位置、尺寸、角色坐标与跳跃轨迹都来自 jumpLogic 的世界坐标；本文件只负责投影、绘制和缓动，不做任何判定。
 */
import type { Landing, Platform } from "./jumpLogic";

const COS30 = Math.cos(Math.PI / 6),
  SIN30 = 0.5;
/** 等轴椭圆系数：世界半径 r → 屏幕 rx = r·EX·S，ry = r·EY·S */
const EX = 1.2247,
  EY = 0.7071;

export const G05_BG_URL = "/art/g05-sky-ruins.webp";

export interface JumpFx {
  kind: "ripple" | "text" | "dust" | "bonus" | "poof";
  x: number;
  z: number;
  /** 离台面高度（poof 用） */
  y?: number;
  t: number;
  text?: string;
  strong?: boolean;
}

type Phase = "idle" | "jump" | "land" | "fall" | "topple" | "gone";
type Pt = { x: number; y: number };
type Proj = (x: number, z: number, y?: number) => Pt;

/** 平台材质：形状 + 颜色序号决定，奖励台单独 */
type Material = "stone" | "moss" | "lilac" | "wood" | "rune" | "crystal";
interface Palette {
  top: string;
  topLine: string;
  rim: string;
  left: string;
  right: string;
  mortar: string;
  outline: string;
}
const PALETTES: Record<Material, Palette> = {
  stone: { top: "#f1e8d8", topLine: "#ddd1bc", rim: "#fffaf0", left: "#cbbfab", right: "#a99d8c", mortar: "#8f8475", outline: "#4e4a5c" },
  moss: { top: "#e9e5cf", topLine: "#d3cfb4", rim: "#fbffe9", left: "#bdb8a2", right: "#9b9783", mortar: "#7f7c6a", outline: "#46503f" },
  lilac: { top: "#efe7f4", topLine: "#dcd0e6", rim: "#fffaff", left: "#c8bcd8", right: "#a798bb", mortar: "#8a7ca0", outline: "#4d4766" },
  wood: { top: "#e2b277", topLine: "#b98348", rim: "#ffe0ae", left: "#a8723f", right: "#875a31", mortar: "#6b4524", outline: "#3e2b1e" },
  rune: { top: "#e9eff1", topLine: "#d2dce0", rim: "#ffffff", left: "#bcc6cf", right: "#99a5b1", mortar: "#7d8995", outline: "#45505e" },
  crystal: { top: "#dcfbff", topLine: "#a9eaf2", rim: "#ffffff", left: "#93d9e8", right: "#6cb8d0", mortar: "#4f9cb8", outline: "#2f5a74" },
};
const MINT = "#8de9bc";
const MINT_HI = "#c9ffe6";
const CYAN = "#7fe8f0";

function materialOf(p: Platform): Material {
  if (p.bonus) return "crystal";
  if (p.shape === "round") return "rune";
  if (p.shape === "narrow") return "wood";
  return (["stone", "moss", "lilac"] as const)[p.color % 3];
}

/** 每块平台的确定性随机（藤蔓、岩石轮廓） */
function prand(seed: number) {
  let a = (seed * 2654435761) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const easeOutBack = (t: number) => {
  const c = 1.6;
  const x = t - 1;
  return 1 + (c + 1) * x * x * x + c * x * x;
};
const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);

type AnyCanvas = HTMLCanvasElement | OffscreenCanvas;
function makeCanvas(w: number, h: number): AnyCanvas | null {
  if (typeof OffscreenCanvas !== "undefined") return new OffscreenCanvas(w, h);
  if (typeof document !== "undefined") return Object.assign(document.createElement("canvas"), { width: w, height: h });
  return null;
}

/** 背景图共享加载（多个场景实例共用一张） */
let bgImage: HTMLImageElement | null = null;
let bgPromise: Promise<HTMLImageElement | null> | null = null;
export function loadG05Background(): Promise<HTMLImageElement | null> {
  if (bgPromise) return bgPromise;
  if (typeof Image === "undefined") return (bgPromise = Promise.resolve(null));
  bgPromise = new Promise((resolve) => {
    const img = new Image();
    img.decoding = "async";
    img.onload = () => {
      bgImage = img;
      resolve(img);
    };
    img.onerror = () => resolve(null);
    img.src = G05_BG_URL;
  });
  return bgPromise;
}

/** 背景图中的动态点位（归一化坐标，均在左右两侧画框或上方远景，不进入中间游玩区） */
const SPARKLES: [number, number, number][] = [
  [0.08, 0.2, 1.2], // 左侧神殿水晶窗
  [0.212, 0.15, 0.8],
  [0.692, 0.13, 1.4], // 远景城堡顶部水晶
  [0.895, 0.345, 0.9], // 右侧拱门水晶
  [0.82, 0.655, 0.8],
  [0.97, 0.22, 0.9],
];
const FALLS: [number, number, number, number][] = [
  // x0, x1, y0, y1（归一化）
  [0.142, 0.178, 0.6, 0.86],
  [0.172, 0.182, 0.2, 0.42],
  [0.822, 0.86, 0.72, 0.95],
  [0.952, 0.968, 0.4, 0.62],
  [0.612, 0.622, 0.32, 0.5],
];

/** 画面状态（每帧由游戏组件推进） */
export class JumpScene {
  platforms: Platform[] = [];
  /** 平台出现时间（秒，场景时钟） */
  private born = new Map<number, number>();
  /** 已离开的平台：淡出后移除 */
  private leaving = new Map<number, number>();
  t = 0;
  /** 角色世界坐标（y 为离台面高度，台面 y=0） */
  cx = 0;
  cz = 0;
  cy = 0;
  /** 0..1 蓄力 */
  charge = 0;
  private phase: Phase = "idle";
  private phaseT = 0;
  private from = { x: 0, z: 0 };
  private to = { x: 0, z: 0 };
  private jumpDur = 0.5;
  private jumpH = 1;
  private axis: "x" | "z" = "x";
  private landing: Landing | null = null;
  private onDone: (() => void) | null = null;
  private stretch = 0;
  /** 落地弹性时钟 */
  private landT = 10;
  private flip = 0;
  private fallVy = 0;
  private toppleA = 0;
  private alpha = 1;
  /** 起跳拖尾：最近的角色位置 */
  private trail: { x: number; z: number; y: number; t: number }[] = [];
  /** 起跳瞬间的蓄力（拖尾强度） */
  private launchPower = 0;
  /** 满蓄力闪光时钟 */
  private fullT = -10;
  private shakeT = -10;
  private shakeAmp = 0;
  /** 镜头（世界坐标）与速度 */
  private camX = 0;
  private camZ = 0;
  private camVX = 0;
  private camVZ = 0;
  private camTX = 0;
  private camTZ = 0;
  fx: JumpFx[] = [];
  /** 当前所在平台 id、目标平台 id */
  curId = 0;
  targetId = 1;
  /** 可选取景覆盖（只用于选卡预览图渲染）：S 为每单位像素，ox/oy 为画面比例位置 */
  view: { S?: number; ox?: number; oy?: number } = {};
  /** 关闭背景动态（基准 / 截图用） */
  staticBackground = false;
  // —— 缓存 ——
  private bgCache: AnyCanvas | null = null;
  private bgKey = "";
  private cloudStrip: AnyCanvas | null = null;
  private cloudKey = "";
  private lo: AnyCanvas | null = null;

  constructor() {
    void loadG05Background();
  }

  /** 背景图加载完成（预览渲染脚本等待它） */
  ready() {
    return loadG05Background().then(() => undefined);
  }

  reset(platforms: Platform[], cur: Platform, target: Platform) {
    this.platforms = [...platforms];
    this.born.clear();
    this.leaving.clear();
    for (const p of platforms) this.born.set(p.id, -10);
    this.cx = cur.x;
    this.cz = cur.z;
    this.cy = 0;
    this.phase = "idle";
    this.alpha = 1;
    this.flip = 0;
    this.toppleA = 0;
    this.fx = [];
    this.trail = [];
    this.curId = cur.id;
    this.targetId = target.id;
    this.camTX = this.camX = (cur.x + target.x) / 2;
    this.camTZ = this.camZ = (cur.z + target.z) / 2;
    this.camVX = this.camVZ = 0;
    this.axis = target.axis;
  }

  get busy() {
    return this.phase !== "idle" && this.phase !== "gone";
  }

  /** 开始一次跳跃动画；结束（落稳或掉落完）后回调 */
  startJump(l: Landing, axis: "x" | "z", onDone: () => void) {
    this.from = { x: this.cx, z: this.cz };
    this.to = { x: l.x, z: l.z };
    this.landing = l;
    this.axis = axis;
    this.jumpDur = 0.44 + l.dist * 0.035;
    this.jumpH = 0.95 + l.dist * 0.16;
    this.phase = "jump";
    this.phaseT = 0;
    this.stretch = 1;
    this.onDone = onDone;
    this.launchPower = Math.max(0.25, this.charge);
    this.charge = 0;
    this.trail = [];
    // 起跳：脚下一圈小尘
    this.addFx({ kind: "dust", x: this.from.x, z: this.from.z });
  }

  /** 成功落地后：加入新平台、更新镜头目标 */
  advance(platforms: Platform[], cur: Platform, target: Platform) {
    for (const p of platforms) if (!this.born.has(p.id)) this.born.set(p.id, this.t + 0.12);
    for (const p of this.platforms)
      if (!platforms.find((q) => q.id === p.id) && !this.leaving.has(p.id)) this.leaving.set(p.id, this.t);
    const keep = this.platforms.filter((p) => this.leaving.has(p.id) && this.t - this.leaving.get(p.id)! < 0.6);
    this.platforms = [...keep.filter((p) => !platforms.find((q) => q.id === p.id)), ...platforms];
    this.curId = cur.id;
    this.targetId = target.id;
    this.camTX = (cur.x + target.x) / 2;
    this.camTZ = (cur.z + target.z) / 2;
    this.axis = target.axis;
  }

  addFx(f: Omit<JumpFx, "t">) {
    this.fx.push({ ...f, t: this.t });
  }

  shake(amp: number) {
    this.shakeT = this.t;
    this.shakeAmp = amp;
  }

  step(dt: number) {
    this.t += dt;
    this.phaseT += dt;
    this.landT += dt;
    this.stretch = Math.max(0, this.stretch - dt * 6);
    if (this.charge >= 0.999 && this.fullT < this.t - 10) this.fullT = this.t;
    if (this.charge < 0.999) this.fullT = -10;
    // 镜头：临界阻尼弹簧，平滑重组画面
    const w = 5.5;
    for (const k of ["X", "Z"] as const) {
      const pos = this[`cam${k}`],
        vel = this[`camV${k}`],
        tgt = this[`camT${k}`];
      const x = pos - tgt,
        e = Math.exp(-w * dt);
      this[`cam${k}`] = tgt + (x + (vel + w * x) * dt) * e;
      this[`camV${k}`] = (vel - w * (vel + w * x) * dt) * e;
    }
    if (this.phase === "jump") {
      const f = Math.min(1, this.phaseT / this.jumpDur);
      this.cx = this.from.x + (this.to.x - this.from.x) * f;
      this.cz = this.from.z + (this.to.z - this.from.z) * f;
      this.cy = 4 * this.jumpH * f * (1 - f);
      this.flip = easeInOut(f) * Math.PI * 2;
      this.trail.push({ x: this.cx, z: this.cz, y: this.cy, t: this.t });
      if (f >= 1) {
        this.flip = 0;
        this.cy = 0;
        const k = this.landing!.kind;
        if (k === "hit" || k === "perfect" || k === "stay") {
          this.phase = "land";
          this.phaseT = 0;
          this.landT = 0;
          this.addFx({ kind: "dust", x: this.cx, z: this.cz });
          if (k === "perfect") this.shake(0.6);
        } else if (k === "edgeShort" || k === "edgeLong") {
          this.phase = "topple";
          this.phaseT = 0;
          this.toppleA = 0;
        } else {
          this.phase = "fall";
          this.phaseT = 0;
          this.fallVy = -2;
        }
      }
    } else if (this.phase === "land") {
      if (this.phaseT > 0.18) this.finish();
    } else if (this.phase === "topple") {
      this.toppleA = Math.min(Math.PI / 2, this.toppleA + dt * (2 + this.phaseT * 9));
      if (this.toppleA >= Math.PI / 2) {
        this.phase = "fall";
        this.phaseT = 0;
        this.fallVy = -1;
      }
    } else if (this.phase === "fall") {
      this.fallVy -= 22 * dt;
      this.cy += this.fallVy * dt;
      this.alpha = Math.max(0, 1 - this.phaseT / 0.9);
      if (this.phaseT > 0.75) {
        // 掉进云海：一团云雾
        this.addFx({ kind: "poof", x: this.cx, z: this.cz, y: this.cy });
        this.shake(1);
        this.finish();
      }
    }
    this.trail = this.trail.filter((p) => this.t - p.t < 0.32);
    this.fx = this.fx.filter((f) => this.t - f.t < (f.kind === "poof" ? 1.6 : 1.2));
  }

  private finish() {
    const cb = this.onDone;
    this.onDone = null;
    // 掉落结束：角色离场（不回到 idle，避免在台面下方继续绘制）
    this.phase = this.phase === "fall" ? "gone" : "idle";
    cb?.();
  }

  /** 失败后保持掉落结果画面（角色不再出现） */
  get fallen() {
    return this.alpha <= 0.01;
  }

  // ———————————————————— 绘制 ————————————————————
  draw(ctx: CanvasRenderingContext2D) {
    const W = ctx.canvas.width,
      H = ctx.canvas.height;
    const S = this.view.S ?? Math.min(W / 14, H / 8.4);
    // 像素颗粒：世界层按约 320 行的低分辨率绘制再放大
    const px = Math.max(2, Math.round(Math.min(H / 300, W / 520)));
    const sh = this.t - this.shakeT < 0.35 ? this.shakeAmp * (1 - (this.t - this.shakeT) / 0.35) : 0;
    const shx = sh ? Math.round(Math.sin(this.t * 90) * sh * px * 2) : 0,
      shy = sh ? Math.round(Math.cos(this.t * 77) * sh * px * 1.5) : 0;

    this.drawBackground(ctx, W, H, px);

    // —— 世界层（低分辨率） ——
    const lw = Math.ceil(W / px),
      lh = Math.ceil(H / px);
    if (!this.lo || this.lo.width !== lw || this.lo.height !== lh) this.lo = makeCanvas(lw, lh);
    const lo = this.lo;
    const o = (lo?.getContext("2d") as CanvasRenderingContext2D | null) ?? null;
    const target = o ?? ctx;
    const k = o ? 1 / px : 1;
    const Sl = S * k;
    const ox = W * (this.view.ox ?? 0.5) * k,
      oy = H * (this.view.oy ?? 0.5) * k;
    const cX = this.camX,
      cZ = this.camZ;
    const P: Proj = (x, z, y = 0) => ({
      x: ox + (x - cX - (z - cZ)) * COS30 * Sl,
      y: oy - (x - cX + (z - cZ)) * SIN30 * Sl - y * Sl,
    });
    if (o) {
      o.setTransform(1, 0, 0, 1, 0, 0);
      o.clearRect(0, 0, lw, lh);
    }
    this.drawWorld(target, P, Sl);
    if (o && lo) {
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(lo as CanvasImageSource, shx, shy, lw * px, lh * px);
      ctx.imageSmoothingEnabled = true;
    }
    // —— 文字层（主画布，清晰） ——
    const Pm: Proj = (x, z, y = 0) => {
      const p = P(x, z, y);
      return { x: p.x / k + shx, y: p.y / k + shy };
    };
    this.drawTexts(ctx, Pm, S);
  }

  // —————— 背景 ——————
  private drawBackground(ctx: CanvasRenderingContext2D, W: number, H: number, px: number) {
    const img = bgImage;
    const margin = 0.05; // 视差余量
    const key = `${W}x${H}:${img ? 1 : 0}`;
    if (key !== this.bgKey) {
      this.bgKey = key;
      const cw = Math.round(W * (1 + margin * 2)),
        chh = Math.round(H * (1 + margin * 2));
      this.bgCache = makeCanvas(cw, chh);
      const b = this.bgCache?.getContext("2d") as CanvasRenderingContext2D | null;
      if (b) {
        if (img) {
          // cover 适配 16:9；像素图放大用最近邻，保持颗粒
          const s = Math.max(cw / img.width, chh / img.height);
          const dw = img.width * s,
            dh = img.height * s;
          b.imageSmoothingEnabled = false;
          b.drawImage(img, (cw - dw) / 2, (chh - dh) / 2, dw, dh);
        } else {
          const g = b.createLinearGradient(0, 0, 0, chh);
          g.addColorStop(0, "#7fb4ec");
          g.addColorStop(0.55, "#bcd6f5");
          g.addColorStop(1, "#efe4f6");
          b.fillStyle = g;
          b.fillRect(0, 0, cw, chh);
        }
        // 中间游玩区轻微提亮、两侧压暗一点：保证平台与角色可读
        const r = b.createRadialGradient(cw / 2, chh * 0.55, chh * 0.1, cw / 2, chh * 0.55, cw * 0.62);
        r.addColorStop(0, "rgba(255,255,255,0.16)");
        r.addColorStop(0.55, "rgba(255,255,255,0.06)");
        r.addColorStop(1, "rgba(40,50,90,0.14)");
        b.fillStyle = r;
        b.fillRect(0, 0, cw, chh);
      }
    }
    // 视差：镜头沿世界前进时背景反向移动很小一段（整数像素，避免闪烁）
    const mx = W * margin,
      my = H * margin;
    const vx = Math.max(-mx, Math.min(mx, -(this.camX - this.camZ) * W * 0.004)),
      vy = Math.max(-my, Math.min(my, (this.camX + this.camZ) * H * 0.003));
    const bx = Math.round(-mx + vx),
      by = Math.round(-my + vy);
    if (this.bgCache) ctx.drawImage(this.bgCache as CanvasImageSource, bx, by);
    if (this.staticBackground) return;
    const T = this.t;
    const cw = W * (1 + margin * 2),
      chh = H * (1 + margin * 2);
    const at = (nx: number, ny: number) => ({ x: bx + nx * cw, y: by + ny * chh });
    // 瀑布水光：向下流动的短亮条
    ctx.fillStyle = "#ffffff";
    for (const [x0, x1, y0, y1] of FALLS) {
      const a = at(x0, y0),
        b = at(x1, y1);
      const n = Math.max(2, Math.round((b.x - a.x) / (px * 2.5)));
      for (let i = 0; i < n; i++) {
        const ph = (T * 0.55 + i * 0.37) % 1;
        const x = Math.round(a.x + ((i + 0.5) / n) * (b.x - a.x));
        const y = Math.round(a.y + ph * (b.y - a.y));
        ctx.globalAlpha = 0.5 * Math.sin(ph * Math.PI);
        ctx.fillRect(x, y, px, px * 4);
      }
    }
    // 水晶闪光：十字星，错峰
    for (let i = 0; i < SPARKLES.length; i++) {
      const [nx, ny, sz] = SPARKLES[i];
      const ph = (T * 0.45 + i * 0.29) % 1;
      const a = Math.max(0, Math.sin(ph * Math.PI * 2));
      if (a < 0.05) continue;
      const p = at(nx, ny);
      const L = Math.round(px * (2 + 3 * a) * sz);
      ctx.globalAlpha = 0.85 * a;
      ctx.fillStyle = "#f4ffff";
      ctx.fillRect(Math.round(p.x - L), Math.round(p.y), L * 2 + px, px);
      ctx.fillRect(Math.round(p.x), Math.round(p.y - L), px, L * 2 + px);
    }
    ctx.globalAlpha = 1;
    // 下方漂移的像素云带（前景，低对比）
    this.drawCloudBand(ctx, W, H, px);
  }

  private drawCloudBand(ctx: CanvasRenderingContext2D, W: number, H: number, px: number) {
    const key = `${W}x${H}`;
    const sw = Math.ceil(W / px),
      shh = Math.ceil((H * 0.22) / px);
    if (key !== this.cloudKey) {
      this.cloudKey = key;
      this.cloudStrip = makeCanvas(sw, shh);
      const c = this.cloudStrip?.getContext("2d") as CanvasRenderingContext2D | null;
      if (c) {
        const r = prand(77);
        // 一串圆鼓鼓的云团：浅紫底 + 白色顶光，左右可无缝循环
        const puffs: [number, number, number][] = [];
        for (let x = -20; x < sw + 20; x += 14 + r() * 18) puffs.push([x, shh * (0.55 + r() * 0.3), 12 + r() * 16]);
        for (const [fill, dy, grow] of [
          ["#e2d8f4", 1, 1],
          ["#f7f3fd", -1, 0.86],
        ] as const) {
          c.fillStyle = fill;
          for (const [x, y, rr] of puffs) {
            for (const off of [-sw, 0, sw]) {
              c.beginPath();
              c.arc(Math.round(x + off), Math.round(y + dy), Math.round(rr * grow), 0, Math.PI * 2);
              c.fill();
            }
          }
          c.fillRect(0, shh * 0.78 + dy, sw, shh);
        }
      }
    }
    if (!this.cloudStrip) return;
    const off = ((this.t * 3) % sw) * px;
    ctx.imageSmoothingEnabled = false;
    ctx.globalAlpha = 0.72;
    const y = Math.round(H - shh * px * 0.55);
    ctx.drawImage(this.cloudStrip as CanvasImageSource, Math.round(-off), y, sw * px, shh * px);
    ctx.drawImage(this.cloudStrip as CanvasImageSource, Math.round(-off + sw * px), y, sw * px, shh * px);
    ctx.globalAlpha = 1;
    ctx.imageSmoothingEnabled = true;
  }

  // —————— 世界 ——————
  private drawWorld(ctx: CanvasRenderingContext2D, P: Proj, S: number) {
    const cur = this.platforms.find((p) => p.id === this.curId);
    const press = this.phase === "idle" ? this.charge : 0;
    // 排序：远（x+z 大）先画
    const sorted = [...this.platforms].sort((a, b) => b.x + b.z - (a.x + a.z));
    const charKey = this.cx + this.cz;
    const onSupport = this.phase !== "fall" && this.phase !== "topple";
    let charDrawn = false;
    for (const p of sorted) {
      const key = p.x + p.z;
      if (!charDrawn && !onSupport && key < charKey) {
        this.drawChar(ctx, P, S, cur);
        charDrawn = true;
      }
      this.drawPlatform(ctx, p, P, S, p.id === this.curId ? press : 0);
      if (!charDrawn && onSupport && this.supportId() === p.id) {
        this.drawTrail(ctx, P, S);
        this.drawChar(ctx, P, S, cur);
        charDrawn = true;
      }
    }
    if (!charDrawn) {
      this.drawTrail(ctx, P, S);
      this.drawChar(ctx, P, S, cur);
    }
    this.drawFx(ctx, P, S);
  }

  /** 角色此刻所在 / 将落上的平台 */
  private supportId() {
    if (this.phase === "jump") {
      // 空中：画在起跳台与目标台中较近的一块之后，避免穿插
      const f = Math.min(1, this.phaseT / this.jumpDur);
      return f < 0.5 ? this.curId : this.targetId;
    }
    let best = this.curId;
    for (const p of this.platforms) {
      if (p.shape === "round" ? Math.hypot(this.cx - p.x, this.cz - p.z) <= p.w / 2 + 0.01 : Math.abs(this.cx - p.x) <= p.w / 2 + 0.01 && Math.abs(this.cz - p.z) <= p.d / 2 + 0.01) best = p.id;
    }
    return best;
  }

  private appear(p: Platform) {
    const b = this.born.get(p.id) ?? -10;
    const f = Math.min(1, Math.max(0, (this.t - b) / 0.42));
    const l = this.leaving.get(p.id);
    const fade = l === undefined ? 1 : Math.max(0, 1 - (this.t - l) / 0.5);
    return { drop: (1 - easeOutBack(f)) * 2.2, a: Math.min(1, f * 1.6) * fade };
  }

  private emphasis(p: Platform) {
    // 当前与目标清晰；更远的预告块与离开的旧块淡一些
    if (p.id === this.curId || p.id === this.targetId) return 1;
    return p.id > this.targetId ? 0.62 : 0.85;
  }

  private drawPlatform(ctx: CanvasRenderingContext2D, p: Platform, P: Proj, S: number, press: number) {
    const { drop, a } = this.appear(p);
    if (a <= 0) return;
    const m = materialOf(p);
    const pal = PALETTES[m];
    // 浮岛轻轻上下浮动（目标与当前台不动，避免影响判断）
    const bob = p.id === this.curId || p.id === this.targetId ? 0 : Math.sin(this.t * 1.3 + p.id) * 0.04;
    const yTop = drop - press * 0.16 + bob;
    const h = p.h - press * 0.16;
    const lw = Math.max(1, Math.round(S * 0.02));
    ctx.globalAlpha = a * this.emphasis(p);
    const rnd = prand(p.id + 11);
    if (p.shape === "round") {
      const R = p.w / 2,
        rx = R * EX * S,
        ry = R * EY * S;
      const c = P(p.x, p.z, yTop),
        b = P(p.x, p.z, yTop - h);
      this.drawUnderside(ctx, [{ x: b.x - rx, y: b.y }, { x: b.x - rx * 0.5, y: b.y + ry * 0.85 }, { x: b.x + rx * 0.5, y: b.y + ry * 0.85 }, { x: b.x + rx, y: b.y }], P(p.x, p.z, yTop - h - h * 1.25 - 0.4), rnd, S);
      // 侧面（左亮右暗）
      const side = ctx.createLinearGradient(c.x - rx, 0, c.x + rx, 0);
      side.addColorStop(0, pal.left);
      side.addColorStop(1, pal.right);
      ctx.fillStyle = side;
      ctx.beginPath();
      ctx.ellipse(b.x, b.y, rx, ry, 0, 0, Math.PI);
      ctx.lineTo(c.x - rx, c.y);
      ctx.ellipse(c.x, c.y, rx, ry, 0, Math.PI, 0, true);
      ctx.closePath();
      ctx.fill();
      // 石环横缝
      ctx.strokeStyle = pal.mortar;
      ctx.lineWidth = lw;
      ctx.globalAlpha = a * this.emphasis(p) * 0.55;
      for (let i = 1; i < 3; i++) {
        const yy = c.y + ((b.y - c.y) * i) / 3;
        ctx.beginPath();
        ctx.ellipse(c.x, yy, rx, ry, 0, 0.05 * Math.PI, 0.95 * Math.PI);
        ctx.stroke();
      }
      ctx.globalAlpha = a * this.emphasis(p);
      this.drawIvy(ctx, rnd, (f) => ({ x: c.x - rx + f * 2 * rx, y: c.y + Math.sin(f * Math.PI) * ry }), b.y - c.y, S, 3);
      // 顶面
      ctx.fillStyle = pal.top;
      ctx.beginPath();
      ctx.ellipse(c.x, c.y, rx, ry, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = pal.topLine;
      ctx.lineWidth = lw;
      ctx.beginPath();
      ctx.ellipse(c.x, c.y, rx * 0.72, ry * 0.72, 0, 0, Math.PI * 2);
      ctx.stroke();
      // 符文环：缓慢旋转的发光刻点
      this.drawRuneRing(ctx, c, rx * 0.86, ry * 0.86, S, p.id === this.targetId || p.id === this.curId ? 1 : 0.6);
      // 外轮廓：顶面边界清楚
      ctx.strokeStyle = pal.outline;
      ctx.lineWidth = lw;
      ctx.beginPath();
      ctx.ellipse(c.x, c.y, rx, ry, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = pal.rim;
      ctx.beginPath();
      ctx.ellipse(c.x, c.y + lw * 0.6, rx - lw, ry - lw, 0, 0.1 * Math.PI, 0.9 * Math.PI);
      ctx.stroke();
    } else {
      const hw = p.w / 2,
        hd = p.d / 2;
      const t0 = P(p.x - hw, p.z - hd, yTop),
        t1 = P(p.x + hw, p.z - hd, yTop),
        t2 = P(p.x + hw, p.z + hd, yTop),
        t3 = P(p.x - hw, p.z + hd, yTop);
      const dy = h * S;
      const b3 = { x: t3.x, y: t3.y + dy },
        b0 = { x: t0.x, y: t0.y + dy },
        b1 = { x: t1.x, y: t1.y + dy };
      const depth = m === "wood" ? 0.55 : h * 1.25 + 0.35;
      this.drawUnderside(ctx, [b3, b0, b1], P(p.x, p.z, yTop - h - depth), rnd, S);
      // 左前侧面（法向 −x）：t3 → t0
      ctx.fillStyle = pal.left;
      quad(ctx, t3, t0, b0, b3);
      ctx.fill();
      // 右前侧面（法向 −z）：t0 → t1
      ctx.fillStyle = pal.right;
      quad(ctx, t0, t1, b1, b0);
      ctx.fill();
      // 侧面纹理：砖缝 / 木纹 / 晶面
      ctx.strokeStyle = pal.mortar;
      ctx.lineWidth = lw;
      ctx.globalAlpha = a * this.emphasis(p) * (m === "crystal" ? 0.45 : 0.6);
      if (m === "wood") {
        this.faceLines(ctx, t3, t0, dy, 3, 0);
        this.faceLines(ctx, t0, t1, dy, 3, 0);
      } else if (m === "crystal") {
        this.crystalFacets(ctx, t3, t0, dy);
        this.crystalFacets(ctx, t0, t1, dy);
      } else {
        const rows = Math.max(2, Math.round(h * 3));
        this.faceLines(ctx, t3, t0, dy, rows, Math.max(2, Math.round(p.d * 1.6)));
        this.faceLines(ctx, t0, t1, dy, rows, Math.max(2, Math.round(p.w * 1.6)));
      }
      ctx.globalAlpha = a * this.emphasis(p);
      if (m === "moss" || m === "stone" || m === "lilac") {
        const ivyN = m === "moss" ? 5 : m === "stone" ? 2 : 1;
        this.drawIvy(ctx, rnd, (f) => (f < 0.5 ? lerp(t3, t0, f * 2) : lerp(t0, t1, (f - 0.5) * 2)), dy, S, ivyN);
      }
      // 顶面
      ctx.fillStyle = pal.top;
      quad(ctx, t0, t1, t2, t3);
      ctx.fill();
      // 顶面纹理：石板缝 / 木板缝（细、浅，不影响落点判断）
      ctx.strokeStyle = pal.topLine;
      ctx.lineWidth = lw;
      if (m === "wood") {
        const n = Math.max(3, Math.round((p.axis === "x" ? p.d : p.w) * 2.4));
        for (let i = 1; i < n; i++) {
          const f = i / n;
          if (p.axis === "x") line(ctx, lerp(t0, t3, f), lerp(t1, t2, f));
          else line(ctx, lerp(t0, t1, f), lerp(t3, t2, f));
        }
      } else if (m === "crystal") {
        line(ctx, lerp(t0, t1, 0.5), lerp(t3, t2, 0.5));
        line(ctx, lerp(t0, t3, 0.5), lerp(t1, t2, 0.5));
      } else {
        for (const f of [1 / 3, 2 / 3]) {
          line(ctx, lerp(t0, t1, f), lerp(t3, t2, f));
          line(ctx, lerp(t0, t3, f), lerp(t1, t2, f));
        }
      }
      if (m === "moss") {
        // 顶面后沿一条苔藓
        ctx.fillStyle = "#9cc77a";
        ctx.globalAlpha = a * this.emphasis(p) * 0.8;
        quad(ctx, t3, t2, lerp(t2, t1, 0.12), lerp(t3, t0, 0.12));
        ctx.fill();
        ctx.globalAlpha = a * this.emphasis(p);
      }
      if (m === "crystal") this.drawCrystalGlow(ctx, P(p.x, p.z, yTop), p, S);
      // 外轮廓 + 前沿高光：顶面边界清楚
      ctx.strokeStyle = pal.outline;
      ctx.lineWidth = lw;
      ctx.beginPath();
      ctx.moveTo(t0.x, t0.y);
      ctx.lineTo(t1.x, t1.y);
      ctx.lineTo(t2.x, t2.y);
      ctx.lineTo(t3.x, t3.y);
      ctx.closePath();
      ctx.moveTo(t0.x, t0.y);
      ctx.lineTo(b0.x, b0.y);
      ctx.moveTo(t3.x, t3.y);
      ctx.lineTo(b3.x, b3.y);
      ctx.moveTo(t1.x, t1.y);
      ctx.lineTo(b1.x, b1.y);
      ctx.stroke();
      ctx.strokeStyle = pal.rim;
      ctx.beginPath();
      ctx.moveTo(t3.x + lw, t3.y);
      ctx.lineTo(t0.x, t0.y - lw);
      ctx.lineTo(t1.x - lw, t1.y);
      ctx.stroke();
    }
    // 目标台：中心淡淡的落点标记（不显示精确落点，只提示中心）
    if (p.id === this.targetId && this.phase !== "fall") {
      const c = P(p.x, p.z, yTop);
      const pulse = 0.55 + 0.45 * Math.sin(this.t * 3.2);
      ctx.strokeStyle = p.bonus ? "#ffffff" : MINT;
      ctx.globalAlpha = a * (0.45 + 0.4 * pulse);
      ctx.lineWidth = lw;
      const r = 0.24;
      ctx.beginPath();
      // 菱形（等轴下的圆）更有像素感
      ctx.moveTo(c.x, c.y - r * EY * S);
      ctx.lineTo(c.x + r * EX * S, c.y);
      ctx.lineTo(c.x, c.y + r * EY * S);
      ctx.lineTo(c.x - r * EX * S, c.y);
      ctx.closePath();
      ctx.stroke();
      ctx.fillStyle = ctx.strokeStyle;
      ctx.fillRect(Math.round(c.x - lw), Math.round(c.y - lw), lw * 2, lw * 2);
    }
    ctx.globalAlpha = 1;
  }

  /** 浮岛底座：倒锥形岩石 + 垂下的藤蔓根须 */
  private drawUnderside(ctx: CanvasRenderingContext2D, top: Pt[], tip: Pt, rnd: () => number, S: number) {
    const L = top[0],
      R = top[top.length - 1];
    const mid = top[Math.floor(top.length / 2)];
    // 轮廓：左边缘 → 顶部前沿 → 右边缘 → 锯齿下降到尖端
    const jag = (a: Pt, b: Pt, n: number) => {
      const out: Pt[] = [];
      for (let i = 1; i < n; i++) {
        const f = i / n;
        const j = (rnd() - 0.5) * S * 0.18;
        out.push({ x: a.x + (b.x - a.x) * f + j, y: a.y + (b.y - a.y) * f + Math.abs(j) * 0.5 });
      }
      return out;
    };
    const tipX = { x: tip.x + (rnd() - 0.5) * S * 0.25, y: tip.y };
    const leftEdge = jag(L, tipX, 4),
      rightEdge = jag(tipX, R, 4);
    // 左半（受光）
    ctx.fillStyle = "#a29db6";
    ctx.beginPath();
    ctx.moveTo(L.x, L.y);
    for (const p of top) ctx.lineTo(p.x, p.y);
    ctx.lineTo(mid.x, mid.y);
    ctx.lineTo(tipX.x, tipX.y);
    for (let i = leftEdge.length - 1; i >= 0; i--) ctx.lineTo(leftEdge[i].x, leftEdge[i].y);
    ctx.closePath();
    ctx.fill();
    // 右半（背光）
    ctx.fillStyle = "#807b9b";
    ctx.beginPath();
    ctx.moveTo(mid.x, mid.y);
    for (const p of top.slice(Math.floor(top.length / 2))) ctx.lineTo(p.x, p.y);
    for (const p of [...rightEdge].reverse()) ctx.lineTo(p.x, p.y);
    ctx.lineTo(tipX.x, tipX.y);
    ctx.closePath();
    ctx.fill();
    // 岩层横纹
    ctx.strokeStyle = "rgba(60,58,80,0.45)";
    ctx.lineWidth = Math.max(1, Math.round(S * 0.02));
    for (const f of [0.35, 0.65]) line(ctx, lerp(L, tipX, f), lerp(R, tipX, f * 0.9));
    // 根须 / 藤蔓
    ctx.fillStyle = "#6f9a5c";
    const n = 2 + Math.floor(rnd() * 3);
    for (let i = 0; i < n; i++) {
      const f = 0.15 + rnd() * 0.7;
      const p = f < 0.5 ? lerp(L, tipX, f * 1.2) : lerp(tipX, R, (f - 0.5) * 2);
      const len = S * (0.2 + rnd() * 0.45);
      const w = Math.max(1, Math.round(S * 0.03));
      ctx.fillRect(Math.round(p.x), Math.round(p.y), w, Math.round(len));
    }
  }

  /** 侧面横缝 + 错缝竖缝 */
  private faceLines(ctx: CanvasRenderingContext2D, a: Pt, b: Pt, dy: number, rows: number, cols: number) {
    ctx.beginPath();
    for (let r = 1; r < rows; r++) {
      const yo = (dy * r) / rows;
      ctx.moveTo(a.x, a.y + yo);
      ctx.lineTo(b.x, b.y + yo);
    }
    if (cols > 0) {
      for (let r = 0; r < rows; r++) {
        const y0 = (dy * r) / rows,
          y1 = (dy * (r + 1)) / rows;
        for (let i = 0; i < cols; i++) {
          const f = (i + (r % 2 ? 0.5 : 1)) / cols;
          if (f <= 0 || f >= 1) continue;
          const p = lerp(a, b, f);
          ctx.moveTo(p.x, p.y + y0);
          ctx.lineTo(p.x, p.y + y1);
        }
      }
    }
    ctx.stroke();
  }

  private crystalFacets(ctx: CanvasRenderingContext2D, a: Pt, b: Pt, dy: number) {
    ctx.beginPath();
    const m = lerp(a, b, 0.5);
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(m.x, m.y + dy * 0.6);
    ctx.lineTo(b.x, b.y);
    ctx.moveTo(m.x, m.y + dy * 0.6);
    ctx.lineTo(m.x, m.y + dy);
    ctx.stroke();
  }

  private drawIvy(ctx: CanvasRenderingContext2D, rnd: () => number, along: (f: number) => Pt, dy: number, S: number, n: number) {
    const w = Math.max(1, Math.round(S * 0.035));
    for (let i = 0; i < n; i++) {
      const f = 0.06 + rnd() * 0.88;
      const p = along(f);
      const len = dy * (0.25 + rnd() * 0.55);
      ctx.fillStyle = "#5f8f4e";
      ctx.fillRect(Math.round(p.x), Math.round(p.y), w, Math.round(len));
      ctx.fillStyle = "#8fc06d";
      for (let y = 0; y < len; y += w * 3) ctx.fillRect(Math.round(p.x + (((y / w) | 0) % 2 ? w : -w)), Math.round(p.y + y), w, w);
      if (rnd() < 0.35) {
        ctx.fillStyle = "#f2b7d0";
        ctx.fillRect(Math.round(p.x - w), Math.round(p.y + len * 0.5), w, w);
      }
    }
  }

  private drawRuneRing(ctx: CanvasRenderingContext2D, c: Pt, rx: number, ry: number, S: number, k: number) {
    const n = 12;
    const w = Math.max(2, Math.round(S * 0.05));
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + this.t * 0.4;
      const glow = 0.45 + 0.55 * Math.max(0, Math.sin(this.t * 2.4 - i * 0.9));
      ctx.globalAlpha = k * glow;
      ctx.fillStyle = i % 2 ? CYAN : MINT_HI;
      ctx.fillRect(Math.round(c.x + Math.cos(a) * rx - w / 2), Math.round(c.y + Math.sin(a) * ry - w / 2), w, w);
    }
    ctx.globalAlpha = 1;
  }

  private drawCrystalGlow(ctx: CanvasRenderingContext2D, c: Pt, p: Platform, S: number) {
    // 奖励台：中心晶核 + 向上飘的光粒
    const w = Math.max(1, Math.round(S * 0.04));
    const pulse = 0.6 + 0.4 * Math.sin(this.t * 4);
    ctx.fillStyle = "#ffffff";
    ctx.globalAlpha = 0.9;
    const r = 0.16 * S * (0.9 + 0.2 * pulse);
    ctx.beginPath();
    ctx.moveTo(c.x, c.y - r * 0.6);
    ctx.lineTo(c.x + r, c.y);
    ctx.lineTo(c.x, c.y + r * 0.6);
    ctx.lineTo(c.x - r, c.y);
    ctx.closePath();
    ctx.fill();
    for (let i = 0; i < 6; i++) {
      const ph = (this.t * 0.6 + i / 6) % 1;
      const a = (i / 6) * Math.PI * 2;
      const rr = 0.45 + (i % 3) * 0.12;
      const x = c.x + Math.cos(a) * rr * Math.min(p.w, p.d) * 0.5 * EX * S;
      const y = c.y + Math.sin(a) * rr * Math.min(p.w, p.d) * 0.5 * EY * S - ph * S * 0.9;
      ctx.globalAlpha = Math.sin(ph * Math.PI) * 0.9;
      ctx.fillStyle = i % 2 ? CYAN : "#ffffff";
      ctx.fillRect(Math.round(x), Math.round(y), w, w);
    }
    ctx.globalAlpha = 1;
  }

  /** 起跳拖尾：薄荷色像素方块，按起跳力度变长 */
  private drawTrail(ctx: CanvasRenderingContext2D, P: Proj, S: number) {
    if (this.phase !== "jump" && this.trail.length === 0) return;
    const w = Math.max(1, Math.round(S * 0.07 * (0.6 + this.launchPower * 0.6)));
    for (let i = 0; i < this.trail.length; i++) {
      const p = this.trail[i];
      const age = (this.t - p.t) / 0.32;
      const c = P(p.x, p.z, p.y + 0.3);
      ctx.globalAlpha = (1 - age) * 0.7 * this.alpha;
      ctx.fillStyle = i % 3 === 0 ? "#ffffff" : MINT;
      const s = Math.max(1, Math.round(w * (1 - age * 0.6)));
      ctx.fillRect(Math.round(c.x - s / 2), Math.round(c.y - s / 2), s, s);
    }
    ctx.globalAlpha = 1;
  }

  // —————— Yukee ——————
  private drawChar(ctx: CanvasRenderingContext2D, P: Proj, S: number, cur: Platform | undefined) {
    if (this.alpha <= 0 || this.phase === "gone") return;
    const press = this.phase === "idle" ? this.charge : 0;
    const sink = this.phase === "idle" && cur ? press * 0.16 : 0;
    const lw = Math.max(1, Math.round(S * 0.02));
    // 接触阴影
    if (this.phase === "jump" || this.phase === "idle" || this.phase === "land") {
      const sh = P(this.cx, this.cz, -sink);
      const k = 1 / (1 + Math.max(0, this.cy) * 0.9);
      ctx.fillStyle = `rgba(40,45,80,${0.28 * k})`;
      ctx.beginPath();
      ctx.ellipse(sh.x, sh.y, 0.22 * EX * S * k, 0.22 * EY * S * k, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    // 蓄力：脚下能量环 + 向上旋起的光粒
    if (press > 0.02) this.drawChargeFx(ctx, P, S, press, sink);
    const base = P(this.cx, this.cz, this.cy - sink);
    // 形变：蓄力压扁、起跳拉长、落地回弹
    let sx = 1 + 0.24 * press,
      sy = 1 - 0.34 * press;
    if (this.stretch > 0) {
      sy *= 1 + 0.2 * this.stretch;
      sx *= 1 - 0.12 * this.stretch;
    }
    if (this.landT < 0.5) {
      const b = Math.exp(-this.landT * 9) * Math.cos(this.landT * 26);
      sy *= 1 - 0.18 * b;
      sx *= 1 + 0.12 * b;
    }
    const bw = 0.34 * S,
      bh = 0.64 * S;
    ctx.save();
    ctx.globalAlpha = this.alpha;
    ctx.translate(Math.round(base.x), Math.round(base.y));
    if (this.phase === "topple" || (this.phase === "fall" && this.toppleA > 0)) {
      const dir = this.axis === "x" ? 1 : -1;
      const sgn = this.landing && (this.landing.kind === "edgeShort" || this.landing.kind === "short") ? -1 : 1;
      ctx.rotate(this.toppleA * dir * sgn * 0.9);
    }
    if (this.phase === "jump") {
      // 空翻：围绕身体中心旋转一周
      ctx.translate(0, -bh / 2);
      ctx.rotate(this.flip * (this.axis === "x" ? 1 : -1));
      ctx.translate(0, bh / 2);
    }
    ctx.scale(sx, sy);
    const face = this.axis === "x" ? 1 : -1;
    const fail = this.phase === "topple" || this.phase === "fall";
    const happy = this.phase === "land" && this.landing?.kind === "perfect";
    // 小脚
    ctx.fillStyle = "#0c241e";
    ctx.beginPath();
    ctx.ellipse(-bw * 0.42, -bh * 0.05, bw * 0.3, bh * 0.08, 0, 0, Math.PI * 2);
    ctx.ellipse(bw * 0.42, -bh * 0.05, bw * 0.3, bh * 0.08, 0, 0, Math.PI * 2);
    ctx.fill();
    // 手臂：蓄力时向后收、空中张开、失败时乱挥
    const armUp = this.phase === "jump" ? -0.5 : fail ? Math.sin(this.t * 30) * 0.6 : press * 0.4;
    ctx.strokeStyle = "#06120e";
    ctx.lineWidth = Math.max(2, bw * 0.24);
    ctx.lineCap = "round";
    for (const sd of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(sd * bw * 0.85, -bh * 0.45);
      ctx.lineTo(sd * bw * 1.3, -bh * (0.3 - armUp * 0.4));
      ctx.stroke();
    }
    ctx.strokeStyle = "#2a6150";
    ctx.lineWidth = Math.max(1, bw * 0.12);
    for (const sd of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(sd * bw * 0.85, -bh * 0.45);
      ctx.lineTo(sd * bw * 1.3, -bh * (0.3 - armUp * 0.4));
      ctx.stroke();
    }
    ctx.lineCap = "butt";
    // 胶滴主体：深墨绿、柔和
    const blob = () => {
      ctx.beginPath();
      ctx.moveTo(0, -bh);
      ctx.bezierCurveTo(bw * 0.9, -bh, bw * 1.1, -bh * 0.55, bw, -bh * 0.22);
      ctx.bezierCurveTo(bw * 0.95, -bh * 0.02, bw * 0.4, 0, 0, 0);
      ctx.bezierCurveTo(-bw * 0.4, 0, -bw * 0.95, -bh * 0.02, -bw, -bh * 0.22);
      ctx.bezierCurveTo(-bw * 1.1, -bh * 0.55, -bw * 0.9, -bh, 0, -bh);
      ctx.closePath();
    };
    blob();
    ctx.strokeStyle = "#06120e";
    ctx.lineWidth = lw * 2;
    ctx.stroke();
    const body = ctx.createLinearGradient(-bw, -bh, bw, 0);
    body.addColorStop(0, "#3b7a63");
    body.addColorStop(0.45, "#1e4a3d");
    body.addColorStop(1, "#133129");
    ctx.fillStyle = body;
    blob();
    ctx.fill();
    // 高光（像素块）
    ctx.fillStyle = "rgba(199,255,231,0.4)";
    ctx.fillRect(Math.round(-bw * 0.62), Math.round(-bh * 0.86), Math.max(1, Math.round(bw * 0.3)), Math.max(1, Math.round(bh * 0.07)));
    // 面屏
    const fw = bw * 1.44,
      fh = bh * 0.4;
    const fx = -fw / 2 + face * bw * 0.05;
    ctx.fillStyle = "#081a16";
    ctx.beginPath();
    ctx.roundRect(fx, -bh * 0.76, fw, fh, fh * 0.35);
    ctx.fill();
    // 薄荷眼：蓄力眯起、完美时笑眼、失败时 > <
    const eyeY = -bh * 0.56;
    const ew = Math.max(1, Math.round(bw * 0.2)),
      eh = Math.max(1, Math.round(bh * 0.16 * (1 - 0.6 * press)));
    ctx.fillStyle = MINT;
    ctx.strokeStyle = MINT;
    ctx.lineWidth = Math.max(1, Math.round(bw * 0.1));
    for (const sd of [-1, 1]) {
      const ex = Math.round(sd * bw * 0.34 + face * bw * 0.08);
      if (fail) {
        ctx.beginPath();
        ctx.moveTo(ex - ew * 0.6, eyeY - ew * 0.5);
        ctx.lineTo(ex + ew * 0.1 * sd, eyeY);
        ctx.lineTo(ex - ew * 0.6, eyeY + ew * 0.5);
        ctx.stroke();
      } else if (happy) {
        ctx.beginPath();
        ctx.arc(ex, eyeY + ew * 0.3, ew * 0.7, Math.PI * 1.1, Math.PI * 1.9);
        ctx.stroke();
      } else {
        ctx.fillRect(ex - ew / 2, Math.round(eyeY - eh / 2), ew, eh);
      }
    }
    if (happy) {
      ctx.fillStyle = "rgba(255,150,140,0.8)";
      ctx.fillRect(Math.round(-bw * 0.72), Math.round(-bh * 0.4), Math.max(1, Math.round(bw * 0.18)), Math.max(1, Math.round(bh * 0.04)));
      ctx.fillRect(Math.round(bw * 0.54), Math.round(-bh * 0.4), Math.max(1, Math.round(bw * 0.18)), Math.max(1, Math.round(bh * 0.04)));
    }
    // 天线：反向惯性 + 薄荷灯（蓄力越满越亮）
    const swing = (this.phase === "jump" ? -0.4 * face : 0) + Math.sin(this.t * 3) * 0.08 + press * Math.sin(this.t * 22) * 0.06;
    const ax = Math.sin(swing) * bh * 0.32,
      ay = -bh - Math.cos(swing) * bh * 0.3;
    ctx.strokeStyle = "#06120e";
    ctx.lineWidth = Math.max(1, Math.round(bw * 0.09));
    ctx.beginPath();
    ctx.moveTo(0, -bh);
    ctx.lineTo(ax, ay);
    ctx.stroke();
    const lampR = Math.max(1.5, bw * 0.17);
    ctx.fillStyle = "#06120e";
    ctx.beginPath();
    ctx.arc(ax, ay, lampR * 1.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = press > 0.02 ? (this.fullT > 0 && (this.t * 8) % 1 < 0.5 ? "#ffffff" : MINT_HI) : MINT;
    ctx.beginPath();
    ctx.arc(ax, ay, lampR, 0, Math.PI * 2);
    ctx.fill();
    if (press > 0.02 || this.phase === "jump") {
      ctx.globalAlpha = this.alpha * (0.25 + 0.35 * press);
      ctx.fillStyle = MINT_HI;
      ctx.beginPath();
      ctx.arc(ax, ay, lampR * (2.2 + press * 1.6), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  private drawChargeFx(ctx: CanvasRenderingContext2D, P: Proj, S: number, press: number, sink: number) {
    const c = P(this.cx, this.cz, -sink);
    const w = Math.max(1, Math.round(S * 0.035));
    const full = this.fullT > 0;
    // 能量环：随蓄力收紧变亮，满蓄力闪烁
    const r = 0.62 - press * 0.22;
    ctx.strokeStyle = full && (this.t * 8) % 1 < 0.5 ? "#ffffff" : MINT;
    ctx.globalAlpha = 0.35 + 0.55 * press;
    ctx.lineWidth = w;
    ctx.beginPath();
    ctx.moveTo(c.x, c.y - r * EY * S);
    ctx.lineTo(c.x + r * EX * S, c.y);
    ctx.lineTo(c.x, c.y + r * EY * S);
    ctx.lineTo(c.x - r * EX * S, c.y);
    ctx.closePath();
    ctx.stroke();
    // 旋起的光粒
    const n = 4 + Math.round(press * 6);
    for (let i = 0; i < n; i++) {
      const ph = (this.t * (0.9 + press) + i / n) % 1;
      const a = (i / n) * Math.PI * 2 + this.t * 2.2;
      const rr = (0.55 - ph * 0.3) * (1 - press * 0.3);
      const x = c.x + Math.cos(a) * rr * EX * S,
        y = c.y + Math.sin(a) * rr * EY * S - ph * S * (0.5 + press * 0.5);
      ctx.globalAlpha = Math.sin(ph * Math.PI) * (0.5 + 0.5 * press);
      ctx.fillStyle = i % 3 === 0 ? "#ffffff" : i % 3 === 1 ? MINT : CYAN;
      ctx.fillRect(Math.round(x), Math.round(y), w, w);
    }
    ctx.globalAlpha = 1;
  }

  // —————— 特效 ——————
  private drawFx(ctx: CanvasRenderingContext2D, P: Proj, S: number) {
    const w = Math.max(1, Math.round(S * 0.04));
    for (const f of this.fx) {
      const age = this.t - f.t;
      const c = P(f.x, f.z, f.y ?? 0);
      if (f.kind === "ripple") {
        // 中心命中：两圈扩散的像素菱形 + 四角星
        for (const d of [0, 0.14]) {
          const k = Math.max(0, Math.min(1, (age - d) / 0.6));
          if (k <= 0 || k >= 1) continue;
          const r = 0.2 + k * 0.95;
          ctx.strokeStyle = d ? MINT : "#fff6c8";
          ctx.globalAlpha = (1 - k) * 0.95;
          ctx.lineWidth = Math.max(1, Math.round(w * (1.4 - k)));
          ctx.beginPath();
          ctx.moveTo(c.x, c.y - r * EY * S);
          ctx.lineTo(c.x + r * EX * S, c.y);
          ctx.lineTo(c.x, c.y + r * EY * S);
          ctx.lineTo(c.x - r * EX * S, c.y);
          ctx.closePath();
          ctx.stroke();
        }
        const k = Math.min(1, age / 0.7);
        for (let i = 0; i < 4; i++) {
          const a = (i / 4) * Math.PI * 2 + 0.6;
          const x = c.x + Math.cos(a) * (0.35 + k * 0.6) * EX * S,
            y = c.y + Math.sin(a) * (0.35 + k * 0.6) * EY * S - k * S * 0.5;
          ctx.globalAlpha = 1 - k;
          ctx.fillStyle = "#ffffff";
          const L = Math.round(w * (2 - k));
          ctx.fillRect(Math.round(x - L), Math.round(y), L * 2 + w, w);
          ctx.fillRect(Math.round(x), Math.round(y - L), w, L * 2 + w);
        }
      } else if (f.kind === "dust") {
        // 起跳 / 落地：左右散开的小尘块
        const k = Math.min(1, age / 0.45);
        if (k >= 1) continue;
        ctx.fillStyle = "#fffaf0";
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2 + 0.3;
          const rr = 0.2 + k * 0.45;
          const x = c.x + Math.cos(a) * rr * EX * S,
            y = c.y + Math.sin(a) * rr * EY * S - Math.sin(k * Math.PI) * S * 0.12;
          ctx.globalAlpha = (1 - k) * 0.85;
          const s = Math.max(1, Math.round(w * (1.6 - k)));
          ctx.fillRect(Math.round(x - s / 2), Math.round(y - s / 2), s, s);
        }
      } else if (f.kind === "bonus") {
        // 奖励台：晶片向上迸发
        const k = Math.min(1, age / 0.9);
        for (let i = 0; i < 12; i++) {
          const a = (i / 12) * Math.PI * 2;
          const v = 0.5 + (i % 3) * 0.25;
          const x = c.x + Math.cos(a) * k * v * EX * S,
            y = c.y + Math.sin(a) * k * v * EY * S - (k * 1.6 - k * k * 0.9) * S;
          ctx.globalAlpha = 1 - k;
          ctx.fillStyle = i % 2 ? CYAN : "#ffffff";
          ctx.fillRect(Math.round(x), Math.round(y), w, w * 2);
        }
      } else if (f.kind === "poof") {
        // 掉进云海：一团慢慢散开的云雾
        const k = Math.min(1, age / 1.4);
        const puffs = 7;
        for (let i = 0; i < puffs; i++) {
          const a = (i / puffs) * Math.PI * 2;
          const rr = (0.25 + k * 0.7) * S;
          ctx.globalAlpha = (1 - k) * 0.85;
          ctx.fillStyle = i % 2 ? "#ffffff" : "#e6dcf6";
          ctx.beginPath();
          ctx.arc(Math.round(c.x + Math.cos(a) * rr), Math.round(c.y + Math.sin(a) * rr * 0.45 - k * S * 0.3), Math.round(S * (0.22 + 0.1 * (i % 3)) * (1 - k * 0.4)), 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
    ctx.globalAlpha = 1;
  }

  private drawTexts(ctx: CanvasRenderingContext2D, P: Proj, S: number) {
    for (const f of this.fx) {
      if (f.kind !== "text" || !f.text) continue;
      const age = this.t - f.t;
      const k = Math.min(1, age / 1.0);
      const c = P(f.x, f.z, 0);
      const size = Math.round(S * (f.strong ? 0.4 : 0.32));
      // 弹出：先放大再回落
      const pop = age < 0.15 ? 0.7 + (age / 0.15) * 0.45 : age < 0.3 ? 1.15 - ((age - 0.15) / 0.15) * 0.15 : 1;
      ctx.save();
      ctx.globalAlpha = 1 - k * k;
      ctx.translate(c.x, c.y - S * (1.05 + k * 0.6));
      ctx.scale(pop, pop);
      ctx.font = `800 ${size}px "Inter","PingFang SC","Microsoft YaHei",sans-serif`;
      ctx.textAlign = "center";
      ctx.lineJoin = "round";
      ctx.lineWidth = Math.max(3, size * 0.22);
      ctx.strokeStyle = "#2f3550";
      ctx.strokeText(f.text, 0, 0);
      ctx.fillStyle = f.strong ? "#fff3a8" : "#ffffff";
      ctx.fillText(f.text, 0, 0);
      ctx.restore();
    }
  }
}

function quad(ctx: CanvasRenderingContext2D, a: Pt, b: Pt, c: Pt, d: Pt) {
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.lineTo(c.x, c.y);
  ctx.lineTo(d.x, d.y);
  ctx.closePath();
}
function line(ctx: CanvasRenderingContext2D, a: Pt, b: Pt) {
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();
}
function lerp(a: Pt, b: Pt, f: number): Pt {
  return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
}
