/**
 * G03「星海冲浪 · 晴日河湾」场景（Canvas 2D）。
 *
 * 底图：public/art/g03-sunlit-castle.png（用户提供的晴日像素城堡/瀑布原画，原样使用）。
 * 底图之上全部为程序化动态图层：
 *  1. 底图（随 Yukee 横移有轻微视差）+ 轻度压暗与暗角，让前景目标始终压得住背景
 *  2. 太阳光芒与暖光（随进度增强）· 瀑布流光 · 河面闪光
 *  3. 彩虹进度：六颗阳光对应彩虹六道色带，接住一颗，光沿弧线飞上天空画出一道
 *  4. 阳光目标：从太阳出发沿光路落到左/右接光点；深色衬底 + 深青轮廓 + 旋转光芒，
 *     下方河面有落点光圈与光柱，远近关系清楚；靠近时光带连接、变大、进度环填充
 *  5. Yukee（与挂灯同一角色：深墨绿柔和胶滴、薄荷发光眼、暖金天线灯），
 *     以像素化方式绘制以融入像素世界；随侧倾横移、倾斜、天线惯性、浪花
 *
 * 所有时间来自调用方的场景时钟 t（秒）；暂停时 t 不推进，整个世界冻结。
 */

export interface SunSurfState {
  t: number;
  /** Yukee 横坐标（画布像素，已平滑） */
  x: number;
  u: number;
  target: -1 | 1;
  approach: number;
  hold: number;
  arrived: boolean;
  returning: boolean;
  reps: number;
  complete: boolean;
  catchT: number;
  catchSide: -1 | 1;
  spawnT: number;
  completeT: number;
  tracking: "ok" | "unstable" | "lost";
  preview?: boolean;
}

export const TARGET_REPS = 6;
/** 彩虹六色（由外到内），同时用作 HUD 进度色 */
export const RAINBOW = [
  "#ff6b5e",
  "#ffa94d",
  "#ffe066",
  "#69db7c",
  "#4dabf7",
  "#9775fa",
] as const;

const IMG_W = 1672,
  IMG_H = 941;

const clamp = (v: number, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const ease = (v: number) => 1 - Math.pow(1 - clamp(v), 3);

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}
const R = rng(20261021);
const SPARKS = Array.from({ length: 26 }, () => ({
  x: 0.4 + R() * 0.5,
  y: 0.74 + R() * 0.24,
  ph: R() * 6.28,
  sp: 0.6 + R() * 1.2,
}));
const FALL = Array.from({ length: 40 }, () => ({ x: R(), ph: R(), w: R() }));
export interface SunLayout {
  W: number;
  H: number;
  k: number;
  cx: number;
  laneDX: number;
  /** 目标中心横坐标（与 Yukee 中心可以不同：Yukee 在河道里，目标在两岸上空） */
  tx: number;
  targetDX: number;
  yukeeY: number;
  targetY: number;
  waterY: number;
  /** 底图映射 */
  scale: number;
  ox: number;
  oy: number;
  sun: { x: number; y: number };
  rainbow: { x: number; y: number; r: number; band: number };
}

export function layoutFor(W: number, H: number, preview = false, par = 0): SunLayout {
  if (preview) {
    // 卡片 6.3:1：取底图中下部（瀑布、河道、城堡墙基）横幅；Yukee 偏左，右侧 30% 给标题。
    const k = H / 300;
    const scale = W / IMG_W;
    const oy = H * 0.5 - IMG_H * 0.64 * scale;
    return {
      W,
      H,
      k,
      cx: W * 0.3,
      laneDX: W * 0.13,
      tx: W * 0.3,
      targetDX: W * 0.13,
      yukeeY: H * 0.82,
      targetY: H * 0.36,
      waterY: H * 0.8,
      scale,
      ox: 0,
      oy,
      sun: { x: W * 0.42, y: -H * 0.4 },
      rainbow: { x: W * 0.47, y: H * 1.05, r: H * 0.95, band: 6 * k },
    };
  }
  const k = H / 540;
  const scale = Math.max(W / IMG_W, H / IMG_H) * 1.05;
  const ox = (W - IMG_W * scale) / 2 - par * 0.04;
  const oy = (H - IMG_H * scale) / 2;
  const map = (nx: number, ny: number) => ({ x: ox + nx * IMG_W * scale, y: oy + ny * IMG_H * scale });
  const sun = map(0.365, 0.03);
  const rc = map(0.43, 0.7);
  return {
    W,
    H,
    k,
    cx: W * 0.56,
    laneDX: Math.min(W * 0.2, 210 * k),
    tx: W * 0.53,
    targetDX: Math.min(W * 0.27, 280 * k),
    yukeeY: H * 0.755,
    targetY: H * 0.47,
    waterY: H * 0.78,
    scale,
    ox,
    oy,
    sun,
    rainbow: { x: rc.x, y: rc.y, r: Math.min(W * 0.3, 330 * k), band: 7 * k },
  };
}

function glow(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string, alpha: number) {
  if (alpha <= 0.002 || r <= 0) return;
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, color);
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.globalAlpha = Math.min(1, alpha);
  ctx.fillStyle = g;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
  ctx.globalAlpha = 1;
}

function drawBackground(ctx: CanvasRenderingContext2D, L: SunLayout, s: SunSurfState, img: CanvasImageSource | null) {
  const { W, H } = L;
  if (img) {
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, L.ox, L.oy, IMG_W * L.scale, IMG_H * L.scale);
    ctx.imageSmoothingEnabled = true;
  } else {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, "#3aa0ff");
    g.addColorStop(0.6, "#9fd8ff");
    g.addColorStop(1, "#2f86c9");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }
  // 轻度压暗 + 暗角：保留晴日氛围，同时让目标与角色是画面里对比最强的东西
  ctx.fillStyle = s.complete ? "rgba(16,40,70,0.04)" : "rgba(16,40,70,0.13)";
  ctx.fillRect(0, 0, W, H);
  const v = ctx.createRadialGradient(W / 2, H * 0.55, Math.min(W, H) * 0.35, W / 2, H * 0.55, Math.max(W, H) * 0.75);
  v.addColorStop(0, "rgba(10,30,55,0)");
  v.addColorStop(1, "rgba(10,30,55,0.32)");
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, W, H);
}

function drawSunlight(ctx: CanvasRenderingContext2D, L: SunLayout, s: SunSurfState) {
  const prog = s.complete ? 1 : s.reps / TARGET_REPS;
  const { sun, k } = L;
  // 旋转光芒：进度越高越亮越长
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  const n = 9;
  for (let i = 0; i < n; i++) {
    const a = Math.PI * 0.12 + (i / (n - 1)) * Math.PI * 0.76 + Math.sin(s.t * 0.25 + i) * 0.03;
    const len = (260 + 300 * prog) * k;
    const w = 0.035 + 0.01 * Math.sin(s.t * 0.7 + i * 1.3);
    const g = ctx.createLinearGradient(sun.x, sun.y, sun.x + Math.cos(a) * len, sun.y + Math.sin(a) * len);
    g.addColorStop(0, `rgba(255,246,200,${0.07 + 0.16 * prog})`);
    g.addColorStop(1, "rgba(255,246,200,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(sun.x, sun.y);
    ctx.lineTo(sun.x + Math.cos(a - w) * len, sun.y + Math.sin(a - w) * len);
    ctx.lineTo(sun.x + Math.cos(a + w) * len, sun.y + Math.sin(a + w) * len);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
  glow(ctx, sun.x, sun.y, (110 + 90 * prog) * k, "rgba(255,248,214,0.95)", 0.55 + 0.35 * prog);
}

function drawWater(ctx: CanvasRenderingContext2D, L: SunLayout, s: SunSurfState) {
  if (s.preview) return;
  const map = (nx: number, ny: number) => ({ x: L.ox + nx * IMG_W * L.scale, y: L.oy + ny * IMG_H * L.scale });
  // 瀑布流光：落下的白色像素短线
  const falls = [
    [0.248, 0.335, 0.77, 1.0],
    [0.345, 0.4, 0.83, 1.0],
    [0.352, 0.425, 0.63, 0.7],
  ];
  const px = Math.max(2, Math.round(2.5 * L.k));
  for (const [x0, x1, y0, y1] of falls) {
    const a = map(x0, y0),
      b = map(x1, y1);
    for (const f of FALL) {
      const p = (f.ph + s.t * (0.8 + f.w * 0.6)) % 1;
      const x = a.x + f.x * (b.x - a.x);
      const y = a.y + p * (b.y - a.y);
      ctx.globalAlpha = 0.35 * Math.sin(p * Math.PI);
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(Math.round(x), Math.round(y), px, px * 3);
    }
  }
  ctx.globalAlpha = 1;
  // 河面闪光（低亮度，不与目标抢视线）
  for (const sp of SPARKS) {
    const p = map(sp.x, sp.y);
    const a = Math.max(0, Math.sin(s.t * sp.sp + sp.ph));
    if (a < 0.4) continue;
    ctx.globalAlpha = (a - 0.4) * 0.9;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(Math.round(p.x - px), Math.round(p.y), px * 3, px);
    ctx.fillRect(Math.round(p.x), Math.round(p.y - px), px, px * 3);
  }
  ctx.globalAlpha = 1;
}

/** 彩虹：已接住的色带完整显示，正在落位的一道沿弧线扫出 */
function drawRainbow(ctx: CanvasRenderingContext2D, L: SunLayout, s: SunSurfState) {
  const { rainbow: rb } = L;
  const painting = s.reps > 0 && s.t - s.catchT < 1.25 ? s.reps - 1 : -1;
  const done = s.complete && painting < 0;
  for (let i = 0; i < TARGET_REPS; i++) {
    const r = rb.r - i * rb.band;
    let sweep = 0;
    if (i < s.reps && i !== painting) sweep = 1;
    else if (i === painting) sweep = ease((s.t - s.catchT - 0.45) / 0.8);
    if (sweep <= 0) {
      // 尚未点亮：极淡的虚线提示「这里会出现彩虹」
      if (i === s.reps && !s.complete) {
        ctx.strokeStyle = "rgba(255,255,255,0.35)";
        ctx.lineWidth = 1.5 * L.k;
        ctx.setLineDash([3 * L.k, 7 * L.k]);
        ctx.beginPath();
        ctx.arc(rb.x, rb.y, r, Math.PI, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      continue;
    }
    ctx.strokeStyle = RAINBOW[i];
    ctx.globalAlpha = done ? 0.72 + 0.12 * Math.sin(s.t * 2 + i) : 0.62;
    ctx.lineWidth = rb.band + 0.5;
    ctx.beginPath();
    ctx.arc(rb.x, rb.y, r, Math.PI, Math.PI + Math.PI * sweep);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
  if (done) glow(ctx, rb.x, rb.y - rb.r * 0.6, rb.r * 0.9, "rgba(255,255,240,0.5)", 0.25);
}

export function targetPose(L: SunLayout, s: SunSurfState) {
  const home = { x: L.tx + s.target * L.targetDX, y: L.targetY };
  const start = { x: L.sun.x + s.target * 30 * L.k, y: L.sun.y + 40 * L.k };
  if (s.returning) {
    // 下一颗在太阳旁等待（另一侧），回到中间后才落下
    const wx = L.sun.x + s.target * 90 * L.k,
      wy = Math.max(L.sun.y + 80 * L.k, 46 * L.k);
    return { x: wx, y: wy, r: 12 * L.k, flight: 0, waiting: true };
  }
  const f = ease((s.t - s.spawnT) / 1.0);
  const c = { x: home.x - s.target * L.targetDX * 0.1, y: Math.min(start.y, home.y) - 30 * L.k };
  const a = 1 - f;
  const x = a * a * start.x + 2 * a * f * c.x + f * f * home.x;
  const y = a * a * start.y + 2 * a * f * c.y + f * f * home.y;
  const bob = f >= 1 ? Math.sin(s.t * 2.4) * 5 * L.k : 0;
  return { x, y: y + bob, r: (9 + 11 * f) * L.k, flight: f, waiting: false };
}

/** 阳光光团：深色衬底 + 深青外轮廓 + 白金光核 + 旋转光芒，亮背景上也一眼可辨 */
function drawSunOrb(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, t: number, power: number, k: number) {
  // 衬底：把亮背景压下去
  const bp = ctx.createRadialGradient(x, y, r * 0.5, x, y, r * 3.1);
  bp.addColorStop(0, "rgba(6,34,58,0.55)");
  bp.addColorStop(1, "rgba(6,34,58,0)");
  ctx.fillStyle = bp;
  ctx.beginPath();
  ctx.arc(x, y, r * 3.1, 0, Math.PI * 2);
  ctx.fill();
  glow(ctx, x, y, r * (2.6 + 1.6 * power), "rgba(255,226,120,0.95)", 0.55 + 0.4 * power);
  // 旋转光芒（深色描边 + 金色填充）
  const n = 8;
  const rot = t * (0.8 + 1.6 * power);
  for (let i = 0; i < n; i++) {
    const a = rot + (i / n) * Math.PI * 2;
    const len = r * (1.55 + 0.55 * power + (i % 2 ? -0.2 : 0.15));
    const w = 0.2;
    ctx.beginPath();
    ctx.moveTo(x + Math.cos(a - w) * r * 1.05, y + Math.sin(a - w) * r * 1.05);
    ctx.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len);
    ctx.lineTo(x + Math.cos(a + w) * r * 1.05, y + Math.sin(a + w) * r * 1.05);
    ctx.closePath();
    ctx.fillStyle = "#ffcf3f";
    ctx.fill();
    ctx.strokeStyle = "#0b3b4d";
    ctx.lineWidth = 1.6 * k;
    ctx.stroke();
  }
  // 光核
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  const core = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.1, x, y, r);
  core.addColorStop(0, "#ffffff");
  core.addColorStop(0.45, "#fff3b0");
  core.addColorStop(1, "#ffb627");
  ctx.fillStyle = core;
  ctx.fill();
  ctx.lineWidth = 3 * k;
  ctx.strokeStyle = "#0b3b4d";
  ctx.stroke();
  ctx.lineWidth = 1.5 * k;
  ctx.strokeStyle = "rgba(255,255,255,0.9)";
  ctx.beginPath();
  ctx.arc(x, y, r - 2.5 * k, Math.PI * 1.05, Math.PI * 1.6);
  ctx.stroke();
}

function drawTarget(ctx: CanvasRenderingContext2D, L: SunLayout, s: SunSurfState, yx: number, yy: number) {
  if (s.complete) return;
  const { k } = L;
  const st = targetPose(L, s);
  if (st.waiting) {
    const pulse = 0.7 + 0.3 * Math.sin(s.t * 5);
    drawSunOrb(ctx, st.x, st.y, st.r * pulse, s.t, 0, k);
    return;
  }
  // 飞行轨迹：从太阳落下的光尘
  if (st.flight < 1) {
    for (let i = 1; i <= 7; i++) {
      const q = targetPose(L, { ...s, t: s.t - i * 0.05 });
      ctx.globalAlpha = 0.5 - i * 0.06;
      ctx.fillStyle = "#fff1a8";
      ctx.beginPath();
      ctx.arc(q.x, q.y, (6 - i * 0.6) * k, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
  const ap = st.flight >= 1 ? s.approach : 0;
  // 落点：河面光圈 + 光柱，交代远近
  const ringY = L.waterY - 6 * k;
  ctx.globalAlpha = 0.35 + 0.45 * ap;
  const col = ctx.createLinearGradient(0, st.y, 0, ringY);
  col.addColorStop(0, "rgba(255,236,150,0.55)");
  col.addColorStop(1, "rgba(255,236,150,0)");
  ctx.fillStyle = col;
  ctx.fillRect(st.x - st.r * 0.45, st.y, st.r * 0.9, ringY - st.y);
  ctx.strokeStyle = "#fff4c2";
  ctx.lineWidth = 2.5 * k;
  ctx.beginPath();
  ctx.ellipse(st.x, ringY, (34 + 14 * ap) * k, (8 + 3 * ap) * k, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = "rgba(11,59,77,0.6)";
  ctx.lineWidth = 1.2 * k;
  ctx.beginPath();
  ctx.ellipse(st.x, ringY, (38 + 14 * ap) * k, (10 + 3 * ap) * k, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.globalAlpha = 1;
  // 光带：从 Yukee 天线连到光团，越近越粗越亮
  if (ap > 0.05) {
    ctx.lineCap = "round";
    ctx.strokeStyle = `rgba(11,59,77,${0.25 + 0.3 * ap})`;
    ctx.lineWidth = (4 + 8 * ap) * k;
    const path = () => {
      ctx.beginPath();
      ctx.moveTo(yx, yy);
      ctx.quadraticCurveTo((yx + st.x) / 2, Math.min(yy, st.y) - 50 * k, st.x, st.y);
    };
    path();
    ctx.stroke();
    ctx.strokeStyle = `rgba(255,230,120,${0.3 + 0.65 * ap})`;
    ctx.lineWidth = (2 + 5 * ap) * k;
    path();
    ctx.stroke();
    // 沿光带流动的光点
    for (let i = 0; i < 4; i++) {
      const f = (s.t * 1.6 + i / 4) % 1;
      const a = 1 - f;
      const cxp = (yx + st.x) / 2,
        cyp = Math.min(yy, st.y) - 50 * k;
      const px = a * a * st.x + 2 * a * f * cxp + f * f * yx;
      const py = a * a * st.y + 2 * a * f * cyp + f * f * yy;
      ctx.fillStyle = "#ffffff";
      ctx.globalAlpha = ap;
      ctx.beginPath();
      ctx.arc(px, py, 3 * k, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.lineCap = "butt";
  }
  const r = st.r * (1 + 0.28 * ap + (s.arrived ? 0.08 * Math.sin(s.t * 20) : 0));
  drawSunOrb(ctx, st.x, st.y, r, s.t, ap, k);
  if (st.flight >= 1) {
    // 进度环：接近时填到一半，进入接光区后保持填满
    const R2 = r * 2.3;
    ctx.strokeStyle = "rgba(11,59,77,0.55)";
    ctx.lineWidth = 6 * k;
    ctx.beginPath();
    ctx.arc(st.x, st.y, R2, 0, Math.PI * 2);
    ctx.stroke();
    const prog = s.arrived ? 0.5 + 0.5 * s.hold : 0.5 * ap;
    if (prog > 0) {
      ctx.strokeStyle = s.arrived ? "#ffffff" : "#ffd84a";
      ctx.lineWidth = 4 * k;
      ctx.beginPath();
      ctx.arc(st.x, st.y, R2, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * prog);
      ctx.stroke();
    }
    if (!s.arrived) {
      for (let i = 0; i < 3; i++) {
        const ph = (s.t * 1.4 + i / 3) % 1;
        const ax = st.x - s.target * (R2 + (44 - ph * 26) * k);
        ctx.globalAlpha = Math.sin(ph * Math.PI) * (0.95 - 0.5 * ap);
        ctx.lineCap = "round";
        for (const [w, c] of [
          [7, "#0b3b4d"],
          [3.5, "#ffe58a"],
        ] as const) {
          ctx.strokeStyle = c;
          ctx.lineWidth = w * k;
          ctx.beginPath();
          ctx.moveTo(ax - s.target * 7 * k, st.y - 11 * k);
          ctx.lineTo(ax + s.target * 5 * k, st.y);
          ctx.lineTo(ax - s.target * 7 * k, st.y + 11 * k);
          ctx.stroke();
        }
        ctx.lineCap = "butt";
      }
      ctx.globalAlpha = 1;
    }
  }
}

function drawCatchFx(ctx: CanvasRenderingContext2D, L: SunLayout, s: SunSurfState, yx: number, yy: number) {
  const dt = s.t - s.catchT;
  if (s.reps === 0 || dt < 0 || dt > 1.4) return;
  const { k } = L;
  const from = { x: L.tx + s.catchSide * L.targetDX, y: L.targetY };
  // 1) 爆开：冲击环 + 光片
  if (dt < 0.6) {
    const p = dt / 0.6;
    ctx.strokeStyle = `rgba(255,255,255,${1 - p})`;
    ctx.lineWidth = 5 * k * (1 - p);
    ctx.beginPath();
    ctx.arc(from.x, from.y, (24 + 70 * ease(p)) * k, 0, Math.PI * 2);
    ctx.stroke();
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2 + i * 0.7;
      const d = (18 + 60 * ease(p)) * k;
      ctx.globalAlpha = 1 - p;
      ctx.fillStyle = i % 2 ? "#fff1a8" : "#ffffff";
      const sz = 5 * k * (1 - p * 0.5);
      ctx.fillRect(from.x + Math.cos(a) * d - sz / 2, from.y + Math.sin(a) * d - sz / 2, sz, sz);
    }
    ctx.globalAlpha = 1;
  }
  // 2) 光被吸进 Yukee（0–0.45s）
  if (dt < 0.45) {
    const f = ease(dt / 0.45);
    const x = from.x + (yx - from.x) * f,
      y = from.y + (yy - from.y) * f - Math.sin(f * Math.PI) * 40 * k;
    glow(ctx, x, y, 34 * k, "rgba(255,230,120,0.95)", 0.9);
    ctx.fillStyle = "#fffbe0";
    ctx.beginPath();
    ctx.arc(x, y, 9 * k * (1 - f * 0.4), 0, Math.PI * 2);
    ctx.fill();
  }
  // 3) Yukee 把这道光送上天，画出对应颜色的彩虹带（0.45–1.25s）
  const band = Math.max(0, s.reps - 1);
  const rb = L.rainbow;
  const to = { x: rb.x - (rb.r - band * rb.band), y: rb.y };
  if (dt >= 0.3 && dt < 0.8) {
    const f = ease((dt - 0.3) / 0.5);
    const c = { x: (yx + to.x) / 2, y: Math.min(yy, to.y) - 120 * k };
    const a = 1 - f;
    const x = a * a * yx + 2 * a * f * c.x + f * f * to.x;
    const y = a * a * yy + 2 * a * f * c.y + f * f * to.y;
    ctx.strokeStyle = RAINBOW[band];
    ctx.lineWidth = 6 * k;
    ctx.lineCap = "round";
    ctx.globalAlpha = 0.85;
    ctx.beginPath();
    for (let i = 0; i <= 10; i++) {
      const fi = clamp(f - (10 - i) * 0.025);
      const ai = 1 - fi;
      const px = ai * ai * yx + 2 * ai * fi * c.x + fi * fi * to.x;
      const py = ai * ai * yy + 2 * ai * fi * c.y + fi * fi * to.y;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.lineCap = "butt";
    glow(ctx, x, y, 26 * k, "rgba(255,255,230,0.95)", 0.9);
  }
}

function drawCompleteFx(ctx: CanvasRenderingContext2D, L: SunLayout, s: SunSurfState) {
  if (!s.complete) return;
  const dt = s.t - s.completeT;
  if (dt < 1.2) return;
  const { k, rainbow: rb } = L;
  // 彩虹下方飘起少量金色光片（数量克制）
  for (let i = 0; i < 18; i++) {
    const p = ((dt - 1.2) * 0.25 + i / 18) % 1;
    const x = rb.x + Math.sin(i * 2.3) * rb.r * 0.9 + Math.sin(s.t + i) * 8 * k;
    const y = L.H * 0.86 - p * L.H * 0.5;
    ctx.globalAlpha = Math.sin(p * Math.PI) * 0.8;
    ctx.fillStyle = RAINBOW[i % 6];
    const sz = 4 * k;
    ctx.fillRect(x, y, sz, sz);
  }
  ctx.globalAlpha = 1;
}

/** Yukee（像素化）。offscreen 由调用方缓存。 */
function drawYukee(ctx: CanvasRenderingContext2D, L: SunLayout, s: SunSurfState, off: { c: HTMLCanvasElement | OffscreenCanvas | null }) {
  const { k } = L;
  const happyDt = s.t - s.catchT;
  const happy = (s.reps > 0 && happyDt >= 0 && happyDt < 0.9) || s.complete;
  const jump =
    s.reps > 0 && happyDt >= 0 && happyDt < 0.55
      ? Math.sin((happyDt / 0.55) * Math.PI) * 22 * k
      : s.complete
        ? Math.abs(Math.sin(s.t * 3.2)) * 12 * k
        : 0;
  const bob = Math.sin(s.t * 1.8) * 3.5 * k;
  // 完成后在河湾中央稍稍上浮庆祝，给结算面板让位
  const away = s.complete ? ease((s.t - s.completeT) / 1.4) : 0;
  const x = s.x,
    y = L.yukeeY + bob - away * 30 * k;
  const lean = s.u;
  const S = 1.3; // 角色放大
  // 水面：板下光、尾迹、浪花（平滑绘制，在主画布上）
  glow(ctx, x, y + 8 * k, 110 * k, "rgba(255,255,255,0.7)", 0.25 + 0.2 * Math.abs(lean));
  for (let i = 0; i < 8; i++) {
    const d = ((s.t * 70 + i * 20) % 160) * k;
    ctx.globalAlpha = (1 - d / (160 * k)) * 0.75;
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 2 * k;
    ctx.beginPath();
    ctx.ellipse(x - lean * d * 0.35, y + 12 * k + d * 0.4, 70 * k + d * 0.5, 6 * k + d * 0.05, 0, 0.1 * Math.PI, 0.9 * Math.PI);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  const sprayN = Math.round(Math.abs(lean) * 14);
  for (let i = 0; i < sprayN; i++) {
    const ph = (s.t * 2.4 + i * 0.137) % 1;
    const sx = x - Math.sign(lean) * (85 + ph * 80) * k;
    const sy = y + 6 * k - Math.sin(ph * Math.PI) * 40 * k * (0.6 + (i % 3) * 0.25);
    ctx.globalAlpha = (1 - ph) * 0.9;
    ctx.fillStyle = "#ffffff";
    const sz = (3 + (i % 2) * 2) * k;
    ctx.fillRect(sx, sy, sz, sz);
  }
  ctx.globalAlpha = 1;
  // 吸光后的暖光
  if (happy) glow(ctx, x, y - 60 * k * S - jump, 90 * k, "rgba(255,226,120,0.9)", s.complete ? 0.35 : 0.55 * (1 - happyDt / 0.9));

  // 角色绘制到低分辨率离屏画布，再无平滑放大 → 与像素世界同一语言
  const px = Math.max(2, Math.round(2.6 * k));
  const box = Math.ceil((260 * k * S) / px);
  if (typeof document === "undefined" && typeof OffscreenCanvas === "undefined") return;
  if (!off.c || off.c.width !== box) {
    off.c = typeof OffscreenCanvas !== "undefined" ? new OffscreenCanvas(box, box) : Object.assign(document.createElement("canvas"), { width: box, height: box });
    off.c.width = box;
    off.c.height = box;
  }
  const o = off.c.getContext("2d") as CanvasRenderingContext2D;
  o.setTransform(1, 0, 0, 1, 0, 0);
  o.clearRect(0, 0, box, box);
  const q = (k * S) / px; // 离屏中每「基准像素」大小
  o.translate(box / 2, box * 0.78 - jump / px);
  // 冲浪板
  o.save();
  o.rotate(lean * 0.16);
  o.fillStyle = "#0b3b4d";
  o.beginPath();
  o.ellipse(0, 0, 80 * q, 14 * q, 0, 0, Math.PI * 2);
  o.fill();
  o.fillStyle = "#7ff0d0";
  o.beginPath();
  o.ellipse(0, -1 * q, 76 * q, 10.5 * q, 0, 0, Math.PI * 2);
  o.fill();
  o.fillStyle = "#ffd25a";
  o.fillRect(-56 * q, -2 * q, 112 * q, 3.5 * q);
  o.fillStyle = "#e6fff7";
  o.fillRect(-48 * q, -7 * q, 50 * q, 2.5 * q);
  o.restore();
  // 身体
  o.rotate(lean * 0.3);
  const bw = 46 * q,
    bh = 78 * q;
  o.fillStyle = "#0c241e";
  o.beginPath();
  o.ellipse(-16 * q, -6 * q, 11 * q, 6 * q, 0, 0, Math.PI * 2);
  o.ellipse(16 * q, -6 * q, 11 * q, 6 * q, 0, 0, Math.PI * 2);
  o.fill();
  // 手臂：平衡 / 开心举起
  o.strokeStyle = "#06120e";
  o.lineWidth = 9 * q;
  o.lineCap = "round";
  const armPath = (sd: number) => {
    const balance = -lean * sd * 12 * q;
    o.beginPath();
    o.moveTo(sd * bw * 0.85, -bh * 0.5);
    o.quadraticCurveTo(sd * (bw + 16 * q), -bh * 0.5 + 4 * q + balance, sd * (bw + 24 * q), -bh * 0.5 + (happy ? -32 * q : 10 * q) + balance);
  };
  for (const sd of [-1, 1]) {
    armPath(sd);
    o.stroke();
  }
  o.strokeStyle = "#2a6150";
  o.lineWidth = 5 * q;
  for (const sd of [-1, 1]) {
    armPath(sd);
    o.stroke();
  }
  o.lineCap = "butt";
  // 胶滴主体
  const blob = () => {
    o.beginPath();
    o.moveTo(0, -bh - 8 * q);
    o.bezierCurveTo(bw * 0.85, -bh - 8 * q, bw * 1.08, -bh * 0.55, bw, -bh * 0.22);
    o.bezierCurveTo(bw * 0.95, -2 * q, bw * 0.4, 0, 0, 0);
    o.bezierCurveTo(-bw * 0.4, 0, -bw * 0.95, -2 * q, -bw, -bh * 0.22);
    o.bezierCurveTo(-bw * 1.08, -bh * 0.55, -bw * 0.85, -bh - 8 * q, 0, -bh - 8 * q);
    o.closePath();
  };
  blob();
  o.fillStyle = "#06120e";
  o.lineWidth = 7 * q;
  o.strokeStyle = "#06120e";
  o.stroke();
  const body = o.createLinearGradient(-bw, -bh, bw, 0);
  body.addColorStop(0, "#3b7a63");
  body.addColorStop(0.45, "#1e4a3d");
  body.addColorStop(1, "#133129");
  o.fillStyle = body;
  blob();
  o.fill();
  o.fillStyle = "rgba(199,255,231,0.28)";
  o.beginPath();
  o.ellipse(-bw * 0.45, -bh * 0.8, bw * 0.26, bh * 0.09, -0.5, 0, Math.PI * 2);
  o.fill();
  // 面屏
  o.fillStyle = "#081a16";
  o.beginPath();
  o.roundRect(-bw * 0.72, -bh * 0.74, bw * 1.44, bh * 0.4, 14 * q);
  o.fill();
  // 眼睛
  const lookX = (s.complete ? 0 : s.target * 4 + lean * 5) * q;
  const blink = s.t % 3.7 < 0.12 && !happy;
  const eyeY = -bh * 0.54;
  const eyeW = 10 * q * (1 + 0.15 * s.approach),
    eyeH = 18 * q * (1 + 0.2 * s.approach);
  o.fillStyle = s.tracking === "lost" ? "#4f8a70" : "#8de9bc";
  for (const sd of [-1, 1]) {
    const ex = sd * 15 * q + lookX;
    if (happy) {
      o.strokeStyle = "#b8ffe0";
      o.lineWidth = 5 * q;
      o.beginPath();
      o.arc(ex, eyeY + 5 * q, 7 * q, Math.PI * 1.1, Math.PI * 1.9);
      o.stroke();
    } else if (blink || s.tracking === "lost") {
      o.fillRect(ex - eyeW / 2, eyeY - 2 * q, eyeW, 4 * q);
    } else {
      o.beginPath();
      o.roundRect(ex - eyeW / 2, eyeY - eyeH / 2, eyeW, eyeH, eyeW / 2);
      o.fill();
    }
  }
  if (happy) {
    o.fillStyle = "rgba(255,150,140,0.75)";
    o.fillRect(-32 * q, -bh * 0.42, 9 * q, 4 * q);
    o.fillRect(23 * q, -bh * 0.42, 9 * q, 4 * q);
  }
  // 天线：反向惯性
  const swing = -lean * 0.5 + Math.sin(s.t * 3) * 0.08;
  const ax = Math.sin(swing) * 24 * q,
    ay = -bh - 8 * q - Math.cos(swing) * 24 * q;
  o.strokeStyle = "#06120e";
  o.lineWidth = 4 * q;
  o.beginPath();
  o.moveTo(0, -bh - 7 * q);
  o.lineTo(ax, ay);
  o.stroke();
  o.fillStyle = "#06120e";
  o.beginPath();
  o.arc(ax, ay, 7.5 * q, 0, Math.PI * 2);
  o.fill();
  o.fillStyle = "#ffd25a";
  o.beginPath();
  o.arc(ax, ay, 5.5 * q, 0, Math.PI * 2);
  o.fill();

  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(off.c as CanvasImageSource, x - (box * px) / 2, y - box * px * 0.78, box * px, box * px);
  ctx.imageSmoothingEnabled = true;
  // 天线灯光晕（平滑，随接近变亮）
  const cos = Math.cos(lean * 0.3),
    sin = Math.sin(lean * 0.3);
  const lx = ax * px,
    ly = ay * px;
  const gx = x + lx * cos - ly * sin,
    gy = y - jump + lx * sin + ly * cos;
  glow(ctx, gx, gy, (16 + 26 * s.approach + (happy ? 18 : 0)) * k, "rgba(255,220,110,0.95)", 0.45 + 0.5 * s.approach);
  return { ax: gx, ay: gy };
}

/** 天线灯在画布中的位置（光带起点），与 drawYukee 计算一致的近似 */
export function antennaPoint(L: SunLayout, s: SunSurfState) {
  const S = 1.3;
  const lean = s.u;
  const bh = 78 * L.k * S;
  const swing = -lean * 0.5;
  const lx = Math.sin(swing) * 24 * L.k * S,
    ly = -bh - 8 * L.k * S - Math.cos(swing) * 24 * L.k * S;
  const c = Math.cos(lean * 0.3),
    si = Math.sin(lean * 0.3);
  return { x: s.x + lx * c - ly * si, y: L.yukeeY + lx * si + ly * c };
}

export interface SunSurfAssets {
  img: CanvasImageSource | null;
  off: { c: HTMLCanvasElement | OffscreenCanvas | null };
}

export function drawSunSurf(ctx: CanvasRenderingContext2D, s: SunSurfState, assets: SunSurfAssets) {
  const W = ctx.canvas.width,
    H = ctx.canvas.height;
  const base = layoutFor(W, H, !!s.preview);
  const par = s.x - base.cx;
  const L = s.preview ? base : layoutFor(W, H, false, par);
  ctx.clearRect(0, 0, W, H);
  drawBackground(ctx, L, s, assets.img);
  if (!s.preview) drawSunlight(ctx, L, s);
  drawWater(ctx, L, s);
  drawRainbow(ctx, L, s);
  const ant = antennaPoint(L, s);
  drawTarget(ctx, L, s, ant.x, ant.y);
  drawYukee(ctx, L, s, assets.off);
  drawCatchFx(ctx, L, s, ant.x, ant.y);
  drawCompleteFx(ctx, L, s);
}
