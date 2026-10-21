import { useEffect, useRef, useState, type CSSProperties } from "react";
import { cameraVision } from "../vision/CameraVision";
import {
  DEFAULT_LEAN_CONFIG,
  LeanSession,
  measureLean,
  type LeanMode,
  type LeanProfile,
  type LeanSample,
} from "../vision/leanPose";
import type { PoseFrame } from "../vision/wingPose";
import type { GameResult } from "../state/machine";
import type { GameEventKind } from "./YukeeRun";
import LeanSurfScene from "./LeanSurfScene";
import { RAINBOW } from "./sunSurfScene";
import "./leanSurf.css";

/** 键盘演示：模拟肩线约 4.3° 的轻微侧倾，仍经过同一套平滑、阈值与回中逻辑。 */
const DEMO_SHOULDER_RAD = 0.075;

export default function LeanSurf({
  profile,
  mode,
  paused,
  onPause,
  onQuit,
  onFinish,
  onEarlyExit,
  onGameEvent,
}: {
  profile: LeanProfile;
  mode: LeanMode;
  paused: boolean;
  onPause: () => void;
  onQuit: () => void;
  onFinish: (r: Omit<GameResult, "game">) => void;
  onEarlyExit: () => void;
  onGameEvent: (k: GameEventKind) => void;
}) {
  const session = useRef(new LeanSession(profile));
  const frame = useRef({ ...session.current.current });
  const [hud, setHud] = useState(frame.current),
    [softAck, setSoftAck] = useState(false);
  const key = useRef(0),
    pose = useRef<PoseFrame | null>(null);
  const callbacks = useRef({ onGameEvent });
  callbacks.current = { onGameEvent };
  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  const softBlocked = hud.overSoftLimit && !softAck && !hud.complete;
  const blockedRef = useRef(softBlocked);
  blockedRef.current = softBlocked;
  /** 场景动画时钟只在真正运行时推进：暂停、软上限弹窗时整个世界冻结。 */
  const running = useRef(true);
  running.current = !paused && !softBlocked;
  useEffect(() => {
    if (paused || softBlocked) {
      session.current.pause();
      key.current = 0;
    }
  }, [paused, softBlocked]);
  useEffect(() => {
    if (mode !== "camera") return;
    return cameraVision.onPose((f) => {
      pose.current = f;
    });
  }, [mode]);
  useEffect(() => {
    if (mode !== "demo") return;
    const down = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        e.preventDefault();
        if (!pausedRef.current && !blockedRef.current)
          key.current = e.key === "ArrowLeft" ? -1 : 1;
      }
    };
    const up = (e: KeyboardEvent) => {
      if (
        (e.key === "ArrowLeft" && key.current === -1) ||
        (e.key === "ArrowRight" && key.current === 1)
      )
        key.current = 0;
    };
    const blur = () => {
      key.current = 0;
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
    };
  }, [mode]);
  useEffect(() => {
    let raf = 0,
      last = performance.now(),
      flush = 0,
      prevReps = 0,
      completed = false;
    const tick = (now: number) => {
      const dt = now - last;
      last = now;
      if (!pausedRef.current && !blockedRef.current) {
        const p = pose.current;
        let sample: LeanSample | null;
        if (mode === "demo")
          sample = {
            torso: null,
            shoulder: profile.s0 + key.current * DEMO_SHOULDER_RAD,
          };
        else sample = p && now - p.at < 250 ? measureLean(p) : null;
        const value = session.current.update(dt, sample);
        frame.current = value;
        if (value.reps > prevReps) {
          // 刚接住的是旧目标侧（新目标已切到另一侧）。
          callbacks.current.onGameEvent(value.target === 1 ? "left" : "right");
          prevReps = value.reps;
        }
        if (value.complete && !completed) {
          completed = true;
          callbacks.current.onGameEvent("complete");
        }
        if (now - flush > 80 || value.complete) {
          flush = now;
          setHud(value);
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [profile, mode]);

  const side = hud.target < 0 ? "左" : "右";
  const firstTime = hud.reps === 0;
  const instruction = hud.complete
    ? "彩虹完成了"
    : hud.returning
      ? `接住了！回到中间，下一束阳光在${side}边`
      : hud.arrived
        ? "接住阳光…保持一下下"
        : hud.approach > 0.35
          ? `再往${side}一点点`
          : firstTime
            ? `阳光落在${side}边，上身轻轻往${side}歪一点`
            : `阳光在${side}边，轻轻侧倾去接`;
  const subline =
    mode === "demo"
      ? "按住 ← / → 侧倾，松开回中"
      : "坐着就能玩 · 幅度很小也可以 · 不转腰、不甩头";
  const reps = DEFAULT_LEAN_CONFIG.targetReps;
  const knob = 50 + hud.u * 46;
  const zone = DEFAULT_LEAN_CONFIG.catchThreshold * 46;
  return (
    <div
      className={`lean-game ${hud.arrived ? "is-catching" : ""}`}
      data-testid="lean-surf"
      data-mode={mode}
      data-reps={hud.reps}
      data-tracking={hud.tracking}
      data-complete={hud.complete ? "1" : "0"}
      data-arrived={hud.arrived ? "1" : "0"}
      data-returning={hud.returning ? "1" : "0"}
      data-target={hud.target}
    >
      <LeanSurfScene frame={frame} running={running} />
      <header className="lean-hud">
        <span className="lean-title">
          <b>星海冲浪</b>
          <small>LEAN SURF · 晴日河湾 · 躯干左右轻微侧倾</small>
        </span>
        <span className="lean-stars" aria-label={`进度 ${hud.reps}/${reps}`}>
          {Array.from({ length: reps }, (_, i) => (
            <i
              key={i}
              style={{ "--c": RAINBOW[i] } as CSSProperties}
              className={`${i < hud.reps ? "lit" : ""} ${i === hud.reps && !hud.complete ? "next" : ""}`}
            />
          ))}
          <b data-testid="lean-reps">
            {hud.reps}/{reps}
          </b>
        </span>
        <span>
          <time data-testid="lean-time">
            {(hud.effectiveMs / 1000).toFixed(1)}s
          </time>
          <button aria-label="暂停冲浪" onClick={onPause}>
            Ⅱ
          </button>
          <button aria-label="退出冲浪" onClick={onQuit}>
            ×
          </button>
        </span>
      </header>
      <span className="lean-mode" data-source={hud.source}>
        <i />
        {mode === "demo"
          ? "键盘演示 · 非人体识别"
          : hud.source === "torso"
            ? "本机识别 · 肩膀 + 髋部"
            : hud.source === "shoulder"
              ? "本机识别 · 肩线（髋部可不入镜）"
              : "本机识别 · 正在寻找肩膀"}
      </span>
      {!hud.complete && (
        <footer className="lean-guide">
          <div
            className={`lean-figure ${hud.returning ? "center" : hud.target < 0 ? "left" : "right"}`}
            aria-hidden
          >
            <svg viewBox="0 0 60 60">
              <g className="lean-figure-body">
                <circle cx="30" cy="15" r="6.5" />
                <path d="M19 26 Q30 21 41 26 L38 44 H22 Z" />
              </g>
              <rect x="15" y="44" width="30" height="5" rx="2.5" />
            </svg>
          </div>
          <div className="lean-guide-text">
            <b role="status">{instruction}</b>
            <small>{subline}</small>
          </div>
          <div
            className="lean-meter"
            data-testid="lean-meter"
            aria-label="侧倾识别"
            style={
              {
                "--knob": `${knob}%`,
                "--zone": `${zone}%`,
                "--hold": hud.hold,
              } as CSSProperties
            }
          >
            <span
              className={`lean-zone left ${hud.target < 0 && !hud.returning ? "on" : ""}`}
            />
            <span className="lean-center" />
            <span
              className={`lean-zone right ${hud.target > 0 && !hud.returning ? "on" : ""}`}
            />
            <span
              className={`lean-knob ${hud.tracking !== "ok" ? "dim" : ""} ${hud.arrived ? "hit" : ""}`}
            />
            <small className="l">左</small>
            <small className="r">右</small>
          </div>
        </footer>
      )}
      {hud.recovering && hud.tracking !== "lost" && !hud.complete && !paused && (
        <div className="lean-toast">找到你了，继续冲浪…</div>
      )}
      {hud.tracking === "lost" && !hud.complete && !paused && (
        <div className="lean-modal" data-testid="lean-lost">
          <b>看不到你的肩膀了</b>
          <p>
            坐回画面中间，让双肩露出来就会自动继续。
            <br />
            髋部被桌子挡住也没关系。
          </p>
          <small>计时和计分已暂停，看不到时不会计分。</small>
          <button
            onClick={() => {
              cameraVision.stop();
              cameraVision.start().catch(() => {});
            }}
          >
            重新连接摄像头
          </button>
        </div>
      )}
      {softBlocked && (
        <div className="lean-modal" data-testid="lean-soft-limit">
          <b>已经有效活动 45 秒了</b>
          <p>阳光会等你。可以结束，也可以继续。</p>
          <button onClick={() => setSoftAck(true)}>继续冲浪</button>
          <button onClick={onEarlyExit}>结束本次</button>
        </div>
      )}
      {hud.complete && (
        <div className="lean-modal lean-result" data-testid="lean-complete">
          <small>SUNLIT SURF · RAINBOW COMPLETE</small>
          <h2>六束阳光，画出了一道彩虹。</h2>
          <p>
            {reps}/{reps} 束阳光 · 左右各 {reps / 2} 次 · 有效时间{" "}
            {(hud.effectiveMs / 1000).toFixed(1)} 秒
          </p>
          {mode === "demo" && <p className="lean-note">键盘演示数据 · 待真人实测</p>}
          <button
            className="primary"
            onClick={() =>
              onFinish({
                effectiveMs: hud.effectiveMs,
                reps: hud.reps,
                source: mode === "demo" ? "keyboard-demo" : "camera",
              })
            }
          >
            回到专注
          </button>
        </div>
      )}
    </div>
  );
}
