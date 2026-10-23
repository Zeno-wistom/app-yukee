import type { PoseFrame } from "./wingPose";

/**
 * G05 浅蹲识别：只看 MediaPipe 左右肩（11 / 12）在固定画面里的图像高度。
 * 依据《电脑端动作游戏完整交互与设计方案 10.21 V2》第 17–19 节：
 *   q = ((L.y − L0.y) + (R.y − R0.y)) / 2 / W0，u = q / A
 *   站直得到 L0 / R0 / W0；一次舒适浅蹲得到本人幅度 A。
 *   两肩同步、肩宽尺度、横向偏移、侧倾四项检查不通过时不蓄力。
 * 这是「与浅蹲配合的上身下降回升」信号，不是膝关节动作质量评估；
 * 弯腰也可能让双肩下降，正面单摄像头无法严格区分。
 * 不使用相对髋部的世界坐标（会抵消整体下降）。所有阈值均为展前起测值，需真人校正。
 *
 * v3：校准按肩宽、静止噪声与最小像素共同定下限；噪声太大先站稳。
 * 游戏阈值由本人幅度派生，舒适工作幅度封顶 0.14W0，误做深蹲不会抬高门槛。
 * 站稳上膛 → 新姿态帧确认下降 → 保持蓄力 → 站回稳定释放；不再在半途回升时自动释放。
 * 画面掉失、异常横移/前探、暂停会冻结或取消当前动作，恢复必须先站直。
 * 所有阈值仍需真人舒适度验证，单目肩部信号不能严格区分浅蹲与弯腰。
 */

export interface SquatSample {
  /** 像素坐标 */
  ly: number;
  ry: number;
  lx: number;
  rx: number;
  /** 当前肩宽（像素） */
  width: number;
  /** 视频高（像素），用于最小位移判断 */
  videoH: number;
}

export interface SquatProfile {
  ly0: number;
  ry0: number;
  /** 站立肩中心 x（像素） */
  cx0: number;
  /** 站立肩宽 W0（像素） */
  w0: number;
  /** 站立肩线角（弧度） */
  tilt0: number;
  /** 本人舒适浅蹲幅度 A（以 W0 为单位） */
  amp: number;
  /** 站立静止抖动（像素，标准差） */
  jitterPx: number;
}

export const SQUAT_CONFIG = {
  minVisibility: 0.5,
  /** 站立基线采集时长 */
  standMs: 2000,
  /** 站立期间允许的晃动（p10–p90 范围，以肩宽计） */
  standStillW: 0.07,
  /** 推理掉帧容忍：短于此不清空校准缓冲 */
  calGapMs: 600,
  /** 校准浅蹲最小有效下降：max(minDropPx, jitterFactor×抖动, minAmpW·W0)，封顶 maxMinAmpW·W0 */
  minDropPx: 3,
  jitterFactor: 3,
  minAmpW: 0.035,
  maxMinAmpW: 0.10,
  /** 蹲到位「停住」：0.35 秒内变化不超过 max(0.05 W0, 30% 当前下降) */
  bottomHoldMs: 350,
  bottomHoldW: 0.05,
  bottomHoldFrac: 0.3,
  /** 「蹲下→站起」一个来回也可通过：在蹲位至少这么久 */
  cycleMinMs: 250,
  /** 来回通过时取蹲位 q 的 80 分位 × 0.85 作幅度 */
  cycleAmpScale: 0.85,
  /** 校准第三步：u ≤ 该值稳定 300ms 视为站回 */
  calReadyU: 0.35,
  calReadyMs: 300,
  /** 游戏判定（u 为本人幅度的比例） */
  readyU: 0.3,
  downU: 0.45,
  /** 已在蹲位时，u 回升到这里以下停止增加蓄力 */
  holdU: 0.35,
  releaseU: 0.3,
  downStableMs: 140,
  releaseStableMs: 160,
  /** 落地后站立区累计多久才允许下一次蓄力 */
  rearmMs: 150,
  /** 站立基线自适应时间常数（只在站立区、静止时更新） */
  baselineTauMs: 900,
  baselineMaxU: 0.6,
  /** 检查项（游戏） */
  syncFrac: 0.45,
  widthMin: 0.75,
  widthMax: 1.3,
  lateralW: 0.35,
  tiltRad: (12 * Math.PI) / 180,
  /** 检查项失败持续多久才取消蓄力 */
  checkFailMs: 300,
  /** 校准阶段检查（更宽松：只防明显的侧倾 / 横移 / 前探） */
  calWidthMin: 0.72,
  calWidthMax: 1.35,
  calLateralW: 0.4,
  calTiltRad: (15 * Math.PI) / 180,
  /** 短暂缺点冻结；超过即暂停并取消本轮蓄力 */
  lostPauseMs: 300,
  /** 重现后稳定多久才恢复 */
  resumeMs: 800,
  /** q 的平滑时间常数 */
  smoothTauMs: 60,
} as const;

export type SquatMissReason = "" | "noFrame" | "stale" | "noLandmarks" | "lowVisibility" | "tooSmall";

/** 带原因的测量（调试面板用） */
export function measureSquatDiag(
  frame: PoseFrame | null,
  minVisibility: number = SQUAT_CONFIG.minVisibility,
): { sample: SquatSample | null; reason: SquatMissReason; visL: number; visR: number } {
  if (!frame) return { sample: null, reason: "noFrame", visL: 0, visR: 0 };
  const W = frame.videoWidth || 640,
    H = frame.videoHeight || 480;
  const l = frame.landmarks[11],
    r = frame.landmarks[12];
  if (!l || !r) return { sample: null, reason: "noLandmarks", visL: 0, visR: 0 };
  if (![W, H, l.x, l.y, r.x, r.y, l.visibility, r.visibility].every((v) => typeof v === "number" && Number.isFinite(v)) ||
    [l, r].some((p) => p.x < 0 || p.x > 1 || p.y < 0 || p.y > 1))
    return { sample: null, reason: "noLandmarks", visL: 0, visR: 0 };
  const visL = l.visibility ?? 0,
    visR = r.visibility ?? 0;
  if (visL < minVisibility || visR < minVisibility) return { sample: null, reason: "lowVisibility", visL, visR };
  const width = Math.hypot((l.x - r.x) * W, (l.y - r.y) * H);
  if (width < Math.max(24, W * 0.05)) return { sample: null, reason: "tooSmall", visL, visR };
  return { sample: { ly: l.y * H, ry: r.y * H, lx: l.x * W, rx: r.x * W, width, videoH: H }, reason: "", visL, visR };
}

export function measureSquat(frame: PoseFrame | null, minVisibility: number = SQUAT_CONFIG.minVisibility): SquatSample | null {
  return measureSquatDiag(frame, minVisibility).sample;
}

/** 噪声门槛 + 舒适幅度上限：误做深蹲不会抬高下一局的动作门槛。 */
export function squatThresholds(p: SquatProfile) {
  const noiseQ = Math.max(SQUAT_CONFIG.minDropPx, p.jitterPx * SQUAT_CONFIG.jitterFactor) / p.w0;
  const comfortableAmp = Math.min(p.amp, 0.14);
  const downQ = Math.max(comfortableAmp * SQUAT_CONFIG.downU, noiseQ);
  const holdQ = downQ * 0.62;
  const releaseQ = Math.min(holdQ * 0.8, Math.max(noiseQ * 0.45, comfortableAmp * 0.18));
  return { downU: downQ / p.amp, holdU: holdQ / p.amp, releaseU: releaseQ / p.amp,
    readyU: releaseQ / p.amp, noiseQ, downQ, comfortableAmp };
}

const tiltOf = (s: SquatSample) => Math.atan2(s.ry - s.ly, Math.abs(s.lx - s.rx));

export interface SquatChecks {
  sync: boolean;
  scale: boolean;
  lateral: boolean;
  tilt: boolean;
}

/** 原始下降量与检查项。zero 为站立基线修正（q 单位），loose 为校准用宽松阈值 */
export function squatSignal(s: SquatSample, p: SquatProfile, zero = 0, loose = false) {
  const c = SQUAT_CONFIG;
  const dL = (s.ly - p.ly0) / p.w0 - zero,
    dR = (s.ry - p.ry0) / p.w0 - zero;
  const q = (dL + dR) / 2;
  const u = Math.max(0, Math.min(1.5, q / p.amp));
  const scale = s.width / p.w0;
  const lateral = Math.abs((s.lx + s.rx) / 2 - p.cx0) / p.w0;
  const tilt = Math.abs(tiltOf(s) - p.tilt0);
  const checks: SquatChecks = {
    // 下降明显时两肩都要下降（允许少量噪声），且位移差不超过本人幅度的 45%
    sync: q < p.amp * 0.35 || (dL > -0.15 * p.amp && dR > -0.15 * p.amp && Math.abs(dL - dR) <= c.syncFrac * p.amp + 0.03),
    scale: scale >= (loose ? c.calWidthMin : c.widthMin) && scale <= (loose ? c.calWidthMax : c.widthMax),
    lateral: lateral <= (loose ? c.calLateralW : c.lateralW),
    tilt: tilt <= (loose ? c.calTiltRad : c.tiltRad),
  };
  const ok = checks.sync && checks.scale && checks.lateral && checks.tilt;
  return { dL, dR, q, u, checks, ok, scale, lateral, tilt };
}

const firstFailed = (c: SquatChecks): "" | keyof SquatChecks => (!c.sync ? "sync" : !c.scale ? "scale" : !c.lateral ? "lateral" : !c.tilt ? "tilt" : "");

function quantile(xs: number[], f: number) {
  if (!xs.length) return 0;
  const a = [...xs].sort((x, y) => x - y);
  return a[Math.min(a.length - 1, Math.max(0, Math.round((a.length - 1) * f)))];
}

export type SquatCalStage = "stand" | "squat" | "rise" | "ready";
export type SquatCalHint = "" | "still" | "deeper" | "checks" | "hold" | "lost";

/** 校准调试快照（界面与日志用） */
export interface SquatCalDiag {
  stage: SquatCalStage;
  /** 当前下降量（W0 单位） */
  q: number;
  /** 第二步需要达到的下降量 */
  minQ: number;
  /** 已在蹲位的时长 */
  downMs: number;
  /** 站立阶段当前晃动 / 允许晃动 */
  standRange: number;
  standLimit: number;
  failed: "" | keyof SquatChecks;
  /** 通过方式：held 停住 / cycle 来回 / rebase 站回超时重设基线 */
  passedBy: "" | "held" | "cycle";
  rebased: boolean;
  gapMs: number;
}

/** 校准：站直 2 秒 → 舒适浅蹲（停住或蹲下站起一个来回）→ 站回 */
export class SquatCalibrator {
  stage: SquatCalStage = "stand";
  progress = 0;
  profile: SquatProfile | null = null;
  /** 最近一次提示原因（给界面） */
  hint: SquatCalHint = "";
  /** 站立基线（站直阶段完成后可读，用于预览画线） */
  base: Omit<SquatProfile, "amp"> | null = null;
  diag: SquatCalDiag = { stage: "stand", q: 0, minQ: 0, downMs: 0, standRange: 0, standLimit: 0, failed: "", passedBy: "", rebased: false, gapMs: 0 };
  private buf: { t: number; s: SquatSample }[] = [];
  private lastT = -1;
  private qs: number | null = null;
  private seg: { t: number; q: number }[] = [];
  private segStart = -1;
  private failSince = -1;
  private amp = 0;
  private riseSince = -1;

  get minQ() {
    const c = SQUAT_CONFIG,
      b = this.base;
    if (!b) return c.minAmpW;
    const px = Math.max(c.minDropPx, c.jitterFactor * b.jitterPx);
    return Math.min(c.maxMinAmpW, Math.max(c.minAmpW, px / b.w0));
  }

  update(s: SquatSample | null, t: number) {
    const c = SQUAT_CONFIG;
    if (!s) {
      // 看不到双肩：短暂掉帧保留进度，超过容忍才从当前阶段头来（不借用推测点）
      const gap = this.lastT < 0 ? Infinity : t - this.lastT;
      this.diag.gapMs = Number.isFinite(gap) ? gap : 0;
      if (gap > c.calGapMs) {
        this.buf = [];
        this.seg = [];
        this.segStart = -1;
        this.riseSince = -1;
        this.qs = null;
        if (this.stage === "stand") this.progress = 0;
        this.hint = "lost";
      }
      return;
    }
    if (this.lastT >= 0 && t - this.lastT > c.calGapMs) {
      this.buf = [];
      this.seg = [];
      this.segStart = -1;
      this.qs = null;
    }
    const dt = this.lastT < 0 ? 33 : Math.max(1, Math.min(200, t - this.lastT));
    this.lastT = t;
    this.diag.gapMs = 0;
    if (this.hint === "lost") this.hint = "";
    if (this.stage === "stand") return this.updateStand(s, t);
    const base = this.base!;
    const probe: SquatProfile = { ...base, amp: 1 };
    const sig = squatSignal(s, probe, 0, true);
    this.qs = this.qs === null ? sig.q : this.qs + (sig.q - this.qs) * (1 - Math.exp(-dt / c.smoothTauMs));
    const q = this.qs;
    const minQ = this.minQ;
    this.diag.q = q;
    this.diag.minQ = minQ;
    if (this.stage === "squat") return this.updateSquat(q, sig, t, minQ);
    if (this.stage === "rise") {
      if (!sig.ok) { this.riseSince = -1; this.hint = "checks"; return; }
      return this.updateRise(q, t);
    }
  }

  private updateStand(s: SquatSample, t: number) {
    const c = SQUAT_CONFIG;
    this.buf.push({ t, s });
    while (this.buf.length && t - this.buf[0].t > c.standMs) this.buf.shift();
    const w = this.buf.reduce((a, b) => a + b.s.width, 0) / this.buf.length;
    const my = this.buf.map((b) => (b.s.ly + b.s.ry) / 2);
    const range = quantile(my, 0.9) - quantile(my, 0.1);
    const limit = Math.max(4, c.standStillW * w);
    this.diag.standRange = range;
    this.diag.standLimit = limit;
    if (range > limit) {
      // 晃动太大：只保留最近 30% 继续计时（不整段清零，减少反复重来）
      this.buf = this.buf.slice(Math.floor(this.buf.length * 0.7));
      this.hint = "still";
    } else this.hint = "";
    const span = this.buf.length > 1 ? t - this.buf[0].t : 0;
    this.progress = Math.min(1, span / c.standMs) * 0.4;
    if (span >= c.standMs * 0.95) {
      const avg = (k: keyof SquatSample) => this.buf.reduce((a, b) => a + b.s[k], 0) / this.buf.length;
      const mean = my.reduce((a, b) => a + b, 0) / my.length;
      const sd = Math.sqrt(my.reduce((a, b) => a + (b - mean) ** 2, 0) / my.length);
      if (c.jitterFactor * sd / w > c.maxMinAmpW) {
        this.buf = this.buf.slice(Math.floor(this.buf.length * 0.7));
        this.hint = "still"; return;
      }
      this.base = {
        ly0: avg("ly"),
        ry0: avg("ry"),
        cx0: (avg("lx") + avg("rx")) / 2,
        w0: avg("width"),
        tilt0: this.buf.reduce((a, b) => a + tiltOf(b.s), 0) / this.buf.length,
        jitterPx: sd,
      };
      this.stage = "squat";
      this.diag.stage = "squat";
      this.buf = [];
      this.progress = 0.4;
    }
  }

  private updateSquat(q: number, sig: ReturnType<typeof squatSignal>, t: number, minQ: number) {
    const c = SQUAT_CONFIG;
    // 校准时同步只看「两肩都在往下」，左右差异更宽松
    const checksOk = sig.checks.scale && sig.checks.lateral && sig.checks.tilt && sig.dL > -0.02 && sig.dR > -0.02;
    this.diag.failed = checksOk ? "" : sig.checks.scale ? (sig.checks.lateral ? (sig.checks.tilt ? "sync" : "tilt") : "lateral") : "scale";
    this.progress = 0.4 + Math.min(1, Math.max(0, q) / minQ) * 0.25 + (this.segStart >= 0 ? Math.min(1, (t - this.segStart) / c.bottomHoldMs) * 0.1 : 0);
    if (this.segStart < 0) {
      if (q >= minQ && checksOk) {
        this.segStart = t;
        this.seg = [{ t, q }];
        this.failSince = -1;
        this.hint = "";
      } else {
        this.hint = q >= minQ && !checksOk ? "checks" : q > minQ * 0.35 ? "deeper" : this.hint === "hold" ? "hold" : "";
      }
      this.diag.downMs = 0;
      return;
    }
    // 已在蹲位
    if (!checksOk) {
      if (this.failSince < 0) this.failSince = t;
      if (t - this.failSince > 250) {
        this.segStart = -1;
        this.seg = [];
        this.hint = "checks";
      }
      return;
    }
    this.failSince = -1;
    const downMs = t - this.segStart;
    this.diag.downMs = downMs;
    if (q < minQ * 0.5) {
      // 站起来了：一个完整来回也算数
      if (downMs >= c.cycleMinMs && this.seg.length >= 3) {
        const amp = Math.max(minQ, quantile(this.seg.map((x) => x.q), 0.8) * c.cycleAmpScale);
        this.pass(amp, "cycle", t);
      } else {
        this.segStart = -1;
        this.seg = [];
        this.hint = "hold";
      }
      return;
    }
    if (q >= minQ * 0.7) this.seg.push({ t, q });
    while (this.seg.length > 2 && t - this.seg[0].t > 1500) this.seg.shift();
    const win = this.seg.filter((x) => t - x.t <= c.bottomHoldMs).map((x) => x.q);
    if (downMs >= c.bottomHoldMs && win.length >= 3) {
      const med = quantile(win, 0.5);
      const range = Math.max(...win) - Math.min(...win);
      if (range <= Math.max(c.bottomHoldW, c.bottomHoldFrac * med) && med >= minQ) {
        this.amp = med;
        this.stage = "rise";
        this.diag.stage = "rise";
        this.diag.passedBy = "held";
        this.progress = 0.75;
        this.riseSince = -1;
      }
    }
  }

  private pass(amp: number, by: "held" | "cycle", t: number) {
    this.amp = amp;
    this.diag.passedBy = by;
    this.stage = "rise";
    this.diag.stage = "rise";
    this.progress = 0.75;
    this.riseSince = -1;
  }

  private updateRise(q: number, t: number) {
    const c = SQUAT_CONFIG;
    const u = q / this.amp;
    this.progress = 0.75 + Math.min(1, Math.max(0, 1 - u) / (1 - c.calReadyU)) * 0.25;
    if (u <= c.calReadyU) {
      if (this.riseSince < 0) this.riseSince = t;
      if (t - this.riseSince >= c.calReadyMs) return this.finish(0);
    } else this.riseSince = -1;
    // 不把尚未站回的中间姿态自动认成新的站姿；站位改变时由用户重新校准。
  }

  private finish(rebaseQ: number) {
    const base = this.base!;
    const dy = rebaseQ * base.w0;
    this.profile = { ...base, ly0: base.ly0 + dy, ry0: base.ry0 + dy, amp: this.amp };
    this.diag.rebased = rebaseQ !== 0;
    this.stage = "ready";
    this.diag.stage = "ready";
    this.progress = 1;
  }
}

/** 键盘演示用合成档案（不代表任何真人数据） */
export const DEMO_SQUAT_PROFILE: SquatProfile = {
  ly0: 200,
  ry0: 200,
  cx0: 320,
  w0: 160,
  tilt0: 0,
  amp: 0.3,
  jitterPx: 1,
};

export type SquatTracking = "ok" | "unstable" | "lost";
export type SquatPhase = "ready" | "down" | "rising";
export interface SquatUpdate {
  /** 连续值：本人幅度比例（0 站直 … 1 舒适浅蹲），已扣除基线漂移 */
  u: number;
  /** 检查项是否通过 */
  ok: boolean;
  phase: SquatPhase;
  /** 是否正在增加蓄力（已确认蹲位，且仍保持在蹲位） */
  charging: boolean;
  /** 本帧刚确认进入蹲位：控制器应补上确认等待的时长（秒） */
  enteredDownSec: number;
  /** 本帧刚确认站回：应释放跳跃 */
  release: boolean;
  /** 本帧因丢失 / 检查失败取消了未完成的蓄力 */
  cancel: boolean;
  tracking: SquatTracking;
  /** 失败的检查项（给界面提示） */
  failed: "" | keyof SquatChecks;
  /** 是否已「上膛」（站立区稳定，可以开始下一次蓄力） */
  armed: boolean;
  /** 调试：基线修正、本轮峰值、检查失败持续、释放方式 */
  zero: number;
  peakU: number;
  failMs: number;
  releasedBy: "" | "stand" | "settle";
}

/**
 * 游戏用状态机：READY → DOWN（确认蹲位后持续蓄力）→ 站回确认 → release。
 * 抖动跨过单一阈值不会反复触发：进入与释放都带迟滞和稳定时长。
 */
export class SquatSession {
  private lastSampleAt = -1;
  private q: number | null = null;
  private phase: SquatPhase = "ready";
  private downMs = 0;
  private upMs = 0;
  private lostMs = 0;
  private resumeMs = 0;
  private paused = false;
  private failMs = 0;
  private peakU = 0;
  /** 站立基线修正（q 单位） */
  private zero = 0;
  /** 站立区稳定后才允许下一次进入蹲位（防止落地后立刻二次触发） */
  private readyMs = 0;
  constructor(public profile: SquatProfile) {}
  /** 外部暂停（菜单 / 跳跃播放中）：清空进行中的循环 */
  reset() {
    this.phase = "ready";
    this.downMs = 0;
    this.upMs = 0;
    this.readyMs = 0;
    this.failMs = 0;
    this.peakU = 0;
    this.q = null;
    this.lastSampleAt = -1;
  }
  update(dtMs: number, s: SquatSample | null, sampleAt?: number): SquatUpdate {
    const c = SQUAT_CONFIG;
    let dt = Math.max(0, Math.min(100, dtMs));
    const thresholds = squatThresholds(this.profile);
    const amp = this.profile.amp;
    const out: SquatUpdate = {
      u: 0,
      ok: false,
      phase: this.phase,
      charging: false,
      enteredDownSec: 0,
      release: false,
      cancel: false,
      tracking: "ok",
      failed: "",
      armed: false,
      zero: this.zero,
      peakU: this.peakU,
      failMs: this.failMs,
      releasedBy: "",
    };
    if (!s) {
      this.lostMs += dt;
      this.resumeMs = 0;
      out.u = this.q === null ? 0 : Math.max(0, (this.q - this.zero) / amp);
      if (this.lostMs > c.lostPauseMs) {
        if (this.phase !== "ready") out.cancel = true;
        this.paused = true;
        this.reset();
        this.q = null;
        out.tracking = "lost";
      } else out.tracking = "unstable";
      out.phase = this.phase;
      return out;
    }
    // 重复的同一推理帧可维持画面，不能重复累计稳定证据。
    if (sampleAt !== undefined) {
      if (sampleAt <= this.lastSampleAt) {
        out.u = this.q === null ? 0 : Math.max(0, (this.q - this.zero) / amp);
        out.ok = this.failMs === 0 && !this.paused;
        out.charging = this.phase === "down" && out.ok;
        out.armed = this.phase === "ready" && this.readyMs >= c.rearmMs;
        out.tracking = this.paused ? "unstable" : "ok";
        return out;
      }
      dt = this.lastSampleAt < 0 ? Math.min(dt, 33) : Math.max(0, Math.min(150, sampleAt - this.lastSampleAt));
      this.lastSampleAt = sampleAt;
    }
    this.lostMs = 0;
    const sig = squatSignal(s, this.profile, this.zero);
    const rawQ = sig.q + this.zero;
    this.q = this.q === null ? rawQ : this.q + (rawQ - this.q) * (1 - Math.exp(-dt / c.smoothTauMs));
    const u = Math.max(0, (this.q - this.zero) / amp);
    out.u = u;
    out.ok = sig.ok;
    out.failed = firstFailed(sig.checks);
    // 站立基线自适应：只在站立区、检查通过、非蹲位时缓慢跟随（不追蹲位）
    const uSigned = (this.q - this.zero) / amp;
    if (this.phase === "ready" && sig.ok && Math.abs(uSigned) < thresholds.readyU && this.downMs === 0) {
      const k = 1 - Math.exp(-dt / c.baselineTauMs);
      this.zero += (this.q - this.zero) * k;
      this.zero = Math.max(-c.baselineMaxU * amp, Math.min(c.baselineMaxU * amp, this.zero));
    }
    out.zero = this.zero;
    if (this.paused) {
      // 重现后先稳定一会儿，并要求回到站立区才恢复
      out.tracking = "unstable";
      this.resumeMs = u <= thresholds.readyU && sig.ok ? this.resumeMs + dt : 0;
      if (this.resumeMs >= c.resumeMs) {
        this.paused = false;
        this.readyMs = c.rearmMs;
      }
      return out;
    }
    if (this.phase === "ready") {
      // 站立区累计满 rearmMs 即「上膛」；下蹲途经中间区不会撤销
      if (u <= thresholds.readyU && sig.ok) this.readyMs += dt;
      else if (!sig.ok) this.readyMs = 0;
      const armed = this.readyMs >= c.rearmMs;
      if (u >= thresholds.downU && sig.ok && armed) {
        this.downMs += dt;
        if (this.downMs >= c.downStableMs) {
          this.phase = "down";
          out.enteredDownSec = this.downMs / 1000;
          this.downMs = 0;
          this.readyMs = 0;
          this.peakU = u;
          this.failMs = 0;
        }
      } else this.downMs = 0;
    } else if (this.phase === "down") {
      this.peakU = Math.max(this.peakU, u);
      if (!sig.ok) {
        // 检查失败（弯腰前探 / 侧倾 / 横移）持续一段时间：取消本轮，不跳
        this.failMs += dt;
        if (this.failMs >= c.checkFailMs) {
          out.cancel = true;
          this.reset();
        }
      } else {
        this.failMs = 0;
        if (u < thresholds.holdU) {
          this.phase = "rising";
          this.upMs = 0;
        }
      }
    } else {
      // 回升中：蓄力冻结；回到站立区稳定后释放，若又蹲回去则继续蓄力
      if (!sig.ok) {
        this.upMs = 0; this.failMs += dt;
        if (this.failMs >= c.checkFailMs) { out.cancel = true; this.reset(); }
      } else if (u >= thresholds.downU) {
        this.phase = "down";
        this.upMs = 0;
      } else if (u <= thresholds.releaseU) {
        this.failMs = 0;
        this.upMs += dt;
        if (this.upMs >= c.releaseStableMs) this.doRelease(out, "stand");
      } else {
        this.upMs = 0;
        this.failMs = 0;
      }
    }
    out.phase = this.phase;
    out.charging = this.phase === "down" && sig.ok;
    out.armed = this.phase === "ready" && this.readyMs >= c.rearmMs;
    out.peakU = this.peakU;
    out.failMs = this.failMs;
    out.zero = this.zero;
    return out;
  }
  private doRelease(out: SquatUpdate, by: "stand" | "settle") {
    out.release = true;
    out.releasedBy = by;
    this.phase = "ready";
    this.upMs = 0;
    this.readyMs = 0;
  }
}

/** 真人调试日志（环形缓冲，只存数值，不存画面）。window.__g05debug 可读 / 复制 */
export interface SquatLogRow {
  t: number;
  src: "cal" | "game";
  [k: string]: number | string | boolean;
}
export const squatDebugLog = {
  rows: [] as SquatLogRow[],
  max: 3000,
  push(r: SquatLogRow) {
    this.rows.push(r);
    if (this.rows.length > this.max) this.rows.splice(0, this.rows.length - this.max);
  },
  clear() {
    this.rows = [];
  },
  dump() {
    return JSON.stringify(this.rows);
  },
};
if (typeof window !== "undefined") (window as unknown as { __g05debug?: typeof squatDebugLog }).__g05debug = squatDebugLog;

/** 调试开关：URL ?g05debug=1，或在 G05 页按 D 切换（存 localStorage） */
/** 调试只在开发构建或带 ?g05debug=1 的地址可用；正式展示按 D 不会弹出开发信息 */
export function squatDebugAllowed() {
  if (typeof window === "undefined") return false;
  try {
    if (import.meta.env?.DEV) return true;
    return new URLSearchParams(window.location.search).has("g05debug");
  } catch {
    return false;
  }
}
export function squatDebugEnabled() {
  if (typeof window === "undefined") return false;
  try {
    if (new URLSearchParams(window.location.search).get("g05debug") === "1") return true;
    if (!squatDebugAllowed()) return false;
    return window.localStorage.getItem("yukee.g05debug") === "1";
  } catch {
    return false;
  }
}
export function setSquatDebug(on: boolean) {
  try {
    window.localStorage.setItem("yukee.g05debug", on ? "1" : "0");
  } catch {
    /* 忽略 */
  }
}
