/**
 * G03「星海冲浪」程序化场景（纯 Canvas 2D，无外部图片、无运行时网络资源）。
 *
 * 层次（远 → 近）：
 *  1. 夜空渐变 · 极光带 · 闪烁星点 · 月亮与光晕
 *  2. 漂移云层（月光描边）
 *  3. 远岛剪影 + 中央灯塔岛（目的地，随进度变亮、旋转光束）
 *  4. 灯塔上方的六星星座（每接住一颗，对应星位被点亮并连线）
 *  5. 海面：透视浪线向镜头推进 · 月光倒影 · 浮游光点 · 两侧灯笼浮标
 *  6. 目标星：从灯塔方向的海天线飞来，停在左右接星区；接近时光带连向 Yukee
 *  7. Yukee 与冲浪板：随侧倾量平移、倾斜，有尾迹、浪花、表情与天线惯性
 *  8. 前景浪脊与近景光斑
 *
 * 所有时间都来自调用方传入的场景时钟 t（秒），暂停时调用方不推进 t，画面整体冻结。
 */

export interface StarSeaState {
  /** 场景时钟（秒） */
  t: number;
  /** Yukee 屏幕横坐标（像素，已平滑） */
  x: number;
  /** 侧倾量 -1..1 */
  u: number;
  target: -1 | 1;
  approach: number;
  hold: number;
  arrived: boolean;
  returning: boolean;
  reps: number;
  complete: boolean;
  /** 最近一次接星的场景时间（秒）与接住的那一侧 */
  catchT: number;
  catchSide: -1 | 1;
  /** 当前目标星开始飞入的场景时间 */
  spawnT: number;
  /** 完成时刻（场景时间） */
  completeT: number;
  tracking: "ok" | "unstable" | "lost";
  /** 预览构图：Yukee 偏左，右侧给卡片文字留位置 */
  preview?: boolean;
}

export const TARGET_REPS = 6;

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}
const R = rng(20261021);
const STARS = Array.from({ length: 150 }, () => ({
  x: R(),
  y: Math.pow(R(), 1.4),
  r: R() < 0.12 ? 1.6 : R() < 0.5 ? 1.05 : 0.7,
  ph: R() * 6.28,
  warm: R() < 0.18,
}));
const PLANKTON = Array.from({ length: 70 }, () => ({
  x: R() * 2 - 1,
  p: R(),
  ph: R() * 6.28,
  warm: R() < 0.25,
}));
const BOKEH = Array.from({ length: 14 }, () => ({
  x: R(),
  y: 0.78 + R() * 0.22,
  r: 3 + R() * 7,
  sp: 0.2 + R() * 0.5,
  ph: R() * 6.28,
}));
/** 星座六个星位：相对灯塔顶部的拱形（基准 540 高） */
export const CONSTELLATION = [
  [-150, -40],
  [-104, -96],
  [-40, -128],
  [36, -126],
  [100, -92],
  [146, -36],
] as const;

const clamp = (v: number, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const ease = (v: number) => 1 - Math.pow(1 - clamp(v), 3);

function starPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  rot = 0,
) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + rot + (i * Math.PI) / 5,
      s = i % 2 ? r * 0.45 : r;
    ctx.lineTo(x + Math.cos(a) * s, y + Math.sin(a) * s);
  }
  ctx.closePath();
}
function glow(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  color: string,
  alpha: number,
) {
  if (alpha <= 0.002 || r <= 0) return;
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, color);
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.globalAlpha = alpha;
  ctx.fillStyle = g;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
  ctx.globalAlpha = 1;
}

export interface StarSeaLayout {
  W: number;
  H: number;
  k: number;
  cx: number;
  horizon: number;
  laneDX: number;
  yukeeY: number;
  starY: number;
  lighthouseX: number;
  lighthouseTop: number;
}
export function layoutFor(W: number, H: number, preview = false): StarSeaLayout {
  if (preview) {
    // 卡片预览（约 6.3:1 超宽条幅）：角色放大、偏左，右侧 30% 留给标题。
    const k = H / 300;
    const horizon = H * 0.46;
    return {
      W,
      H,
      k,
      cx: W * 0.3,
      horizon,
      laneDX: W * 0.12,
      yukeeY: H * 0.79,
      starY: H * 0.44,
      lighthouseX: W * 0.53,
      lighthouseTop: horizon - 78 * k,
    };
  }
  const k = H / 540;
  const cx = W / 2;
  const horizon = H * 0.47;
  const laneDX = Math.min(W * 0.27, 255 * k);
  return {
    W,
    H,
    k,
    cx,
    horizon,
    laneDX,
    yukeeY: H * 0.7,
    starY: H * 0.565,
    lighthouseX: W / 2,
    lighthouseTop: horizon - 78 * k,
  };
}

/** 目标星当前位置与大小（供绘制与吸收动画共用） */
export function targetStarPose(L: StarSeaLayout, s: StarSeaState) {
  const home = { x: L.cx + s.target * L.laneDX, y: L.starY };
  const spawn = {
    x: L.lighthouseX + s.target * 40 * L.k,
    y: L.horizon - 6 * L.k,
  };
  if (s.returning) {
    // 下一颗星在海天线上等待：玩家回到中间后才飞来。
    return { x: spawn.x, y: spawn.y, r: 5 * L.k, flight: 0, waiting: true };
  }
  const f = ease((s.t - s.spawnT) / 1.05);
  const c = {
    x: L.cx + s.target * L.laneDX * 0.55,
    y: L.horizon - 95 * L.k,
  };
  const a = 1 - f;
  const x = a * a * spawn.x + 2 * a * f * c.x + f * f * home.x;
  const y = a * a * spawn.y + 2 * a * f * c.y + f * f * home.y;
  const bob = f >= 1 ? Math.sin(s.t * 2.2) * 5 * L.k : 0;
  return { x, y: y + bob, r: (6 + 16 * f) * L.k, flight: f, waiting: false };
}

function drawSky(ctx: CanvasRenderingContext2D, L: StarSeaLayout, s: StarSeaState, par: number) {
  const { W, H, k, horizon } = L;
  const sky = ctx.createLinearGradient(0, 0, 0, horizon);
  sky.addColorStop(0, "#040b1c");
  sky.addColorStop(0.55, "#0a2140");
  sky.addColorStop(1, "#16475f");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, horizon + 2);
  // 极光：两条缓慢摆动的青绿光带
  for (let i = 0; i < 2; i++) {
    const y0 = H * (0.13 + i * 0.09);
    const amp = 18 * k;
    const sw = Math.sin(s.t * 0.13 + i * 1.7);
    ctx.beginPath();
    ctx.moveTo(-20, y0 + amp * sw);
    ctx.bezierCurveTo(
      W * 0.3,
      y0 - 60 * k + amp * Math.sin(s.t * 0.17 + i),
      W * 0.6,
      y0 + 50 * k - amp * sw,
      W + 20,
      y0 - 20 * k,
    );
    ctx.lineTo(W + 20, y0 + 26 * k);
    ctx.bezierCurveTo(
      W * 0.6,
      y0 + 80 * k - amp * sw,
      W * 0.3,
      y0 - 20 * k + amp * Math.sin(s.t * 0.17 + i),
      -20,
      y0 + 34 * k + amp * sw,
    );
    ctx.closePath();
    const g = ctx.createLinearGradient(0, y0 - 60 * k, 0, y0 + 80 * k);
    g.addColorStop(0, "rgba(94,242,200,0)");
    g.addColorStop(0.5, i ? "rgba(110,190,255,0.07)" : "rgba(94,242,200,0.11)");
    g.addColorStop(1, "rgba(94,242,200,0)");
    ctx.fillStyle = g;
    ctx.fill();
  }
  // 星点
  for (const st of STARS) {
    const x = ((st.x * W - par * 0.03) % W + W) % W;
    const y = st.y * (horizon - 30 * k);
    const tw = 0.45 + 0.55 * (0.5 + 0.5 * Math.sin(s.t * 1.3 + st.ph));
    ctx.globalAlpha = tw * (st.r > 1.2 ? 0.95 : 0.6);
    ctx.fillStyle = st.warm ? "#ffe2a0" : "#cfeff0";
    const r = st.r * k;
    ctx.fillRect(x - r / 2, y - r / 2, r, r);
  }
  ctx.globalAlpha = 1;
  // 月亮
  const mx = W * (s.preview ? 0.66 : 0.82) - par * 0.04,
    my = H * 0.17,
    mr = 30 * k;
  glow(ctx, mx, my, mr * 5, "rgba(255,236,190,0.55)", 0.45);
  ctx.fillStyle = "#fff3d2";
  ctx.beginPath();
  ctx.arc(mx, my, mr, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(214,196,150,0.35)";
  ctx.beginPath();
  ctx.arc(mx - mr * 0.3, my - mr * 0.15, mr * 0.22, 0, Math.PI * 2);
  ctx.arc(mx + mr * 0.25, my + mr * 0.3, mr * 0.15, 0, Math.PI * 2);
  ctx.fill();
}

function drawClouds(ctx: CanvasRenderingContext2D, L: StarSeaLayout, s: StarSeaState, par: number) {
  const { W, H, k } = L;
  // 细长、半透明的云絮：只做氛围层，不压住星空
  const bands = [
    { y: 0.3, w: 0.2, sp: 4, o: 0.05 },
    { y: 0.385, w: 0.26, sp: 6.5, o: 0.5 },
    { y: 0.235, w: 0.15, sp: 3, o: 0.72 },
    { y: 0.34, w: 0.12, sp: 5, o: 0.32 },
  ];
  for (const b of bands) {
    const span = W * (1 + b.w);
    const x = (((b.o * span + s.t * b.sp * k - par * 0.06) % span) + span) % span - b.w * W;
    const y = H * b.y;
    const w = b.w * W;
    const puffs = [
      [0.5, 0, 0.5, 5],
      [0.32, -5, 0.2, 8],
      [0.58, -4, 0.18, 7],
      [0.78, -1, 0.14, 5],
    ];
    for (const [px, py, pw, ph] of puffs) {
      const g = ctx.createRadialGradient(x + w * px, y + py * k, 0, x + w * px, y + py * k, w * pw);
      g.addColorStop(0, "rgba(26,58,92,0.55)");
      g.addColorStop(1, "rgba(26,58,92,0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(x + w * px, y + py * k, w * pw, ph * k * 1.6, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.strokeStyle = "rgba(200,232,238,0.16)";
    ctx.lineWidth = 1 * k;
    ctx.beginPath();
    ctx.ellipse(x + w * 0.32, y - 5 * k, w * 0.16, 9 * k, 0, Math.PI * 1.15, Math.PI * 1.85);
    ctx.stroke();
  }
}

function drawIslands(ctx: CanvasRenderingContext2D, L: StarSeaLayout, s: StarSeaState, par: number) {
  const { W, k, horizon } = L;
  const off = -par * 0.08;
  const sil = (pts: number[][], fill: string) => {
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.moveTo(pts[0][0] + off, horizon + 1);
    for (const [x, y] of pts) ctx.lineTo(x + off, horizon - y * k);
    ctx.lineTo(pts[pts.length - 1][0] + off, horizon + 1);
    ctx.closePath();
    ctx.fill();
  };
  // 远岛（更淡）
  sil(
    [
      [-20, 6],
      [W * 0.06, 22],
      [W * 0.12, 34],
      [W * 0.17, 26],
      [W * 0.23, 40],
      [W * 0.3, 14],
      [W * 0.34, 4],
    ],
    "#0d2a42",
  );
  sil(
    [
      [W * 0.66, 4],
      [W * 0.71, 20],
      [W * 0.77, 44],
      [W * 0.82, 30],
      [W * 0.88, 52],
      [W * 0.95, 24],
      [W + 20, 10],
    ],
    "#0d2a42",
  );
  // 近一层岛：带树影
  sil(
    [
      [-20, 2],
      [W * 0.03, 14],
      [W * 0.08, 18],
      [W * 0.1, 30],
      [W * 0.115, 18],
      [W * 0.16, 12],
      [W * 0.2, 2],
    ],
    "#081d30",
  );
  sil(
    [
      [W * 0.8, 2],
      [W * 0.85, 16],
      [W * 0.89, 26],
      [W * 0.905, 38],
      [W * 0.92, 24],
      [W * 0.97, 14],
      [W + 20, 4],
    ],
    "#081d30",
  );
  // 中央灯塔岛
  const lx = L.lighthouseX + off * 0.6;
  const prog = s.complete ? 1 : s.reps / TARGET_REPS;
  ctx.fillStyle = "#0a2236";
  ctx.beginPath();
  ctx.moveTo(lx - 70 * k, horizon + 1);
  ctx.quadraticCurveTo(lx - 40 * k, horizon - 22 * k, lx, horizon - 26 * k);
  ctx.quadraticCurveTo(lx + 44 * k, horizon - 20 * k, lx + 76 * k, horizon + 1);
  ctx.fill();
  // 小屋
  ctx.fillStyle = "#0c2a40";
  ctx.fillRect(lx + 14 * k, horizon - 30 * k, 18 * k, 12 * k);
  ctx.beginPath();
  ctx.moveTo(lx + 11 * k, horizon - 30 * k);
  ctx.lineTo(lx + 23 * k, horizon - 39 * k);
  ctx.lineTo(lx + 35 * k, horizon - 30 * k);
  ctx.fill();
  ctx.fillStyle = `rgba(255,217,142,${0.25 + prog * 0.7})`;
  ctx.fillRect(lx + 20 * k, horizon - 26 * k, 5 * k, 5 * k);
  // 灯塔塔身（白/青条纹）
  const top = L.lighthouseTop;
  ctx.beginPath();
  ctx.moveTo(lx - 9 * k, horizon - 22 * k);
  ctx.lineTo(lx - 5.5 * k, top + 10 * k);
  ctx.lineTo(lx + 5.5 * k, top + 10 * k);
  ctx.lineTo(lx + 9 * k, horizon - 22 * k);
  ctx.closePath();
  ctx.fillStyle = "#cfe5df";
  ctx.fill();
  ctx.save();
  ctx.clip();
  ctx.fillStyle = "#2f7d7a";
  for (let i = 0; i < 3; i++)
    ctx.fillRect(lx - 12 * k, top + 18 * k + i * 15 * k, 24 * k, 6 * k);
  ctx.restore();
  ctx.fillStyle = "#0f2f3f";
  ctx.fillRect(lx - 8 * k, top + 6 * k, 16 * k, 4 * k);
  ctx.fillRect(lx - 4 * k, top - 6 * k, 8 * k, 3 * k);
  // 灯室
  const lamp = 0.25 + prog * 0.75;
  ctx.fillStyle = `rgba(255,226,150,${0.35 + lamp * 0.65})`;
  ctx.fillRect(lx - 5 * k, top - 3 * k, 10 * k, 9 * k);
  glow(ctx, lx, top + 1 * k, (24 + 50 * lamp) * k, "rgba(255,220,140,0.9)", 0.35 + lamp * 0.55);
  // 旋转光束：有进度才开始转，完成时最亮
  if (prog > 0) {
    const ang = s.t * (s.complete ? 1.4 : 0.7);
    const reach = (180 + 260 * prog) * k;
    for (const dir of [1, -1]) {
      const sw = Math.cos(ang) * dir;
      const ex = lx + sw * reach;
      const g = ctx.createLinearGradient(lx, top, ex, top);
      g.addColorStop(0, `rgba(255,230,160,${(s.complete ? 0.5 : 0.3) * lamp})`);
      g.addColorStop(1, "rgba(255,230,160,0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(lx, top + 1 * k);
      ctx.lineTo(ex, top - 16 * k * Math.abs(sw));
      ctx.lineTo(ex, top + 18 * k * Math.abs(sw));
      ctx.closePath();
      ctx.fill();
    }
  }
}

function constellationPoint(L: StarSeaLayout, i: number, par: number) {
  const [dx, dy] = CONSTELLATION[i];
  return {
    x: L.lighthouseX - par * 0.05 + dx * L.k * (L.W / L.H > 2.4 ? 1.5 : 1.15),
    y: L.lighthouseTop - (L.W / L.H > 2.4 ? 4 : 10) * L.k + dy * L.k * (L.W / L.H > 2.4 ? 0.3 : 0.45),
  };
}

function drawConstellation(ctx: CanvasRenderingContext2D, L: StarSeaLayout, s: StarSeaState, par: number) {
  const { k } = L;
  // 最近一颗正在飞向星座时，星位稍后才点亮
  const landing = s.t - s.catchT < 0.95;
  const litCount = s.complete && !landing ? TARGET_REPS : landing ? s.reps - 1 : s.reps;
  // 连线
  ctx.lineWidth = 1.4 * k;
  for (let i = 0; i < TARGET_REPS - 1; i++) {
    const a = constellationPoint(L, i, par),
      b = constellationPoint(L, i + 1, par);
    const lit = i + 1 < litCount;
    ctx.strokeStyle = lit ? "rgba(255,217,142,0.75)" : "rgba(160,210,220,0.13)";
    ctx.setLineDash(lit ? [] : [2 * k, 6 * k]);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
  ctx.setLineDash([]);
  for (let i = 0; i < TARGET_REPS; i++) {
    const p = constellationPoint(L, i, par);
    if (i < litCount) {
      const pulse = 0.85 + 0.15 * Math.sin(s.t * 2 + i);
      glow(ctx, p.x, p.y, 26 * k, "rgba(255,217,142,0.9)", 0.55 * pulse);
      ctx.fillStyle = "#ffe7a8";
      starPath(ctx, p.x, p.y, 8 * k * pulse);
      ctx.fill();
    } else {
      const next = i === litCount && !s.complete;
      ctx.strokeStyle = next ? "rgba(255,217,142,0.6)" : "rgba(170,215,225,0.3)";
      ctx.lineWidth = 1.2 * k;
      ctx.beginPath();
      ctx.arc(p.x, p.y, (next ? 6 + Math.sin(s.t * 3) : 4.5) * k, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
}

function drawSea(ctx: CanvasRenderingContext2D, L: StarSeaLayout, s: StarSeaState, par: number) {
  const { W, H, k, horizon } = L;
  const sea = ctx.createLinearGradient(0, horizon, 0, H);
  sea.addColorStop(0, "#14506a");
  sea.addColorStop(0.35, "#0b3550");
  sea.addColorStop(1, "#04182a");
  ctx.fillStyle = sea;
  ctx.fillRect(0, horizon, W, H - horizon);
  // 海天线薄雾
  const haze = ctx.createLinearGradient(0, horizon - 14 * k, 0, horizon + 24 * k);
  haze.addColorStop(0, "rgba(120,210,215,0)");
  haze.addColorStop(0.5, "rgba(120,210,215,0.18)");
  haze.addColorStop(1, "rgba(120,210,215,0)");
  ctx.fillStyle = haze;
  ctx.fillRect(0, horizon - 14 * k, W, 38 * k);
  // 月光倒影：一列闪动短线
  const mx = W * (s.preview ? 0.66 : 0.82) - par * 0.04;
  for (let i = 0; i < 26; i++) {
    const p = i / 26;
    const y = horizon + 4 * k + Math.pow(p, 1.6) * (H - horizon);
    const w = (8 + p * 70) * k * (0.6 + 0.4 * Math.sin(s.t * 2.1 + i * 1.9));
    const x = mx + Math.sin(s.t * 0.9 + i) * p * 14 * k;
    ctx.globalAlpha = 0.32 * (1 - p * 0.6) * (0.6 + 0.4 * Math.sin(s.t * 1.7 + i * 2.3));
    ctx.fillStyle = "#ffe9b8";
    ctx.fillRect(x - w / 2, y, w, Math.max(1, 1.5 * k * (0.5 + p)));
  }
  ctx.globalAlpha = 1;
  // 透视浪线：越近越疏、越亮、越粗，向镜头推进
  const N = 15;
  const phase = (s.t * 0.22) % 1;
  for (let i = 0; i < N; i++) {
    const p = (i + phase) / N;
    const y = horizon + p * p * (H - horizon);
    const amp = (1 + p * 7) * k;
    ctx.strokeStyle = `rgba(120,225,215,${0.06 + p * 0.22})`;
    ctx.lineWidth = (0.6 + p * 1.8) * k;
    ctx.beginPath();
    const shift = -par * (0.1 + p * 0.25);
    for (let x = -20; x <= W + 20; x += 16) {
      const yy =
        y + Math.sin((x + shift) / (60 + p * 120) + s.t * 0.8 + i * 1.3) * amp;
      if (x === -20) ctx.moveTo(x, yy);
      else ctx.lineTo(x, yy);
    }
    ctx.stroke();
  }
  // 浮游光点：向镜头漂近
  for (const pl of PLANKTON) {
    const p = (pl.p + s.t * 0.05) % 1;
    const y = horizon + p * p * (H - horizon);
    const x = L.cx + pl.x * (W * 0.2 + p * W * 0.6) - par * (0.1 + p * 0.3);
    const a = (0.25 + 0.5 * (0.5 + 0.5 * Math.sin(s.t * 2 + pl.ph))) * p;
    ctx.globalAlpha = a;
    ctx.fillStyle = pl.warm ? "#ffd98e" : "#8ff0d4";
    const r = (0.8 + p * 2.2) * k;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawBuoys(ctx: CanvasRenderingContext2D, L: StarSeaLayout, s: StarSeaState, par: number) {
  const { k } = L;
  for (const side of [-1, 1] as const) {
    const x = L.cx + side * L.laneDX * 1.32 - par * 0.2;
    const y = L.horizon + (L.H - L.horizon) * 0.36 + Math.sin(s.t * 1.6 + side) * 3 * k;
    const active = !s.complete && !s.returning && s.target === side;
    const tilt = Math.sin(s.t * 1.3 + side * 2) * 0.08;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(tilt);
    // 倒影
    ctx.fillStyle = active ? "rgba(255,217,142,0.22)" : "rgba(140,220,210,0.1)";
    ctx.fillRect(-2 * k, 8 * k, 4 * k, 26 * k);
    ctx.fillStyle = "#0b2a38";
    ctx.beginPath();
    ctx.ellipse(0, 6 * k, 15 * k, 6 * k, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#123b4b";
    ctx.fillRect(-2.5 * k, -24 * k, 5 * k, 28 * k);
    const lampA = active ? 0.75 + 0.25 * Math.sin(s.t * 5) : 0.35;
    glow(ctx, 0, -28 * k, (active ? 40 : 18) * k, active ? "rgba(255,217,142,0.9)" : "rgba(141,233,188,0.7)", lampA);
    ctx.fillStyle = active ? "#ffe2a0" : "#8de9bc";
    ctx.beginPath();
    ctx.roundRect(-5 * k, -34 * k, 10 * k, 12 * k, 3 * k);
    ctx.fill();
    ctx.restore();
  }
}

function drawTargetStar(ctx: CanvasRenderingContext2D, L: StarSeaLayout, s: StarSeaState, yx: number, yy: number) {
  if (s.complete) return;
  const { k } = L;
  const st = targetStarPose(L, s);
  if (st.waiting) {
    // 海天线上的下一颗：小、柔和闪烁
    glow(ctx, st.x, st.y, 18 * k, "rgba(255,217,142,0.9)", 0.35 + 0.2 * Math.sin(s.t * 4));
    ctx.fillStyle = "#ffe2a0";
    starPath(ctx, st.x, st.y, st.r);
    ctx.fill();
    return;
  }
  const ap = st.flight >= 1 ? s.approach : 0;
  // 光带：Yukee 越靠近，越亮
  if (ap > 0.05) {
    const g = ctx.createLinearGradient(yx, yy, st.x, st.y);
    g.addColorStop(0, `rgba(141,233,188,${0.05 + 0.3 * ap})`);
    g.addColorStop(1, `rgba(255,217,142,${0.15 + 0.55 * ap})`);
    ctx.strokeStyle = g;
    ctx.lineWidth = (2 + 6 * ap) * k;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(yx, yy);
    ctx.quadraticCurveTo((yx + st.x) / 2, Math.min(yy, st.y) - 40 * k, st.x, st.y);
    ctx.stroke();
    ctx.lineCap = "butt";
  }
  // 水面倒影
  ctx.globalAlpha = 0.25 + 0.3 * ap;
  ctx.fillStyle = "#ffd98e";
  for (let i = 0; i < 5; i++) {
    const w = (14 - i * 2) * k * (0.6 + 0.4 * Math.sin(s.t * 3 + i));
    ctx.fillRect(st.x - w / 2, L.starY + 46 * k + i * 6 * k, w, 1.5 * k);
  }
  ctx.globalAlpha = 1;
  const r = st.r * (1 + 0.25 * ap + (s.arrived ? 0.1 * Math.sin(s.t * 18) : 0));
  glow(ctx, st.x, st.y, r * (3.2 + 2 * ap), "rgba(255,217,142,0.95)", 0.45 + 0.45 * ap);
  ctx.fillStyle = s.arrived ? "#fff6d6" : "#ffd98e";
  starPath(ctx, st.x, st.y, r, Math.sin(s.t * 1.2) * 0.15);
  ctx.fill();
  ctx.fillStyle = "#fffaf0";
  starPath(ctx, st.x, st.y, r * 0.42, Math.sin(s.t * 1.2) * 0.15);
  ctx.fill();
  // 接星进度环
  if (st.flight >= 1) {
    ctx.strokeStyle = "rgba(255,217,142,0.25)";
    ctx.lineWidth = 3 * k;
    ctx.beginPath();
    ctx.arc(st.x, st.y, 34 * k, 0, Math.PI * 2);
    ctx.stroke();
    const prog = s.arrived ? 0.5 + 0.5 * s.hold : 0.5 * ap;
    if (prog > 0) {
      ctx.strokeStyle = s.arrived ? "#fff1c0" : "#ffd98e";
      ctx.lineWidth = 3.5 * k;
      ctx.beginPath();
      ctx.arc(st.x, st.y, 34 * k, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * prog);
      ctx.stroke();
    }
    // 方向提示：朝外的柔和箭头（尚未进入接星区时）
    if (!s.arrived) {
      for (let i = 0; i < 3; i++) {
        const ph = (s.t * 1.4 + i / 3) % 1;
        const ax = st.x - s.target * (70 - ph * 30) * k;
        ctx.globalAlpha = Math.sin(ph * Math.PI) * (0.55 - 0.3 * ap);
        ctx.strokeStyle = "#ffe2a0";
        ctx.lineWidth = 3 * k;
        ctx.beginPath();
        ctx.moveTo(ax - s.target * 6 * k, st.y - 9 * k);
        ctx.lineTo(ax + s.target * 4 * k, st.y);
        ctx.lineTo(ax - s.target * 6 * k, st.y + 9 * k);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
  }
}

function drawCatchFx(ctx: CanvasRenderingContext2D, L: StarSeaLayout, s: StarSeaState, par: number) {
  const dt = s.t - s.catchT;
  if (dt < 0 || dt > 1.3 || s.reps === 0) return;
  const { k } = L;
  const from = { x: L.cx + s.catchSide * L.laneDX, y: L.starY };
  // 爆散火花与冲击环
  if (dt < 0.7) {
    const p = dt / 0.7;
    ctx.strokeStyle = `rgba(255,236,180,${1 - p})`;
    ctx.lineWidth = 3 * k * (1 - p);
    ctx.beginPath();
    ctx.arc(from.x, from.y, (20 + 70 * ease(p)) * k, 0, Math.PI * 2);
    ctx.stroke();
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2 + i;
      const d = (14 + 64 * ease(p)) * k * (0.7 + (i % 3) * 0.2);
      ctx.globalAlpha = 1 - p;
      ctx.fillStyle = i % 2 ? "#ffe2a0" : "#9ff3d6";
      starPath(ctx, from.x + Math.cos(a) * d, from.y + Math.sin(a) * d, 4 * k * (1 - p * 0.6));
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
  // 星光沿弧线飞向星座星位
  const to = constellationPoint(L, Math.max(0, s.reps - 1), par);
  const f = ease(clamp((dt - 0.1) / 0.85));
  if (dt < 0.95) {
    const c = { x: (from.x + to.x) / 2 + s.catchSide * 60 * k, y: Math.min(from.y, to.y) - 60 * k };
    const a = 1 - f;
    const x = a * a * from.x + 2 * a * f * c.x + f * f * to.x;
    const y = a * a * from.y + 2 * a * f * c.y + f * f * to.y;
    for (let i = 1; i <= 6; i++) {
      const fi = clamp(f - i * 0.04);
      const ai = 1 - fi;
      const tx = ai * ai * from.x + 2 * ai * fi * c.x + fi * fi * to.x;
      const ty = ai * ai * from.y + 2 * ai * fi * c.y + fi * fi * to.y;
      ctx.globalAlpha = 0.5 - i * 0.07;
      ctx.fillStyle = "#ffe7a8";
      ctx.beginPath();
      ctx.arc(tx, ty, (5 - i * 0.6) * k, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    glow(ctx, x, y, 30 * k, "rgba(255,226,150,0.95)", 0.8);
    ctx.fillStyle = "#fff6d6";
    starPath(ctx, x, y, 10 * k * (1 - f * 0.3), dt * 6);
    ctx.fill();
  } else {
    // 落位闪光
    const p = (dt - 0.95) / 0.35;
    glow(ctx, to.x, to.y, (30 + 40 * p) * k, "rgba(255,240,190,0.95)", 1 - p);
  }
}

function drawYukee(ctx: CanvasRenderingContext2D, L: StarSeaLayout, s: StarSeaState) {
  const { k } = L;
  const x = s.x;
  const happyDt = s.t - s.catchT;
  const happy = (s.reps > 0 && happyDt >= 0 && happyDt < 0.9) || s.complete;
  const jump =
    s.reps > 0 && happyDt >= 0 && happyDt < 0.55
      ? Math.sin((happyDt / 0.55) * Math.PI) * 20 * k
      : s.complete
        ? Math.abs(Math.sin(s.t * 3.2)) * 12 * k
        : 0;
  const bob = Math.sin(s.t * 1.8) * 3.5 * k;
  // 完成后 Yukee 朝灯塔方向滑远一点（上移、缩小），给结算面板让位
  const away = s.complete ? ease((s.t - s.completeT) / 1.6) : 0;
  const y = L.yukeeY + bob - away * 78 * k;
  const lean = s.u;
  // 尾迹（V 形泡沫）与板下光
  glow(ctx, x, y + 10 * k, 120 * k, "rgba(102,244,217,0.55)", 0.35 + 0.25 * Math.abs(lean));
  for (let i = 0; i < 9; i++) {
    const d = ((s.t * 70 + i * 18) % 160) * k;
    const a = 1 - d / (160 * k);
    ctx.globalAlpha = a * 0.55;
    ctx.strokeStyle = "#bff7e6";
    ctx.lineWidth = 1.5 * k;
    ctx.beginPath();
    ctx.ellipse(x - lean * d * 0.35, y + 14 * k + d * 0.55, 60 * k + d * 0.5, 5 * k + d * 0.04, 0, 0.1 * Math.PI, 0.9 * Math.PI);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  // 侧倾浪花：向倾斜反方向甩出
  const sprayN = Math.round(Math.abs(lean) * 12);
  for (let i = 0; i < sprayN; i++) {
    const ph = (s.t * 2.4 + i * 0.137) % 1;
    const sx = x - Math.sign(lean) * (70 + ph * 70) * k;
    const sy = y + 8 * k - Math.sin(ph * Math.PI) * 34 * k * (0.6 + (i % 3) * 0.25);
    ctx.globalAlpha = (1 - ph) * 0.8;
    ctx.fillStyle = i % 3 ? "#d8fff2" : "#8de9bc";
    ctx.beginPath();
    ctx.arc(sx, sy, (1.6 + (i % 2)) * k, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  ctx.save();
  ctx.translate(x, y - jump);
  ctx.scale(1.18 * (1 - away * 0.3), 1.18 * (1 - away * 0.3));
  // 冲浪板
  ctx.save();
  ctx.rotate(lean * 0.16);
  const board = ctx.createLinearGradient(-80 * k, 0, 80 * k, 0);
  board.addColorStop(0, "#3fbfae");
  board.addColorStop(0.5, "#8ff3d6");
  board.addColorStop(1, "#3fbfae");
  ctx.fillStyle = board;
  ctx.beginPath();
  ctx.ellipse(0, 0, 82 * k, 13 * k, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = "#063a36";
  ctx.lineWidth = 2.5 * k;
  ctx.stroke();
  ctx.fillStyle = "#ffd98e";
  ctx.fillRect(-60 * k, -1.5 * k, 120 * k, 3 * k);
  ctx.fillStyle = "rgba(255,255,255,0.5)";
  ctx.beginPath();
  ctx.ellipse(-20 * k, -6 * k, 40 * k, 2.5 * k, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // 身体：以脚底为轴侧倾
  ctx.rotate(lean * 0.3);
  const squash = happy && jump > 2 ? 1.06 : 1;
  ctx.scale(1 / squash, squash);
  const bw = 46 * k,
    bh = 78 * k;
  // 小脚
  ctx.fillStyle = "#0c241e";
  ctx.beginPath();
  ctx.ellipse(-16 * k, -6 * k, 11 * k, 6 * k, 0, 0, Math.PI * 2);
  ctx.ellipse(16 * k, -6 * k, 11 * k, 6 * k, 0, 0, Math.PI * 2);
  ctx.fill();
  // 手臂（保持平衡 / 开心举起）
  const armUp = happy ? -1 : 0;
  ctx.strokeStyle = "#1e4a3d";
  ctx.lineWidth = 7 * k;
  ctx.lineCap = "round";
  for (const sd of [-1, 1]) {
    const balance = -lean * sd * 10 * k;
    ctx.beginPath();
    ctx.moveTo(sd * bw * 0.85, -bh * 0.5);
    ctx.quadraticCurveTo(
      sd * (bw + 16 * k),
      -bh * 0.5 + 4 * k + balance,
      sd * (bw + 24 * k),
      -bh * 0.5 + (armUp ? -30 * k : 10 * k) + balance,
    );
    ctx.stroke();
  }
  ctx.lineCap = "butt";
  // 主体：圆润胶滴（与挂灯 Yukee 同色系的深墨绿）
  ctx.beginPath();
  ctx.moveTo(0, -bh - 8 * k);
  ctx.bezierCurveTo(bw * 0.85, -bh - 8 * k, bw * 1.08, -bh * 0.55, bw, -bh * 0.22);
  ctx.bezierCurveTo(bw * 0.95, -2 * k, bw * 0.4, 0, 0, 0);
  ctx.bezierCurveTo(-bw * 0.4, 0, -bw * 0.95, -2 * k, -bw, -bh * 0.22);
  ctx.bezierCurveTo(-bw * 1.08, -bh * 0.55, -bw * 0.85, -bh - 8 * k, 0, -bh - 8 * k);
  ctx.closePath();
  const body = ctx.createLinearGradient(-bw, -bh, bw, 0);
  body.addColorStop(0, "#3b7a63");
  body.addColorStop(0.45, "#1e4a3d");
  body.addColorStop(1, "#102c25");
  ctx.fillStyle = body;
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = "#06120e";
  ctx.lineWidth = 3 * k;
  ctx.stroke();
  // 月光轮廓光（右上）
  ctx.strokeStyle = "rgba(190,250,226,0.45)";
  ctx.lineWidth = 2 * k;
  ctx.beginPath();
  ctx.ellipse(0, -bh * 0.5, bw * 0.93, bh * 0.55, 0, -Math.PI * 0.45, Math.PI * 0.05);
  ctx.stroke();
  // 高光
  ctx.fillStyle = "rgba(199,255,231,0.18)";
  ctx.beginPath();
  ctx.ellipse(-bw * 0.45, -bh * 0.78, bw * 0.28, bh * 0.1, -0.5, 0, Math.PI * 2);
  ctx.fill();
  // 面屏
  ctx.fillStyle = "#081a16";
  ctx.beginPath();
  ctx.roundRect(-bw * 0.72, -bh * 0.74, bw * 1.44, bh * 0.4, 14 * k);
  ctx.fill();
  ctx.strokeStyle = "rgba(141,233,188,0.25)";
  ctx.lineWidth = 1.5 * k;
  ctx.stroke();
  // 眼睛：看向目标、接近时放大、开心弯月、丢失时眯眼
  const lookX = (s.complete ? 0 : s.target * 4 + lean * 5) * k;
  const blink = (s.t % 3.7) < 0.12 && !happy;
  const eyeY = -bh * 0.54;
  const eyeW = 9 * k * (1 + 0.15 * s.approach),
    eyeH = 17 * k * (1 + 0.2 * s.approach);
  ctx.fillStyle = s.tracking === "lost" ? "#4f8a70" : "#8de9bc";
  for (const sd of [-1, 1]) {
    const ex = sd * 15 * k + lookX;
    if (happy) {
      ctx.strokeStyle = "#b8ffe0";
      ctx.lineWidth = 4 * k;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.arc(ex, eyeY + 4 * k, 7 * k, Math.PI * 1.1, Math.PI * 1.9);
      ctx.stroke();
      ctx.lineCap = "butt";
    } else if (blink || s.tracking === "lost") {
      ctx.fillRect(ex - eyeW / 2, eyeY - 1.5 * k, eyeW, 3 * k);
    } else {
      ctx.beginPath();
      ctx.roundRect(ex - eyeW / 2, eyeY - eyeH / 2, eyeW, eyeH, eyeW / 2);
      ctx.fill();
    }
  }
  ctx.shadowBlur = 0;
  if (happy) {
    ctx.fillStyle = "rgba(255,170,150,0.45)";
    ctx.beginPath();
    ctx.ellipse(-26 * k, -bh * 0.4, 6 * k, 3 * k, 0, 0, Math.PI * 2);
    ctx.ellipse(26 * k, -bh * 0.4, 6 * k, 3 * k, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  // 天线：反向惯性摆动 + 暖金灯泡随接近变亮
  const swing = -lean * 0.5 + Math.sin(s.t * 3) * 0.08;
  const ax = Math.sin(swing) * 22 * k,
    ay = -bh - 8 * k - Math.cos(swing) * 22 * k;
  ctx.strokeStyle = "#0b231d";
  ctx.lineWidth = 3 * k;
  ctx.beginPath();
  ctx.moveTo(0, -bh - 7 * k);
  ctx.quadraticCurveTo(ax * 0.3, (ay - bh) / 2 - 4 * k, ax, ay);
  ctx.stroke();
  glow(ctx, ax, ay, (14 + 22 * s.approach + (happy ? 16 : 0)) * k, "rgba(255,217,142,0.95)", 0.5 + 0.5 * s.approach);
  ctx.fillStyle = "#ffd98e";
  ctx.beginPath();
  ctx.arc(ax, ay, 5 * k, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawForeground(ctx: CanvasRenderingContext2D, L: StarSeaLayout, s: StarSeaState, par: number) {
  const { W, H, k } = L;
  for (let layer = 0; layer < 2; layer++) {
    const base = H - (layer ? 22 : 48) * k * (s.preview ? 0.45 : 1);
    const off = -par * (0.35 + layer * 0.2) + s.t * (layer ? 26 : 14) * k;
    ctx.fillStyle = layer ? "rgba(3,16,28,0.92)" : "rgba(5,26,42,0.75)";
    ctx.beginPath();
    ctx.moveTo(0, H);
    for (let x = 0; x <= W + 10; x += 10) {
      const y =
        base +
        Math.sin((x + off) / (70 + layer * 40)) * (7 + layer * 4) * k +
        Math.sin((x + off) / 23) * 2 * k;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(W, H);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = layer ? "rgba(141,233,214,0.32)" : "rgba(141,233,214,0.18)";
    ctx.lineWidth = 1.6 * k;
    ctx.stroke();
    // 浪脊泡沫高光
    ctx.fillStyle = layer ? "rgba(160,240,220,0.35)" : "rgba(160,240,220,0.2)";
    for (let x = 0; x <= W; x += 22) {
      const y = base + Math.sin((x + off) / (70 + layer * 40)) * (7 + layer * 4) * k;
      if (Math.sin((x + off) / (70 + layer * 40)) < -0.6)
        ctx.fillRect(x, y - 1 * k, 9 * k, 1.5 * k);
    }
  }
  for (const b of BOKEH) {
    const x = ((b.x * W + s.t * b.sp * 20 * k - par * 0.5) % W + W) % W;
    const y = b.y * H + Math.sin(s.t * b.sp + b.ph) * 6 * k;
    glow(ctx, x, y, b.r * 2.2 * k, "rgba(141,233,188,0.6)", 0.18);
  }
}

function drawCompleteFx(ctx: CanvasRenderingContext2D, L: StarSeaLayout, s: StarSeaState, par: number) {
  if (!s.complete) return;
  const dt = s.t - s.completeT;
  if (dt < 0.9) return;
  const { k } = L;
  // 星座完成后：温和的星光烟花从星座向外散开（循环但很慢）
  for (let burst = 0; burst < 3; burst++) {
    const bt = ((dt - 0.9 + burst * 0.9) % 2.7) / 2.7;
    const c = constellationPoint(L, burst * 2 + 1, par);
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const d = ease(bt) * 60 * k;
      ctx.globalAlpha = (1 - bt) * 0.8;
      ctx.fillStyle = i % 2 ? "#ffe7a8" : "#a8f5dc";
      ctx.beginPath();
      ctx.arc(c.x + Math.cos(a) * d, c.y + Math.sin(a) * d + bt * 10 * k, 2.2 * k, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
}

/** 完整绘制一帧。 */
export function drawStarSea(ctx: CanvasRenderingContext2D, s: StarSeaState) {
  const W = ctx.canvas.width,
    H = ctx.canvas.height;
  const L = layoutFor(W, H, !!s.preview);
  const par = s.x - L.cx; // 视差：远景少动、近景多动
  drawSky(ctx, L, s, par);
  drawClouds(ctx, L, s, par);
  drawConstellation(ctx, L, s, par);
  drawIslands(ctx, L, s, par);
  drawSea(ctx, L, s, par);
  drawBuoys(ctx, L, s, par);
  drawTargetStar(ctx, L, s, s.x, L.yukeeY - 62 * L.k);
  drawYukee(ctx, L, s);
  drawCatchFx(ctx, L, s, par);
  drawCompleteFx(ctx, L, s, par);
  drawForeground(ctx, L, s, par);
}
