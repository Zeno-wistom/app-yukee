import { useEffect, useRef, useState } from "react";
import { cameraVision } from "../vision/CameraVision";
import {
  DEMO_LEAN_PROFILE,
  LeanCalibrator,
  leanAmount,
  leanCenterThreshold,
  measureLean,
  type LeanMode,
  type LeanProfile,
} from "../vision/leanPose";
import type { PoseFrame } from "../vision/wingPose";
import "./leanSurf.css";

const copy = {
  visible: ["让双肩和双髋都入镜", "身体稳定可见约 1 秒"],
  neutral: ["保持自然中立姿态", "放松站稳约 2 秒，不必挺胸或憋气"],
  left: ["身体慢慢向左侧倾", "轻轻侧倾、稍停一下；按你的舒适幅度记录"],
  right: ["身体慢慢向右侧倾", "轻轻向另一侧、稍停一下；躯干跟随，不只摆头"],
  ready: ["回到中间，准备出发", "保持自然站姿，3 秒后出发收集阳光"],
};
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
    stage: "visible" as keyof typeof copy,
    progress: 0,
    missing: true,
    countdown: 0,
  });
  const [error, setError] = useState("");
  useEffect(() => {
    let cancelled = false,
      raf = 0,
      off: (() => void) | undefined,
      preview: HTMLVideoElement | null = null;
    let latest: PoseFrame | null = null,
      lastSample = -Infinity,
      last = performance.now(),
      ready = 0,
      flush = 0;
    const calibrator = new LeanCalibrator();
    done.current = false;
    const tick = (now: number) => {
      const dt = Math.min(120, now - last);
      last = now;
      const fresh = latest && now - latest.at < 250;
      const a = fresh ? measureLean(latest) : null;
      if (pauseRef.current) {
        calibrator.update(null, now);
        ready = 0;
      } else if (calibrator.stage !== "ready") {
        if (a === null) calibrator.update(null, now);
        else if (latest!.at > lastSample) {
          lastSample = latest!.at;
          calibrator.update(a, latest!.at);
        }
      } else {
        ready =
          a !== null &&
          calibrator.profile &&
          Math.abs(leanAmount(a, calibrator.profile)) <=
            leanCenterThreshold(
              calibrator.profile,
              leanAmount(a, calibrator.profile),
            )
            ? ready + dt
            : 0;
        if (ready >= 3000 && calibrator.profile && !done.current) {
          done.current = true;
          callback.current(calibrator.profile, "camera");
          return;
        }
      }
      if (now - flush > 100) {
        flush = now;
        setHud({
          stage: calibrator.stage,
          progress: calibrator.progress,
          missing: a === null,
          countdown:
            calibrator.stage === "ready"
              ? Math.max(1, Math.ceil((3000 - ready) / 1000))
              : 0,
        });
      }
      raf = requestAnimationFrame(tick);
    };
    const draw = (f: PoseFrame | null) => {
      const ctx = canvas.current?.getContext("2d");
      if (!ctx) return;
      ctx.clearRect(0, 0, canvas.current!.width, canvas.current!.height);
      if (!f) return;
      if (
        canvas.current!.width !== f.videoWidth ||
        canvas.current!.height !== f.videoHeight
      ) {
        canvas.current!.width = f.videoWidth;
        canvas.current!.height = f.videoHeight;
      }
      ctx.lineWidth = 3;
      for (const [i, j] of [
        [11, 12],
        [11, 23],
        [12, 24],
        [23, 24],
      ]) {
        const p = f.landmarks[i],
          q = f.landmarks[j];
        if (!p || !q) continue;
        ctx.strokeStyle =
          (p.visibility ?? 0) >= 0.65 && (q.visibility ?? 0) >= 0.65
            ? "#8de9bc"
            : "#ffd98e";
        ctx.beginPath();
        ctx.moveTo(p.x * f.videoWidth, p.y * f.videoHeight);
        ctx.lineTo(q.x * f.videoWidth, q.y * f.videoHeight);
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
  return (
    <div
      className="lean-calibration"
      data-testid="lean-calibration"
      data-stage={hud.stage}
    >
      <span className="eyebrow">G03 / 星海冲浪 · 个人躯干校准</span>
      <div className="lean-calibration-body">
        <div className="lean-camera">
          <div ref={slot} />
          <canvas ref={canvas} width={480} height={270} />
          <span>双肩 + 双髋 · 本机实时处理</span>
        </div>
        <section>
          <small>阳光河谷在等你 · 轻轻侧倾，自然回中</small>
          <h2>{error ? "摄像头暂不可用" : copy[hud.stage][0]}</h2>
          <p>{error || copy[hud.stage][1]}</p>
          <progress value={hud.progress} max={1} />
          <p role="status">
            {hud.missing
              ? "看不到完整躯干：调整摄像头；髋部被桌沿遮挡时，请重新选择可见的舒适站姿并校准。"
              : "绿色连线表示关键点可见；请缓慢、自然活动。"}
          </p>
          {hud.countdown > 0 && (
            <b className="lean-countdown">{hud.countdown}</b>
          )}
          <button
            onClick={() => {
              setError("");
              setAttempt((n) => n + 1);
            }}
          >
            重新连接 / 校准
          </button>
          <small>画面不保存、不上传。无法看见双髋时不会开放正式游戏。</small>
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
