import { useCallback, useEffect, useRef, useState } from "react";
import { cameraVision } from "../../vision/CameraVision";
import { measureSquat, SquatSession, type SquatProfile, type SquatUpdate } from "../../vision/squatPose";
import type { PoseFrame } from "../../vision/wingPose";
import type { GameResult } from "../../state/machine";
import type { GameEventKind } from "../YukeeRun";
import { distanceToCharge, isFail, isSuccess, JUMP_CONFIG, JumpRun, type LandingKind } from "./jumpLogic";
import { JumpScene } from "./squatJumpScene";
import "./squatJump.css";

export type SquatMode = "camera" | "demo";
type CtrlState = "ready" | "charging" | "flying" | "over";

interface Hud {
  state: CtrlState;
  score: number;
  jumps: number;
  charge: number;
  last: LandingKind | null;
  cleared: boolean;
  perfects: number;
  tracking: SquatUpdate["tracking"];
  u: number;
  failed: SquatUpdate["failed"];
  needCharge: number;
  /** 测试用：落在两台空隙正中所需蓄力 */
  gapCharge: number;
  effectiveMs: number;
  combo: number;
}

const FAIL_TEXT: Partial<Record<LandingKind, string>> = {
  short: "差一点，跳得不够远",
  long: "用力过猛，跳过头了",
  edgeShort: "踩到边缘，没站稳",
  edgeLong: "踩到边缘，没站稳",
};

/**
 * G05 浅蹲跳一跳。键盘与摄像头只是两种「按下 / 松开」来源，
 * 蓄力、跳跃、落点判定和计分走同一个控制器（jumpLogic.JumpRun）。
 */
export default function SquatJump({
  profile,
  mode,
  paused,
  onPause,
  onQuit,
  onFinish,
  onEarlyExit,
  onGameEvent,
  seed,
}: {
  profile: SquatProfile;
  mode: SquatMode;
  paused: boolean;
  onPause: () => void;
  onQuit: () => void;
  onFinish: (r: Omit<GameResult, "game">) => void;
  onEarlyExit: () => void;
  onGameEvent: (k: GameEventKind) => void;
  seed?: number;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  const cb = useRef({ onGameEvent });
  cb.current = { onGameEvent };
  const pose = useRef<PoseFrame | null>(null);
  const space = useRef({ down: false, released: false });
  const restartRef = useRef<() => void>(() => {});
  const overAt = useRef(0);
  const [hud, setHud] = useState<Hud>({
    state: "ready",
    score: 0,
    jumps: 0,
    charge: 0,
    last: null,
    cleared: false,
    perfects: 0,
    tracking: "ok",
    u: 0,
    failed: "",
    needCharge: 0,
    gapCharge: 0,
    effectiveMs: 0,
    combo: 0,
  });

  useEffect(() => {
    if (mode !== "camera") return;
    return cameraVision.onPose((f) => {
      pose.current = f;
    });
  }, [mode]);

  useEffect(() => {
    if (mode !== "demo") return;
    const down = (e: KeyboardEvent) => {
      if (e.code !== "Space" && e.key !== " ") return;
      e.preventDefault();
      if (e.repeat) return;
      if (!pausedRef.current) space.current.down = true;
    };
    const up = (e: KeyboardEvent) => {
      if (e.code !== "Space" && e.key !== " ") return;
      e.preventDefault();
      if (space.current.down) space.current.released = true;
      space.current.down = false;
    };
    const blur = () => {
      space.current.down = false;
      space.current.released = false;
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
    const el = canvas.current!;
    const ctx = el.getContext("2d", { alpha: false })!;
    const scene = new JumpScene();
    let run = new JumpRun(seed);
    const session = new SquatSession(profile);
    let state: CtrlState = "ready";
    let charge = 0,
      perfects = 0,
      effectiveMs = 0;
    let lastSq: SquatUpdate | null = null;
    const visible = () => run.platforms.slice(Math.max(0, run.cur - 1));
    scene.reset(visible(), run.current, run.target);
    const restart = () => {
      run = new JumpRun();
      scene.reset(visible(), run.current, run.target);
      state = "ready";
      charge = 0;
      perfects = 0;
      effectiveMs = 0;
      session.reset();
      space.current = { down: false, released: false };
    };
    restartRef.current = restart;
    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      let w = Math.max(1, Math.round(el.clientWidth * dpr)),
        h = Math.max(1, Math.round(el.clientHeight * dpr));
      if (w > 2200) {
        h = Math.round((h * 2200) / w);
        w = 2200;
      }
      if (Math.abs(el.width - w) > 2 || Math.abs(el.height - h) > 2) {
        el.width = w;
        el.height = h;
      }
    };
    resize();
    let resizeDirty = false;
    const ro = new ResizeObserver(() => {
      resizeDirty = true;
    });
    ro.observe(el);

    const doJump = () => {
      const target = run.target;
      const l = run.jump(charge);
      el.dataset.lastCharge = charge.toFixed(3);
      el.dataset.lastDist = l.dist.toFixed(3);
      state = "flying";
      cb.current.onGameEvent("jump");
      scene.startJump(l, target.axis, () => {
        if (isSuccess(l.kind)) {
          if (l.kind === "perfect") {
            perfects++;
            scene.addFx({ kind: "ripple", x: l.x, z: l.z });
          }
          const bonus = run.current.bonus;
          scene.addFx({
            kind: "text",
            x: l.x,
            z: l.z,
            text: l.kind === "perfect" ? `完美 +${l.gained}` : `+${l.gained}`,
            strong: l.kind === "perfect" || bonus,
          });
          cb.current.onGameEvent(target.axis === "x" ? "right" : "left");
          if (!run.over) scene.advance(visible(), run.current, run.target);
          if (run.cleared) {
            state = "over";
            overAt.current = performance.now();
            cb.current.onGameEvent("complete");
          } else state = "ready";
        } else if (isFail(l.kind)) {
          state = "over";
          overAt.current = performance.now();
          cb.current.onGameEvent("stumble");
        } else state = "ready"; // 留在原台：不得分也不失败，可以再蓄力
        session.reset();
        charge = 0;
      });
    };

    let raf = 0,
      last = performance.now(),
      flush = 0;
    const tick = (now: number) => {
      const dtMs = now - last;
      last = now;
      const dt = Math.min(1 / 30, dtMs / 1000);
      if (resizeDirty) {
        resizeDirty = false;
        resize();
      }
      const isPaused = pausedRef.current;
      // —— 输入：统一成 pressing / release / cancel ——
      let pressing = false,
        release = false,
        cancel = false,
        tracking: SquatUpdate["tracking"] = "ok";
      if (mode === "demo") {
        pressing = space.current.down;
        release = space.current.released;
        space.current.released = false;
      } else if (!isPaused && state !== "flying" && state !== "over") {
        const p = pose.current;
        const s = p && now - p.at < 250 ? measureSquat(p) : null;
        lastSq = session.update(dtMs, s);
        pressing = lastSq.charging;
        release = lastSq.release;
        cancel = lastSq.cancel;
        tracking = lastSq.tracking;
      }
      if (isPaused) {
        if (state === "charging") {
          state = "ready";
          charge = 0;
        }
        session.reset();
      } else {
        if (state !== "over" && tracking === "ok") effectiveMs += dtMs;
        if (cancel && state === "charging") {
          state = "ready";
          charge = 0;
        }
        if (state === "ready" && pressing) state = "charging";
        if (state === "charging") {
          // 摄像头回升途中 pressing=false：蓄力冻结，等站回确认再释放
          if (pressing) charge = Math.min(JUMP_CONFIG.maxChargeSec, charge + dt);
          if (release) {
            if (charge >= 0.06) doJump();
            else {
              state = "ready";
              charge = 0;
            }
          }
        }
        scene.charge = state === "charging" ? charge / JUMP_CONFIG.maxChargeSec : 0;
        scene.step(dt);
      }
      scene.draw(ctx);
      if (now - flush > 80) {
        flush = now;
        const cur = run.current,
          tgt = run.target;
        const dist = tgt ? Math.abs(tgt.axis === "x" ? tgt.x - run.px : tgt.z - run.pz) : 0;
        let gap = 0;
        if (tgt && cur) {
          const ax = tgt.axis === "x";
          const curEdge = (ax ? cur.x - run.px : cur.z - run.pz) + (ax ? cur.w : cur.d) / 2;
          const front = dist - (ax ? tgt.w : tgt.d) / 2;
          gap = (curEdge + front) / 2;
        }
        setHud({
          state,
          score: run.score,
          jumps: run.jumps,
          charge,
          last: run.last?.kind ?? null,
          cleared: run.cleared,
          perfects,
          tracking: mode === "demo" ? "ok" : (lastSq?.tracking ?? "ok"),
          u: lastSq?.u ?? 0,
          failed: lastSq?.failed ?? "",
          needCharge: tgt && cur ? distanceToCharge(dist) : 0,
          gapCharge: gap > 0 ? distanceToCharge(gap) : 0,
          effectiveMs,
          combo: run.combo,
        });
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [profile, mode, seed]);

  const restart = useCallback(() => restartRef.current(), []);
  // 结算后：Enter 再来一局（键盘与鼠标都可用）
  useEffect(() => {
    if (hud.state !== "over") return;
    const key = (e: KeyboardEvent) => {
      if (e.key === "Enter" && performance.now() - overAt.current > 600) restart();
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [hud.state, restart]);

  const target = JUMP_CONFIG.targetJumps;
  const pct = Math.round((hud.charge / JUMP_CONFIG.maxChargeSec) * 100);
  const instruction =
    hud.state === "over"
      ? hud.cleared
        ? "五连跳完成"
        : FAIL_TEXT[hud.last ?? "short"] ?? "没站稳"
      : hud.state === "flying"
        ? "起跳！"
        : mode === "demo"
          ? hud.state === "charging"
            ? "松开空格，起跳"
            : "按住空格蓄力，松开起跳"
          : hud.tracking === "lost"
            ? "看不到双肩，站回标记处"
            : hud.state === "charging"
              ? hud.u < 0.5
                ? "站直，就会起跳"
                : "保持浅蹲蓄力，站直起跳"
              : hud.failed && hud.u > 0.4
                ? hud.failed === "scale"
                  ? "身体别前探，轻轻下蹲"
                  : hud.failed === "lateral"
                    ? "回到站位中间再蹲"
                    : hud.failed === "tilt"
                      ? "肩膀放平，不要侧倾"
                      : "双肩一起下降"
                : "轻轻浅蹲蓄力，站直起跳";
  return (
    <div
      className={`squat-jump ${hud.state}`}
      data-testid="squat-jump"
      data-mode={mode === "demo" ? "keyboard_demo" : "camera"}
      data-state={hud.state}
      data-jumps={hud.jumps}
      data-score={hud.score}
      data-last={hud.last ?? ""}
      data-need-charge={hud.needCharge.toFixed(3)}
      data-gap-charge={hud.gapCharge.toFixed(3)}
      data-tracking={hud.tracking}
      data-cleared={hud.cleared ? "1" : "0"}
    >
      <canvas ref={canvas} className="squat-canvas" aria-label="浅蹲跳一跳：等轴方块平台，角色朝下一块平台起跳" />
      <header className="squat-hud">
        <span className="squat-title">
          <b>G05 浅蹲跳一跳</b>
          <small>{mode === "demo" ? "keyboard_demo · 非人体识别" : "本机识别 · 双肩下降回升"}</small>
        </span>
        <span className="squat-score">
          <b data-testid="squat-score">{hud.score}</b>
          <small>得分</small>
        </span>
        <span className="squat-right">
          <span className="squat-count" data-testid="squat-count">
            {hud.jumps}/{target}
          </span>
          <button aria-label="暂停" onClick={onPause}>
            Ⅱ
          </button>
          <button aria-label="退出" onClick={onQuit}>
            ×
          </button>
        </span>
      </header>
      {hud.state !== "over" && (
        <footer className="squat-guide">
          <b role="status">{instruction}</b>
          <div className="squat-bar" aria-label={`蓄力 ${pct}%`}>
            <i style={{ transform: `scaleX(${hud.charge / JUMP_CONFIG.maxChargeSec})` }} className={pct >= 100 ? "full" : ""} />
          </div>
          {mode === "camera" && (
            <div className="squat-u" aria-hidden>
              <i style={{ transform: `translateY(${Math.min(1, hud.u) * 100}%)` }} />
            </div>
          )}
        </footer>
      )}
      {mode === "camera" && hud.tracking === "lost" && hud.state !== "over" && !paused && (
        <div className="squat-toast" data-testid="squat-lost">
          看不到双肩，已暂停输入。站回标记处、双肩入镜，站直约 1 秒后继续。
        </div>
      )}
      {hud.state === "over" && (
        <div className="squat-result" data-testid={hud.cleared ? "squat-clear" : "squat-fail"}>
          <small>{hud.cleared ? "G05 · CLEAR" : "G05 · RESULT"}</small>
          <h2>{hud.cleared ? "五连跳，完成！" : FAIL_TEXT[hud.last ?? "short"] ?? "没站稳"}</h2>
          <p>
            得分 <b>{hud.score}</b> · 成功 {hud.jumps}/{target}
            {hud.perfects > 0 ? ` · 中心命中 ${hud.perfects} 次` : ""}
          </p>
          {mode === "demo" && <p className="squat-note">keyboard_demo · 不计入真实活动</p>}
          <div className="squat-actions">
            <button onClick={restart} data-testid="squat-restart">
              再来一局
            </button>
            {hud.cleared ? (
              <button
                className="primary"
                onClick={() =>
                  onFinish({
                    effectiveMs: hud.effectiveMs,
                    reps: hud.jumps,
                    source: mode === "demo" ? "keyboard-demo" : "camera",
                  })
                }
              >
                回到专注
              </button>
            ) : (
              <button onClick={onEarlyExit}>结束活动</button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
