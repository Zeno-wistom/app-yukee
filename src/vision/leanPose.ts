import type { PoseFrame } from "./wingPose";

/**
 * G03「星海冲浪」躯干侧倾识别（纯逻辑，无 DOM / 无摄像头依赖）。
 *
 * v2 设计目标：普通人第一次就能玩通，而不是精确测量。
 * - 只需要双肩入镜；双髋可见时额外使用「肩中点 → 髋中点」躯干角，两路信号融合。
 * - 肩线倾斜（roll）来自 11/12 号肩点，头部、鼻子、人脸完全不参与；
 *   整体平移不改变肩线角和躯干角，因此平移、甩头都不会触发。
 * - 校准只记录 1 秒自然坐姿（中立基线），左右幅度用保守默认值，并在游戏中只向上自适应。
 * - 动作循环：朝目标侧轻微侧倾 → 短保持 220ms 接住星星 → 越过中线才可以接下一颗。
 *   无需长时间保持、无需每次等待巡航，也不会在人体静止时计分。
 *
 * 符号约定：正值 = 用户向自己的右侧倾斜（屏幕右侧，镜像观感）。
 */

export interface LeanProfile {
  /** 中立躯干角（弧度）；校准时看不到髋部则为 null，游戏中髋部出现会在中立时补记。 */
  a0: number | null;
  /** 中立肩线角（弧度） */
  s0: number;
  /** 躯干角满量程（弧度）：|Δ| = range 时 u = 1 */
  range: number;
  /** 肩线角满量程（弧度） */
  sRange: number;
}
export type LeanMode = "camera" | "demo";

/** 单帧可用的姿态特征。torso 需要双髋；shoulder 只需要双肩。 */
export interface LeanSample {
  torso: number | null;
  shoulder: number;
}

export const DEFAULT_LEAN_CONFIG = {
  /** 肩/髋关键点可见度下限（原 0.65，桌前坐姿髋部常被遮挡，放宽并改为可选）。 */
  minVisibility: 0.5,
  /** 原始摄像头帧未镜像（MediaPipe 输入为原始画面）。 */
  mirror: true,
  /** 默认满量程：约 6°。触发阈值 0.42 → 约 2.5°，属于轻微侧倾。 */
  defaultRange: 0.105,
  defaultShoulderRange: 0.1,
  /** 自适应只放大不缩小，避免小幅动作者越玩越难；上限约 9.5°。 */
  maxRange: 0.165,
  smoothTauMs: 110,
  /** 进入接星区阈值（原 0.65） */
  catchThreshold: 0.42,
  /** 接星需要的连续保持（原 600ms） */
  catchHoldMs: 220,
  /** 接住后必须越过该线（靠近中间或到另一侧）才开放下一颗（替代原 400ms 回中保持） */
  releaseThreshold: 0.22,
  /** 显示死区：抖动不推动角色 */
  deadZone: 0.06,
  /** 短暂遮挡冻结窗口；超过后提示「看不到你」（原 300ms） */
  lossGraceMs: 600,
  /** 恢复识别后稳定多久继续（原 1s 回中 + 3s 倒计时） */
  resumeMs: 450,
  /** 单帧角度跳变超过该值视为误检帧，丢弃 */
  jumpRejectRad: 0.35,
  /** 中立基线漂移跟随时间常数，只在靠近中间时生效 */
  driftTauMs: 7000,
  softLimitMs: 45000,
  targetReps: 6,
};
export type LeanConfig = typeof DEFAULT_LEAN_CONFIG;
export const DEMO_LEAN_PROFILE: LeanProfile = {
  a0: 0,
  s0: 0,
  range: DEFAULT_LEAN_CONFIG.defaultRange,
  sRange: DEFAULT_LEAN_CONFIG.defaultShoulderRange,
};

const visible = (
  p: { x: number; y: number; visibility?: number } | undefined,
  min: number,
) =>
  !!p &&
  Number.isFinite(p.x) &&
  Number.isFinite(p.y) &&
  Number.isFinite(p.visibility) &&
  p.visibility! >= min &&
  p.x > 0 &&
  p.x < 1 &&
  p.y > 0 &&
  p.y < 1;

/** 关键点 → 特征。鼻子、眼、耳（0–10 号）不参与。 */
export function measureLean(
  frame: PoseFrame | null,
  config: LeanConfig = DEFAULT_LEAN_CONFIG,
): LeanSample | null {
  if (!frame || frame.videoWidth <= 0 || frame.videoHeight <= 0) return null;
  const W = frame.videoWidth,
    H = frame.videoHeight;
  const ls = frame.landmarks[11],
    rs = frame.landmarks[12];
  if (!visible(ls, config.minVisibility) || !visible(rs, config.minVisibility))
    return null;
  const dx = Math.abs(ls.x - rs.x) * W;
  // 肩宽太小：人离得过远或侧身，信号不可信。
  if (dx < Math.max(24, W * 0.06)) return null;
  // 右肩（12）比左肩（11）低 = 向用户右侧倾。与画面是否镜像无关。
  const shoulder = Math.atan2((rs.y - ls.y) * H, dx);
  let torso: number | null = null;
  const lh = frame.landmarks[23],
    rh = frame.landmarks[24];
  if (visible(lh, config.minVisibility) && visible(rh, config.minVisibility)) {
    const sx = ((ls.x + rs.x) / 2) * W,
      sy = ((ls.y + rs.y) / 2) * H;
    const hx = ((lh.x + rh.x) / 2) * W,
      hy = ((lh.y + rh.y) / 2) * H;
    if (hy - sy > Math.max(20, dx * 0.45))
      torso = Math.atan2((sx - hx) * (config.mirror ? -1 : 1), hy - sy);
  }
  return { torso, shoulder };
}

const clamp = (v: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, v));

/** 用个人基线归一化，两路可用时加权融合（躯干为主，肩线为辅）。 */
export function leanAmount(s: LeanSample, p: LeanProfile) {
  const us = (s.shoulder - p.s0) / Math.max(0.02, p.sRange);
  if (s.torso === null || p.a0 === null) return clamp(us, -1, 1);
  const ut = (s.torso - p.a0) / Math.max(0.02, p.range);
  return clamp(0.62 * ut + 0.38 * us, -1, 1);
}

export type LeanCalibrationStage = "visible" | "neutral" | "ready";
const median = (v: number[]) => {
  const a = [...v].sort((x, y) => x - y);
  return a[Math.floor(a.length / 2)];
};
/**
 * 一步校准：看到双肩后自然坐好约 1 秒即可。
 * 只要求「大致稳定」（容差约 3.4°），呼吸、轻微晃动不会反复重来。
 */
export class LeanCalibrator {
  stage: LeanCalibrationStage = "visible";
  profile: LeanProfile | null = null;
  progress = 0;
  hipsSeen = false;
  private samples: { s: LeanSample; at: number }[] = [];
  private lastAt = -Infinity;
  constructor(
    private config: LeanConfig = DEFAULT_LEAN_CONFIG,
    private neutralMs = 1000,
  ) {}
  update(s: LeanSample | null, at: number) {
    if (at <= this.lastAt) return;
    const gap = at - this.lastAt;
    this.lastAt = at;
    if (this.stage === "ready") return;
    if (s === null || gap > 350) {
      this.samples = [];
      this.progress = 0;
      if (s === null) {
        this.stage = "visible";
        return;
      }
    }
    this.stage = "neutral";
    this.samples.push({ s, at });
    const sh = this.samples.map((x) => x.s.shoulder);
    if (Math.max(...sh) - Math.min(...sh) > 0.06) {
      // 不整体清空：只保留最近一帧，给用户「稍微坐稳」的即时机会。
      this.samples = [{ s, at }];
      this.progress = 0;
      return;
    }
    this.progress = Math.min(1, (at - this.samples[0].at) / this.neutralMs);
    if (this.progress < 1 || this.samples.length < 4) return;
    const torsos = this.samples
      .map((x) => x.s.torso)
      .filter((v): v is number => v !== null);
    this.hipsSeen = torsos.length >= this.samples.length * 0.6;
    this.profile = {
      a0: this.hipsSeen ? median(torsos) : null,
      s0: median(sh),
      range: this.config.defaultRange,
      sRange: this.config.defaultShoulderRange,
    };
    this.stage = "ready";
    this.progress = 1;
  }
}

export interface LeanUpdate {
  /** 平滑后的侧倾量 -1..1（含死区） */
  u: number;
  reps: number;
  /** 当前星星所在侧 */
  target: -1 | 1;
  /** 正在目标侧接星区内 */
  arrived: boolean;
  /** 接星保持进度 0..1 */
  hold: number;
  /** 向目标侧的接近程度 0..1，用于「快到了」的提示 */
  approach: number;
  /** 刚接住，需越过中线开放下一颗 */
  returning: boolean;
  effectiveMs: number;
  /** 最近一次接星时的 effectiveMs，用于画面吸收动画 */
  lastCatchMs: number;
  tracking: "ok" | "unstable" | "lost";
  recovering: boolean;
  complete: boolean;
  overSoftLimit: boolean;
  /** 本帧信号来源，便于 HUD 告知「肩+髋」或「仅肩膀」 */
  source: "torso" | "shoulder" | "none";
}

/** 仅管理动作循环；产品级阶段、退出和结果统一由 machine.ts 修改。 */
export class LeanSession {
  current: LeanUpdate = {
    u: 0,
    reps: 0,
    target: -1,
    arrived: false,
    hold: 0,
    approach: 0,
    returning: false,
    effectiveMs: 0,
    lastCatchMs: -1e9,
    tracking: "ok",
    recovering: false,
    complete: false,
    overSoftLimit: false,
    source: "none",
  };
  private profile: LeanProfile;
  private filtered: number | null = null;
  private holdMs = 0;
  private lostMs = 0;
  private resumeMs = 0;
  private last: LeanSample | null = null;
  constructor(
    profile: LeanProfile,
    private config: LeanConfig = DEFAULT_LEAN_CONFIG,
  ) {
    this.profile = { ...profile };
  }
  /** 当前（含自适应）个人参数，仅供调试与测试读取 */
  get liveProfile(): Readonly<LeanProfile> {
    return this.profile;
  }
  pause() {
    const v = this.current;
    v.recovering = true;
    v.arrived = false;
    v.hold = 0;
    this.holdMs = 0;
    this.resumeMs = 0;
    this.filtered = null;
    this.last = null;
  }
  private adapt(s: LeanSample, u: number, dt: number) {
    const p = this.profile,
      c = this.config;
    // 髋部在游戏中才出现：在中立附近补记躯干基线。
    if (s.torso !== null && p.a0 === null && Math.abs(u) < 0.15) p.a0 = s.torso;
    // 幅度只向上自适应：动作明显更大的人，阈值随之变得更「需要动」一点，但最多约 9.5°。
    const ds = Math.abs(s.shoulder - p.s0);
    if (ds * 0.78 > p.sRange) p.sRange = Math.min(c.maxRange, ds * 0.78);
    if (s.torso !== null && p.a0 !== null) {
      const dt0 = Math.abs(s.torso - p.a0);
      if (dt0 * 0.78 > p.range) p.range = Math.min(c.maxRange, dt0 * 0.78);
    }
    // 靠近中间时，基线缓慢跟随坐姿漂移；漂移只会把 u 拉向 0，不可能凭空触发接星。
    if (Math.abs(u) < 0.2) {
      const k = 1 - Math.exp(-dt / c.driftTauMs);
      p.s0 += (s.shoulder - p.s0) * k;
      if (s.torso !== null && p.a0 !== null) p.a0 += (s.torso - p.a0) * k;
    }
  }
  update(dtMs: number, s: LeanSample | null): LeanUpdate {
    const dt = Math.max(0, Math.min(120, dtMs));
    const v = this.current,
      c = this.config;
    if (v.complete) return { ...v };
    // 误检帧：单帧角度剧烈跳变（例如瞬间识别到别人或手臂遮挡）按无效帧处理。
    if (
      s &&
      this.last &&
      Math.abs(s.shoulder - this.last.shoulder) > c.jumpRejectRad
    ) {
      this.last = s;
      s = null;
    }
    if (s === null || !Number.isFinite(s.shoulder)) {
      this.lostMs += dt;
      this.resumeMs = 0;
      // 无效帧不能拼接成连续保持；时间与计分冻结。
      this.holdMs = 0;
      v.hold = 0;
      v.arrived = false;
      v.source = "none";
      if (this.lostMs > c.lossGraceMs && !v.recovering) this.pause();
      v.tracking = this.lostMs > c.lossGraceMs ? "lost" : "unstable";
      return { ...v };
    }
    this.last = s;
    this.lostMs = 0;
    v.source = s.torso !== null && this.profile.a0 !== null ? "torso" : "shoulder";
    if (v.recovering) {
      this.resumeMs += dt;
      v.tracking = "unstable";
      if (this.resumeMs < c.resumeMs) return { ...v };
      v.recovering = false;
      this.filtered = null;
    }
    v.tracking = "ok";
    const raw = leanAmount(s, this.profile);
    this.filtered =
      this.filtered === null
        ? raw
        : this.filtered +
          (raw - this.filtered) * (1 - Math.exp(-dt / c.smoothTauMs));
    this.adapt(s, this.filtered, dt);
    const f = this.filtered;
    v.u = Math.abs(f) < c.deadZone ? 0 : f;
    v.effectiveMs += dt;
    v.overSoftLimit = v.effectiveMs >= c.softLimitMs;
    const toward = f * v.target;
    if (v.returning) {
      // 接住后：越过中线（或已经倾向下一颗所在侧）才开放下一颗。
      if (toward >= -c.releaseThreshold) v.returning = false;
      v.approach = 0;
      v.arrived = false;
      v.hold = 0;
      this.holdMs = 0;
      return { ...v };
    }
    v.approach = clamp(toward / c.catchThreshold, 0, 1);
    v.arrived = toward >= c.catchThreshold;
    this.holdMs = v.arrived ? this.holdMs + dt : 0;
    v.hold = Math.min(1, this.holdMs / c.catchHoldMs);
    if (this.holdMs >= c.catchHoldMs) {
      this.holdMs = 0;
      v.hold = 0;
      v.arrived = false;
      v.reps++;
      v.lastCatchMs = v.effectiveMs;
      v.complete = v.reps >= c.targetReps;
      v.overSoftLimit = !v.complete && v.overSoftLimit;
      v.target = v.target === -1 ? 1 : -1;
      v.returning = !v.complete;
    }
    return { ...v };
  }
}
