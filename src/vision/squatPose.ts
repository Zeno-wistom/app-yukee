import type { PoseFrame } from "./wingPose";

/**
 * G05 浅蹲识别：只看 MediaPipe 左右肩（11 / 12）在固定画面里的图像高度。
 * 依据《电脑端动作游戏完整交互与设计方案 10.21 V2》第 17–19 节：
 *   q = ((L.y − L0.y) + (R.y − R0.y)) / 2 / W0，u = clamp(q / A, 0, 1)
 *   站直 2 秒得到 L0 / R0 / W0；一次舒适浅蹲得到本人幅度 A。
 *   两肩同步、肩宽尺度、横向偏移、侧倾四项检查不通过时不蓄力。
 * 这是「与浅蹲配合的上身下降回升」信号，不是膝关节动作质量评估；
 * 弯腰也可能让双肩下降，正面单摄像头无法严格区分。
 * 不使用相对髋部的世界坐标（会抵消整体下降）。所有阈值均为展前起测值，需真人校正。
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
  minVisibility: 0.65,
  /** 站立基线采集时长 */
  standMs: 2000,
  /** 站立期间允许的最大抖动（以肩宽计） */
  standStillW: 0.06,
  /** 校准浅蹲：最小有效下降 max(12px, 6×抖动)，并且不小于 0.08 W0 */
  minDropPx: 12,
  jitterFactor: 6,
  minAmpW: 0.08,
  /** 浅蹲到底：0.5 秒内变化很小视为停住 */
  bottomStillMs: 500,
  bottomStillW: 0.04,
  /** 游戏判定（u 为本人幅度的比例） */
  readyU: 0.2,
  downU: 0.65,
  /** 已在蹲位时，u 回升到这里以下停止增加蓄力（保持区间带迟滞） */
  holdU: 0.5,
  releaseU: 0.25,
  downStableMs: 300,
  releaseStableMs: 220,
  /** 检查项 */
  syncFrac: 0.3,
  widthMin: 0.8,
  widthMax: 1.2,
  lateralW: 0.25,
  tiltRad: (10 * Math.PI) / 180,
  /** 短暂缺点冻结；超过即暂停并取消本轮蓄力 */
  lostPauseMs: 300,
  /** 重现后稳定多久才恢复 */
  resumeMs: 1000,
  /** q 的平滑时间常数 */
  smoothTauMs: 70,
} as const;

export function measureSquat(frame: PoseFrame | null, minVisibility: number = SQUAT_CONFIG.minVisibility): SquatSample | null {
  if (!frame) return null;
  const W = frame.videoWidth || 640,
    H = frame.videoHeight || 480;
  const l = frame.landmarks[11],
    r = frame.landmarks[12];
  if (!l || !r) return null;
  if ((l.visibility ?? 0) < minVisibility || (r.visibility ?? 0) < minVisibility) return null;
  const width = Math.hypot((l.x - r.x) * W, (l.y - r.y) * H);
  if (width < Math.max(24, W * 0.05)) return null;
  return { ly: l.y * H, ry: r.y * H, lx: l.x * W, rx: r.x * W, width, videoH: H };
}

const tiltOf = (s: SquatSample) => Math.atan2(s.ry - s.ly, Math.abs(s.lx - s.rx));

/** 原始下降量与检查项 */
export function squatSignal(s: SquatSample, p: SquatProfile) {
  const dL = (s.ly - p.ly0) / p.w0,
    dR = (s.ry - p.ry0) / p.w0;
  const q = (dL + dR) / 2;
  const u = Math.max(0, Math.min(1.2, q / p.amp));
  const c = SQUAT_CONFIG;
  const scale = s.width / p.w0;
  const lateral = Math.abs((s.lx + s.rx) / 2 - p.cx0) / p.w0;
  const tilt = Math.abs(tiltOf(s) - p.tilt0);
  const checks = {
    // 两肩都要下降（u 较大时才检查），且位移差不超过本人幅度的 30%
    sync: q < p.amp * 0.3 || (dL > 0 && dR > 0 && Math.abs(dL - dR) <= c.syncFrac * p.amp + 0.02),
    scale: scale >= c.widthMin && scale <= c.widthMax,
    lateral: lateral <= c.lateralW,
    tilt: tilt <= c.tiltRad,
  };
  const ok = checks.sync && checks.scale && checks.lateral && checks.tilt;
  return { dL, dR, q, u, checks, ok };
}

export type SquatCalStage = "stand" | "squat" | "rise" | "ready";

/** 校准：站直 2 秒 → 舒适浅蹲并停住 → 站回 */
export class SquatCalibrator {
  stage: SquatCalStage = "stand";
  progress = 0;
  profile: SquatProfile | null = null;
  /** 最近一次提示原因（给界面） */
  hint: "" | "still" | "deeper" | "checks" = "";
  private buf: { t: number; s: SquatSample }[] = [];
  /** 站立基线（站直阶段完成后可读，用于预览画线） */
  base: Omit<SquatProfile, "amp"> | null = null;
  private bottom: { t: number; q: number }[] = [];
  private amp = 0;
  private riseSince = 0;

  update(s: SquatSample | null, t: number) {
    const c = SQUAT_CONFIG;
    if (!s) {
      // 看不到双肩：当前阶段从头来（不借用推测点）
      this.buf = [];
      this.bottom = [];
      if (this.stage === "stand") this.progress = 0;
      return;
    }
    if (this.stage === "stand") {
      this.buf.push({ t, s });
      while (this.buf.length && t - this.buf[0].t > c.standMs) this.buf.shift();
      const w = this.buf.reduce((a, b) => a + b.s.width, 0) / this.buf.length;
      const my = this.buf.map((b) => (b.s.ly + b.s.ry) / 2);
      const mean = my.reduce((a, b) => a + b, 0) / my.length;
      const sd = Math.sqrt(my.reduce((a, b) => a + (b - mean) ** 2, 0) / my.length);
      const range = Math.max(...my) - Math.min(...my);
      if (range > c.standStillW * w) {
        // 晃动太大：只保留最新一帧重新计时
        this.buf = [{ t, s }];
        this.hint = "still";
      } else this.hint = "";
      const span = this.buf.length > 1 ? t - this.buf[0].t : 0;
      this.progress = Math.min(1, span / c.standMs) * 0.4;
      if (span >= c.standMs * 0.98) {
        const avg = (k: keyof SquatSample) => this.buf.reduce((a, b) => a + b.s[k], 0) / this.buf.length;
        this.base = {
          ly0: avg("ly"),
          ry0: avg("ry"),
          cx0: (avg("lx") + avg("rx")) / 2,
          w0: avg("width"),
          tilt0: this.buf.reduce((a, b) => a + tiltOf(b.s), 0) / this.buf.length,
          jitterPx: sd,
        };
        this.stage = "squat";
        this.buf = [];
      }
      return;
    }
    const base = this.base!;
    const probe: SquatProfile = { ...base, amp: 1 };
    const sig = squatSignal(s, probe);
    const minDropPx = Math.max(c.minDropPx, c.jitterFactor * base.jitterPx);
    const minQ = Math.max(c.minAmpW, minDropPx / base.w0);
    if (this.stage === "squat") {
      const checksOk = sig.checks.scale && sig.checks.lateral && sig.checks.tilt && sig.dL > 0 && sig.dR > 0;
      this.progress = 0.4 + Math.min(1, Math.max(0, sig.q) / minQ) * 0.3;
      if (sig.q < minQ || !checksOk) {
        this.bottom = [];
        this.hint = sig.q >= minQ && !checksOk ? "checks" : sig.q > minQ * 0.4 ? "deeper" : "";
        return;
      }
      this.hint = "";
      this.bottom.push({ t, q: sig.q });
      while (this.bottom.length && t - this.bottom[0].t > c.bottomStillMs) this.bottom.shift();
      const qs = this.bottom.map((b) => b.q);
      if (Math.max(...qs) - Math.min(...qs) > c.bottomStillW) {
        this.bottom = [{ t, q: sig.q }];
        return;
      }
      if (t - this.bottom[0].t >= c.bottomStillMs * 0.95) {
        qs.sort((a, b) => a - b);
        this.amp = qs[Math.floor(qs.length / 2)];
        this.stage = "rise";
        this.progress = 0.75;
      }
      return;
    }
    if (this.stage === "rise") {
      const u = sig.q / this.amp;
      this.progress = 0.75 + Math.min(1, Math.max(0, 1 - u) / (1 - c.readyU)) * 0.25;
      if (u <= c.readyU) {
        if (!this.riseSince) this.riseSince = t;
        if (t - this.riseSince >= 400) {
          this.profile = { ...base, amp: this.amp };
          this.stage = "ready";
          this.progress = 1;
        }
      } else this.riseSince = 0;
    }
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
  /** 连续值：本人幅度比例（0 站直 … 1 舒适浅蹲） */
  u: number;
  /** 检查项是否通过 */
  ok: boolean;
  phase: SquatPhase;
  /** 是否正在增加蓄力（已确认蹲位，且仍保持在蹲位） */
  charging: boolean;
  /** 本帧刚确认站回：应释放跳跃 */
  release: boolean;
  /** 本帧因丢失 / 检查失败取消了未完成的蓄力 */
  cancel: boolean;
  tracking: SquatTracking;
  /** 失败的检查项（给界面提示） */
  failed: "" | "sync" | "scale" | "lateral" | "tilt";
}

/**
 * 游戏用状态机：READY → DOWN（确认蹲位后持续蓄力）→ 站回确认 → release。
 * 抖动跨过单一阈值不会反复触发：进入与释放都带迟滞和稳定时长。
 */
export class SquatSession {
  private q: number | null = null;
  private phase: SquatPhase = "ready";
  private downMs = 0;
  private upMs = 0;
  private lostMs = 0;
  private resumeMs = 0;
  private paused = false;
  /** 站立区稳定后才允许下一次进入蹲位（防止落地后立刻二次触发） */
  private readyMs = 0;
  constructor(public profile: SquatProfile) {}
  /** 外部暂停（菜单 / 跳跃播放中）：清空进行中的循环 */
  reset() {
    this.phase = "ready";
    this.downMs = 0;
    this.upMs = 0;
    this.readyMs = 0;
  }
  update(dtMs: number, s: SquatSample | null): SquatUpdate {
    const c = SQUAT_CONFIG;
    const dt = Math.max(0, Math.min(100, dtMs));
    const out: SquatUpdate = { u: 0, ok: false, phase: this.phase, charging: false, release: false, cancel: false, tracking: "ok", failed: "" };
    if (!s) {
      this.lostMs += dt;
      this.resumeMs = 0;
      out.u = this.q === null ? 0 : Math.max(0, this.q / this.profile.amp);
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
    this.lostMs = 0;
    const sig = squatSignal(s, this.profile);
    this.q = this.q === null ? sig.q : this.q + (sig.q - this.q) * (1 - Math.exp(-dt / c.smoothTauMs));
    const u = Math.max(0, this.q / this.profile.amp);
    out.u = u;
    out.ok = sig.ok;
    out.failed = sig.ok ? "" : !sig.checks.sync ? "sync" : !sig.checks.scale ? "scale" : !sig.checks.lateral ? "lateral" : "tilt";
    if (this.paused) {
      // 重现后先稳定约 1 秒，并要求回到站立区才恢复
      out.tracking = "unstable";
      this.resumeMs = u <= c.readyU && sig.ok ? this.resumeMs + dt : 0;
      if (this.resumeMs >= c.resumeMs) {
        this.paused = false;
        this.readyMs = c.resumeMs;
      }
      return out;
    }
    if (this.phase === "ready") {
      // 站立区累计满 200ms 即「上膛」；下蹲途经中间区不会撤销
      if (u <= c.readyU) this.readyMs += dt;
      if (u >= c.downU && sig.ok && this.readyMs >= 200) {
        this.downMs += dt;
        if (this.downMs >= c.downStableMs) {
          this.phase = "down";
          this.downMs = 0;
          this.readyMs = 0;
        }
      } else this.downMs = 0;
    } else if (this.phase === "down") {
      if (!sig.ok) {
        // 检查失败（弯腰前探 / 侧倾 / 横移）：取消本轮，不跳
        out.cancel = true;
        this.reset();
      } else if (u < c.holdU) this.phase = "rising";
    } else {
      // 回升中：蓄力冻结；回到站立区稳定后释放，若又蹲回去则继续蓄力
      if (u >= c.downU && sig.ok) {
        this.phase = "down";
        this.upMs = 0;
      } else if (u <= c.releaseU) {
        this.upMs += dt;
        if (this.upMs >= c.releaseStableMs) {
          out.release = true;
          this.phase = "ready";
          this.upMs = 0;
          this.readyMs = 0;
        }
      } else this.upMs = 0;
    }
    out.phase = this.phase;
    out.charging = this.phase === "down";
    return out;
  }
}
