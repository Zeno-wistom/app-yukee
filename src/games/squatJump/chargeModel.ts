/**
 * G05 摄像头蓄力模型（只用于摄像头；键盘演示仍是「按住多久 = 蓄力多久」）。
 *
 * 诊断（scripts/g05-feel-sim.ts，模拟动作）：旧版摄像头蓄力 = 在蹲位的墙钟时间（含确认等待），
 * 与按键同速 1:1。一次自然的浅蹲来回本身就在蹲位约 0.8–1.2 秒，而 80% 的目标只需要 0.5–0.95 秒，
 * 身体又无法像手指一样精确掐 ±0.2 秒，所以「稍微蹲一下」就跳过头；蹲多深也完全不影响距离。
 *
 * 新模型：
 * - 蓄力速度 < 1：在蹲位 1 秒 ≈ 0.39–0.77 秒按键蓄力，常见目标需要停留约 1–1.6 秒，可控；
 * - 速度随下蹲幅度增加（0.55×→1.1×），蹲得深蓄得快，动作与距离有直观对应；
 * - 前 0.3 秒缓入，抖一下、点一下头只会产生很小的蓄力（结果为「留在原台」，不扣分）；
 * - 上限 1.3 秒（≈ 5.0 世界单位），比最远目标多一点即可，不再允许 1.5 秒的极端过冲；
 * - 旧版站起途中只要 u 还高于 holdU 就继续以 1:1 蓄力（约 +0.3 秒），这才是「看到差不多了站起来仍然跳过头」的主因；
 *   现在一旦 u 比本轮峰值回落 max(0.12, 20%) 就冻结，站回确认时间也不计入。
 */
import { squatThresholds, type SquatProfile, type SquatUpdate } from "../../vision/squatPose";

export const CAMERA_CHARGE = {
  /** 满幅（u≈1，本人校准幅度）时每秒蓄力 */
  rate: 0.7,
  /** 刚过进入门槛时的速度比例；随幅度线性升到 1，最多到 maxDepthGain */
  minDepthGain: 0.55,
  maxDepthGain: 1.1,
  /** 缓入：前 easeSec 秒速度从 easeFloor 升到 1 */
  easeSec: 0.3,
  easeFloor: 0.35,
  /** 进入确认前的等待只按此比例计入 */
  entryCredit: 0.5,
  /** 摄像头蓄力上限（键盘秒） */
  maxCharge: 1.3,
  /** 回升冻结：低于本轮峰值多少即停止累计 */
  riseFreezeAbs: 0.12,
  riseFreezeFrac: 0.2,
  /** 冻结时回退到这么久之前的蓄力：抵消「看到 → 起身 → 识别到回落」的延迟 */
  rollbackSec: 0.15,
  /** 少于此值站起视为误触：不起跳 */
  minJump: 0.14,
} as const;

/** 下蹲幅度 → 速度倍率（u 为本人幅度 A 的比例） */
export function depthGain(u: number, downU: number) {
  const c = CAMERA_CHARGE;
  const k = Math.max(0, (u - downU) / Math.max(0.05, 1 - downU));
  return Math.min(c.maxDepthGain, c.minDepthGain + (1 - c.minDepthGain) * k);
}

export class CameraCharge {
  charge = 0;
  /** 当前每秒蓄力（调试显示） */
  rate = 0;
  heldSec = 0;
  /** 本轮最深 u；开始回升（低于峰值一定量）即冻结，所见即所得 */
  peakU = 0;
  /** 是否因开始回升而冻结（调试） */
  frozen = false;
  private active = false;
  private hist: { t: number; c: number }[] = [];
  private wasFrozen = false;
  reset() {
    this.hist = [];
    this.wasFrozen = false;
    this.peakU = 0;
    this.frozen = false;
    this.charge = 0;
    this.rate = 0;
    this.heldSec = 0;
    this.active = false;
  }
  step(dt: number, upd: SquatUpdate, profile: SquatProfile) {
    const c = CAMERA_CHARGE;
    const downU = squatThresholds(profile).downU;
    if (upd.cancel) {
      this.reset();
      return this;
    }
    if (upd.enteredDownSec > 0 && !this.active) {
      this.active = true;
      this.heldSec = upd.enteredDownSec;
      this.charge = upd.enteredDownSec * c.rate * c.minDepthGain * c.easeFloor * c.entryCredit * 2;
    }
    if (upd.charging) this.peakU = Math.max(this.peakU, upd.u);
    // 已开始站起：u 比本轮峰值低出 max(0.12, 20% 峰值) 后不再累计（站起途中仍在蹲位的那段不再算）
    this.frozen = upd.charging && upd.u < this.peakU - Math.max(c.riseFreezeAbs, c.riseFreezeFrac * this.peakU);
    if (this.frozen && !this.wasFrozen) {
      // 刚开始站起：回退到 rollbackSec 之前的蓄力
      const tCut = this.heldSec - c.rollbackSec;
      for (let i = this.hist.length - 1; i >= 0; i--)
        if (this.hist[i].t <= tCut) {
          this.charge = Math.min(this.charge, this.hist[i].c);
          break;
        }
    }
    this.wasFrozen = this.frozen;
    if (upd.charging && !this.frozen) {
      this.active = true;
      const ease = Math.min(1, c.easeFloor + ((1 - c.easeFloor) * this.heldSec) / c.easeSec);
      this.rate = c.rate * depthGain(upd.u, downU) * ease;
      this.charge = Math.min(c.maxCharge, this.charge + dt * this.rate);
      this.heldSec += dt;
      this.hist.push({ t: this.heldSec, c: this.charge });
      if (this.hist.length > 90) this.hist.shift();
    } else this.rate = 0;
    if (upd.release) this.active = false;
    return this;
  }
}
