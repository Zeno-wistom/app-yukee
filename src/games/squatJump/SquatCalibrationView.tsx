import { useEffect, useRef, useState } from "react";
import { cameraVision } from "../../vision/CameraVision";
import { DEMO_SQUAT_PROFILE, measureSquat, SquatCalibrator, type SquatCalStage, type SquatProfile } from "../../vision/squatPose";
import type { PoseFrame } from "../../vision/wingPose";
import type { SquatMode } from "./SquatJump";
import "./squatJump.css";

/**
 * G05 校准：站直 2 秒（双肩起点、肩宽 W0）→ 做一次舒适浅蹲并停住（本人幅度 A）→ 站回。
 * 预览画出站立线与浅蹲线，便于现场确认双肩在两端都在画面内。
 */
export default function SquatCalibrationView({
  paused,
  onCalibrated,
}: {
  paused: boolean;
  onCalibrated: (p: SquatProfile, mode: SquatMode) => void;
}) {
  const slot = useRef<HTMLDivElement>(null),
    canvas = useRef<HTMLCanvasElement>(null);
  const cbRef = useRef(onCalibrated);
  cbRef.current = onCalibrated;
  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  const done = useRef(false);
  const [attempt, setAttempt] = useState(0);
  const [error, setError] = useState("");
  const [hud, setHud] = useState<{ stage: SquatCalStage; progress: number; seen: boolean; hint: string }>({
    stage: "stand",
    progress: 0,
    seen: false,
    hint: "",
  });
  useEffect(() => {
    let cancelled = false,
      raf = 0,
      off: (() => void) | undefined,
      preview: HTMLVideoElement | null = null,
      latest: PoseFrame | null = null,
      lastAt = -1,
      readyAt = 0,
      flush = 0;
    const cal = new SquatCalibrator();
    done.current = false;
    const draw = (f: PoseFrame | null) => {
      const cv = canvas.current,
        ctx = cv?.getContext("2d");
      if (!cv || !ctx) return;
      ctx.clearRect(0, 0, cv.width, cv.height);
      if (!f) return;
      if (cv.width !== f.videoWidth || cv.height !== f.videoHeight) {
        cv.width = f.videoWidth;
        cv.height = f.videoHeight;
      }
      const l = f.landmarks[11],
        r = f.landmarks[12];
      if (!l || !r) return;
      const ok = (l.visibility ?? 0) >= 0.65 && (r.visibility ?? 0) >= 0.65;
      ctx.lineWidth = 5;
      ctx.lineCap = "round";
      ctx.strokeStyle = ok ? "#4cc3b1" : "#f0a35e";
      ctx.beginPath();
      ctx.moveTo(l.x * cv.width, l.y * cv.height);
      ctx.lineTo(r.x * cv.width, r.y * cv.height);
      ctx.stroke();
      for (const p of [l, r]) {
        ctx.fillStyle = ok ? "#ffffff" : "#f0a35e";
        ctx.beginPath();
        ctx.arc(p.x * cv.width, p.y * cv.height, 7, 0, Math.PI * 2);
        ctx.fill();
      }
      const base = cal.base;
      if (base) {
        // 站立线（实线）与本人浅蹲线（虚线）
        const y0 = (base.ly0 + base.ry0) / 2;
        ctx.strokeStyle = "rgba(255,255,255,0.85)";
        ctx.lineWidth = 2;
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.moveTo(base.cx0 - base.w0, y0);
        ctx.lineTo(base.cx0 + base.w0, y0);
        ctx.stroke();
        if (cal.profile) {
          const y1 = y0 + cal.profile.amp * base.w0;
          ctx.setLineDash([8, 8]);
          ctx.strokeStyle = "rgba(141,233,188,0.95)";
          ctx.beginPath();
          ctx.moveTo(base.cx0 - base.w0, y1);
          ctx.lineTo(base.cx0 + base.w0, y1);
          ctx.stroke();
          ctx.setLineDash([]);
        }
      }
    };
    const tick = (now: number) => {
      const fresh = latest && now - latest.at < 250;
      const s = fresh ? measureSquat(latest) : null;
      if (pausedRef.current) cal.update(null, now);
      else if (cal.stage !== "ready") {
        if (!s) cal.update(null, now);
        else if (latest!.at > lastAt) {
          lastAt = latest!.at;
          cal.update(s, latest!.at);
        }
      } else if (cal.profile && !done.current) {
        if (!readyAt) readyAt = now;
        if (now - readyAt > 800) {
          done.current = true;
          cbRef.current(cal.profile, "camera");
          return;
        }
      }
      if (now - flush > 80) {
        flush = now;
        setHud({ stage: cal.stage, progress: cal.progress, seen: !!s, hint: cal.hint });
      }
      raf = requestAnimationFrame(tick);
    };
    (async () => {
      try {
        await cameraVision.start();
        if (cancelled) return;
        const src = cameraVision.getVideoElement();
        if (src && slot.current) {
          preview = document.createElement("video");
          preview.muted = true;
          preview.playsInline = true;
          preview.srcObject = src.srcObject;
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

  const steps: { id: SquatCalStage; label: string }[] = [
    { id: "stand", label: "1 站直 2 秒" },
    { id: "squat", label: "2 舒适浅蹲" },
    { id: "rise", label: "3 站回" },
  ];
  const order = ["stand", "squat", "rise", "ready"];
  const idx = order.indexOf(hud.stage);
  const title = error
    ? "摄像头暂不可用"
    : !hud.seen && hud.stage !== "ready"
      ? "站到标记处，让双肩出现在画面里"
      : hud.stage === "stand"
        ? hud.hint === "still"
          ? "站稳别动，重新计时"
          : "站直，保持 2 秒"
        : hud.stage === "squat"
          ? hud.hint === "checks"
            ? "身体别前探、别侧倾，轻轻往下蹲"
            : "做一个舒适的浅蹲，停住"
          : hud.stage === "rise"
            ? "很好，慢慢站回来"
            : "好了，开始跳！";
  const body = error
    ? error
    : hud.stage === "ready"
      ? "游戏里：浅蹲保持蓄力，站直起跳。蹲多久决定跳多远，不需要蹲得更深。"
      : "双脚着地，不用跳起，也不用蹲深。膝盖和脚可以不在画面里，双肩要一直看得见。需要时可以扶稳椅背。";
  return (
    <div className="squat-calibration" data-testid="squat-calibration" data-stage={hud.stage}>
      <span className="eyebrow">G05 / 浅蹲跳一跳 · 准备约 5 秒</span>
      <div className="squat-cal-body">
        <div className="squat-camera">
          <div ref={slot} />
          <canvas ref={canvas} width={640} height={360} />
          <span>本机实时处理 · 画面不保存、不上传</span>
        </div>
        <section className="squat-cal-text">
          <h2 role="status">{title}</h2>
          <p>{body}</p>
          <ol className="squat-steps">
            {steps.map((s, i) => (
              <li key={s.id} className={i < idx ? "done" : i === idx ? "on" : ""}>
                {s.label}
              </li>
            ))}
          </ol>
          <div className="squat-cal-progress">
            <i style={{ transform: `scaleX(${hud.progress})` }} />
          </div>
        </section>
      </div>
      <div className="squat-cal-actions">
        <button
          onClick={() => {
            setError("");
            setAttempt((n) => n + 1);
          }}
        >
          重新校准
        </button>
        <small>阈值为展前起测值，需现场真人校正</small>
        <button
          className="squat-demo-entry"
          onClick={() => {
            if (!done.current) {
              done.current = true;
              cbRef.current(DEMO_SQUAT_PROFILE, "demo");
            }
          }}
        >
          键盘演示 · keyboard_demo
        </button>
      </div>
    </div>
  );
}
