/**
 * 手势切换检测器（纯逻辑，可单元测试）。
 *
 * 信号：MediaPipe HandLandmarker 输出 `palmX ∈ 0~1`（未镜像画面坐标，
 * 用户向自己左侧挥手时画面内手影 x 增大）。
 *
 * 设计要点（对应产品需求 §五）：
 * 1. 只判断「手掌存在 + 水平位移方向 + 速度」三个原子条件，
 *    不做手势分类，避免过度识别带来的误触。
 * 2. 滑动判定基于短窗口轨迹：取窗口内首尾样本算 dx，
 *    需同时满足 ｜dx｜ ≥ minDistance 且平均速度 ≥ minVelocity。
 * 3. 防连发三件套：
 *    - cooldown：两次触发最短间隔
 *    - armed：触发后必须「手掌回到中间区域」或离场后重新出现才重新武装
 *      （对应需求：一直把手放在一边不会连续触发）
 *    - 丢帧保护：手掌离场超 maxGapMs 自动清空轨迹
 * 4. 一次明显拨动只切一个游戏；轻微抖动因位移/速度不足被过滤。
 *
 * 方向约定：dx < 0（手向画面左移动）→ "left"；dx > 0 → "right"。
 * 适配层把 "left" 映射为 next、"right" 映射为 prev，
 * 与视觉上「卡片被推向左边、右侧卡片补位」一致。
 */
export type SwipeDirection = "left" | "right";
export interface HandSwipeConfig {
  /** 窗口内首尾水平位移阈值（归一化 0~1） */
  minDistance: number;
  /** 平均速度阈值（单位/秒） */
  minVelocity: number;
  /** 参与首末相减的窗口长度（ms） */
  windowMs: number;
  /** 手掌丢失最大容忍时长（ms），超过即清空轨迹 */
  maxGapMs: number;
  /** 触发后手掌需回到 |palmX-0.5| < resetZone 才重新武装 */
  resetZone: number;
  /** 两次触发最短间隔（ms）；到期也会重新武装 */
  cooldownMs: number;
}
export const defaultHandSwipeConfig: HandSwipeConfig = {
  minDistance: 0.16,
  minVelocity: 0.5,
  windowMs: 380,
  maxGapMs: 220,
  resetZone: 0.09,
  cooldownMs: 520,
};
interface Sample {
  t: number;
  x: number;
}
export class HandSwipeDetector {
  private samples: Sample[] = [];
  private lastFire = -Infinity;
  private armed = true;
  constructor(private config: Partial<HandSwipeConfig> = {}) {}
  setConfig(patch: Partial<HandSwipeConfig>) {
    this.config = { ...this.config, ...patch };
  }
  reset() {
    this.samples = [];
    this.lastFire = -Infinity;
    this.armed = true;
  }
  get isArmed() {
    return this.armed;
  }
  update(
    handPresent: boolean,
    palmX: number,
    now: number,
  ): SwipeDirection | null {
    const cfg = { ...defaultHandSwipeConfig, ...this.config };
    if (!handPresent || palmX === null || Number.isNaN(palmX)) {
      this.samples.length = 0;
      if (!this.armed && now - this.lastFire >= cfg.cooldownMs)
        this.armed = true;
      return null;
    }
    // 回中 → 重新武装；停在一侧时，cooldown 到期也不能自行解锁。
    if (!this.armed && Math.abs(palmX - 0.5) < cfg.resetZone)
      this.armed = true;
    // 轨迹维护：离场清空 + 滑窗裁剪
    const last = this.samples[this.samples.length - 1];
    if (last && now - last.t > cfg.maxGapMs) this.samples.length = 0;
    this.samples.push({ t: now, x: palmX });
    while (this.samples.length > 2 && now - this.samples[0].t > cfg.windowMs)
      this.samples.shift();
    // 判定
    if (now - this.lastFire < cfg.cooldownMs) return null;
    if (this.samples.length < 2) return null;
    const first = this.samples[0];
    const end = this.samples[this.samples.length - 1];
    const dt = (end.t - first.t) / 1000;
    if (dt <= 0) return null;
    const dx = end.x - first.x;
    if (Math.abs(dx) < cfg.minDistance) return null;
    if (Math.abs(dx) / dt < cfg.minVelocity) return null;
    if (!this.armed) return null;
    // 触发：清轨迹、解除武装、记录冷却
    this.samples.length = 0;
    this.armed = false;
    this.lastFire = now;
    return dx < 0 ? "left" : "right";
  }
}
/**
 * 点头确认检测。
 *
 * 信号：相对 baseline 的 dPitch（向下点头为正，见 gesture.ts 符号约定）。
 * 策略从简：达阈值即触发，防连发交给 armed（需回正）+ cooldown。
 * 阈值刻意低于游戏内「低头=蹲」，且只在选择阶段被消费，互不干扰。
 */
export interface NodConfig {
  /** 触发阈值（相对 baseline 的归一化 pitch 偏移） */
  pitchThreshold: number;
  /** 回正比例：低于 阈值×releaseRatio 才重新武装 */
  releaseRatio: number;
  /** 两次点头最短间隔（ms） */
  cooldownMs: number;
  /** 完成一次点头所允许的轨迹窗口（ms） */
  windowMs: number;
  /** 从中心移动到阈值的最短时长（ms），过滤单帧尖峰 */
  minMovementMs: number;
  /** 最低向下速度（归一化单位/秒） */
  minVelocity: number;
}
export const defaultNodConfig: NodConfig = {
  pitchThreshold: 0.055,
  releaseRatio: 0.5,
  cooldownMs: 1100,
  windowMs: 420,
  minMovementMs: 55,
  minVelocity: 0.12,
};
export class NodDetector {
  private cfg: NodConfig;
  private armed = true;
  private lastFire = -Infinity;
  private samples: { t: number; pitch: number }[] = [];
  constructor(cfg: Partial<NodConfig> = {}) {
    this.cfg = { ...defaultNodConfig, ...cfg };
  }
  setConfig(patch: Partial<NodConfig>) {
    this.cfg = { ...this.cfg, ...patch };
  }
  reset() {
    this.armed = true;
    this.lastFire = -Infinity;
    this.samples = [];
  }
  get isArmed() {
    return this.armed;
  }
  /** 每帧输入 dPitch；按 gesture.ts 的几何定义，向下点头为负。 */
  update(dPitch: number, now: number): boolean {
    const release = this.cfg.pitchThreshold * this.cfg.releaseRatio;
    if (!this.armed && Math.abs(dPitch) < release) {
      this.armed = true;
      this.samples = [{ t: now, pitch: dPitch }];
      return false;
    }
    if (!this.armed) return false;
    if (now - this.lastFire < this.cfg.cooldownMs) return false;

    this.samples.push({ t: now, pitch: dPitch });
    while (
      this.samples.length > 2 &&
      now - this.samples[0].t > this.cfg.windowMs
    )
      this.samples.shift();
    if (dPitch > -this.cfg.pitchThreshold || this.samples.length < 2)
      return false;

    let start = this.samples[0];
    for (const sample of this.samples) {
      if (sample.pitch > start.pitch) start = sample;
    }
    const duration = now - start.t;
    const travel = start.pitch - dPitch;
    const velocity = duration > 0 ? travel / (duration / 1000) : 0;
    if (travel >= this.cfg.pitchThreshold && duration < this.cfg.minMovementMs) {
      // 单帧跳变不是动作；丢弃旧中心样本，持续停在低位不会延迟触发。
      this.samples = [{ t: now, pitch: dPitch }];
      return false;
    }
    if (
      travel >= this.cfg.pitchThreshold &&
      duration >= this.cfg.minMovementMs &&
      duration <= this.cfg.windowMs &&
      velocity >= this.cfg.minVelocity
    ) {
      this.armed = false;
      this.lastFire = now;
      this.samples = [];
      return true;
    }
    return false;
  }
}
