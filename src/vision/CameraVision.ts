import {
  FaceLandmarker,
  FilesetResolver,
  HandLandmarker,
  PoseLandmarker,
} from "@mediapipe/tasks-vision";
import { matrixAngles } from "./pose";
import type { PoseFrame } from "./wingPose";
import {
  Ema,
  GestureDetector,
  faceCenterX,
  headGeometry,
  type Baseline,
  type GestureConfig,
} from "./gesture";
import {
  HandSwipeDetector,
  NodDetector,
  type HandSwipeConfig,
  type NodConfig,
} from "./handSwipe";
import { SelectionHeadDetector } from "./selectionHead";
import type {
  HeadDirection,
  SelectionInputMode,
  VisionStatus,
} from "./types";
import { cameraError } from "./pose";

const INFER_INTERVAL_MS = 1000 / 12; // 目标 ~12 FPS 姿态推理
const STATUS_INTERVAL_MS = 125; // HUD 状态广播 8 Hz
const FACE_LOST_DEBOUNCE_MS = 450; // 丢脸防抖，避免单帧丢失误暂停
const CALIBRATION_HOLD_MS = 1300; // 自然姿态稳定保持时长
const CALIBRATION_TOLERANCE = 0.035; // 稳定窗口允许的归一化偏移幅度
const HAND_INFER_INTERVAL_MS = 1000 / 7; // 手部分析略慢一档，节省 CPU
const POSE_INFER_INTERVAL_MS = 1000 / 12; // G02 身体关键点：12Hz 足够且省电

type ActionListener = (direction: Exclude<HeadDirection, "center">) => void;
type StatusListener = (status: VisionStatus) => void;
type HandSwipeListener = (direction: "left" | "right") => void;
type NodListener = () => void;

/**
 * 全局唯一摄像头视觉管线。
 * - FaceLandmarker + 可选 HandLandmarker，跨校准/选择/游戏复用。
 * - 推理循环与 React 渲染解耦：不以 setState 驱动，状态 8Hz 广播。
 * - 所有手势判定相对用户 baseline（几何分数，符号由成像物理确定）。
 */
export class CameraVision {
  private video: HTMLVideoElement | null = null;
  private stream: MediaStream | null = null;
  private model: FaceLandmarker | null = null;
  private modelPromise: Promise<FaceLandmarker> | null = null;
  private handModel: HandLandmarker | null = null;
  private handModelPromise: Promise<HandLandmarker> | null = null;
  private handModelReady = false;

  // ---- G02 身体关键点：与 G01 共用同一条视频流，不重复占用摄像头 ----
  private poseModel: PoseLandmarker | null = null;
  private poseModelPromise: Promise<PoseLandmarker> | null = null;
  private poseModelReady = false;
  private poseActive = false;
  private poseError: string | null = null;
  private poseListeners = new Set<(frame: PoseFrame | null) => void>();
  private lastPoseInfer = 0;
  private lastPoseVideoTime = -1;
  private latestPose: PoseFrame | null = null;
  private poseFrames = 0;
  private lastPoseSuccessAt = 0;
  private poseInferError: string | null = null;
  private faceInferError: string | null = null;
  private raf = 0;
  private running = false;
  private startPromise: Promise<void> | null = null;
  private startVersion = 0;
  private pendingStream: MediaStream | null = null;

  private detector = new GestureDetector();
  private handSwipe = new HandSwipeDetector();
  private nodDetector = new NodDetector();
  private selectionHead = new SelectionHeadDetector();
  private emaYaw = new Ema(0.4);
  private emaPitch = new Ema(0.4);
  private emaPalmX = new Ema(0.32);
  private baseline: Baseline | null = null;
  private selectionBaseline: Baseline | null = null;
  private selectionSamples: { yaw: number; pitch: number }[] = [];
  private selectionActive = false;
  private selectionMode: SelectionInputMode = "hand";

  private actionListeners = new Set<ActionListener>();
  private statusListeners = new Set<StatusListener>();
  private handSwipeListeners = new Set<HandSwipeListener>();
  private nodListeners = new Set<NodListener>();

  private lastInfer = 0;
  private lastHandInfer = 0;
  private lastVideoTime = -1;
  private lastStatus = 0;
  private frames = 0;
  private inferMs = 0;
  private windowStart = 0;
  private windowFrames = 0;
  private fps = 0;

  private faceMissingSince: number | null = null;
  private facePresent = false;
  private emaFaceCX = new Ema(0.25);
  private lastFaceCX: number | null = null;
  private lastPalmX: number | null = null;
  private handPresent = false;
  private lastHandInferTime = 0;

  private calibrating = false;
  private calibrationStableMs = 0;
  private calibrationLast = 0;
  private calibrationSamples: { yaw: number; pitch: number }[] = [];
  private calibrationDone: (() => void) | null = null;

  /** 供调试面板读取的矩阵估计角（仅诊断，不驱动判定） */
  matrixYawDeg: number | null = null;
  matrixPitchDeg: number | null = null;

  private ensureModel() {
    if (this.model) return Promise.resolve(this.model);
    if (!this.modelPromise) {
      this.modelPromise = (async () => {
        const files = await FilesetResolver.forVisionTasks("/mediapipe/wasm");
        const model = await FaceLandmarker.createFromOptions(files, {
          baseOptions: { modelAssetPath: "/mediapipe/face_landmarker.task" },
          runningMode: "VIDEO",
          numFaces: 1,
          outputFacialTransformationMatrixes: true,
          outputFaceBlendshapes: false,
        });
        this.model = model;
        return model;
      })();
      this.modelPromise.catch(() => {
        this.modelPromise = null;
      });
    }
    return this.modelPromise;
  }

  private ensureHandModel() {
    if (this.handModel) return Promise.resolve(this.handModel);
    if (this.handModelPromise) return this.handModelPromise;
    this.handModelPromise = (async () => {
      try {
        const files = await FilesetResolver.forVisionTasks("/mediapipe/wasm");
        const model = await HandLandmarker.createFromOptions(files, {
          baseOptions: {
            modelAssetPath: "/mediapipe/hand_landmarker.task",
          },
          runningMode: "VIDEO",
          numHands: 1,
          minHandDetectionConfidence: 0.5,
          minHandPresenceConfidence: 0.5,
          minTrackingConfidence: 0.5,
        });
        this.handModel = model;
        this.handModelReady = true;
        return model;
      } catch (e) {
        this.handModelReady = false;
        this.handModelPromise = null;
        throw e;
      }
    })();
    return this.handModelPromise;
  }

  get isRunning() {
    return this.running;
  }

  get handReady() {
    return this.handModelReady;
  }

  get poseReady() {
    return this.poseModelReady;
  }

  /** 身体模型加载失败原因（成功时为 null） */
  get poseLoadError() {
    return this.poseError;
  }

  /**
   * 加载本地 Pose Landmarker（lite 版，5.7MB，随项目静态资源提供）。
   * 优先 GPU delegate，失败自动退回 CPU —— 两条路径都在浏览器本地运行。
   */
  private ensurePoseModel() {
    if (this.poseModel) return Promise.resolve(this.poseModel);
    if (this.poseModelPromise) return this.poseModelPromise;
    this.poseModelPromise = (async () => {
      try {
        const files = await FilesetResolver.forVisionTasks("/mediapipe/wasm");
        const create = (delegate: "GPU" | "CPU") =>
          PoseLandmarker.createFromOptions(files, {
            baseOptions: {
              modelAssetPath: "/mediapipe/pose_landmarker_lite.task",
              delegate,
            },
            runningMode: "VIDEO",
            numPoses: 1,
            minPoseDetectionConfidence: 0.5,
            minPosePresenceConfidence: 0.5,
            minTrackingConfidence: 0.5,
          });
        let model: PoseLandmarker;
        try {
          model = await create("GPU");
        } catch {
          model = await create("CPU");
        }
        this.poseModel = model;
        this.poseModelReady = true;
        this.poseError = null;
        return model;
      } catch (e) {
        this.poseModelReady = false;
        this.poseModelPromise = null;
        this.poseError =
          e instanceof Error ? e.message : "身体关键点模型加载失败";
        throw e;
      }
    })();
    return this.poseModelPromise;
  }

  /**
   * G02 生命周期门：只有展翼接光的校准/游戏阶段才跑身体关键点推理，
   * G01 与日常陪伴阶段完全不受影响。
   */
  private setPoseActive(active: boolean) {
    if (this.poseActive === active) return;
    this.poseActive = active;
    this.lastPoseInfer = 0;
    this.lastPoseVideoTime = -1;
    if (active && this.running) {
      this.ensurePoseModel().catch(() => {
        /* 失败原因由 poseLoadError 带回界面 */
      });
    }
  }

  /** 校准页复用同一条视频流做镜像预览，不重新申请摄像头 */
  getVideoElement() {
    return this.video;
  }

  onPose(listener: (frame: PoseFrame | null) => void) {
    this.poseListeners.add(listener);
    // 订阅者共同持有推理任务，旧页面的清理不能关闭新页面正在使用的模型。
    this.setPoseActive(true);
    if (this.latestPose && performance.now() - this.latestPose.at <= 320)
      listener(this.latestPose);
    return () => {
      this.poseListeners.delete(listener);
      this.setPoseActive(this.poseListeners.size > 0);
    };
  }

  private emitPose(frame: PoseFrame | null) {
    this.latestPose = frame;
    this.poseListeners.forEach((listener) => listener(frame));
  }

  /** 仅包含状态与关键点置信度，不包含图像；供可关闭的调试面板读取。 */
  getPoseDiagnostics() {
    return {
      running: this.running,
      track: this.stream?.getVideoTracks()[0]?.readyState ?? "none",
      videoPaused: this.video?.paused ?? true,
      videoTime: this.video?.currentTime ?? 0,
      poseActive: this.poseActive,
      poseReady: this.poseModelReady,
      subscribers: this.poseListeners.size,
      frames: this.poseFrames,
      frameAgeMs: this.latestPose ? performance.now() - this.latestPose.at : null,
      lastSuccessAgeMs: this.lastPoseSuccessAt ? performance.now() - this.lastPoseSuccessAt : null,
      visibility: [11, 12, 13, 14, 15, 16].map(i => this.latestPose?.landmarks[i]?.visibility ?? null),
      error: this.poseError ?? this.poseInferError,
      faceError: this.faceInferError,
    };
  }

  private tickPose(now: number) {
    if (!this.poseActive) return;
    if (now - this.lastPoseInfer < POSE_INFER_INTERVAL_MS) return;
    const model = this.poseModel;
    const video = this.video;
    if (!model || !video || video.readyState < 2) return;
    // 同一视频帧不重复推理；新帧到达才继续
    if (video.currentTime === this.lastPoseVideoTime) return;
    this.lastPoseInfer = now;
    this.lastPoseVideoTime = video.currentTime;
    try {
      const result = model.detectForVideo(video, now);
      this.poseFrames++;
      this.poseInferError = null;
      const landmarks = result.landmarks?.[0];
      const frame: PoseFrame | null =
        landmarks && landmarks.length > 0
          ? {
              landmarks: landmarks.map((point) => ({
                x: point.x,
                y: point.y,
                visibility: point.visibility,
              })),
              videoWidth: video.videoWidth,
              videoHeight: video.videoHeight,
              at: now,
            }
          : null;
      if (frame) this.lastPoseSuccessAt = now;
      this.emitPose(frame);
    } catch (error) {
      // 保留可追查错误；上层按旧帧时间判定失效，不能伪装成有效追踪。
      this.poseInferError = error instanceof Error ? error.message : String(error);
    }
  }

  setGestureConfig(config: Partial<GestureConfig>) {
    this.detector.setConfig(config);
  }

  setHandSwipeConfig(config: Partial<HandSwipeConfig>) {
    this.handSwipe.setConfig(config);
  }

  setNodConfig(config: Partial<NodConfig>) {
    this.nodDetector.setConfig(config);
  }

  setSelectionMode(mode: SelectionInputMode) {
    if (this.selectionMode === mode) return;
    this.selectionMode = mode;
    this.handSwipe.reset();
    this.selectionHead.reset();
    this.nodDetector.reset();
    if (
      mode === "hand" &&
      this.selectionActive &&
      this.running &&
      !this.handModelPromise
    ) {
      this.ensureHandModel().catch(() => {
        // 模型缺失或加载失败：保持 handModelReady=false，调用方据此降级
      });
    }
  }

  /** 选择页生命周期门：只在这里运行 Hand，并建立独立于游戏校准的自然姿态基准。 */
  setSelectionActive(active: boolean) {
    if (this.selectionActive === active) return;
    this.selectionActive = active;
    this.selectionBaseline = null;
    this.selectionSamples = [];
    this.selectionHead.reset();
    this.nodDetector.reset();
    this.handSwipe.reset();
    this.handPresent = false;
    this.lastPalmX = null;
    this.emaPalmX.reset();
    if (active && this.selectionMode === "hand" && this.running) {
      this.ensureHandModel().catch(() => {
        /* 状态字段带回 handModelReady=false，界面仍保留点头提示 */
      });
    }
    this.emitStatus();
  }

  /** 幂等启动：并发/重复调用共享同一次启动 */
  start(): Promise<void> {
    if (this.running) return Promise.resolve();
    if (this.startPromise) return this.startPromise;
    const version = ++this.startVersion;
    let openingStream: MediaStream | null = null;
    let openingVideo: HTMLVideoElement | null = null;
    this.startPromise = (async () => {
      if (!navigator.mediaDevices?.getUserMedia)
        throw new Error("请通过 localhost 或 HTTPS 打开");
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 480, height: 270, facingMode: "user" },
        audio: false,
      });
      openingStream = stream;
      if (version !== this.startVersion) throw new Error("摄像头启动已取消");
      this.pendingStream = stream;
      const video = document.createElement("video");
      openingVideo = video;
      video.muted = true;
      video.playsInline = true;
      video.srcObject = stream;
      await video.play();
      const model = await this.ensureModel();
      // 退出后迟到的权限/模型结果不得重新打开摄像头，也不能清掉新一轮的视频。
      if (version !== this.startVersion) throw new Error("摄像头启动已取消");
      this.stream = stream;
      this.pendingStream = null;
      this.video = video;
      this.frames = 0;
      this.fps = 0;
      this.windowFrames = 0;
      this.windowStart = performance.now();
      this.lastVideoTime = -1;
      this.faceMissingSince = null;
      this.facePresent = false;
      this.handPresent = false;
      this.lastPalmX = null;
      this.emaPalmX.reset();
      this.handSwipe.reset();
      this.nodDetector.reset();
      this.running = true;
      if (this.selectionActive && this.selectionMode === "hand") {
        this.ensureHandModel().catch(() => {
          /* 静默失败：状态字段会带回 handModelReady=false */
        });
      }
      // 若进入 G02 时摄像头已在运行，按需补载身体模型
      if (this.poseActive) {
        this.ensurePoseModel().catch(() => {
          /* 失败原因由 poseLoadError 带回界面 */
        });
      }
      const loop = (now: number) => {
        if (!this.running) return;
        try {
          // Body games do not consume face landmarks. Keep the shared stream, run one model.
          if (!this.poseActive) this.tickFace(model, now);
        } catch (error) {
          // 人脸模型故障不能终止整条 RAF，从而连带冻结 G02 身体推理。
          this.faceInferError = error instanceof Error ? error.message : String(error);
          this.facePresent = false;
          this.emitStatus();
        }
        this.tickHand(now);
        this.tickPose(now);
        this.raf = requestAnimationFrame(loop);
      };
      this.raf = requestAnimationFrame(loop);
    })()
      .catch((error) => {
        openingStream?.getTracks().forEach(t => t.stop());
        if (openingVideo) openingVideo.srcObject = null;
        if (version === this.startVersion) {
          this.pendingStream = null;
          this.releaseStream();
        }
        if (version !== this.startVersion)
          throw new DOMException("摄像头启动已取消", "AbortError");
        throw new Error(cameraError(error, "摄像头启动"));
      })
      .finally(() => {
        if (version === this.startVersion) this.startPromise = null;
      });
    return this.startPromise;
  }

  private tickFace(model: FaceLandmarker, now: number) {
    const video = this.video;
    if (!video) return;
    if (
      now - this.lastInfer >= INFER_INTERVAL_MS &&
      video.readyState >= 2 &&
      video.currentTime !== this.lastVideoTime
    ) {
      this.lastInfer = now;
      this.lastVideoTime = video.currentTime;
      const begin = performance.now();
      const result = model.detectForVideo(video, now);
      this.faceInferError = null;
      this.inferMs = performance.now() - begin;
      this.frames++;
      this.windowFrames++;
      if (now - this.windowStart >= 2000) {
        this.fps = this.windowFrames / ((now - this.windowStart) / 1000);
        this.windowFrames = 0;
        this.windowStart = now;
      }
      const landmarks = result.faceLandmarks[0];
      if (landmarks && landmarks.length > 0) {
        this.faceMissingSince = null;
        this.facePresent = true;
        const geometry = headGeometry(landmarks);
        const yaw = this.emaYaw.push(geometry.yaw);
        const pitch = this.emaPitch.push(geometry.pitch);
        this.lastFaceCX = this.emaFaceCX.push(faceCenterX(landmarks));
        const matrix = result.facialTransformationMatrixes[0];
        if (matrix) {
          const angles = matrixAngles(matrix.data);
          this.matrixYawDeg = angles.yaw;
          this.matrixPitchDeg = angles.pitch;
        }
        if (this.selectionActive)
          this.updateSelectionTracking(yaw, pitch, now);
        else if (this.calibrating) this.updateCalibration(yaw, pitch, now);
        else if (this.baseline) {
          const dYaw = yaw - this.baseline.yaw;
          const dPitch = pitch - this.baseline.pitch;
          const fired = this.detector.update(dYaw, dPitch, now);
          if (fired && fired !== "center") this.emitAction(fired);
        }
      } else if (this.facePresent && this.faceMissingSince === null) {
        this.faceMissingSince = now;
      }
      if (
        this.faceMissingSince !== null &&
        now - this.faceMissingSince > FACE_LOST_DEBOUNCE_MS
      ) {
        this.facePresent = false;
        if (this.calibrating) this.resetCalibrationProgress();
        if (this.selectionActive) {
          this.selectionBaseline = null;
          this.selectionSamples = [];
          this.selectionHead.reset();
          this.nodDetector.reset();
        }
      }
    }
    if (now - this.lastStatus >= STATUS_INTERVAL_MS) {
      this.lastStatus = now;
      this.emitStatus();
    }
  }

  private tickHand(now: number) {
    if (!this.selectionActive || this.selectionMode !== "hand") return;
    if (now - this.lastHandInfer < HAND_INFER_INTERVAL_MS) return;
    this.lastHandInfer = now;
    if (!this.handModel || !this.video) return;
    if (this.video.readyState < 2) return;
    // 复用上次 videoTime 即可，单帧足够；但每 N ms 仍走一次确保新帧被采样
    if (this.video.currentTime === this.lastHandInferTime) return;
    this.lastHandInferTime = this.video.currentTime;
    try {
      const result = this.handModel.detectForVideo(this.video, now);
      const landmarks = result.landmarks?.[0];
      if (landmarks && landmarks.length > 0) {
        // landmark 0 = wrist；landmark 9 = middle finger MCP（约等于掌心）。
        // wrist 在 low-light 下更稳健，作为掌心信号。
        const wrist = landmarks[0];
        const palmX = this.emaPalmX.push(wrist.x);
        this.lastPalmX = palmX;
        this.handPresent = true;
        const swipe = this.handSwipe.update(true, palmX, now);
        if (swipe) this.emitHandSwipe(swipe);
      } else {
        this.lastPalmX = null;
        // 给 detector 一个「手离开了」的样本以清空轨迹
        this.handSwipe.update(false, 0.5, now);
        this.handPresent = false;
      }
    } catch {
      // 单帧推理失败通常是因为新视频帧尚未就绪；下一帧再试
    }
  }

  private updateSelectionTracking(yaw: number, pitch: number, now: number) {
    if (!this.selectionBaseline) {
      const samples = this.selectionSamples;
      samples.push({ yaw, pitch });
      if (samples.length > 12) samples.shift();
      if (samples.length < 8) return;
      const yawValues = samples.map((sample) => sample.yaw);
      const pitchValues = samples.map((sample) => sample.pitch);
      if (
        Math.max(...yawValues) - Math.min(...yawValues) >=
          CALIBRATION_TOLERANCE ||
        Math.max(...pitchValues) - Math.min(...pitchValues) >=
          CALIBRATION_TOLERANCE
      )
        return;
      this.selectionBaseline = {
        yaw: yawValues.reduce((sum, value) => sum + value, 0) / yawValues.length,
        pitch:
          pitchValues.reduce((sum, value) => sum + value, 0) /
          pitchValues.length,
      };
      this.selectionHead.reset();
      this.nodDetector.reset();
      this.emitStatus();
      return;
    }
    const dYaw = yaw - this.selectionBaseline.yaw;
    const dPitch = pitch - this.selectionBaseline.pitch;
    if (this.selectionMode === "head") {
      const direction = this.selectionHead.update(dYaw, now);
      if (direction) this.emitAction(direction);
    }
    if (this.nodDetector.update(dPitch, now)) this.emitNod();
  }

  private updateCalibration(yaw: number, pitch: number, now: number) {
    const samples = this.calibrationSamples;
    samples.push({ yaw, pitch });
    if (samples.length > 24) samples.shift();
    let stable = false;
    if (samples.length >= 8) {
      let minY = Infinity,
        maxY = -Infinity,
        minP = Infinity,
        maxP = -Infinity;
      for (const s of samples) {
        minY = Math.min(minY, s.yaw);
        maxY = Math.max(maxY, s.yaw);
        minP = Math.min(minP, s.pitch);
        maxP = Math.max(maxP, s.pitch);
      }
      stable =
        maxY - minY < CALIBRATION_TOLERANCE &&
        maxP - minP < CALIBRATION_TOLERANCE;
    }
    if (stable) {
      this.calibrationStableMs += now - this.calibrationLast;
      if (this.calibrationStableMs >= CALIBRATION_HOLD_MS) {
        const n = samples.length;
        this.baseline = {
          yaw: samples.reduce((a, s) => a + s.yaw, 0) / n,
          pitch: samples.reduce((a, s) => a + s.pitch, 0) / n,
        };
        this.calibrating = false;
        this.detector.reset();
        this.nodDetector.reset();
        const done = this.calibrationDone;
        this.calibrationDone = null;
        this.emitStatus();
        done?.();
      }
    } else {
      this.calibrationStableMs = 0;
    }
    this.calibrationLast = now;
  }

  private resetCalibrationProgress() {
    this.calibrationStableMs = 0;
    this.calibrationSamples = [];
  }

  /** 开始自然姿态校准；完成后回调并进入动作识别 */
  beginCalibration(onDone: () => void) {
    this.baseline = null;
    this.calibrating = true;
    this.calibrationStableMs = 0;
    this.calibrationSamples = [];
    this.calibrationLast = performance.now();
    this.calibrationDone = onDone;
    this.emaYaw.reset();
    this.emaPitch.reset();
    this.detector.reset();
  }

  cancelCalibration() {
    this.calibrating = false;
    this.calibrationDone = null;
  }

  /** 校准进度 0~1 */
  get calibrationProgress() {
    if (!this.calibrating) return null;
    return Math.min(this.calibrationStableMs / CALIBRATION_HOLD_MS, 1);
  }

  get currentDirection(): HeadDirection {
    if (!this.baseline) return "center";
    const yaw = this.emaYaw.current;
    const pitch = this.emaPitch.current;
    if (yaw === null || pitch === null) return "center";
    return this.detector.direction(
      yaw - this.baseline.yaw,
      pitch - this.baseline.pitch,
    );
  }

  onAction(listener: ActionListener) {
    this.actionListeners.add(listener);
    return () => {
      this.actionListeners.delete(listener);
    };
  }
  onStatus(listener: StatusListener) {
    this.statusListeners.add(listener);
    return () => {
      this.statusListeners.delete(listener);
    };
  }
  onHandSwipe(listener: HandSwipeListener) {
    this.handSwipeListeners.add(listener);
    return () => {
      this.handSwipeListeners.delete(listener);
    };
  }
  onNod(listener: NodListener) {
    this.nodListeners.add(listener);
    return () => {
      this.nodListeners.delete(listener);
    };
  }

  private emitAction(direction: Exclude<HeadDirection, "center">) {
    this.actionListeners.forEach((l) => l(direction));
  }
  private emitHandSwipe(direction: "left" | "right") {
    this.handSwipeListeners.forEach((l) => l(direction));
  }
  private emitNod() {
    this.nodListeners.forEach((l) => l());
  }
  private emitStatus() {
    const yaw = this.emaYaw.current;
    const pitch = this.emaPitch.current;
    const status: VisionStatus = {
      running: this.running,
      facePresent: this.facePresent,
      direction: this.currentDirection,
      dYaw:
        (this.selectionActive ? this.selectionBaseline : this.baseline) &&
        yaw !== null
          ? yaw -
            (this.selectionActive
              ? this.selectionBaseline!.yaw
              : this.baseline!.yaw)
          : 0,
      dPitch:
        (this.selectionActive ? this.selectionBaseline : this.baseline) &&
        pitch !== null
          ? pitch -
            (this.selectionActive
              ? this.selectionBaseline!.pitch
              : this.baseline!.pitch)
          : 0,
      rawYaw: yaw ?? 0,
      rawPitch: pitch ?? 0,
      faceCenterX: this.facePresent ? this.lastFaceCX : null,
      fps: this.fps,
      inferMs: this.inferMs,
      frames: this.frames,
      calibrated: this.baseline !== null,
      calibrating: this.calibrationProgress,
      palmX: this.handPresent ? this.lastPalmX : null,
      handPresent: this.handPresent,
      selectionMode: this.selectionMode,
      selectionReady: this.selectionBaseline !== null,
      handModelReady: this.handModelReady,
    };
    this.statusListeners.forEach((l) => l(status));
  }

  private releaseStream() {
    cancelAnimationFrame(this.raf);
    this.running = false;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    if (this.video) this.video.srcObject = null;
    this.video = null;
    this.facePresent = false;
    this.handPresent = false;
    this.calibrating = false;
    this.calibrationDone = null;
    this.lastFaceCX = null;
    this.lastPalmX = null;
    this.emaFaceCX.reset();
    this.emaPalmX.reset();
    this.handSwipe.reset();
    this.nodDetector.reset();
    this.selectionHead.reset();
    this.selectionBaseline = null;
    this.selectionSamples = [];
    this.baseline = null;
    // G02 身体关键点：只停推理，保留已加载模型（下次进入游戏更快）
    this.poseActive = this.poseListeners.size > 0;
    this.lastPoseInfer = 0;
    this.lastPoseVideoTime = -1;
    this.emitPose(null);
  }

  /** 停止摄像头并释放视频轨道；模型保留以加速下次启动 */
  stop() {
    this.startVersion++;
    this.startPromise = null;
    this.pendingStream?.getTracks().forEach(t => t.stop());
    this.pendingStream = null;
    this.releaseStream();
    this.emitStatus();
  }
}

export const cameraVision = new CameraVision();
