import { useEffect, useRef, useState } from "react";
import { Hand, RefreshCcw, ScanLine } from "lucide-react";
import { cameraVision } from "../vision/CameraVision";
import {
  WingCalibrator,
  keypointsVisible,
  measureWing,
  wingTrackingHint,
  type PoseFrame,
  type WingProfile,
} from "../vision/wingPose";
import { DEMO_WING_PROFILE, type WingInputMode } from "./useWingSession";

/**
 * G02 进入游戏前的个人动作校准。
 *
 * 流程（对应需求第 5 节）：
 * 1. framing 让双肩/双肘/双腕完整入镜，稳定可见约 1 秒；
 * 2. neutral 保持自然准备姿势约 2 秒，记录中立位置与抖动；
 * 3. spread 跟随提示缓慢向两侧展开，记录本人的舒适最大幅度；
 * 4. 用「展开幅度 vs 静止抖动」判断是否可靠，不可靠就要求重新校准；
 * 5. 通过后 3 秒倒计时进入游戏。
 *
 * 预览复用 CameraVision 的同一条视频流（不会和 G01 抢摄像头），
 * 画面只在本机处理，不保存、不上传。
 */

type Stage =
  | "loading"
  | "framing"
  | "neutral"
  | "spread"
  | "ready"
  | "rejected"
  | "error";

const STAGE_COPY: Record<
  Stage,
  { step: string; title: string; desc: string }
> = {
  loading: {
    step: "01 / 准备",
    title: "正在打开摄像头",
    desc: "本地模型加载中，画面不会离开这台电脑。",
  },
  framing: {
    step: "01 / 取景",
    title: "让双臂完整入镜",
    desc: "往后退一点，让双肩、双肘和手腕都在画面里。",
  },
  neutral: {
    step: "02 / 准备位",
    title: "保持舒服的准备姿势",
    desc: "双手放在腰前或桌面，自然放松两秒，保持入镜。",
  },
  spread: {
    step: "03 / 舒适幅度",
    title: "慢慢向两侧展开双臂",
    desc: "展开到你觉得舒服的位置，停一下就好，不用举高。",
  },
  ready: {
    step: "04 / 就绪",
    title: "校准完成，慢慢收回双臂",
    desc: "展开、停一下、收回，完成 5 次就能集满光能量。",
  },
  rejected: {
    step: "重新校准",
    title: "还需要再确认一次",
    desc: "刚才的展开幅度和静止抖动太接近，重新来一遍会更准确。",
  },
  error: {
    step: "摄像头",
    title: "摄像头暂时不可用",
    desc: "检查是否被其他程序占用，或允许浏览器使用摄像头。",
  },
};

export default function WingCalibrationView({
  onCalibrated,
  paused = false,
}: {
  onCalibrated: (profile: WingProfile, mode: WingInputMode) => void;
  paused?: boolean;
}) {
  const [connectionAttempt, setConnectionAttempt] = useState(0);
  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  const [stage, setStage] = useState<Stage>("loading");
  const [error, setError] = useState("");
  const [countdown, setCountdown] = useState<number | null>(null);
  const [liveHint, setLiveHint] = useState("正在请求摄像头…");
  const holderRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const meterL = useRef<HTMLSpanElement>(null);
  const meterR = useRef<HTMLSpanElement>(null);
  const barRef = useRef<HTMLElement>(null);
  const latest = useRef<PoseFrame | null>(null);
  const doneRef = useRef(false);
  const stateRef = useRef({
    stage: "loading" as Stage,
    stageAt: 0,
    visibleSince: -1,
    lastSampleAt: 0,
    lastVisibleAt: 0,
  });
  const calibrator = useRef(new WingCalibrator());
  const profileRef = useRef<WingProfile | null>(null);
  const lastHint = useRef("");
  const lastCount = useRef<number | null>(null);
  const calibratedRef = useRef(onCalibrated);
  calibratedRef.current = onCalibrated;

  useEffect(() => {
    let cancelled = false;
    let raf = 0;
    let offPose: (() => void) | undefined;
    let preview: HTMLVideoElement | null = null;
    let lastTick = performance.now();
    const machine = stateRef.current;
    const go = (next: Stage, now: number, hint?: string) => {
      if (machine.stage === next) return;
      machine.stage = next;
      machine.stageAt = now;
      machine.visibleSince = -1;
      setStage(next);
      if (hint) hintTo(hint);
    };
    /** 文案只在变化时写入 React，避免每帧重渲染 */
    const hintTo = (text: string) => {
      if (lastHint.current === text) return;
      lastHint.current = text;
      setLiveHint(text);
    };

    const drawSkeleton = (frame: PoseFrame | null) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      if (!width || !height) return;
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.clearRect(0, 0, width, height);
      if (!frame) return;
      const point = (index: number) => {
        const p = frame.landmarks[index];
        const scale = Math.min(width / frame.videoWidth, height / frame.videoHeight);
        const drawW = frame.videoWidth * scale;
        const drawH = frame.videoHeight * scale;
        return {
          x: (width - drawW) / 2 + p.x * drawW,
          y: (height - drawH) / 2 + p.y * drawH,
          v: p.visibility ?? 1,
        };
      };
      const bones: [number, number][] = [
        [11, 12],
        [11, 13],
        [13, 15],
        [12, 14],
        [14, 16],
      ];
      ctx.lineCap = "round";
      for (const [a, b] of bones) {
        const p = point(a);
        const q = point(b);
        const alpha = Math.min(p.v, q.v) >= 0.4 ? 0.92 : 0.24;
        ctx.strokeStyle = `rgba(141, 233, 188, ${alpha})`;
        ctx.lineWidth = Math.max(1.6, width * 0.006);
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(q.x, q.y);
        ctx.stroke();
      }
      for (const index of [11, 12, 13, 14, 15, 16]) {
        const p = point(index);
        const strong = p.v >= 0.4;
        ctx.fillStyle = strong ? "#bff5e2" : "rgba(255, 217, 142, 0.5)";
        ctx.beginPath();
        ctx.arc(p.x, p.y, Math.max(2, width * 0.009), 0, Math.PI * 2);
        ctx.fill();
      }
    };

    const setMeter = (ql: number, qr: number, progress: number) => {
      if (meterL.current)
        meterL.current.style.width = `${Math.min(100, ql * 100)}%`;
      if (meterR.current)
        meterR.current.style.width = `${Math.min(100, qr * 100)}%`;
      if (barRef.current) barRef.current.style.width = `${progress * 100}%`;
    };

    const finish = (profile: WingProfile, mode: WingInputMode) => {
      if (doneRef.current) return;
      doneRef.current = true;
      setCountdown(null);
      calibratedRef.current(profile, mode);
    };

    const tick = (now: number) => {
      if (cancelled) return;
      const dt = now - lastTick;
      lastTick = now;
      if (pausedRef.current) {
        machine.stageAt += dt;
        machine.lastVisibleAt = now;
        if (machine.stage === "neutral" || machine.stage === "spread" || machine.stage === "framing") {
          calibrator.current.reset();
          machine.visibleSince = -1;
          go("framing", now, "继续后，先让双臂完整入镜");
        }
        raf = requestAnimationFrame(tick);
        return;
      }
      const frame = latest.current;
      const fresh = !!frame && now - frame.at <= 320;
      const measure = fresh ? measureWing(frame!.landmarks, frame!.videoWidth, frame!.videoHeight) : null;
      const visible = !!measure && keypointsVisible(frame!.landmarks);

      if (machine.stage === "loading") {
        if (cameraVision.poseLoadError) {
          setError(cameraVision.poseLoadError);
          go("error", now);
        } else if (cameraVision.isRunning && cameraVision.poseReady) {
          go("framing", now, "正在寻找你的双肩…");
        } else if (cameraVision.isRunning) {
          setLiveHint("正在加载身体识别模型…");
        }
      } else if (machine.stage === "framing") {
        if (visible) {
          if (machine.visibleSince < 0) machine.visibleSince = now;
          const held = now - machine.visibleSince;
          setMeter(measure!.qL, measure!.qR, Math.min(1, held / 1000));
          hintTo(
            held >= 1000
              ? "取景完成，保持舒服的准备姿势"
              : "保持住，让双臂都留在画面里",
          );
          if (held >= 1000) {
            calibrator.current.reset();
            go("neutral", now, "保持自然姿势，正在记录…");
          }
        } else {
          machine.visibleSince = -1;
          setMeter(0, 0, 0);
          hintTo(wingTrackingHint(fresh ? frame!.landmarks : null));
        }
      } else if (machine.stage === "neutral") {
        if (!visible) {
          if (now - machine.lastVisibleAt > 320) {
            // 关键点丢失：本次校准作废，回到取景，不猜测阈值
            calibrator.current.reset();
            go("framing", now, "刚才看不到你，请重新入镜");
          }
        } else {
          machine.lastVisibleAt = now;
          if (now - machine.stageAt > 280 && frame!.at !== machine.lastSampleAt) {
            machine.lastSampleAt = frame!.at;
            calibrator.current.addNeutral(measure!.qL, measure!.qR);
          }
          const progress = Math.min(1, (now - machine.stageAt) / 2000);
          setMeter(measure!.qL, measure!.qR, progress);
          hintTo("不要刻意用力，自然放松就好");
          if (progress >= 1) {
            const neutral = calibrator.current.captureNeutral();
            if (!neutral.ok) {
              setError(
                neutral.reason === "jitter"
                  ? "动作波动太大，请坐稳一点再试一次"
                  : "还没有采集到足够的姿态数据",
              );
              go("rejected", now);
            } else {
              calibrator.current.beginSpread(now);
              go("spread", now, "慢慢向两侧打开双臂");
            }
          }
        }
      } else if (machine.stage === "spread") {
        if (!visible) {
          if (now - machine.lastVisibleAt > 320) {
            go("framing", now, "手腕离开画面了，请重新入镜");
          }
        } else {
          machine.lastVisibleAt = now;
          // 每次模型输出只采一次，重复 RAF 不能伪造稳定的校准样本。
          if (frame!.at === machine.lastSampleAt) {
            raf = requestAnimationFrame(tick);
            return;
          }
          machine.lastSampleAt = frame!.at;
          const track = calibrator.current.trackSpread(
            measure!.qL,
            measure!.qR,
            now,
          );
          setMeter(measure!.qL, measure!.qR, track.progress);
          hintTo(
            track.progress < 1
              ? "再向外打开一点，到舒服的位置"
              : "很好，正在记录你的舒适幅度",
          );
          if (track.settled || now - machine.stageAt > 12000) {
            const result = calibrator.current.captureSpread(
              measure!.shoulderWidthPx,
            );
            if (!result.ok || !result.profile) {
              setError(result.message ?? "这次校准没有通过");
              go("rejected", now);
            } else {
              profileRef.current = result.profile;
              go("ready", now, "校准完成");
            }
          }
        }
      } else if (machine.stage === "ready") {
        if (!visible) {
          machine.stageAt += dt;
          hintTo(wingTrackingHint(fresh ? frame!.landmarks : null));
          raf = requestAnimationFrame(tick);
          return;
        }
        hintTo("校准完成，慢慢收回双臂，准备开始");
        const elapsed = now - machine.stageAt;
        const left = Math.max(1, Math.min(3, Math.ceil((3000 - elapsed) / 1000)));
        if (lastCount.current !== left) {
          lastCount.current = left;
          setCountdown(left);
        }
        if (elapsed >= 3000 && profileRef.current) {
          finish(profileRef.current, "camera");
        }
      }
      raf = requestAnimationFrame(tick);
    };

    (async () => {
      try {
        await cameraVision.start();
        if (cancelled) return;
        const source = cameraVision.getVideoElement();
        if (source && holderRef.current) {
          // 预览只共享 MediaStream，绝不移动全局推理 video。
          // 移除已连接 DOM 的 video 会令浏览器暂停播放，校准卸载后就会永远停帧。
          preview = document.createElement("video");
          preview.muted = true;
          preview.playsInline = true;
          preview.srcObject = source.srcObject;
          holderRef.current.replaceChildren(preview);
          await preview.play();
          if (cancelled) { preview.srcObject = null; return; }
        }
        offPose = cameraVision.onPose((frame) => {
          latest.current = frame;
          drawSkeleton(frame);
        });
        machine.stageAt = performance.now();
        machine.lastVisibleAt = performance.now();
        raf = requestAnimationFrame(tick);
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : String(e));
        setStage("error");
        stateRef.current.stage = "error";
      }
    })();

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      offPose?.();
      // 释放预览绑定即可；不停止共享视频轨道，不触碰推理 video。
      if (preview) { preview.pause(); preview.srcObject = null; preview.remove(); }
    };
    // 生命周期只随挂载/卸载变化；回调通过 ref 读取，避免父级重渲染打断校准
  }, [connectionAttempt]);

  const retry = () => {
    setError("");
    setCountdown(null);
    doneRef.current = false;
    calibrator.current.reset();
    Object.assign(stateRef.current, {
      stage: "loading",
      stageAt: performance.now(),
      visibleSince: -1,
      lastSampleAt: 0,
      lastVisibleAt: performance.now(),
    });
    latest.current = null;
    lastHint.current = "";
    lastCount.current = null;
    profileRef.current = null;
    setStage("loading");
    // 重建本页连接，不停止整个产品共用的摄像头；错误也回到同一套重试流程。
    setConnectionAttempt(n => n + 1);
  };

  /** 开发者演示：跳过真人校准，用键盘模拟展开（结果标记为演示数据） */
  const startDemo = () => {
    if (doneRef.current) return;
    doneRef.current = true;
    calibratedRef.current(DEMO_WING_PROFILE, "demo");
  };

  const copy = STAGE_COPY[stage];

  return (
    <div className="wing-calibration" data-testid="wing-calibration" data-stage={stage}>
      <div className="wing-calib-head">
        <span className="eyebrow">G02 · 展翼接光 / 个人动作校准</span>
        <span className={`wing-calib-step ${stage}`}>{copy.step}</span>
      </div>
      <div className="wing-calib-body">
        <div className="wing-camera">
          <div className="wing-camera-mirror">
            <div className="wing-camera-slot" ref={holderRef} />
            <canvas ref={canvasRef} className="wing-camera-skeleton" />
            <div className="wing-camera-frame" aria-hidden />
          </div>
          <span className="wing-camera-tag">
            <i /> {stage === "error" ? "摄像头未连接" : "本机实时识别"}
          </span>
        </div>
        <div className="wing-calib-panel">
          <h2>{copy.title}</h2>
          <p>{stage === "error" || stage === "rejected" ? error : copy.desc}</p>
          <div className="wing-calib-meters" aria-label="左右臂展开幅度">
            <span>
              <b>左臂</b>
              <i>
                <em ref={meterL} />
              </i>
            </span>
            <span>
              <b>右臂</b>
              <i>
                <em ref={meterR} />
              </i>
            </span>
          </div>
          <div className="wing-calib-track" aria-hidden>
            <i ref={barRef} />
          </div>
          <span className="wing-calib-hint" role="status">
            {stage === "error" ? "允许摄像头访问后重试" : liveHint}
          </span>
          {stage === "error" ? (
            <button className="primary" onClick={retry}>
              <RefreshCcw size={13} /> 重新连接
            </button>
          ) : stage === "rejected" ? (
            <button className="primary" onClick={retry}>
              <ScanLine size={13} /> 重新校准
            </button>
          ) : (
            <small className="privacy-note">
              画面仅在本机实时处理，不保存、不上传。
            </small>
          )}
        </div>
      </div>
      {countdown !== null && (
        <div className="wing-countdown" aria-live="polite">
          {countdown}
        </div>
      )}
      {stage !== "ready" && (
        <button
          className="wing-demo-link"
          onClick={startDemo}
          title="仅用于开发调试：用键盘模拟展开，不计为摄像头识别"
        >
          <Hand size={11} /> 键盘演示 · 非人体识别
        </button>
      )}
    </div>
  );
}
