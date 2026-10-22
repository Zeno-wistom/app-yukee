import { useEffect, useRef, useState } from "react";
import { cameraVision } from "../../vision/CameraVision";
import { DEMO_SQUAT_PROFILE, measureSquatDiag, SquatCalibrator, squatDebugLog, SQUAT_CONFIG, type SquatCalDiag, type SquatCalStage, type SquatMissReason, type SquatProfile } from "../../vision/squatPose";
import { f2, f3, SquatDebugPanel, useSquatDebugToggle, type DebugRow } from "./SquatDebug";
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
  const debug = useSquatDebugToggle();
  const [hud, setHud] = useState<{
    stage: SquatCalStage;
    progress: number;
    seen: boolean;
    hint: string;
    diag: SquatCalDiag;
    miss: SquatMissReason;
    visL: number;
    visR: number;
    fps: number;
    w0: number;
  }>({
    stage: "stand",
    progress: 0,
    seen: false,
    hint: "",
    diag: new SquatCalibrator().diag,
    miss: "noFrame",
    visL: 0,
    visR: 0,
    fps: 0,
    w0: 0,
  });
  useEffect(() => {
    let cancelled = false,
      raf = 0,
      off: (() => void) | undefined,
      preview: HTMLVideoElement | null = null,
      latest: PoseFrame | null = null,
      lastAt = -1,
      readyAt = 0,
      flush = 0,
      frames: number[] = [];
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
      const ok = (l.visibility ?? 0) >= SQUAT_CONFIG.minVisibility && (r.visibility ?? 0) >= SQUAT_CONFIG.minVisibility;
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
      if (base && cal.stage === "squat") {
        // 第二步：画出「蹲到这里就够」的目标线
        const y0 = (base.ly0 + base.ry0) / 2;
        const yT = y0 + cal.minQ * base.w0;
        ctx.setLineDash([10, 8]);
        ctx.strokeStyle = "rgba(255,214,90,0.95)";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(base.cx0 - base.w0 * 1.1, yT);
        ctx.lineTo(base.cx0 + base.w0 * 1.1, yT);
        ctx.stroke();
        ctx.setLineDash([]);
      }
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
      const fresh = latest && now - latest.at < 400;
      const m = fresh ? measureSquatDiag(latest) : { sample: null, reason: (latest ? "stale" : "noFrame") as SquatMissReason, visL: 0, visR: 0 };
      const s = m.sample;
      const isNew = !!latest && latest.at > lastAt;
      if (isNew) {
        lastAt = latest!.at;
        frames.push(now);
        while (frames.length && now - frames[0] > 1000) frames.shift();
      }
      if (pausedRef.current) cal.update(null, now);
      else if (cal.stage !== "ready") {
        if (!s) cal.update(null, now);
        else if (isNew) {
          cal.update(s, latest!.at);
          squatDebugLog.push({
            t: Math.round(latest!.at),
            src: "cal",
            stage: cal.stage,
            q: +cal.diag.q.toFixed(4),
            minQ: +cal.diag.minQ.toFixed(4),
            downMs: Math.round(cal.diag.downMs),
            hint: cal.hint,
            failed: cal.diag.failed,
            visL: +m.visL.toFixed(2),
            visR: +m.visR.toFixed(2),
            w: Math.round(s.width),
          });
        }
      } else if (cal.profile && !done.current && s && !pausedRef.current) {
        if (!readyAt) readyAt = now;
        if (now - readyAt > 800) {
          done.current = true;
          cbRef.current(cal.profile, "camera");
          return;
        }
      } else readyAt = 0;
      if (now - flush > 80) {
        flush = now;
        setHud({
          stage: cal.stage,
          progress: cal.progress,
          seen: !!s,
          hint: cal.hint,
          diag: { ...cal.diag },
          miss: m.reason,
          visL: m.visL,
          visR: m.visR,
          fps: frames.length,
          w0: cal.base?.w0 ?? s?.width ?? 0,
        });
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
    { id: "squat", label: "2 浅蹲停一下" },
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
          ? "站稳别晃，继续计时"
          : "站直，保持 2 秒"
        : hud.stage === "squat"
          ? hud.hint === "checks"
            ? hud.diag.failed === "lateral"
              ? "回到画面中间再蹲"
              : hud.diag.failed === "tilt"
                ? "肩膀放平，别侧倾"
                : hud.diag.failed === "scale"
                  ? "身体别往前探，直着往下蹲"
                  : "两边肩膀一起往下"
            : hud.hint === "hold"
              ? "蹲到黄线后多停一下再起来"
              : hud.hint === "deeper"
                ? "再往下一点，肩膀碰到黄线"
                : "轻轻浅蹲，肩膀到黄线停一下"
          : hud.stage === "rise"
            ? "很好，慢慢站回来"
            : "好了，开始跳！";
  const body = error
    ? error
    : hud.stage === "ready"
      ? "游戏里：浅蹲保持蓄力，站直起跳。蹲多久决定跳多远，不需要蹲得更深。"
      : hud.stage === "squat"
        ? "蹲到黄线停约半秒就行；蹲下再站起一次也算。双脚着地，不用蹲深，需要时可以扶稳椅背。"
        : "双脚着地，不用跳起，也不用蹲深。膝盖和脚可以不在画面里，双肩要一直看得见。需要时可以扶稳椅背。";
  const missText: Record<SquatMissReason, string> = {
    "": "ok",
    noFrame: "无姿态帧",
    stale: "姿态帧过期",
    noLandmarks: "无肩点",
    lowVisibility: "肩点可见度低",
    tooSmall: "人太远",
  };
  const d = hud.diag;
  const debugRows: DebugRow[] = [
    ["阶段", `${hud.stage}${d.passedBy ? ` · ${d.passedBy}` : ""}${d.rebased ? " · rebase" : ""}`],
    ["姿态帧", `${hud.fps} fps`, hud.fps >= 8 ? "ok" : hud.fps >= 4 ? "warn" : "bad"],
    ["肩点", missText[hud.miss], hud.miss ? "bad" : "ok"],
    ["可见度 L/R", `${f2(hud.visL)} / ${f2(hud.visR)}  (≥${SQUAT_CONFIG.minVisibility})`, hud.visL >= SQUAT_CONFIG.minVisibility && hud.visR >= SQUAT_CONFIG.minVisibility ? "ok" : "bad"],
    ["肩宽 W0", `${Math.round(hud.w0)} px`, hud.w0 >= 60 ? "ok" : "warn"],
    ...(hud.stage === "stand"
      ? ([["站立晃动", `${f2(d.standRange)} / ${f2(d.standLimit)} px`, d.standRange <= d.standLimit ? "ok" : "bad"]] as DebugRow[])
      : ([
          ["下降 q", `${f3(d.q)} W0 (${Math.round(d.q * hud.w0)} px)`],
          ["需要 minQ", `${f3(d.minQ)} W0 (${Math.round(d.minQ * hud.w0)} px)`, d.q >= d.minQ ? "ok" : "warn"],
          ["蹲位时长", `${Math.round(d.downMs)} / ${SQUAT_CONFIG.bottomHoldMs} ms`],
          ["检查", d.failed ? `未通过：${d.failed}` : "通过", d.failed ? "bad" : "ok"],
        ] as DebugRow[])),
    ["掉帧", `${Math.round(d.gapMs)} ms`, d.gapMs > SQUAT_CONFIG.calGapMs ? "bad" : ""],
    ["提示", hud.hint || "–"],
  ];
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
      {debug && (
        <SquatDebugPanel
          title="G05 校准调试"
          rows={debugRows}
          meter={hud.stage === "squat" ? { value: d.q, max: Math.max(0.3, d.minQ * 2.5), marks: [{ at: d.minQ, label: "minQ" }] } : undefined}
        />
      )}
      <div className="squat-cal-actions">
        <button
          onClick={() => {
            setError("");
            setAttempt((n) => n + 1);
          }}
        >
          重新校准
        </button>
        <small>阈值为展前起测值，需现场真人校正 · 按 D 打开调试</small>
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
