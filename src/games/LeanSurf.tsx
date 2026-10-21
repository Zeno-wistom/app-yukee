import { useEffect, useRef, useState } from "react";
import { cameraVision } from "../vision/CameraVision";
import {
  LeanSession,
  measureLean,
  type LeanMode,
  type LeanProfile,
} from "../vision/leanPose";
import type { PoseFrame } from "../vision/wingPose";
import type { GameResult } from "../state/machine";
import type { GameEventKind } from "./YukeeRun";
import LeanSurfScene from "./LeanSurfScene";
import "./leanSurf.css";

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
        const a =
          mode === "demo"
            ? profile.a0 +
              key.current *
                (key.current < 0
                  ? profile.a0 - profile.aL
                  : profile.aR - profile.a0)
            : p && now - p.at < 250
              ? measureLean(p)
              : null;
        const value = session.current.update(dt, a);
        frame.current = value;
        if (value.reps > prevReps) {
          callbacks.current.onGameEvent(prevReps % 2 ? "right" : "left");
          prevReps = value.reps;
        }
        if (value.complete && !completed) {
          completed = true;
          callbacks.current.onGameEvent("complete");
        }
        if (now - flush > 100) {
          flush = now;
          setHud(value);
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [profile, mode]);
  const instruction = hud.complete
    ? "六颗星，全部点亮了"
    : hud.cruising
      ? "下一颗星正靠近 · 自然回中"
      : hud.arrived
        ? "已到达 · 慢慢回到中间"
        : `身体缓慢向${hud.target < 0 ? "左" : "右"}侧倾 · 保持一下`;
  return (
    <div
      className="lean-game"
      data-testid="lean-surf"
      data-mode={mode}
      data-reps={hud.reps}
      data-tracking={hud.tracking}
      data-complete={hud.complete ? "1" : "0"}
      data-arrived={hud.arrived ? "1" : "0"}
      data-cruising={hud.cruising ? "1" : "0"}
    >
      <LeanSurfScene frame={frame} />
      <header className="lean-hud">
        <span>
          <b>STAR SURF</b>
          <small>星海冲浪</small>
        </span>
        <span className="lean-stars" aria-label={`进度 ${hud.reps}/6`}>
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <i key={i} className={i < hud.reps ? "lit" : ""}>
              ★
            </i>
          ))}
          <b data-testid="lean-reps">{hud.reps}/6</b>
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
      <span className="lean-mode">
        {mode === "demo"
          ? "键盘演示 · 非人体识别"
          : "本机躯干识别 · 双肩 + 双髋"}
      </span>
      {!hud.complete && (
        <div
          className={`lean-compass ${hud.arrived ? "is-returning" : ""}`}
          aria-label="实时侧倾反馈"
        >
          <span className="lean-signal">
            {hud.tracking === "ok"
              ? mode === "demo"
                ? "● 键盘已就绪"
                : "● 身体已识别"
              : "◌ 正在确认姿态"}
          </span>
          <div
            className="lean-balance"
            role="meter"
            aria-label="侧倾幅度"
            aria-valuemin={-100}
            aria-valuemax={100}
            aria-valuenow={Math.round(hud.u * 100)}
          >
            <span
              className={`lean-zone left ${!hud.arrived && hud.target < 0 ? "active" : ""}`}
            />
            <span className="lean-neutral" />
            <span
              className={`lean-zone right ${!hud.arrived && hud.target > 0 ? "active" : ""}`}
            />
            <i style={{ left: `${50 + hud.u * 44}%` }} />
          </div>
          <span className="lean-action-state">
            {hud.arrived
              ? "✓ 已接住 · 回中点亮"
              : hud.hold > 0
                ? "很好 · 保持一下"
                : hud.cruising
                  ? "星光靠近中"
                  : `← ${hud.target < 0 ? "向左轻倾" : "向右轻倾"} →`}
          </span>
          <progress
            aria-label={hud.arrived ? "回中进度" : "保持进度"}
            value={hud.hold}
            max={1}
          />
        </div>
      )}
      {!hud.complete && (
        <footer className="lean-guide">
          <b role="status">{instruction}</b>
          <small>
            {mode === "demo"
              ? "按住 ← / → 侧倾，松开回中"
              : "保持舒适幅度；不转腰、不追求大角度"}
          </small>
        </footer>
      )}
      {(hud.tracking === "lost" || hud.recovering) &&
        !hud.complete &&
        !paused && (
          <div className="lean-modal">
            <b>
              {hud.tracking === "lost"
                ? "暂时看不到完整躯干"
                : hud.countdown
                  ? `准备继续 · ${hud.countdown}`
                  : "回到中立姿态，稳定约 1 秒"}
            </b>
            <p>
              双肩和双髋都要入镜；若桌沿遮挡髋部，请调整摄像头或退出后重新校准。
            </p>
            <small>计时和计分暂停，掉线动作不会补算。</small>
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
          <p>星星会等你。可以结束，也可以继续。</p>
          <button onClick={() => setSoftAck(true)}>继续冲浪</button>
          <button onClick={onEarlyExit}>结束本次</button>
        </div>
      )}
      {hud.complete && (
        <div className="lean-modal lean-result" data-testid="lean-complete">
          <small>LIGHT ON THE OCEAN</small>
          <h2>把六颗星，带回来了。</h2>
          <p>
            6/6 · 左右各 3 次 · 有效时间 {(hud.effectiveMs / 1000).toFixed(1)}{" "}
            秒
          </p>
          {mode === "demo" && <p>键盘演示数据 · 待真人实测</p>}
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
