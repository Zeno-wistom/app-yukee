/**
 * Yukee 角色类型定义。
 *
 * Yukee 本体常驻挂灯；游戏中的像素 Yukee 是由本体析出的联机分身。
 * YukeeEngine 只是「产品状态机 → 表情/动画」的 Visual Adapter，
 * 不持有任何业务状态。
 */

/** Yukee 产品语义状态（第一版固定 8 个） */
export type YukeeState =
  | "calm"
  | "attentive"
  | "concerned"
  | "anxious"
  | "focused"
  | "playful"
  | "confused"
  | "celebrate";

/** 瞬时反馈事件：叠加在持续状态之上，结束后回到原状态。
 * 受伤反馈池（wince/startled/worried/pained）保持克制：
 * 不愤怒、不惨叫、不大幅抖动，本质仍是健康陪伴角色。 */
export type YukeeEvent =
  | "blink"
  | "success"
  | "miss"
  | "notice"
  | "enterGame"
  | "exitGame"
  | "wince"
  | "startled"
  | "worried"
  | "pained";

/** LaoA-GrokBot 原版状态名（数据索引用，产品层不直接暴露） */
export type LaoaState = string;

/** 一套表情 = 2 个眼睛 ring，每个 ring 48 个 [x, y] 点（229×229 视窗坐标） */
export type YukeeRing = [number, number][];
export type YukeeExpression = [YukeeRing, YukeeRing];

/** Yukee 状态 → 底层 Expression 配置（视觉选择后的映射结果） */
export interface YukeeStateProfile {
  /** 该状态可用的 Expression 索引池（Expression Pool 机制） */
  pool: number[];
  /** 池内表情轮换节奏 [minMs, maxMs]（Expression Cadence） */
  cadence: [number, number];
  /** 自动眨眼间隔 [minMs, maxMs]，null 表示不自动眨眼 */
  blink: [number, number] | null;
  /** 持续状态的伴随动作（已按挂灯小屏收敛幅度） */
  motion: "none" | "tilt" | "pulse" | "scan" | "bounce";
  /** 眼睛发光色 */
  color: string;
}

/** 引擎每帧输出（由 YukeeFace 写入 SVG） */
export interface YukeeEyeFrame {
  /** SVG path d 字符串 */
  d: string;
  /** 眼睛整体 translate（含 gaze 与 turn 透视中心） */
  x: number;
  y: number;
  /** 眼睛自身质心（scale 的反平移原点） */
  cx: number;
  cy: number;
  /** turn 透视缩放 */
  perspective: number;
  /** 眨眼缩放（1 = 睁开） */
  blinkScale: number;
  /** turn 到背面时隐藏 */
  visible: boolean;
}

export interface YukeeFrame {
  eyes: [YukeeEyeFrame, YukeeEyeFrame];
  /** 呼吸 squash（很弱）：1 ± 0.008 */
  breath: number;
  /** 身体 X 偏移（已 smoothing/deadzone/clamp/damping），单位 px */
  bodyX: number;
  /** 身体随横向移动产生的克制倾斜，单位 deg */
  bodyTilt: number;
}
