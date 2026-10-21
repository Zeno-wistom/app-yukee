/**
 * metaball —— 真实融球几何（bezier 桥接，非模糊滤镜）。
 *
 * 几何核心移植自 fluidkit（MIT License，https://github.com/runvendo/fluidkit，
 * 见 THIRD_PARTY_NOTICES.md）：
 * - bridgePath：两圆之间的表面张力桥（腰宽随拉伸收窄）
 * - neckWaist / SNAP_STRETCH：张力曲线与断开阈值
 *
 * 选型说明：fluidkit 的 Droplets/Thinking 是环境循环组件，无法编排
 * 「鼓起→析出→软连接→拉伸→断开」这种一次性导演序列；gooey-react 的
 * SVG filter 方案不支持 React 19 且每帧重算滤镜正是拖帧来源。
 * 因此只移植其经过验证的 metaball 几何，由 GSAP 时间线驱动。
 */

export interface Blob {
  x: number;
  y: number;
  r: number;
}

/** 张力曲线参数（fluidkit src/liquid/tension.ts） */
export const CONNECT_STRETCH = 1.02;
export const SNAP_STRETCH = 1.3;
const MIN_WAIST_FACTOR = 0.6;
const BASE_WAIST = 0.55;

/** 拉伸越大腰部越细，逼近断开点时为 BASE_WAIST × 0.6 */
export function neckWaist(stretch: number): number {
  return (
    BASE_WAIST *
    Math.max(MIN_WAIST_FACTOR, Math.min(1, (SNAP_STRETCH - stretch) / 0.35))
  );
}

interface Point {
  x: number;
  y: number;
}
const fmt = (n: number) => n.toFixed(2);
const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const angleBetween = (a: Point, b: Point) => Math.atan2(b.y - a.y, b.x - a.x);
const vecAt = (c: Point, angle: number, r: number) => ({
  x: c.x + r * Math.cos(angle),
  y: c.y + r * Math.sin(angle),
});

export function circlePath(c: Blob): string {
  if (c.r <= 0.5) return "";
  return (
    `M ${fmt(c.x + c.r)} ${fmt(c.y)} ` +
    `A ${fmt(c.r)} ${fmt(c.r)} 0 1 0 ${fmt(c.x - c.r)} ${fmt(c.y)} ` +
    `A ${fmt(c.r)} ${fmt(c.r)} 0 1 0 ${fmt(c.x + c.r)} ${fmt(c.y)} Z `
  );
}

/** 两圆之间的张力桥（fluidkit src/liquid/geometry.ts bridgePath） */
export function bridgePath(
  c1: Blob,
  c2: Blob,
  waist: number,
  handle = 2.1,
  reach = 1.6,
): string {
  const r1 = c1.r;
  const r2 = c2.r;
  if (r1 <= 0.5 || r2 <= 0.5) return "";
  const d = dist(c1, c2);
  const maxD = (r1 + r2) * reach;
  if (d > maxD || d <= Math.abs(r1 - r2) + 0.5) return "";
  let u1 = 0;
  let u2 = 0;
  if (d < r1 + r2) {
    u1 = Math.acos((r1 * r1 + d * d - r2 * r2) / (2 * r1 * d));
    u2 = Math.acos((r2 * r2 + d * d - r1 * r1) / (2 * r2 * d));
  }
  const ang = angleBetween(c1, c2);
  const maxSpread = Math.acos((r1 - r2) / d);
  const a1 = ang + u1 + (maxSpread - u1) * waist;
  const a2 = ang - u1 - (maxSpread - u1) * waist;
  const a3 = ang + Math.PI - u2 - (Math.PI - u2 - maxSpread) * waist;
  const a4 = ang - Math.PI + u2 + (Math.PI - u2 - maxSpread) * waist;
  const p1 = vecAt(c1, a1, r1);
  const p2 = vecAt(c1, a2, r1);
  const p3 = vecAt(c2, a3, r2);
  const p4 = vecAt(c2, a4, r2);
  const totalR = r1 + r2;
  const d2 =
    Math.min((waist * handle), dist(p1, p3) / totalR) *
    Math.min(1, (d * 2) / totalR);
  const hr1 = r1 * d2;
  const hr2 = r2 * d2;
  const h1 = vecAt(p1, a1 - Math.PI / 2, hr1);
  const h2 = vecAt(p2, a2 + Math.PI / 2, hr1);
  const h3 = vecAt(p3, a3 + Math.PI / 2, hr2);
  const h4 = vecAt(p4, a4 - Math.PI / 2, hr2);
  return (
    `M ${fmt(p1.x)} ${fmt(p1.y)} ` +
    `C ${fmt(h1.x)} ${fmt(h1.y)} ${fmt(h3.x)} ${fmt(h3.y)} ${fmt(p3.x)} ${fmt(p3.y)} ` +
    `L ${fmt(p4.x)} ${fmt(p4.y)} ` +
    `C ${fmt(h4.x)} ${fmt(h4.y)} ${fmt(h2.x)} ${fmt(h2.y)} ${fmt(p2.x)} ${fmt(p2.y)} Z `
  );
}

/**
 * 两球的融球并集 path：重叠/临近时带张力桥，分离后仅为两圆。
 * connected 带回滞（连接后拉伸超过 SNAP_STRETCH 才断开）。
 */
export function unionPath(
  a: Blob,
  b: Blob,
  wasConnected: boolean,
): { d: string; connected: boolean; stretch: number } {
  const stretch = dist(a, b) / Math.max(a.r + b.r, 0.001);
  const connected = wasConnected
    ? stretch < SNAP_STRETCH
    : stretch < CONNECT_STRETCH;
  const d =
    circlePath(a) +
    circlePath(b) +
    (connected ? bridgePath(a, b, neckWaist(stretch)) : "");
  return { d, connected, stretch };
}
