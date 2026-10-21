/**
 * G02「展翼接光」姿态数学与动作判定（纯逻辑，无 DOM / 无摄像头依赖）。
 *
 * 分层目的：
 * - 摄像头层只负责给出 MediaPipe 关键点；
 * - 本文件负责「关键点 → 展开量 → 动作循环 → 计次」的全部判断，
 *   因此可以用单元测试验证单手、抖动、丢失恢复、保持不回位等边界；
 * - 所有阈值集中在 DEFAULT_WING_CONFIG，真人试玩后只改这一处。
 *
 * 坐标约定：输入是 MediaPipe 归一化坐标（0~1），这里按需求先换算成视频像素，
 * 再用同一帧肩宽归一化。左右侧使用模型的人体语义（11/12 号点），
 * 不做「画面左边就是左手」的猜测；展开方向由肩点连线自动推导，
 * 因此摄像头是否镜像都不会影响判定。
 */

/** MediaPipe Pose 关键点（只保留本游戏需要的 6 个） */
export const WING_LANDMARK_INDEX = {
  leftShoulder: 11,
  rightShoulder: 12,
  leftElbow: 13,
  rightElbow: 14,
  leftWrist: 15,
  rightWrist: 16,
} as const;

export interface PoseLandmark {
  x: number;
  y: number;
  /** MediaPipe 的可见度（0~1）；缺失时按可见处理 */
  visibility?: number;
}

/** 摄像头层广播给 G02 的单帧姿态数据 */
export interface PoseFrame {
  /** 33 个归一化关键点（MediaPipe Pose 顺序） */
  landmarks: PoseLandmark[];
  /** 当前视频像素尺寸，用于归一化 → 像素换算 */
  videoWidth: number;
  videoHeight: number;
  /** 推理时间戳（performance.now） */
  at: number;
}

export interface WingConfig {
  /** 展开到位阈值：u ≥ 该值开始积累「保持」时间 */
  openThreshold: number;
  /** 回到准备位阈值：u < 该值开始积累「回位」时间 */
  readyThreshold: number;
  /** 展开到位需要保持的时间（毫秒，开发初值 700） */
  openHoldMs: number;
  /** 回位需要保持的时间（毫秒，开发初值 500） */
  returnHoldMs: number;
  /** READY 需要先稳定待机的时间（毫秒，开发初值 400） */
  readyHoldMs: number;
  /** 展开量 EMA 平滑时间常数（毫秒，约 100ms：抗抖但不明显迟滞） */
  smoothTauMs: number;
  /** 关键点短暂丢失可容忍的冻结窗口（毫秒） */
  lossGraceMs: number;
  /** 恢复识别后先稳定确认的时间（毫秒） */
  resumeStableMs: number;
  /** 关键点可见度下限 */
  minVisibility: number;
  /** 目标完成次数 */
  targetReps: number;
  /** 建议单局时长上限（毫秒）：超过后允许结束或继续 */
  softLimitMs: number;
  /** 校准要求的最小有效展开幅度（以肩宽为单位） */
  minSeparation: number;
  /** 校准展开采样判定「稳定」所需的无增长时间（毫秒） */
  spreadSettleMs: number;
  /** 中立姿态允许的最大抖动（肩宽为单位），超过即要求重新校准 */
  maxJitter: number;
}

/** 开发初值：全部可配置，真人测试后按反馈微调 */
export const DEFAULT_WING_CONFIG: WingConfig = {
  openThreshold: 0.7,
  readyThreshold: 0.25,
  openHoldMs: 700,
  returnHoldMs: 500,
  readyHoldMs: 400,
  smoothTauMs: 100,
  lossGraceMs: 300,
  resumeStableMs: 1000,
  minVisibility: 0.4,
  targetReps: 5,
  softLimitMs: 45_000,
  minSeparation: 0.15,
  spreadSettleMs: 450,
  maxJitter: 0.06,
};

export interface WingMeasure {
  /** 左手腕相对左肩向外侧移动的距离 / 肩宽 */
  qL: number;
  /** 右手腕相对右肩向外侧移动的距离 / 肩宽 */
  qR: number;
  /** 当前帧肩宽（像素），用于诊断 */
  shoulderWidthPx: number;
  /** 画面是否镜像（左肩出现在画面右侧） */
  mirrored: boolean;
}

export interface WingProfile {
  q0L: number;
  q1L: number;
  q0R: number;
  q1R: number;
  /** 中立姿态抖动（肩宽为单位） */
  jitter: number;
  /** 校准时肩宽（像素），仅用于诊断与后续调参 */
  shoulderWidthPx: number;
}

export interface WingExpand {
  uL: number;
  uR: number;
  /** 双臂展开量：取两侧较小值，单手无法完成 */
  u: number;
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

function visible(
  point: PoseLandmark | undefined,
  minVisibility: number,
): point is PoseLandmark {
  return !!point && Number.isFinite(point.x) && Number.isFinite(point.y) &&
    Number.isFinite(point.visibility ?? 1) && (point.visibility ?? 1) >= minVisibility;
}

/** 只在有关键点证据时指出缺失部位；无新帧时不猜测用户的位置。 */
export function wingTrackingHint(landmarks: readonly PoseLandmark[] | null | undefined): string {
  if (!landmarks) return "正在重新识别身体";
  const missing = (indices: number[]) => indices.some(i => {
    const p = landmarks[i];
    return !visible(p, DEFAULT_WING_CONFIG.minVisibility) || p.x < -0.02 || p.x > 1.02 || p.y < -0.02 || p.y > 1.02;
  });
  if (missing([11, 12])) return "请让双肩进入画面";
  if (missing([15, 16])) return "请让双手进入画面";
  if (missing([13, 14])) return "请让双肘进入画面";
  return "正在重新识别身体";
}

/**
 * 判断 6 个关键点是否都可见（校准阶段要求肩、肘、腕完整入镜）。
 * 归一化坐标越界（手出画）同样视为不可见。
 */
export function keypointsVisible(
  landmarks: readonly PoseLandmark[] | null | undefined,
  minVisibility = DEFAULT_WING_CONFIG.minVisibility,
): boolean {
  if (!landmarks) return false;
  return Object.values(WING_LANDMARK_INDEX).every((index) => {
    const point = landmarks[index];
    if (!visible(point, minVisibility)) return false;
    return point.x > -0.02 && point.x < 1.02 && point.y > -0.02 && point.y < 1.02;
  });
}

/**
 * 从关键点计算左右臂的展开量 q（未做个人归一化）。
 * 返回 null 表示肩/腕不可见，调用方应视为「本帧无效」。
 */
export function measureWing(
  landmarks: readonly PoseLandmark[] | null | undefined,
  videoWidth: number,
  videoHeight: number,
  config: WingConfig = DEFAULT_WING_CONFIG,
): WingMeasure | null {
  if (!landmarks || videoWidth <= 0 || videoHeight <= 0) return null;
  // 校准和游戏严格使用同一套肩、肘、腕及画面边界规则。
  if (!keypointsVisible(landmarks, config.minVisibility)) return null;
  const lS = landmarks[WING_LANDMARK_INDEX.leftShoulder];
  const rS = landmarks[WING_LANDMARK_INDEX.rightShoulder];
  const lW = landmarks[WING_LANDMARK_INDEX.leftWrist];
  const rW = landmarks[WING_LANDMARK_INDEX.rightWrist];
  if (
    !visible(lS, config.minVisibility) ||
    !visible(rS, config.minVisibility) ||
    !visible(lW, config.minVisibility) ||
    !visible(rW, config.minVisibility)
  )
    return null;

  // 1) 归一化坐标 → 视频像素坐标
  const toPx = (p: PoseLandmark) => ({
    x: p.x * videoWidth,
    y: p.y * videoHeight,
  });
  const ls = toPx(lS);
  const rs = toPx(rS);
  const lw = toPx(lW);
  const rw = toPx(rW);

  // 2) 肩宽 W0（当前帧）
  const shoulderWidthPx = Math.hypot(ls.x - rs.x, ls.y - rs.y);
  if (shoulderWidthPx < 8) return null;

  // 3) 外侧方向：由肩点连线推导（指向该侧肩膀的方向 = 该侧的外侧）
  const axis = ls.x - rs.x;
  const sign = axis >= 0 ? 1 : -1;
  const outL = Math.max(0, (lw.x - ls.x) * sign);
  const outR = Math.max(0, (rw.x - rs.x) * -sign);

  // 4) 始终除以同一帧的肩宽：前后移动时分子分母同比缩放，
  // 避免原实现切换 W0/当前肩宽引起阈值跳变，也与校准的量纲一致。
  const base = shoulderWidthPx;

  return {
    qL: outL / base,
    qR: outR / base,
    shoulderWidthPx,
    mirrored: axis < 0,
  };
}

/** 时间常数式 EMA：alpha 由 dt 推导，帧率变化时行为一致 */
export class WingSmoother {
  private left: number | null = null;
  private right: number | null = null;

  constructor(private readonly tauMs = DEFAULT_WING_CONFIG.smoothTauMs) {}

  reset() {
    this.left = null;
    this.right = null;
  }

  push(qL: number, qR: number, dtMs: number) {
    if (this.left === null || this.right === null) {
      this.left = qL;
      this.right = qR;
      return { qL, qR };
    }
    const alpha = 1 - Math.exp(-Math.max(dtMs, 1) / Math.max(this.tauMs, 1));
    this.left += (qL - this.left) * alpha;
    this.right += (qR - this.right) * alpha;
    return { qL: this.left, qR: this.right };
  }
}

/** 个人阈值归一化：u 为两侧展开量的较小值 */
export function expandAmount(
  qL: number,
  qR: number,
  profile: Pick<WingProfile, "q0L" | "q1L" | "q0R" | "q1R">,
): WingExpand {
  const spanL = Math.max(profile.q1L - profile.q0L, 0.02);
  const spanR = Math.max(profile.q1R - profile.q0R, 0.02);
  const uL = clamp01((qL - profile.q0L) / spanL);
  const uR = clamp01((qR - profile.q0R) / spanR);
  return { uL, uR, u: Math.min(uL, uR) };
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function stdev(values: number[], mean: number): number {
  if (values.length < 2) return 0;
  const variance =
    values.reduce((sum, value) => sum + (value - mean) ** 2, 0) /
    (values.length - 1);
  return Math.sqrt(variance);
}

export interface NeutralStats {
  q0L: number;
  q0R: number;
  jitter: number;
  samples: number;
  /** 样本足够且抖动在允许范围内 */
  ok: boolean;
  reason?: "samples" | "jitter";
}

export interface SpreadTrack {
  /** 0~1：距离可用展开幅度还差多少 */
  progress: number;
  /** 已稳定保持，可以锁定 */
  settled: boolean;
  /** 相对中立位置的最小展开幅度 */
  separation: number;
}

export interface CalibrationResult {
  ok: boolean;
  profile?: WingProfile;
  reason?: "separation" | "jitter" | "samples";
  /** 供界面直接展示的中文说明 */
  message?: string;
}

/**
 * 个人动作校准器。
 * 流程：addNeutral × N → captureNeutral → beginSpread → trackSpread × N → captureSpread。
 */
export class WingCalibrator {
  private spreadWindow: { l: number; r: number; at: number }[] = [];
  private stableEndpoint: { l: number; r: number } | null = null;
  private neutralSamples: { l: number; r: number }[] = [];
  private base: NeutralStats | null = null;
  private spreadActive = false;
  private lastSpreadAt = -Infinity;

  constructor(private readonly config: WingConfig = DEFAULT_WING_CONFIG) {}

  reset() {
    this.spreadWindow = [];
    this.stableEndpoint = null;
    this.neutralSamples = [];
    this.base = null;
    this.spreadActive = false;
    this.lastSpreadAt = -Infinity;
  }

  addNeutral(qL: number, qR: number) {
    this.neutralSamples.push({ l: qL, r: qR });
    if (this.neutralSamples.length > 240) this.neutralSamples.shift();
  }

  get neutralCount() {
    return this.neutralSamples.length;
  }

  /** 结束中立采样：取中位数抗偶发跳动，抖动取两侧标准差较大值 */
  captureNeutral(): NeutralStats {
    const samples = this.neutralSamples;
    if (samples.length < 8) {
      this.base = {
        q0L: 0,
        q0R: 0,
        jitter: 0,
        samples: samples.length,
        ok: false,
        reason: "samples",
      };
      return this.base;
    }
    const left = samples.map((s) => s.l);
    const right = samples.map((s) => s.r);
    const q0L = median(left);
    const q0R = median(right);
    const jitter = Math.max(
      stdev(left, left.reduce((a, b) => a + b, 0) / left.length),
      stdev(right, right.reduce((a, b) => a + b, 0) / right.length),
    );
    const ok = jitter <= this.config.maxJitter;
    this.base = {
      q0L,
      q0R,
      jitter,
      samples: samples.length,
      ok,
      reason: ok ? undefined : "jitter",
    };
    return this.base;
  }

  get neutral() {
    return this.base;
  }

  beginSpread(nowMs: number) {
    this.spreadWindow = [];
    this.stableEndpoint = null;
    if (!this.base) this.captureNeutral();
    this.spreadActive = true;
    this.lastSpreadAt = nowMs;
  }

  /**
   * 采样展开过程。settled 需要同时满足：
   * 1) 两侧都明显超过中立位置（最小幅度 minSeparation）；
   * 2) 同时可见且连续稳定 spreadSettleMs，取该窗口中位数作为舒适端点。
   */
  trackSpread(qL: number, qR: number, nowMs: number): SpreadTrack {
    const base = this.base;
    if (!base || !this.spreadActive || nowMs <= this.lastSpreadAt)
      return { progress: 0, settled: false, separation: 0 };
    this.lastSpreadAt = nowMs;
    this.spreadWindow.push({ l: qL, r: qR, at: nowMs });
    // 留一个窗口起点，确保持续时间真的覆盖 settleMs，而非重复采样同一帧。
    while (this.spreadWindow.length > 1 && this.spreadWindow[1].at <= nowMs - this.config.spreadSettleMs)
      this.spreadWindow.shift();
    const sL = qL - base.q0L;
    const sR = qR - base.q0R;
    const separation = Math.min(sL, sR);
    const required = Math.max(this.config.minSeparation, base.jitter * 3);
    const progress = clamp01(separation / required);
    const window = this.spreadWindow;
    const left = window.map(s => s.l);
    const right = window.map(s => s.r);
    const tolerance = Math.max(0.04, base.jitter * 3);
    const settled =
      separation >= required &&
      window.length >= 4 && nowMs - window[0].at >= this.config.spreadSettleMs &&
      Math.min(...left) - base.q0L >= required && Math.min(...right) - base.q0R >= required &&
      Math.max(...left) - Math.min(...left) <= tolerance &&
      Math.max(...right) - Math.min(...right) <= tolerance;
    this.stableEndpoint = settled ? { l: median(left), r: median(right) } : null;
    return { progress, settled, separation };
  }

  /**
   * 结束展开采样并校验。
   * 展开幅度必须明显大于静止抖动，否则拒绝通过 ——
   * 宁可要求重新校准，也不放宽成会误触的固定阈值。
   */
  captureSpread(shoulderWidthPx: number): CalibrationResult {
    const base = this.base;
    if (!base || !base.ok) {
      if (base?.reason === "jitter")
        return {
          ok: false,
          reason: "jitter",
          message: "刚才的动作有点不稳定，请重新校准",
        };
      return { ok: false, reason: "samples", message: "还没有采集到足够的姿态数据" };
    }
    const q1L = this.stableEndpoint?.l ?? base.q0L;
    const q1R = this.stableEndpoint?.r ?? base.q0R;
    const sL = q1L - base.q0L;
    const sR = q1R - base.q0R;
    // 幅度必须 ≥ 最小值，且至少是抖动的 3 倍，避免「静止抖动被当成展开」
    const need = Math.max(this.config.minSeparation, base.jitter * 3);
    if (Math.min(sL, sR) < need) {
      return {
        ok: false,
        reason: "separation",
        message: "展开幅度不够明显，请把双臂再向外打开一些后重新校准",
      };
    }
    return {
      ok: true,
      profile: {
        q0L: base.q0L,
        q1L,
        q0R: base.q0R,
        q1R,
        jitter: base.jitter,
        shoulderWidthPx,
      },
    };
  }

}

export type WingStage = "ready" | "open" | "return";

export interface WingUpdate {
  needsReady: boolean;
  stage: WingStage;
  /** 平滑后的双臂展开量 0~1 */
  u: number;
  uL: number;
  uR: number;
  /** 当前阶段保持进度 0~1 */
  hold: number;
  /** 本轮展开已经判定有效（正在等待回位） */
  openValid: boolean;
  reps: number;
  /** 本帧是否新增一次完整动作 */
  added: number;
  /** 有效游戏时间（只在识别正常且未暂停时累计） */
  effectiveMs: number;
  /** 已连续丢失识别的时间 */
  lostMs: number;
  /** 连续丢失已超过宽限窗口 */
  interrupted: boolean;
  /** 恢复识别后的稳定确认中 */
  resuming: boolean;
  /** 恢复完成（仅一帧为 true） */
  resumed: boolean;
  complete: boolean;
  /** 超过建议时长且尚未完成 */
  overSoftLimit: boolean;
  tracking: "ok" | "unstable" | "lost";
}

/**
 * 动作状态机：READY → OPEN → RETURN → READY。
 * - READY 需先稳定待机 readyHoldMs，才允许开始一轮；
 * - OPEN 需 u ≥ openThreshold 并保持 openHoldMs，只标记「展开有效」，不加次；
 * - RETURN 需 u < readyThreshold 并保持 returnHoldMs，才 +1。
 * 因此「一直保持展开」不会重复加分。
 */
export class WingSession {
  private readonly smoother: WingSmoother;
  private stage: WingStage = "ready";
  private readyHold = 0;
  private armed = false;
  private openHold = 0;
  private openValid = false;
  private returnHold = 0;
  private lostMs = 0;
  private resumeStable = 0;
  private resumePending = false;
  private reps = 0;
  private effectiveMs = 0;
  private complete = false;
  private last: WingUpdate | null = null;

  constructor(
    private readonly profile: WingProfile,
    private readonly config: WingConfig = DEFAULT_WING_CONFIG,
  ) {
    this.smoother = new WingSmoother(config.smoothTauMs);
  }

  get repCount() {
    return this.reps;
  }

  get elapsed() {
    return this.effectiveMs;
  }

  get done() {
    return this.complete;
  }

  reset() {
    this.stage = "ready";
    this.readyHold = 0;
    this.armed = false;
    this.openHold = 0;
    this.openValid = false;
    this.returnHold = 0;
    this.lostMs = 0;
    this.resumeStable = 0;
    this.resumePending = false;
    this.reps = 0;
    this.effectiveMs = 0;
    this.complete = false;
    this.smoother.reset();
    this.last = null;
  }

  /**
   * 推进一帧。dtMs 为真实时间差（暂停时调用方不要调用）。
   * sample 为 null 表示本帧没有可用关键点。
   */
  update(dtMs: number, sample: WingMeasure | null): WingUpdate {
    const dt = Math.max(0, Math.min(dtMs, 120));
    if (this.complete) return this.snapshot({ added: 0 });

    if (!sample) {
      this.lostMs += dt;
      this.resumeStable = 0;
      this.smoother.reset();
      // 丢失期间冻结当前阶段的保持计时，不补算
      if (this.lostMs > this.config.lossGraceMs) {
        this.interrupted();
      }
      return this.snapshot({
        added: 0,
        tracking: this.lostMs > this.config.lossGraceMs ? "lost" : "unstable",
      });
    }

    const lostBefore = this.lostMs;
    this.lostMs = 0;

    // 长时间丢失后：先稳定确认 resumeStableMs，再从 READY 重新开始
    if (this.resumePending) {
      this.resumeStable += dt;
      if (this.resumeStable < this.config.resumeStableMs) {
        return this.snapshot({ added: 0, tracking: "unstable", resuming: true });
      }
      this.resumePending = false;
      this.resumeStable = 0;
      this.stage = "ready";
      this.armed = false;
      this.readyHold = 0;
      this.openHold = 0;
      this.openValid = false;
      this.returnHold = 0;
      return this.snapshot({ added: 0, resumed: true, tracking: "ok" });
    }

    // 短暂丢失恢复：清空平滑器，避免旧值把展开量「拖」回去造成误判
    if (lostBefore > 0) this.smoother.reset();
    const smooth = this.smoother.push(sample.qL, sample.qR, dt);
    const { u, uL, uR } = expandAmount(smooth.qL, smooth.qR, this.profile);

    this.effectiveMs += dt;

    let added = 0;

    // ---- READY：稳定待机 → 允许开始 ----
    if (this.stage === "ready") {
      this.readyHold = Math.max(uL, uR) < this.config.readyThreshold ? this.readyHold + dt : 0;
      if (this.readyHold >= this.config.readyHoldMs) this.armed = true;
      if (this.armed && u >= this.config.openThreshold) {
        this.stage = "open";
        this.openHold = 0;
      }
    }

    // ---- OPEN：展开保持 ----
    if (this.stage === "open") {
      if (!this.openValid) {
        if (u >= this.config.openThreshold && this.armed) {
          this.openHold += dt;
          if (this.openHold >= this.config.openHoldMs) this.openValid = true;
        } else {
          // 中途放下：本轮作废，回到 READY 重新来（不扣分、不惩罚）
          this.openHold = 0;
          this.stage = "ready";
          this.readyHold = 0;
        }
      }
      if (this.openValid && Math.max(uL, uR) < this.config.readyThreshold) {
        this.stage = "return";
        this.returnHold = 0;
      }
    }

    // ---- RETURN：回位保持 → 计次 ----
    if (this.stage === "return") {
      if (Math.max(uL, uR) < this.config.readyThreshold) {
        this.returnHold += dt;
        if (this.returnHold >= this.config.returnHoldMs) {
          this.reps += 1;
          added = 1;
          this.stage = "ready";
          this.readyHold = 0;
          this.armed = false;
          this.openHold = 0;
          this.openValid = false;
          this.returnHold = 0;
          if (this.reps >= this.config.targetReps) this.complete = true;
        }
      } else if (u >= this.config.openThreshold) {
        // 又抬起来了：回到 OPEN（已有效则继续等回位）
        this.stage = "open";
        this.returnHold = 0;
      } else {
        this.returnHold = 0;
      }
    }

    return this.snapshot({ added, u, uL, uR, tracking: "ok" });
  }

  private interrupted() {
    if (!this.resumePending) {
      // 已发生的动作过程不能恢复后补算：整轮作废，重新准备
      this.resumePending = true;
      this.resumeStable = 0;
      this.stage = "ready";
      this.armed = false;
      this.readyHold = 0;
      this.openHold = 0;
      this.openValid = false;
      this.returnHold = 0;
    }
  }

  /** 暂停时中断未完成的动作，继续后先回位，不能用暂停期间的动作补分。 */
  pause() {
    this.interrupted();
    this.smoother.reset();
  }

  private snapshot(override: {
    added: number;
    u?: number;
    uL?: number;
    uR?: number;
    tracking?: WingUpdate["tracking"];
    resuming?: boolean;
    resumed?: boolean;
  }): WingUpdate {
    const previous = this.last;
    const u = override.u ?? previous?.u ?? 0;
    const uL = override.uL ?? previous?.uL ?? 0;
    const uR = override.uR ?? previous?.uR ?? 0;
    const hold =
      this.stage === "return"
        ? clamp01(this.returnHold / this.config.returnHoldMs)
        : this.stage === "open" && !this.openValid
          ? clamp01(this.openHold / this.config.openHoldMs)
          : this.stage === "ready"
            ? clamp01(this.readyHold / this.config.readyHoldMs)
            : 0;
    const next: WingUpdate = {
      needsReady: this.stage === "ready" && !this.armed,
      stage: this.stage,
      u,
      uL,
      uR,
      hold,
      openValid: this.openValid,
      reps: this.reps,
      added: override.added,
      effectiveMs: this.effectiveMs,
      lostMs: this.lostMs,
      interrupted: this.resumePending,
      resuming: override.resuming ?? false,
      resumed: override.resumed ?? false,
      complete: this.complete,
      overSoftLimit:
        !this.complete && this.effectiveMs >= this.config.softLimitMs,
      tracking: override.tracking ?? "ok",
    };
    this.last = next;
    return next;
  }
}

/** 界面文案：由状态机状态推导当前动作指令 */
export function wingInstruction(update: WingUpdate): string {
  if (update.complete) return "光能量已充满";
  if (update.tracking === "lost") return "正在重新识别身体";
  if (update.resuming) return "识别已恢复，准备继续";
  if (update.needsReady) return "双臂慢慢收回，准备接光";
  if (update.stage === "open") return update.openValid ? "放松回位" : "保持一下";
  if (update.stage === "return") return "放松回位";
  if (update.u >= 0.35) return "继续缓缓展开";
  return "缓慢展开双臂";
}
