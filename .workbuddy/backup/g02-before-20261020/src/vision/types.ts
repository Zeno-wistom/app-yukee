export type MotionAction =
  | "calibrated"
  | "gameComplete"
  | "left"
  | "center"
  | "right"
  | "up"
  | "down";
export interface MotionInput {
  action: MotionAction;
  source: "debug" | "camera";
  timestamp: number;
}
export interface VisionAdapter {
  subscribe(listener: (input: MotionInput) => void): () => void;
  stop(): void;
}
export type HeadDirection = "center" | "left" | "right" | "up" | "down";
export type SelectionInputMode = "hand" | "head";
export interface VisionStatus {
  running: boolean;
  facePresent: boolean;
  direction: HeadDirection;
  /** 相对 baseline 的归一化偏移（约 -1 ~ 1） */
  dYaw: number;
  dPitch: number;
  /** 未减 baseline 的原始几何分数（EMA 后），供 Yukee gaze 自适应中心使用 */
  rawYaw: number;
  rawPitch: number;
  /** 脸部中心的画面 x 坐标（0~1，未镜像），供 Yukee 身体 X 跟随 */
  faceCenterX: number | null;
  /** 推理帧率与耗时 */
  fps: number;
  inferMs: number;
  frames: number;
  calibrated: boolean;
  /** 校准进度 0~1，未校准中为 null */
  calibrating: number | null;
  /** 手掌中心画面 x（0~1，未镜像）；未检测到手为 null */
  palmX: number | null;
  /** 手掌模型是否当前帧可见 */
  handPresent: boolean;
  /**
   * 选择交互的当前激活输入模式。
   * 由上层（selection preference）注入；vision 内部不读它，只带回以便 HUD 同步。
   */
  selectionMode: SelectionInputMode;
  /** 选择页已完成自然面向屏幕的短暂基准采样 */
  selectionReady: boolean;
  /** HandLandmarker 模型是否成功加载（false = 静默降级到 head-only） */
  handModelReady: boolean;
}
/** 选择阶段的纯函数输入事件（由 input adapter 上发）。 */
export type LampInput =
  | { kind: "next"; source: "hand" | "head" }
  | { kind: "prev"; source: "hand" | "head" }
  | { kind: "confirm"; source: "hand" | "head" };
