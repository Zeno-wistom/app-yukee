import { useEffect, useRef, useState, type CSSProperties } from "react";
import { audioEngine } from "../audio/engine";
import { cameraVision } from "../vision/CameraVision";
import {
  DEMO_LEAN_PROFILE,
  LeanCalibrator,
  leanAmount,
  measureLean,
  type LeanMode,
  type LeanProfile,
  type LeanSample,
} from "../vision/leanPose";
import type { PoseFrame } from "../vision/wingPose";
import "./leanSurf.css";

/**
 * v2 一步校准：看见双肩 → 自然坐好约 1 秒 → 直接出发。
 * 不再要求左右各做一次校准动作、不再 3 秒倒计时；髋部可选。
 */
export default function LeanCalibrationView({
  paused,
  onCalibrated,
}: {
  paused: boolean;
  onCalibrated: (p: LeanProfile, mode: LeanMode) => void;
}) {
  const slot = useRef<HTMLDivElement>(null),
    canvas = useRef<HTMLCanvasElement>(null);
  const callback = useRef(onCalibrated);
  callback.current = onCalibrated;
  const pauseRef = useRef(paused);
  pauseRef.current = paused;
  const done = useRef(false);
  const [attempt, setAttempt] = useState(0);
  const [hud, setHud] = useState({
    stage: "visible" as "visible" | "neutral" | "ready",
    progress: 0,
    shoulders: false,
    hips: false,
    u: 0,
  });
  const [error, setError] = useState("");
  // 错误反馈：出现错误提示时一声短促的低音（带 1.2 s 冷却）
  useEffect(() => {
    if (error) audioEngine.ui("ui-error");
  }, [error]);
  useEffect(() => {
    let cancelled = false,
      raf = 0,
      off: (() => void) | undefined,
      preview: HTMLVideoElement | null = null;
    let latest: PoseFrame | null = null,
      lastSample = -Infinity,
      readyAt = 0,
      flush = 0;
    const calibrator = new LeanCalibrator();
    done.current = false;
    const tick = (now: number) => {
      const fresh = latest && now - latest.at < 250;
      const s: LeanSample | null = fresh ? measureLean(latest) : null;
      if (pauseRef.current) {
        calibrator.update(null, now);
      } else if (calibrator.stage !== "ready") {
        if (s === null) calibrator.update(null, now);
        else if (latest!.at > lastSample) {
          lastSample = latest!.at;
          calibrator.update(s, latest!.at);
        }
      } else if (calibrator.profile && !done.current && s && !pauseRef.current) {
        // 「好了」状态展示 0.7 秒后直接进入游戏
        if (!readyAt) readyAt = now;
        if (now - readyAt > 700) {
          done.current = true;
          callback.current(calibrator.profile, "camera");
          return;
        }
      } else readyAt = 0;
      if (now - flush > 80) {
        flush = now;
        setHud({
          stage: calibrator.stage,
          progress: calibrator.progress,
          shoulders: s !== null,
          hips: s?.torso != null,
          u:
            s && calibrator.profile
              ? leanAmount(s, calibrator.profile)
              : 0,
        });
      }
      raf = requestAnimationFrame(tick);
    };
    const draw = (f: PoseFrame | null) => {
      const ctx = canvas.current?.getContext("2d");
      if (!ctx) return;
      const cv = canvas.current!;
      ctx.clearRect(0, 0, cv.width, cv.height);
      if (!f) return;
      // 骨架画布使用真实视频宽高（取自 Codex v2），避免 16:9 覆盖层与 4:3 摄像头错位
      if (cv.width !== f.videoWidth || cv.height !== f.videoHeight) {
        cv.width = f.videoWidth;
        cv.height = f.videoHeight;
      }
      ctx.lineWidth = 4;
      ctx.lineCap = "round";
      for (const [i, j] of [
        [11, 12],
        [11, 23],
        [12, 24],
        [23, 24],
      ]) {
        const p = f.landmarks[i],
          q = f.landmarks[j];
        if (!p || !q) continue;
        const ok = (p.visibility ?? 0) >= 0.5 && (q.visibility ?? 0) >= 0.5;
        if (!ok && (i !== 11 || j !== 12)) continue;
        ctx.strokeStyle = ok ? "#8de9bc" : "#ffd98e";
        ctx.beginPath();
        ctx.moveTo(p.x * cv.width, p.y * cv.height);
        ctx.lineTo(q.x * cv.width, q.y * cv.height);
        ctx.stroke();
      }
    };
    (async () => {
      try {
        await cameraVision.start();
        if (cancelled) return;
        const source = cameraVision.getVideoElement();
        if (source && slot.current) {
          preview = document.createElement("video");
          preview.muted = true;
          preview.playsInline = true;
          preview.srcObject = source.srcObject;
          slot.current.replaceChildren(preview);
          await preview.play();
          if (cancelled) {
            preview.srcObject = null;
            return;
          }
        }
        off = cameraVision.onPose((f) => {
          latest = f;
          draw(f);
        });
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    })();
    raf = requestAnimationFrame(tick);
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      off?.();
      if (preview) {
        preview.pause();
        preview.srcObject = null;
        preview.remove();
      }
    };
  }, [attempt]);
  const title = error
    ? "摄像头暂不可用"
    : hud.stage === "ready"
      ? "好了，出发！"
      : hud.stage === "neutral"
        ? "很好，自然坐着别动 1 秒"
        : "坐在屏幕前，让双肩出现在画面里";
  const body = error
    ? error
    : hud.stage === "ready"
      ? "接下来：阳光落在哪边，上身就往哪边轻轻歪一点。"
      : hud.stage === "neutral"
        ? "不用挺胸，也不用憋气。记住这个放松的姿势，它就是「中间」。"
        : "离屏幕一臂左右，头和肩膀露出来就行；髋部被桌子挡住也没关系。";
  return (
    <div
      className="lean-calibration"
      data-testid="lean-calibration"
      data-stage={hud.stage}
    >
      <span className="eyebrow">G03 / 星海冲浪 · 只需 1 秒准备</span>
      <div className="lean-calibration-body">
        <div className="lean-camera">
          <div ref={slot} />
          <canvas ref={canvas} width={480} height={270} />
          <svg className="lean-frame-guide" viewBox="0 0 480 270" aria-hidden>
            <path d="M190 86a50 50 0 1 1 100 0a50 50 0 1 1 -100 0" />
            <path d="M120 270 Q130 160 240 150 Q350 160 360 270" />
          </svg>
          <span>本机实时处理 · 画面不保存、不上传</span>
        </div>
        <section>
          <small>阳光在等你 · 大约 20–40 秒的轻松侧倾</small>
          <h2>{title}</h2>
          <p>{body}</p>
          <div className="lean-ring" style={{ "--p": hud.progress } as CSSProperties}>
            <b>{hud.stage === "ready" ? "✓" : `${Math.round(hud.progress * 100)}%`}</b>
          </div>
          <ul className="lean-checks" role="status">
            <li className={hud.shoulders ? "ok" : ""}>
              {hud.shoulders ? "已看到双肩" : "还没看到双肩"}
            </li>
            <li className={hud.hips ? "ok" : "optional"}>
              {hud.hips ? "也看到髋部（更稳）" : "髋部可选"}
            </li>
          </ul>
          <div className="lean-calibration-actions">
            <button
              onClick={() => {
                setError("");
                setAttempt((n) => n + 1);
              }}
            >
              重新连接摄像头
            </button>
          </div>
        </section>
      </div>
      <button
        className="lean-demo-entry"
        onClick={() => {
          if (!done.current) {
            done.current = true;
            callback.current(DEMO_LEAN_PROFILE, "demo");
          }
        }}
      >
        键盘演示 · 非人体识别
      </button>
    </div>
  );
}
