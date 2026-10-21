/**
 * YukeeEngine —— Yukee 的角色动画核心。
 *
 * 机制移植自 LaoA-GrokBot（MIT License，Copyright (c) 2026 老A玩AI，
 * 见 THIRD_PARTY_NOTICES.md）：
 * - Spring Morph：velocity += (-14·v - 49·(morph-1))·dt（表情间弹性过渡）
 * - Blink：320ms 眨眼曲线（scaleY 压扁到 0.04）
 * - Gaze：gazeX/gazeY 叠加到眼睛质心（原版 pointermove 驱动，
 *   本版本改为 MediaPipe 头部姿态驱动，见 src/vision/CameraVision.ts）
 * - Turn：以 105px 半径模拟 3D 转头透视（sin/cos longitude）
 * - Expression Pool / Cadence：池内随机轮换、按状态节奏触发
 *
 * 在 LaoA 之上新增：
 * - 持续呼吸 squash（很弱，calm 也保持活物感）
 * - 身体 X 跟随（deadzone + clamp + damping，不直接映射 landmark）
 * - 瞬时事件（success/miss/notice）：临时表情 + 定时弹回持续状态
 * - 无外部视线输入时的自主眼神微动
 *
 * 引擎不是业务状态机：产品相位 → YukeeState 的映射在 yukeeStateMap.ts，
 * 引擎只负责把 YukeeState 渲染成表情与动画。
 */
import { LAOA_EXPRESSIONS } from "./laoaData";
import { YUKEE_EVENTS, YUKEE_STATES } from "./yukeeStateMap";
import type {
  YukeeEvent,
  YukeeEyeFrame,
  YukeeFrame,
  YukeeRing,
  YukeeState,
} from "./yukeeTypes";

const CENTER_X = 114.2705;
const TURN_RADIUS = 105;
const BLINK_MS = 320;
/** gaze 平滑系数（越大越跟手） */
const GAZE_DAMP = 14;
/** 身体跟随系数（明显慢于 gaze，避免抖动） */
const BODY_DAMP = 4.6;
/** 身体倾斜比横移再柔和一点 */
const TILT_DAMP = 3.1;
/** 头部透视跟随速度，略慢于眼睛但快于身体 */
const TURN_DAMP = 9;
/** 身体死区（|target| 小于此值视为 0） */
const BODY_DEADZONE = 0.045;
/** 无外部视线输入超过该时长后进入自主眼神微动 */
const GAZE_IDLE_MS = 1800;

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const centroid = (ring: YukeeRing): [number, number] =>
  ring.reduce(
    (a, p) => [a[0] + p[0] / ring.length, a[1] + p[1] / ring.length],
    [0, 0],
  );
const ringPath = (ring: YukeeRing) =>
  "M" +
  ring.map((p) => `${p[0].toFixed(2)} ${p[1].toFixed(2)}`).join("L") +
  "Z";
const randomIn = ([a, b]: [number, number]) => a + Math.random() * (b - a);

export interface YukeeEngineOptions {
  /** gaze 最大偏移（SVG 坐标 px），挂灯小屏应明显小于 LaoA 原版 22/14 */
  maxGazeX?: number;
  maxGazeY?: number;
  /** 身体 X 最大位移（渲染容器 px，约可用宽度 ±5%~8%） */
  maxBodyX?: number;
  onFrame: (frame: YukeeFrame) => void;
}

export class YukeeEngine {
  private state: YukeeState = "calm";
  private current: [YukeeRing, YukeeRing];
  private target: [YukeeRing, YukeeRing];
  private expression = 0;
  private morph = 1;
  private velocity = 0;

  private gazeTX = 0;
  private gazeTY = 0;
  private gazeX = 0;
  private gazeY = 0;
  private lastGazeInput = 0;
  private wanderSeed = Math.random() * 100;

  private bodyT = 0;
  private bodyX = 0;
  private bodyTilt = 0;

  private turnT = 0;
  private turn = 0;
  private blinkStart = 0;
  private nextBlink = 0;
  private nextCadence = 0;

  /** 瞬时事件：临时表情索引与恢复时刻 */
  private eventExpr: number | null = null;
  private eventUntil = 0;

  private raf = 0;
  private last = 0;
  private running = false;
  private readonly maxGazeX: number;
  private readonly maxGazeY: number;
  private readonly maxBodyX: number;
  private readonly onFrame: (frame: YukeeFrame) => void;

  constructor(options: YukeeEngineOptions) {
    this.maxGazeX = options.maxGazeX ?? 16;
    this.maxGazeY = options.maxGazeY ?? 10;
    this.maxBodyX = options.maxBodyX ?? 0;
    this.onFrame = options.onFrame;
    const first = LAOA_EXPRESSIONS[0];
    this.current = [
      first[0].map((p) => [...p]) as YukeeRing,
      first[1].map((p) => [...p]) as YukeeRing,
    ];
    this.target = LAOA_EXPRESSIONS[0];
  }

  get currentState() {
    return this.state;
  }

  start() {
    if (this.running) return;
    this.running = true;
    const now = performance.now();
    this.last = now;
    this.scheduleBlink(now);
    this.scheduleCadence(now);
    const loop = (t: number) => {
      if (!this.running) return;
      this.tick(t);
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  /** 产品层唯一入口：切换 Yukee 持续状态 */
  setState(state: YukeeState) {
    if (state === this.state) return;
    this.state = state;
    this.eventExpr = null;
    const now = performance.now();
    this.pickFromPool(now, true);
    this.scheduleBlink(now);
    this.scheduleCadence(now);
  }

  /** MediaPipe 驱动的视线输入（-1 ~ 1）。正式体验唯一 gaze 来源 */
  setGaze(x: number, y: number) {
    this.gazeTX = clamp(x, -1, 1);
    this.gazeTY = clamp(y, -1, 1);
    this.lastGazeInput = performance.now();
  }

  /** 用户身体位置输入（-1 ~ 1，来自 faceCenterX），引擎内部做死区/阻尼 */
  setBodyX(v: number) {
    const clamped = clamp(v, -1, 1);
    this.bodyT = Math.abs(clamped) < BODY_DEADZONE ? 0 : clamped;
  }

  /** 3D 转头角度（度），平时保持 0，可用于特殊编排 */
  setTurn(deg: number) {
    this.turnT = clamp(deg, -24, 24);
  }

  /** 瞬时反馈事件：叠加在当前状态上，结束后自动弹回 */
  event(e: YukeeEvent) {
    const now = performance.now();
    if (e === "blink") {
      this.blink(now);
      return;
    }
    if (e === "enterGame") {
      // 投屏阶段 1：眼睛向下看电脑屏幕
      this.setGaze(0, 1);
      return;
    }
    if (e === "exitGame") {
      this.setGaze(0, 0);
      this.blink(now);
      return;
    }
    const def = YUKEE_EVENTS[e];
    this.eventExpr = def.expression;
    this.eventUntil = now + def.durationMs;
    if (def.expression !== null) this.chooseExpression(def.expression);
    if (e === "success" || e === "notice") this.blink(now);
  }

  blink(now = performance.now()) {
    this.blinkStart = now;
  }

  private scheduleBlink(now: number) {
    const range = YUKEE_STATES[this.state].blink;
    this.nextBlink = range ? now + randomIn(range) : Infinity;
  }

  private scheduleCadence(now: number) {
    this.nextCadence = now + randomIn(YUKEE_STATES[this.state].cadence);
  }

  /** 从当前状态池中挑一个不同表情（Expression Pool 机制） */
  private pickFromPool(now: number, immediate: boolean) {
    const pool = YUKEE_STATES[this.state].pool;
    const next =
      pool.length > 1
        ? (pool.filter((i) => i !== this.expression)[
            Math.floor(Math.random() * (pool.length - 1))
          ] ?? pool[0])
        : pool[0];
    if (immediate || next !== this.expression) this.chooseExpression(next);
    this.scheduleCadence(now);
  }

  private chooseExpression(index: number) {
    // 先定格当前形变位置，再向新目标弹性过渡（LaoA 原版做法）
    this.current = this.interpolated();
    this.target = LAOA_EXPRESSIONS[index];
    this.expression = index;
    this.morph = 0;
    this.velocity = 0;
  }

  private interpolated(): [YukeeRing, YukeeRing] {
    const m = clamp(this.morph, 0, 1);
    return this.current.map((ring, e) =>
      ring.map((p, i) => [
        p[0] + (this.target[e][i][0] - p[0]) * m,
        p[1] + (this.target[e][i][1] - p[1]) * m,
      ]),
    ) as [YukeeRing, YukeeRing];
  }

  private blinkScale(now: number) {
    if (!this.blinkStart) return 1;
    const t = (now - this.blinkStart) / BLINK_MS;
    if (t >= 1) {
      this.blinkStart = 0;
      return 1;
    }
    return Math.max(t < 0.42 ? 1 - t / 0.42 : (t - 0.42) / 0.58, 0.04);
  }

  private tick(now: number) {
    const dt = Math.min((now - this.last) / 1000, 0.1);
    this.last = now;

    // Spring Morph（LaoA: stiffness 49 / damping 14）
    this.velocity += (-14 * this.velocity - 49 * (this.morph - 1)) * dt;
    this.morph += this.velocity * dt;
    if (!Number.isFinite(this.morph)) {
      this.morph = 1;
      this.velocity = 0;
    }

    // 瞬时事件结束 → 弹回持续状态池
    if (this.eventUntil && now >= this.eventUntil) {
      this.eventUntil = 0;
      this.eventExpr = null;
      this.pickFromPool(now, true);
    }
    // Expression Cadence：池内轮换
    if (!this.eventExpr && now >= this.nextCadence)
      this.pickFromPool(now, false);
    // 自动眨眼
    if (now >= this.nextBlink) {
      this.blink(now);
      this.scheduleBlink(now);
    }

    // gaze 阻尼逼近目标。非游戏状态默认正视用户；只有游戏态在没有
    // 视觉输入时保留很弱的自主扫视，避免首页因噪声持续偏向一侧。
    if (now - this.lastGazeInput > GAZE_IDLE_MS) {
      if (this.state === "playful") {
        const t = now / 1000 + this.wanderSeed;
        this.gazeTX = Math.sin(t * 0.43) * 0.12;
        this.gazeTY = Math.sin(t * 0.31) * 0.06;
      } else {
        this.gazeTX = 0;
        this.gazeTY = 0;
        this.bodyT = 0;
        this.turnT = 0;
      }
    }
    const gx = this.gazeTX * this.maxGazeX;
    const gy = this.gazeTY * this.maxGazeY;
    const gk = Math.min(1, dt * GAZE_DAMP);
    this.gazeX += (gx - this.gazeX) * gk;
    this.gazeY += (gy - this.gazeY) * gk;

    // 身体 X 阻尼跟随（已含死区与 clamp）
    const bk = Math.min(1, dt * BODY_DAMP);
    this.bodyX += (this.bodyT * this.maxBodyX - this.bodyX) * bk;
    const tk = Math.min(1, dt * TILT_DAMP);
    this.bodyTilt += (this.bodyT * 4.8 - this.bodyTilt) * tk;

    const turnK = Math.min(1, dt * TURN_DAMP);
    this.turn += (this.turnT - this.turn) * turnK;

    // 渲染双眼（LaoA turn 透视 + gaze 平移 + blink 压扁）
    const shown = this.interpolated();
    const bs = this.blinkScale(now);
    const rad = (this.turn * Math.PI) / 180;
    const eyes = shown.map((ring): YukeeEyeFrame => {
      const c = centroid(ring);
      const base = Math.asin(clamp((c[0] - CENTER_X) / TURN_RADIUS, -1, 1));
      const longitude = base + rad;
      const depth = Math.cos(longitude);
      const perspective =
        Math.max(depth, 0.02) / Math.max(Math.cos(base), 0.02);
      return {
        d: ringPath(ring),
        x: CENTER_X + TURN_RADIUS * Math.sin(longitude) + this.gazeX,
        y: c[1] + this.gazeY,
        cx: c[0],
        cy: c[1],
        perspective: clamp(perspective, 0.02, 2.4),
        blinkScale: bs,
        visible: depth > 0.02,
      };
    }) as [YukeeEyeFrame, YukeeEyeFrame];

    // 呼吸 squash：4.2s 周期、±0.8%，calm 也保持很弱的生命感
    const breath = 1 + Math.sin((now / 1000) * ((Math.PI * 2) / 4.2)) * 0.008;

    this.onFrame({
      eyes,
      breath,
      bodyX: this.bodyX,
      bodyTilt: this.bodyTilt,
    });
  }
}
