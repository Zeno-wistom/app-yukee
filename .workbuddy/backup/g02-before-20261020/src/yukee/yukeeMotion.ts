/**
 * Yukee 运动辅助：把 MediaPipe 几何信号换算成 Yukee 输入。
 *
 * 分工约定（防止转头与身体移动互相污染）：
 * - 头部 yaw/pitch → gaze + 轻微头部透视
 * - 脸部中心 faceCenterX → 身体 X 位移 + 轻微倾斜
 *
 * 符号约定与 src/vision/gesture.ts 一致（成像物理决定）：
 * 用户向自己的左侧转头 → 鼻尖在画面中右移 → rawYaw 增大。
 * 原始画面未镜像，因此用户身体左移 → faceCenterX 增大；
 * 而屏幕上「向左」是 CSS 负方向，所以需要镜像取反。
 */

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

/**
 * 中心 dead zone：把 |delta| < dz 的微小偏移归零，
 * 超出部分平移回原点，保证映射在 dead zone 边界处连续。
 * 真人正对屏幕时，EMA 噪声不再驱动 Yukee 眼神 / 身体漂移。
 */
const deadzone = (delta: number, dz: number) => {
  const a = Math.abs(delta);
  if (a <= dz) return 0;
  return Math.sign(delta) * (a - dz);
};

/** 头部几何分数 → gaze（-1 ~ 1）。gain 放大有效头部动作范围 */
export function gazeFromHead(
  rawYaw: number,
  rawPitch: number,
  centerYaw: number,
  centerPitch: number,
): { x: number; y: number } {
  const GAIN_YAW = 12;
  const GAIN_PITCH = 9;
  // dead zone 约为 1°~2° 头部转动，只在「明确转头」时视线才跟过去
  const DZ_YAW = 0.022;
  const DZ_PITCH = 0.018;
  return {
    // +0 归一：dead zone 归零时避免 -0 语义
    x: clamp(-deadzone(rawYaw - centerYaw, DZ_YAW) * GAIN_YAW, -1, 1) + 0,
    y: clamp(-deadzone(rawPitch - centerPitch, DZ_PITCH) * GAIN_PITCH, -1, 1) + 0,
  };
}

/** 脸部中心（0~1 画面坐标）→ 身体目标（-1 ~ 1，已镜像） */
export function bodyFromFaceCenter(faceCenterX: number): number {
  // 身体最迟钝：dead zone 比 gaze 更宽，只有明显偏离才移动
  return clamp(deadzone(0.5 - faceCenterX, 0.03) * 3.2, -1, 1);
}

/**
 * 自适应视线中心：用户未校准时的隐式 baseline。
 * 用极慢 EMA 追踪长期平均头部姿态，gaze 表达相对偏移，
 * 避免长时间使用后的缓慢漂移累积。
 */
export class GazeCenter {
  private yaw: number | null = null;
  private pitch: number | null = null;
  private readonly alpha = 0.012; // 8Hz 下约 10s 时间常数
  push(rawYaw: number, rawPitch: number) {
    this.yaw =
      this.yaw === null ? rawYaw : this.yaw + (rawYaw - this.yaw) * this.alpha;
    this.pitch =
      this.pitch === null
        ? rawPitch
        : this.pitch + (rawPitch - this.pitch) * this.alpha;
  }
  get current() {
    return { yaw: this.yaw ?? 0, pitch: this.pitch ?? 0 };
  }
  reset() {
    this.yaw = null;
    this.pitch = null;
  }
}
