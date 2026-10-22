import { useEffect, useRef, useState, type MutableRefObject } from "react";
import { cameraVision } from "../vision/CameraVision";
import {
  WingSession,
  measureWing,
  wingInstruction,
  wingTrackingHint,
  type PoseFrame,
  type WingProfile,
  type WingUpdate,
} from "../vision/wingPose";

/**
 * G02 会话 hook：把「摄像头关键点」和「动作状态机」接在一起。
 *
 * 职责边界：
 * - 摄像头管理在 vision/CameraVision（与 G01 共用一条视频流）；
 * - 动作判定在 vision/wingPose（纯逻辑、可单测）；
 * - 这里只负责每帧取数、推进时间、把 HUD 以 10Hz 交给 React，
 *   同时用 60fps 的 onFrame 给动画层直接写 DOM，避免高频重渲染。
 */

export type WingInputMode = "camera" | "demo";

/** 演示模式的合成阈值：键盘 u 直接映射到 0~1 */
export const DEMO_WING_PROFILE: WingProfile = {
  q0L: 0,
  q1L: 1,
  q0R: 0,
  q1R: 1,
  jitter: 0,
  shoulderWidthPx: 0,
};

export interface WingHud {
  u: number;
  stage: WingUpdate["stage"];
  openValid: boolean;
  hold: number;
  reps: number;
  effectiveMs: number;
  tracking: WingUpdate["tracking"];
  interrupted: boolean;
  resuming: boolean;
  complete: boolean;
  overSoftLimit: boolean;
  /** 当前动作指令文案（缓慢展开 / 保持一下 / 放松回位） */
  instruction: string;
  poseReady: boolean;
  poseError: string | null;
}

const EMPTY_HUD: WingHud = {
  u: 0,
  stage: "ready",
  openValid: false,
  hold: 0,
  reps: 0,
  effectiveMs: 0,
  tracking: "ok",
  interrupted: false,
  resuming: false,
  complete: false,
  overSoftLimit: false,
  instruction: "缓慢展开双臂",
  poseReady: false,
  poseError: null,
};

/** 关键点超过该时间没有更新，就按「本帧无效」处理 */
const FRAME_STALE_MS = 320;

export function useWingSession(options: {
  paused: boolean;
  profile: WingProfile | null;
  mode: WingInputMode;
  onRep?: (reps: number) => void;
  onComplete?: () => void;
  onFrame?: (update: WingUpdate) => void;
}): {
  hud: WingHud;
  /** 演示模式下由外层按键写入：true = 模拟「双臂展开」 */
  demoHoldRef: MutableRefObject<boolean>;
  sessionRef: MutableRefObject<WingSession | null>;
} {
  const { paused, profile, mode, onRep, onComplete, onFrame } = options;
  const [hud, setHud] = useState<WingHud>(EMPTY_HUD);
  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  const frameRef = useRef<PoseFrame | null>(null);
  const demoHoldRef = useRef(false);
  const demoU = useRef(0);
  const sessionRef = useRef<WingSession | null>(null);
  const callbacks = useRef({ onRep, onComplete, onFrame });
  callbacks.current = { onRep, onComplete, onFrame };

  // 摄像头关键点订阅：只有游戏/校准挂载期间才打开身体模型
  useEffect(() => {
    if (mode !== "camera") return;
    const off = cameraVision.onPose((frame) => {
      frameRef.current = frame;
    });
    return () => {
      off();
      frameRef.current = null;
    };
  }, [mode]);

  useEffect(() => {
    if (paused) { sessionRef.current?.pause(); demoHoldRef.current = false; }
  }, [paused]);

  useEffect(() => {
    if (!profile) {
      sessionRef.current = null;
      setHud(EMPTY_HUD);
      return;
    }
    const session = new WingSession(profile);
    sessionRef.current = session;
    let raf = 0;
    let last = performance.now();
    let lastFlush = 0;
    let completeSent = false;

    const readSample = (now: number, dt: number) => {
      if (mode === "demo") {
        // 键盘演示：按住空格缓慢展开，松开缓慢回位（与真人节奏接近）
        const target = demoHoldRef.current ? 1 : 0;
        demoU.current +=
          (target - demoU.current) * (1 - Math.exp(-Math.max(dt, 1) / 190));
        const u = demoU.current;
        return {
          qL: profile.q0L + u * (profile.q1L - profile.q0L),
          qR: profile.q0R + u * (profile.q1R - profile.q0R),
          shoulderWidthPx: profile.shoulderWidthPx,
          mirrored: false,
        };
      }
      const frame = frameRef.current;
      if (!frame || now - frame.at > FRAME_STALE_MS) return null;
      return measureWing(
        frame.landmarks,
        frame.videoWidth,
        frame.videoHeight,
      );
    };

    const tick = (now: number) => {
      const dt = Math.min(now - last, 120);
      last = now;
      if (!pausedRef.current) {
        const update = session.update(dt, readSample(now, dt));
        callbacks.current.onFrame?.(update);
        if (update.added > 0) callbacks.current.onRep?.(update.reps);
        if (update.complete && !completeSent) {
          completeSent = true;
          callbacks.current.onComplete?.();
        }
        if (now - lastFlush > 90) {
          lastFlush = now;
          setHud({
            u: update.u,
            stage: update.stage,
            openValid: update.openValid,
            hold: update.hold,
            reps: update.reps,
            effectiveMs: update.effectiveMs,
            tracking: update.tracking,
            interrupted: update.interrupted,
            resuming: update.resuming,
            complete: update.complete,
            overSoftLimit: update.overSoftLimit,
            instruction: update.tracking === "lost"
              ? wingTrackingHint(frameRef.current && now - frameRef.current.at <= FRAME_STALE_MS ? frameRef.current.landmarks : null)
              : wingInstruction(update),
            poseReady: cameraVision.poseReady,
            poseError: cameraVision.poseLoadError,
          });
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [profile, mode]);

  return { hud, demoHoldRef, sessionRef };
}
