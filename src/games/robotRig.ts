/**
 * G02「展翼接光」火柴人机器人骨架几何（纯逻辑，无 DOM 依赖）。
 *
 * 职责：把动作状态机输出的左右展开量 uL/uR（0~1，已经过校准归一化与 EMA 平滑）
 * 映射为机器人的关节姿态与缆绳端点：
 * - 手臂为「肩 → 肘 → 手」两节骨骼，手部目标点随 u 连续插值，肘部用双骨 IK 求解；
 * - 缆绳连接「手部 → 帆外角（clew）」，clew 位置与 CSS 中帆的 scaleX 公式保持一致；
 * - 屏幕左侧手臂由 uL（人体解剖学左臂）驱动、右侧由 uR 驱动，
 *   与既有帆的左右映射一致（镜像语义沿用 wingPose.measureWing 的约定）。
 *
 * 动画层只做视觉跟随；计分仍在 WingSession 内完成，两者互不干扰。
 */

export interface RobotArmPose {
  /** 上臂相对 +x 轴的绝对角度（度，SVG y 轴向下） */
  upperDeg: number;
  /** 前臂相对上臂的转角（度） */
  foreDeg: number;
  /** 前臂相对 +x 轴的绝对角度（度）——渲染层扁平分组直接使用 */
  foreAbsDeg: number;
  elbowX: number;
  elbowY: number;
  handX: number;
  handY: number;
}

export interface RobotRope {
  /** 起点 = 手部位置 */
  x: number;
  y: number;
  len: number;
  /** 绳方向角（度） */
  deg: number;
}

export interface RobotPose {
  left: RobotArmPose;
  right: RobotArmPose;
  ropeL: RobotRope;
  ropeR: RobotRope;
}

/** 场景坐标（与 WingScene SVG viewBox 640×320 同空间，船体组内） */
export const ROBOT_GEOMETRY = {
  /** 肩关节（屏幕左/右） */
  shoulderL: { x: 310.5, y: 203 },
  shoulderR: { x: 329.5, y: 203 },
  upperLen: 14,
  foreLen: 13.5,
  /**
   * 手部目标以「绕肩极坐标」插值（角度 + 半径分别随 u 线性变化），
   * 保证手臂从弯曲到伸直单调连续；半径上限略超臂展，接近到位时手臂自然伸直。
   */
  restL: { deg: 137.2, r: 18.4 },
  openL: { deg: 211.47, r: 34 },
  restR: { deg: 42.8, r: 18.4 },
  openR: { deg: -31.47, r: 34 },
  /** 帆的收起比例与 clew 几何：与 product.css 中 scaleX(0.2 + 0.8u) 及帆路径一致 */
  mastL: 317,
  mastR: 322,
  sailReach: 95,
  clewY: 160.5,
  sailMinScale: 0.2,
  /** 头部包围盒：缆绳不得进入 */
  headBox: { x0: 304, x1: 336, y0: 170, y1: 202 },
  /** 身体中线，用于 IK 肘部方向选择（肘部始终朝外） */
  centerX: 320,
} as const;

const DEG = 180 / Math.PI;

const clamp = (v: number, lo: number, hi: number) =>
  v < lo ? lo : v > hi ? hi : v;

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

function normalizeDeg(deg: number): number {
  let d = deg % 360;
  if (d > 180) d -= 360;
  if (d < -180) d += 360;
  return d;
}

/**
 * 双骨 IK：给定肩点与手部目标，求上臂绝对角与前臂相对角。
 * 肘部取「离身体中线更远」的解，保证手臂始终向外弯，不会穿过躯干。
 */
export function solveArm(
  shoulder: { x: number; y: number },
  target: { x: number; y: number },
): RobotArmPose {
  const { upperLen: l1, foreLen: l2, centerX } = ROBOT_GEOMETRY;
  const dx = target.x - shoulder.x;
  const dy = target.y - shoulder.y;
  const raw = Math.hypot(dx, dy) || 1e-6;
  const d = clamp(raw, Math.abs(l1 - l2) + 0.5, l1 + l2 - 0.05);
  // 目标超出臂展时，手停在臂展圆上（手臂自然伸直指向目标）
  const hand = {
    x: shoulder.x + (dx / raw) * d,
    y: shoulder.y + (dy / raw) * d,
  };
  const cosA = clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -1, 1);
  const a = Math.acos(cosA);
  const base = Math.atan2(hand.y - shoulder.y, hand.x - shoulder.x);
  const candidates = [base + a, base - a].map((theta) => ({
    theta,
    x: shoulder.x + l1 * Math.cos(theta),
    y: shoulder.y + l1 * Math.sin(theta),
  }));
  const elbow =
    Math.abs(candidates[0].x - centerX) >= Math.abs(candidates[1].x - centerX)
      ? candidates[0]
      : candidates[1];
  const foreAbs = Math.atan2(hand.y - elbow.y, hand.x - elbow.x);
  return {
    upperDeg: elbow.theta * DEG,
    foreDeg: normalizeDeg(foreAbs - elbow.theta) * DEG,
    foreAbsDeg: foreAbs * DEG,
    elbowX: elbow.x,
    elbowY: elbow.y,
    handX: hand.x,
    handY: hand.y,
  };
}

/** 帆外角（clew）：随该侧帆的 scaleX 同步移动 */
export function sailClew(u: number, side: "L" | "R"): { x: number; y: number } {
  const g = ROBOT_GEOMETRY;
  const scale = g.sailMinScale + (1 - g.sailMinScale) * clamp(u, 0, 1);
  return {
    x: side === "L" ? g.mastL - g.sailReach * scale : g.mastR + g.sailReach * scale,
    y: g.clewY,
  };
}

function buildRope(hand: { x: number; y: number }, clew: { x: number; y: number }): RobotRope {
  return {
    x: hand.x,
    y: hand.y,
    len: Math.hypot(clew.x - hand.x, clew.y - hand.y),
    deg: Math.atan2(clew.y - hand.y, clew.x - hand.x) * DEG,
  };
}

/**
 * 由左右展开量计算整帧机器人姿态。
 * uL → 屏幕左侧手臂与左帆缆绳；uR → 右侧（与帆的镜像约定一致）。
 */
export function computeRobotPose(uL: number, uR: number): RobotPose {
  const g = ROBOT_GEOMETRY;
  const tL = clamp(uL, 0, 1);
  const tR = clamp(uR, 0, 1);
  const target = (
    shoulder: { x: number; y: number },
    rest: { deg: number; r: number },
    open: { deg: number; r: number },
    t: number,
  ) => {
    const rad = (lerp(rest.deg, open.deg, t) * Math.PI) / 180;
    const r = lerp(rest.r, open.r, t);
    return { x: shoulder.x + r * Math.cos(rad), y: shoulder.y + r * Math.sin(rad) };
  };
  const left = solveArm(g.shoulderL, target(g.shoulderL, g.restL, g.openL, tL));
  const right = solveArm(g.shoulderR, target(g.shoulderR, g.restR, g.openR, tR));
  return {
    left,
    right,
    ropeL: buildRope({ x: left.handX, y: left.handY }, sailClew(tL, "L")),
    ropeR: buildRope({ x: right.handX, y: right.handY }, sailClew(tR, "R")),
  };
}

/**
 * 把姿态转成可直接写到根元素上的 CSS 变量（角度单位 deg，长度单位 px 数值）。
 * 与 product.css 中 .wing-arm-* / .wing-rope-* 的 var() 引用一一对应。
 */
export function robotCssVars(pose: RobotPose): Record<string, string> {
  const f = (v: number) => v.toFixed(2);
  return {
    "--arm-l-upper": f(pose.left.upperDeg),
    "--arm-l-fore-x": f(pose.left.elbowX),
    "--arm-l-fore-y": f(pose.left.elbowY),
    "--arm-l-fore-abs": f(pose.left.foreAbsDeg),
    "--arm-r-upper": f(pose.right.upperDeg),
    "--arm-r-fore-x": f(pose.right.elbowX),
    "--arm-r-fore-y": f(pose.right.elbowY),
    "--arm-r-fore-abs": f(pose.right.foreAbsDeg),
    "--rope-l-x": f(pose.ropeL.x),
    "--rope-l-y": f(pose.ropeL.y),
    "--rope-l-len": f(pose.ropeL.len),
    "--rope-l-ang": f(pose.ropeL.deg),
    "--rope-r-x": f(pose.ropeR.x),
    "--rope-r-y": f(pose.ropeR.y),
    "--rope-r-len": f(pose.ropeR.len),
    "--rope-r-ang": f(pose.ropeR.deg),
  };
}
