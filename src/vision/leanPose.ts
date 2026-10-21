import type { PoseFrame } from "./wingPose";

export interface LeanProfile {
  a0: number;
  aL: number;
  aR: number;
  /** 中立姿态实测噪声，用于个人回中容差；不随游玩漂移。 */
  neutralNoise?: number;
}
export type LeanMode = "camera" | "demo";
export const DEFAULT_LEAN_CONFIG = {
  minVisibility: 0.65,
  mirror: true,
  smoothTauMs: 100,
  targetThreshold: 0.65,
  centerThreshold: 0.2,
  targetHoldMs: 600,
  centerHoldMs: 400,
  lossGraceMs: 300,
  stableMs: 1000,
  readyMs: 3000,
  softLimitMs: 45000,
  cruiseMs: 900,
  holdGraceMs: 120,
  targetRelease: 0.55,
  centerRelease: 0.28,
};
export type LeanConfig = typeof DEFAULT_LEAN_CONFIG;
export const DEMO_LEAN_PROFILE: LeanProfile = { a0: 0, aL: -0.2, aR: 0.2 };

/** Pose 原始坐标只在此处做一次镜像校正；鼻子和脸部数据不参与。 */
export function measureLean(
  frame: PoseFrame | null,
  config = DEFAULT_LEAN_CONFIG,
): number | null {
  if (!frame || frame.videoWidth <= 0 || frame.videoHeight <= 0) return null;
  const points = [11, 12, 23, 24].map((i) => frame.landmarks[i]);
  if (
    points.some(
      (p) =>
        !p ||
        !Number.isFinite(p.x) ||
        !Number.isFinite(p.y) ||
        !Number.isFinite(p.visibility) ||
        p.visibility! < config.minVisibility ||
        p.x <= 0 ||
        p.x >= 1 ||
        p.y <= 0 ||
        p.y >= 1,
    )
  )
    return null;
  const [ls, rs, lh, rh] = points;
  const sx = ((ls.x + rs.x) / 2) * frame.videoWidth;
  const sy = ((ls.y + rs.y) / 2) * frame.videoHeight;
  const hx = ((lh.x + rh.x) / 2) * frame.videoWidth;
  const hy = ((lh.y + rh.y) / 2) * frame.videoHeight;
  if (hy - sy < 20 || Math.abs(ls.x - rs.x) * frame.videoWidth < 20)
    return null;
  return Math.atan2((sx - hx) * (config.mirror ? -1 : 1), hy - sy);
}
export function leanAmount(a: number, p: LeanProfile) {
  const d = a - p.a0;
  return Math.max(
    -1,
    Math.min(1, d / Math.max(0.01, d < 0 ? p.a0 - p.aL : p.aR - p.a0)),
  );
}

export type LeanCalibrationStage =
  "visible" | "neutral" | "left" | "right" | "ready";
const median = (v: number[]) => {
  const a = [...v].sort((x, y) => x - y);
  return a[Math.floor(a.length / 2)];
};
const quantile = (v: number[], q: number) => {
  const a = [...v].sort((x, y) => x - y);
  return a[Math.floor((a.length - 1) * q)];
};
export function leanCenterThreshold(p: LeanProfile, u = 0) {
  const span = u < 0 ? p.a0 - p.aL : p.aR - p.a0;
  return Math.max(
    0.2,
    Math.min(0.3, ((p.neutralNoise ?? 0) * 2) / Math.max(0.06, span)),
  );
}
/** 新帧滑动窗口采样；重复帧不累计，短缺失冻结，持续失稳不通过。 */
export class LeanCalibrator {
  stage: LeanCalibrationStage = "visible";
  profile: LeanProfile | null = null;
  progress = 0;
  private samples: { a: number; at: number }[] = [];
  private lastAt = -Infinity;
  private a0 = 0;
  private aL = 0;
  private noise = 0;
  private invalidMs = 0;
  update(a: number | null, at: number) {
    if (at <= this.lastAt) return;
    const gap = at - this.lastAt;
    this.lastAt = at;
    if (a === null || !Number.isFinite(a) || gap > 300) {
      this.invalidMs += gap;
      // 短缺帧冻结采样；不把看不见的时间算成保持。
      if (a === null && this.invalidMs <= 120 && this.samples.length) {
        for (const sample of this.samples) sample.at += gap;
        return;
      }
      this.samples = [];
      this.progress = 0;
      if (a === null || !Number.isFinite(a)) return;
    }
    this.invalidMs = 0;
    if (this.stage === "ready") return;
    const directionOK =
      this.stage === "left"
        ? a < this.a0 - Math.max(0.06, this.noise * 3)
        : this.stage === "right"
          ? a > this.a0 + Math.max(0.06, this.noise * 3)
          : true;
    if (!directionOK) {
      this.samples = [];
      this.progress = 0;
      return;
    }
    this.samples.push({ a, at });
    // 有界滑动窗口 + 中间80%分布：容忍单帧离群，不累计持续摇晃。
    const duration =
      this.stage === "neutral" ? 2000 : this.stage === "visible" ? 1000 : 800;
    while (this.samples.length > 1 && at - this.samples[1].at >= duration)
      this.samples.shift();
    const values = this.samples.map((s) => s.a);
    if (quantile(values, 0.9) - quantile(values, 0.1) > 0.035) {
      this.progress = 0;
      return;
    }
    this.progress = Math.min(1, (at - this.samples[0].at) / duration);
    if (this.progress < 1 || this.samples.length < 5) return;
    const end = median(values);
    if (this.stage === "visible") this.stage = "neutral";
    else if (this.stage === "neutral") {
      this.a0 = end;
      this.noise = (quantile(values, 0.9) - quantile(values, 0.1)) / 2;
      this.stage = "left";
    } else if (this.stage === "left") {
      this.aL = end;
      this.stage = "right";
    } else {
      this.profile = {
        a0: this.a0,
        aL: this.aL,
        aR: end,
        neutralNoise: this.noise,
      };
      this.stage = "ready";
    }
    this.samples = [];
    this.progress = 0;
  }
}

export interface LeanUpdate {
  u: number;
  reps: number;
  target: -1 | 1;
  arrived: boolean;
  hold: number;
  effectiveMs: number;
  tracking: "ok" | "unstable" | "lost";
  recovering: boolean;
  countdown: number;
  complete: boolean;
  overSoftLimit: boolean;
  cruising: boolean;
  approach: number;
}
/** 仅管理动作循环；产品级阶段、退出和结果统一由 machine.ts 修改。 */
export class LeanSession {
  current: LeanUpdate = {
    u: 0,
    reps: 0,
    target: -1,
    arrived: false,
    hold: 0,
    effectiveMs: 0,
    tracking: "ok",
    recovering: false,
    countdown: 0,
    complete: false,
    overSoftLimit: false,
    cruising: true,
    approach: 0,
  };
  private filtered: number | null = null;
  private holdMs = 0;
  private lostMs = 0;
  private stableMs = 0;
  private readyMs = 0;
  private cruiseMs: number;
  private armed = false;
  private outsideMs = 0;
  private previousAngle: number | null = null;
  constructor(
    private profile: LeanProfile,
    private config = DEFAULT_LEAN_CONFIG,
  ) {
    this.cruiseMs = config.cruiseMs;
  }
  pause() {
    this.current.recovering = true;
    this.current.arrived = false;
    this.current.hold = 0;
    this.holdMs = 0;
    this.outsideMs = 0;
    this.stableMs = 0;
    this.readyMs = 0;
    this.armed = false;
    this.filtered = null;
    this.previousAngle = null;
  }
  update(dtMs: number, a: number | null): LeanUpdate {
    const dt = Math.max(0, Math.min(120, dtMs));
    const v = this.current;
    if (v.complete) return { ...v };
    if (a === null || !Number.isFinite(a)) {
      this.lostMs += dt;
      this.stableMs = 0;
      this.readyMs = 0;
      this.previousAngle = null;
      // 已观察到的进度可在短暂丢帧后继续；无效时间不能凑够保持。
      // <300ms 看不见时冻结，不能加时也不能计分；超时由 pause 丢弃半动作。
      if (this.lostMs > this.config.lossGraceMs && !v.recovering) this.pause();
      v.tracking = this.lostMs > this.config.lossGraceMs ? "lost" : "unstable";
      return { ...v };
    }
    this.lostMs = 0;
    const rawU = leanAmount(a, this.profile);
    if (v.recovering) {
      const stable =
        Math.abs(rawU) <= leanCenterThreshold(this.profile, rawU) &&
        (this.previousAngle === null ||
          Math.abs(a - this.previousAngle) <= 0.025);
      this.previousAngle = a;
      if (!stable) {
        this.stableMs = 0;
        this.readyMs = 0;
      } else if (this.stableMs < this.config.stableMs) this.stableMs += dt;
      else this.readyMs += dt;
      v.tracking = "unstable";
      v.countdown =
        this.stableMs >= this.config.stableMs
          ? Math.max(1, Math.ceil((this.config.readyMs - this.readyMs) / 1000))
          : 0;
      if (this.readyMs >= this.config.readyMs) {
        v.recovering = false;
        v.countdown = 0;
        this.filtered = null;
      }
      return { ...v };
    }
    v.tracking = "ok";
    this.filtered =
      this.filtered === null
        ? a
        : this.filtered +
          (a - this.filtered) * (1 - Math.exp(-dt / this.config.smoothTauMs));
    v.u = leanAmount(this.filtered, this.profile);
    v.effectiveMs += dt;
    v.overSoftLimit = v.effectiveMs >= this.config.softLimitMs;
    if (this.cruiseMs > 0) this.cruiseMs = Math.max(0, this.cruiseMs - dt);
    v.cruising = this.cruiseMs > 0;
    v.approach = this.config.cruiseMs
      ? 1 - this.cruiseMs / this.config.cruiseMs
      : 1;
    const center = Math.max(
      this.config.centerThreshold,
      leanCenterThreshold(this.profile, v.u),
    );
    if (!this.armed) {
      this.holdMs = Math.abs(v.u) <= center ? this.holdMs + dt : 0;
      if (this.holdMs >= this.config.centerHoldMs) {
        this.armed = true;
        this.holdMs = 0;
      }
    } else if (!v.cruising) {
      const entered = v.arrived
        ? Math.abs(v.u) <= center
        : v.u * v.target >= this.config.targetThreshold;
      const retained = v.arrived
        ? Math.abs(v.u) <= Math.max(center + 0.08, this.config.centerRelease)
        : v.u * v.target >= this.config.targetRelease;
      // 先进入严格区域才开始；迟滞阻止边缘抖动，越界短暂冻结但不加保持。
      const valid = entered || (this.holdMs > 0 && retained);
      if (valid) {
        this.holdMs += dt;
        this.outsideMs = 0;
      } else {
        this.outsideMs += dt;
        if (this.outsideMs > this.config.holdGraceMs) this.holdMs = 0;
      }
      const need = v.arrived
        ? this.config.centerHoldMs
        : this.config.targetHoldMs;
      v.hold = Math.min(1, this.holdMs / need);
      if (this.holdMs >= need) {
        this.holdMs = 0;
        this.outsideMs = 0;
        v.hold = 0;
        if (!v.arrived) v.arrived = true;
        else {
          v.reps++;
          v.arrived = false;
          v.target = v.target === -1 ? 1 : -1;
          v.complete = v.reps === 6;
          v.overSoftLimit = !v.complete && v.overSoftLimit;
          this.cruiseMs = this.config.cruiseMs;
          v.cruising = !v.complete && this.cruiseMs > 0;
          v.approach = v.cruising ? 0 : 1;
          this.armed = true;
        }
      }
    }
    return { ...v };
  }
}
