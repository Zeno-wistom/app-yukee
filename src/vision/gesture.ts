import type { HeadDirection } from "./types";
/**
 * 头部手势判定（纯函数，便于单元测试）。
 *
 * 信号来源：面部关键点几何偏移（相对用户自身 baseline）。
 * - dYaw > 0   表示用户向自己的左侧转头（鼻尖在画面中右移）
 * - dPitch > 0 表示用户抬头（鼻尖在画面中上移）
 * 该符号约定来自摄像头成像的物理事实，与 MediaPipe 矩阵坐标系无关。
 */
export interface GestureConfig {
  /** 触发阈值（归一化偏移，相对脸宽/脸高） */
  yawThreshold: number;
  pitchThreshold: number;
  /** 回正比例：偏移低于 阈值×releaseRatio 才重新武装同一动作 */
  releaseRatio: number;
  /** 同类/全局触发冷却，防摄像头抖动连发 */
  cooldownMs: number;
}
export const defaultGestureConfig: GestureConfig = {
  yawThreshold: 0.075,
  pitchThreshold: 0.06,
  releaseRatio: 0.45,
  cooldownMs: 450,
};
export interface Baseline {
  yaw: number;
  pitch: number;
}
export class GestureDetector {
  private config: GestureConfig;
  private armed: Record<Exclude<HeadDirection, "center">, boolean> = {
    left: true,
    right: true,
    up: true,
    down: true,
  };
  private lastFire = -Infinity;
  constructor(config: Partial<GestureConfig> = {}) {
    this.config = { ...defaultGestureConfig, ...config };
  }
  setConfig(config: Partial<GestureConfig>) {
    this.config = { ...this.config, ...config };
  }
  reset() {
    this.armed = { left: true, right: true, up: true, down: true };
    this.lastFire = -Infinity;
  }
  /** 当前朝向（含 center），用于 HUD 实时显示 */
  direction(dYaw: number, dPitch: number): HeadDirection {
    const { yawThreshold, pitchThreshold } = this.config;
    const yaw = Math.abs(dYaw) >= yawThreshold * 0.55 ? dYaw : 0;
    const pitch = Math.abs(dPitch) >= pitchThreshold * 0.55 ? dPitch : 0;
    if (!yaw && !pitch) return "center";
    if (Math.abs(yaw) / yawThreshold >= Math.abs(pitch) / pitchThreshold && yaw)
      return yaw > 0 ? "left" : "right";
    return pitch > 0 ? "up" : "down";
  }
  /**
   * 每帧输入平滑后的相对偏移，返回本次触发的动作（无触发为 null）。
   * 要求回正后才能再次触发同一方向；全局 cooldown 防抖。
   */
  update(dYaw: number, dPitch: number, now: number): HeadDirection | null {
    const { yawThreshold, pitchThreshold, releaseRatio, cooldownMs } =
      this.config;
    // 回正 → 重新武装
    if (Math.abs(dYaw) < yawThreshold * releaseRatio) {
      this.armed.left = true;
      this.armed.right = true;
    }
    if (Math.abs(dPitch) < pitchThreshold * releaseRatio) {
      this.armed.up = true;
      this.armed.down = true;
    }
    if (now - this.lastFire < cooldownMs) return null;
    // 选相对偏移更大的轴，避免斜向头部动作双触发
    const yawScore = Math.abs(dYaw) / yawThreshold;
    const pitchScore = Math.abs(dPitch) / pitchThreshold;
    let fired: HeadDirection | null = null;
    if (yawScore >= 1 && yawScore >= pitchScore)
      fired = dYaw > 0 ? "left" : "right";
    else if (pitchScore >= 1) fired = dPitch > 0 ? "up" : "down";
    if (fired && this.armed[fired]) {
      this.armed[fired] = false;
      this.lastFire = now;
      return fired;
    }
    return null;
  }
}
/** 指数滑动平均，抑制关键点抖动 */
export class Ema {
  private value: number | null = null;
  constructor(private alpha: number) {}
  push(x: number) {
    this.value =
      this.value === null ? x : this.value + (x - this.value) * this.alpha;
    return this.value;
  }
  get current() {
    return this.value;
  }
  reset() {
    this.value = null;
  }
}
/**
 * 从 478 关键点计算头部姿态的归一化几何分数。
 * 只依赖对称参考点中点，符号由成像物理决定：
 * 用户向左转头 → 鼻尖向画面右侧移动 → yawScore 增大。
 * 用户抬头 → 鼻尖相对双眼连线上移（画面 y 减小）→ pitchScore 增大。
 * @param points 归一化关键点数组（x/y ∈ 0~1，画面坐标，未镜像）
 */
export function headGeometry(points: { x: number; y: number }[]): {
  yaw: number;
  pitch: number;
} {
  const nose = points[4] ?? points[1]; // 鼻尖
  const eyeL = points[33]; // 画面侧左眼外角
  const eyeR = points[263]; // 画面侧右眼外角
  const cheekL = points[234];
  const cheekR = points[454];
  const top = points[10]; // 额头
  const chin = points[152];
  const faceW = Math.max(
    Math.hypot(cheekR.x - cheekL.x, cheekR.y - cheekL.y),
    1e-6,
  );
  const faceH = Math.max(Math.hypot(chin.x - top.x, chin.y - top.y), 1e-6);
  const faceCX = (cheekL.x + cheekR.x) / 2;
  const eyeCY = (eyeL.y + eyeR.y) / 2;
  return {
    yaw: (nose.x - faceCX) / faceW,
    pitch: (eyeCY - nose.y) / faceH,
  };
}
/** 脸部中心的画面 x 坐标（0~1，未镜像）：双颊关键点中点 */
export function faceCenterX(points: { x: number; y: number }[]): number {
  return (points[234].x + points[454].x) / 2;
}
