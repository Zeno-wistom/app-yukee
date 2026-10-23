/**
 * 各游戏的「状态变化 → 音效」规则（纯逻辑，可单测）。
 *
 * 原则：只在状态跃迁时发声，绝不跟着每一帧姿态更新发声；
 * 每条规则自带冷却与连发合并，识别抖动不会变成音效连发。
 * 发声本身交给注入的 sink（生产环境是 audioEngine）。
 */
import type { SampleId } from "./catalog";

export interface PlayOpts {
  rate?: number;
  gain?: number;
  /** 相对现在的延迟（秒） */
  at?: number;
}

export interface CueSink {
  play(id: SampleId, opts?: PlayOpts): void;
  /** 合成音（无文件）：轻量气流声、刻度音、释放声 */
  synth(kind: "whoosh" | "tick" | "release" | "spark", opts?: PlayOpts & { freq?: number }): void;
  duck(factor: number, holdSec: number): void;
}

/** 大调五声音阶（相对倍率），连续收集时逐级上行，听起来是旋律而不是噪声叠加 */
export const PENTATONIC = [1, 1.122, 1.26, 1.498, 1.682, 2];

const now = () => (typeof performance !== "undefined" ? performance.now() : Date.now());

// ---------------------------------------------------------------
// G02 展翼接光
// ---------------------------------------------------------------
export class WingCues {
  private stage: "ready" | "open" | "return" = "ready";
  private lastStar = -1e9;
  private starStep = 0;
  private starsInBurst = 0;
  private done = false;
  constructor(private sink: CueSink, private clock: () => number = now) {}

  /** 每帧调用也安全：只有阶段跃迁才发声 */
  stageChanged(stage: "ready" | "open" | "return", trackingOk: boolean) {
    const prev = this.stage;
    this.stage = stage;
    if (prev === stage || !trackingOk || this.done) return;
    if (stage === "open") this.sink.play("g02-wing-open");
    else if (prev === "open") this.sink.play("g02-wing-close");
  }

  /** 一颗星光被帆面吸收 */
  star() {
    if (this.done) return;
    const t = this.clock();
    const gap = t - this.lastStar;
    if (gap < 75) return; // 同一帧/相邻帧到达的合并成一次
    if (gap < 700) {
      this.starStep = Math.min(PENTATONIC.length - 1, this.starStep + 1);
      this.starsInBurst++;
    } else {
      this.starStep = 0;
      this.starsInBurst = 0;
    }
    this.lastStar = t;
    // 连续吸收逐级升调，但音量随连发轻微下降，避免越叠越刺耳
    this.sink.play("g02-star", {
      rate: PENTATONIC[this.starStep],
      gain: Math.max(0.55, 1 - this.starsInBurst * 0.08),
    });
  }

  /** 完成一次「展开→保持→回位」，星光汇入灯芯 */
  gathered(reps: number) {
    if (this.done) return;
    const i = Math.max(0, Math.min(PENTATONIC.length - 1, reps - 1));
    this.sink.play("g02-gather", { rate: PENTATONIC[i] });
  }

  complete() {
    if (this.done) return;
    this.done = true;
    this.sink.duck(0.35, 2.4);
    this.sink.play("g02-complete", { at: 0.05 });
  }
}

// ---------------------------------------------------------------
// G03 躯干重心冲浪
// ---------------------------------------------------------------
export interface LeanCueState {
  arrived: boolean;
  returning: boolean;
  reps: number;
  target: -1 | 1;
  complete: boolean;
  tracking: "ok" | "unstable" | "lost";
}

export class LeanCues {
  private prev: LeanCueState | null = null;
  private lastCatch = -1e9;
  private streak = 0;
  private lastLean = -1e9;
  private lastCenter = -1e9;
  constructor(private sink: CueSink, private clock: () => number = now) {}

  update(s: LeanCueState) {
    const p = this.prev;
    this.prev = { ...s };
    if (!p) return;
    const t = this.clock();
    if (s.complete && !p.complete) {
      this.sink.duck(0.35, 2.6);
      this.sink.play("g03-complete", { at: 0.05 });
      return;
    }
    if (s.complete) return;
    if (s.reps > p.reps) {
      // 两次接住间隔 7 秒内算连续；每第三次给一段更完整的奖励乐句
      this.streak = t - this.lastCatch < 7000 ? this.streak + 1 : 1;
      this.lastCatch = t;
      if (this.streak > 0 && this.streak % 3 === 0) this.sink.play("g03-streak");
      else this.sink.play("g03-catch", { rate: 1 + Math.min(this.streak - 1, 2) * 0.06 });
      return;
    }
    if (s.tracking !== "ok") return;
    // 侧倾到位：很轻的拨弦，左低右高帮助判断方向
    if (s.arrived && !p.arrived && t - this.lastLean > 500) {
      this.lastLean = t;
      this.sink.play("g03-lean", { rate: s.target < 0 ? 0.94 : 1.06 });
    }
    // 接住后越过中线：重心回正，一声柔和的浪花气流
    if (p.returning && !s.returning && t - this.lastCenter > 600) {
      this.lastCenter = t;
      this.sink.synth("whoosh", { gain: 0.5 });
    }
  }
}

// ---------------------------------------------------------------
// G05 浅蹲跳一跳
// ---------------------------------------------------------------
/** 蓄力阶段刻度：25 / 50 / 75 / 100%；C5 E5 G5 C6 */
export const CHARGE_STEPS = [0.25, 0.5, 0.75, 1];
const STEP_FREQ = [523.25, 659.25, 783.99, 1046.5];

export class SquatCues {
  private step = 0;
  private inBand = false;
  private charging = false;
  constructor(private sink: CueSink) {}

  chargeStart() {
    this.charging = true;
    this.step = 0;
    this.inBand = false;
    this.sink.synth("tick", { freq: 392, gain: 0.5 });
  }

  /** level 是实际蓄力值 / 满格（与蓄力条同一个数），只在越过刻度时发声 */
  chargeLevel(level: number, band: { lo: number; hi: number } | null) {
    if (!this.charging) return;
    let step = 0;
    while (step < CHARGE_STEPS.length && level >= CHARGE_STEPS[step] - 1e-6) step++;
    if (step > this.step) {
      this.sink.synth("tick", { freq: STEP_FREQ[step - 1], gain: 0.55 + step * 0.08 });
    }
    // 蓄力条的回退（摄像头起身回退 0.15 s）不会让刻度重复响
    this.step = Math.max(this.step, step);
    const inside = !!band && band.hi > band.lo && level >= band.lo && level <= band.hi;
    if (inside && !this.inBand) this.sink.synth("spark", { gain: 0.7 });
    this.inBand = inside;
  }

  chargeCancel() {
    this.charging = false;
    this.step = 0;
    this.inBand = false;
  }

  /** 站起释放（起跳音由引擎原有 g05Launch 合成，力度随蓄力） */
  release() {
    this.chargeCancel();
    this.sink.synth("release", { gain: 0.8 });
  }

  landed(kind: string, combo: number) {
    if (kind === "perfect") this.sink.play("g05-perfect", { at: 0.04 });
    else this.sink.play("g05-score", { at: 0.04 });
    // combo = 连续「完美」次数（jumpLogic 的连击计分）；第二次起给逐级上行的连击乐句
    if (kind === "perfect" && combo >= 2)
      this.sink.play("g05-streak", { at: 0.32, rate: PENTATONIC[Math.min(PENTATONIC.length - 1, combo - 2)] });
  }

  fail() {
    this.chargeCancel();
    this.sink.duck(0.55, 1.2);
    this.sink.play("g05-fail", { at: 0.35 });
  }

  complete() {
    this.sink.duck(0.35, 2.4);
    this.sink.play("g05-complete", { at: 0.15 });
  }

  restart() {
    this.chargeCancel();
    this.sink.play("g05-restart");
  }
}
