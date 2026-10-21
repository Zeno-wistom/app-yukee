/** 游戏选择页专用的水平转头判定：触发后必须先回中，才允许再次切换。 */
export interface SelectionHeadConfig {
  yawThreshold: number;
  releaseRatio: number;
  cooldownMs: number;
}

export const defaultSelectionHeadConfig: SelectionHeadConfig = {
  yawThreshold: 0.065,
  releaseRatio: 0.45,
  cooldownMs: 620,
};

export class SelectionHeadDetector {
  private config: SelectionHeadConfig;
  private armed = true;
  private lastFire = -Infinity;

  constructor(config: Partial<SelectionHeadConfig> = {}) {
    this.config = { ...defaultSelectionHeadConfig, ...config };
  }

  reset() {
    this.armed = true;
    this.lastFire = -Infinity;
  }

  get isArmed() {
    return this.armed;
  }

  update(dYaw: number, now: number): "left" | "right" | null {
    const { yawThreshold, releaseRatio, cooldownMs } = this.config;
    if (!this.armed) {
      if (Math.abs(dYaw) < yawThreshold * releaseRatio) this.armed = true;
      return null;
    }
    if (now - this.lastFire < cooldownMs) return null;
    if (Math.abs(dYaw) < yawThreshold) return null;
    this.armed = false;
    this.lastFire = now;
    return dYaw > 0 ? "left" : "right";
  }
}
