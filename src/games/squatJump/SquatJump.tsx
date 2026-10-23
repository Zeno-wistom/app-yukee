import { useCallback, useEffect, useRef, useState } from "react";
import { cameraVision } from "../../vision/CameraVision";
import { measureSquatDiag, SquatSession, squatDebugLog, squatThresholds, SQUAT_CONFIG, type SquatMissReason, type SquatProfile, type SquatUpdate } from "../../vision/squatPose";
import { audioEngine } from "../../audio/engine";
import { SquatCues } from "../../audio/gameCues";
import { f2, f3, SquatDebugPanel, useSquatDebugToggle, type DebugRow } from "./SquatDebug";
import type { PoseFrame } from "../../vision/wingPose";
import type { GameResult } from "../../state/machine";
import type { GameEventKind } from "../YukeeRun";
import { chargeToDistance, distanceToCharge, isFail, isSuccess, JUMP_CONFIG, JumpRun, type LandingKind } from "./jumpLogic";
import { JumpScene } from "./squatJumpScene";
import { CAMERA_CHARGE, CameraCharge } from "./chargeModel";
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
  /** 蓄力条上的目标区（0–1，按蓄力条满格归一化）：可落区与中心区 */
  band: { lo: number; hi: number; plo: number; phi: number };
  /** 调试 */
  dbg: { phase: string; ok: boolean; zero: number; peakU: number; failMs: number; armed: boolean; miss: SquatMissReason; visL: number; visR: number; fps: number; releasedBy: string; lastCharge: number; rate: number; frozen: boolean; held: number; lastDist: number; lastNeed: number };
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
    band: { lo: 0, hi: 0, plo: 0, phi: 0 },
    dbg: { phase: "ready", ok: true, zero: 0, peakU: 0, failMs: 0, armed: false, miss: "", visL: 0, visR: 0, fps: 0, releasedBy: "", lastCharge: 0, rate: 0, frozen: false, held: 0, lastDist: 0, lastNeed: 0 },
  });
  const debug = useSquatDebugToggle();

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
    const cam = new CameraCharge();
    // 蓄力条满格：键盘 1.5 秒；摄像头 1.3（不再允许极端过冲）
    const barMax = mode === "camera" ? CAMERA_CHARGE.maxCharge : JUMP_CONFIG.maxChargeSec;
    let lastDist = 0,
      lastNeed = 0;
    let state: CtrlState = "ready";
    let charge = 0,
      perfects = 0,
      effectiveMs = 0;
    let lastSq: SquatUpdate | null = null;
    let miss: SquatMissReason = "",
      visL = 0,
      visR = 0,
      lastPoseAt = -1,
      lastReleasedBy = "",
      lastCharge = 0;
    const poseFrames: number[] = [];
    let chargeSound = false;
    // 音效规则：蓄力刻度与实际蓄力值同一个数；只在跃迁时发声
    const cues = new SquatCues(audioEngine.sink);
    /** 当前目标的可落点区（蓄力条比例），与 HUD 亮区同一公式 */
    const bandFor = () => {
      const tgt = run.target;
      if (!tgt) return null;
      const dist = Math.abs(tgt.axis === "x" ? tgt.x - run.px : tgt.z - run.pz);
      const half = (tgt.axis === "x" ? tgt.w : tgt.d) / 2;
      const n = (d: number) => Math.max(0, Math.min(1, distanceToCharge(d) / barMax));
      return { lo: n(dist - half), hi: n(dist + half) };
    };
    const stopChargeSound = () => {
      if (chargeSound) audioEngine.chargeStop();
      chargeSound = false;
    };
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
      cam.reset();
      stopChargeSound();
      space.current = { down: false, released: false };
      audioEngine.markUi();
      cues.restart();
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
      stopChargeSound();
      lastCharge = charge;
      {
        const ax = target.axis === "x";
        lastNeed = Math.abs(ax ? target.x - run.px : target.z - run.pz);
      }
      cues.release();
      audioEngine.launchPower = Math.min(1, charge / barMax);
      audioEngine.sfx("g05Launch");
      const l = run.jump(charge);
      el.dataset.lastCharge = charge.toFixed(3);
      el.dataset.lastDist = l.dist.toFixed(3);
      lastDist = l.dist;
      squatDebugLog.push({
        t: Math.round(performance.now()),
        src: "game",
        ev: "jump",
        input: mode,
        charge: +charge.toFixed(3),
        dist: +l.dist.toFixed(3),
        needDist: +lastNeed.toFixed(3),
        result: l.kind,
      });
      state = "flying";
      cb.current.onGameEvent("jump");
      scene.startJump(l, target.axis, () => {
        if (isSuccess(l.kind)) {
          const bonus = run.current.bonus;
          if (l.kind === "perfect") {
            perfects++;
            scene.addFx({ kind: "ripple", x: l.x, z: l.z });
            audioEngine.sfx("g05Perfect");
          } else audioEngine.sfx("g05Land");
          if (bonus) {
            scene.addFx({ kind: "bonus", x: run.current.x, z: run.current.z });
            audioEngine.sfx("g05Bonus");
          }
          scene.addFx({
            kind: "text",
            x: l.x,
            z: l.z,
            text: l.kind === "perfect" ? `完美 +${l.gained}` : `+${l.gained}`,
            strong: l.kind === "perfect" || bonus,
          });
          cb.current.onGameEvent("land");
          if (run.cleared) cues.complete();
          else cues.landed(l.kind, run.combo);
          if (!run.over) scene.advance(visible(), run.current, run.target);
          if (run.cleared) {
            state = "over";
            overAt.current = performance.now();
            cb.current.onGameEvent("complete");
          } else state = "ready";
        } else if (isFail(l.kind)) {
          state = "over";
          overAt.current = performance.now();
          cues.fail();
          cb.current.onGameEvent("fall");
        } else {
          state = "ready"; // 留在原台：不得分也不失败，可以再蓄力
          audioEngine.sfx("g05Land");
        }
        session.reset();
        cam.reset();
        charge = 0;
      });
    };

    let raf = 0,
      last = performance.now(),
      flush = 0;
    const tick = (now: number) => {
      const dtMs = now - last;
      last = now;
      const dt = Math.max(0, Math.min(0.1, dtMs / 1000));
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
        const m = p && now - p.at < 350 ? measureSquatDiag(p) : { sample: null, reason: (p ? "stale" : "noFrame") as SquatMissReason, visL: 0, visR: 0 };
        miss = m.reason;
        visL = m.visL;
        visR = m.visR;
        lastSq = session.update(dtMs, m.sample, p?.at);
        pressing = lastSq.charging;
        release = lastSq.release;
        cancel = lastSq.cancel;
        tracking = lastSq.tracking;
        // 摄像头蓄力：按幅度加权、缓入、开始站起即冻结（见 chargeModel.ts）
        if (state === "ready" || state === "charging") charge = cam.step(dt, lastSq, profile).charge;
        if (lastSq.release) lastReleasedBy = lastSq.releasedBy;
        if (p && p.at > lastPoseAt) {
          lastPoseAt = p.at;
          poseFrames.push(now);
          while (poseFrames.length && now - poseFrames[0] > 1000) poseFrames.shift();
          squatDebugLog.push({
            t: Math.round(p.at),
            src: "game",
            u: +lastSq.u.toFixed(3),
            phase: lastSq.phase,
            ok: lastSq.ok,
            failed: lastSq.failed,
            zero: +lastSq.zero.toFixed(4),
            peakU: +lastSq.peakU.toFixed(3),
            charge: +charge.toFixed(3),
            rate: +cam.rate.toFixed(3),
            frozen: cam.frozen,
            rel: lastSq.release ? lastSq.releasedBy : "",
            cancel: lastSq.cancel,
            miss,
          });
        }
      }
      if (isPaused) {
        space.current = { down: false, released: false };
        if (state === "charging") {
          state = "ready";
          charge = 0;
        }
        session.reset();
        cam.reset();
        stopChargeSound();
        cues.chargeCancel();
      } else {
        if (state !== "over" && tracking === "ok") effectiveMs += dtMs;
        if (cancel && state === "charging") {
          state = "ready";
          charge = 0;
          stopChargeSound();
          cues.chargeCancel();
        }
        if (state === "ready" && pressing) {
          state = "charging";
          cues.chargeStart();
        }
        if (state === "charging" && pressing && !chargeSound) {
          audioEngine.chargeStart();
          chargeSound = true;
        }
        if (chargeSound && !pressing) stopChargeSound();
        if (state === "charging") {
          // 摄像头回升途中 pressing=false：蓄力冻结，等站回确认再释放
          if (pressing && mode === "demo") charge = Math.min(JUMP_CONFIG.maxChargeSec, charge + dt);
          if (release) {
            if (charge >= (mode === "camera" ? CAMERA_CHARGE.minJump : 0.06)) doJump();
            else {
              state = "ready";
              charge = 0;
              cam.reset();
              cues.chargeCancel();
            }
          }
        }
        if (chargeSound) audioEngine.chargeLevel(charge / barMax);
        if (state === "charging") cues.chargeLevel(charge / barMax, bandFor());
        scene.charge = state === "charging" ? charge / barMax : 0;
        scene.step(dt);
      }
      scene.draw(ctx);
      if (now - flush > 80) {
        flush = now;
        const cur = run.current,
          tgt = run.target;
        const dist = tgt ? Math.abs(tgt.axis === "x" ? tgt.x - run.px : tgt.z - run.pz) : 0;
        let gap = 0;
        const band = { lo: 0, hi: 0, plo: 0, phi: 0 };
        if (tgt) {
          const half = (tgt.axis === "x" ? tgt.w : tgt.d) / 2;
          const n = (d: number) => Math.max(0, Math.min(1, distanceToCharge(d) / barMax));
          band.lo = n(dist - half);
          band.hi = n(dist + half);
          band.plo = n(dist - JUMP_CONFIG.perfectRadius);
          band.phi = n(dist + JUMP_CONFIG.perfectRadius);
        }
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
          band,
          dbg: {
            phase: lastSq?.phase ?? "ready",
            ok: lastSq?.ok ?? true,
            zero: lastSq?.zero ?? 0,
            peakU: lastSq?.peakU ?? 0,
            failMs: lastSq?.failMs ?? 0,
            armed: lastSq?.armed ?? false,
            miss,
            visL,
            visR,
            fps: poseFrames.length,
            releasedBy: lastReleasedBy,
            lastCharge,
            rate: cam.rate,
            frozen: cam.frozen,
            held: cam.heldSec,
            lastDist,
            lastNeed,
          },
        });
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      stopChargeSound();
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
  const barMax = mode === "camera" ? CAMERA_CHARGE.maxCharge : JUMP_CONFIG.maxChargeSec;
  const fill = Math.min(1, hud.charge / barMax);
  const pct = Math.round(fill * 100);
  const inBand = hud.state === "charging" && fill >= hud.band.lo && fill <= hud.band.hi;
  const pastBand = hud.state === "charging" && fill > hud.band.hi;
  const thresholds = squatThresholds(profile);
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
              ? hud.u < thresholds.downU
                ? "站直，就会起跳"
                : pastBand
                  ? "够远了，现在站直"
                  : inBand
                    ? "进入落点区，站直起跳"
                    : "保持浅蹲，看蓄力进入亮区"
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
          <div className={`squat-bar${inBand ? " in-band" : ""}${pastBand ? " past-band" : ""}`} aria-label={`蓄力 ${pct}%`} data-testid="squat-bar">
            <span className="squat-band" style={{ left: `${hud.band.lo * 100}%`, width: `${Math.max(0, hud.band.hi - hud.band.lo) * 100}%` }} />
            <span className="squat-band-perfect" style={{ left: `${hud.band.plo * 100}%`, width: `${Math.max(0, hud.band.phi - hud.band.plo) * 100}%` }} />
            <i style={{ transform: `scaleX(${fill})` }} className={pct >= 100 ? "full" : ""} />
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
      {debug && mode === "camera" && (
        <SquatDebugPanel
          title="G05 动作调试"
          meter={{
            value: hud.u,
            max: 1.4,
            marks: [
              { at: thresholds.releaseU, label: "站" },
              { at: thresholds.holdU, label: "保" },
              { at: thresholds.downU, label: "蹲" },
              { at: 1, label: "A" },
            ],
          }}
          rows={
            [
              ["姿态帧", `${hud.dbg.fps} fps`, hud.dbg.fps >= 8 ? "ok" : hud.dbg.fps >= 4 ? "warn" : "bad"],
              ["肩点", hud.dbg.miss || "ok", hud.dbg.miss ? "bad" : "ok"],
              ["可见度 L/R", `${f2(hud.dbg.visL)} / ${f2(hud.dbg.visR)}`],
              ["u（本人幅度比例）", f3(hud.u)],
              ["阶段", `${hud.dbg.phase}${hud.dbg.armed ? " · 已上膛" : ""}`],
              ["控制器", hud.state],
              ["检查", hud.dbg.ok ? "通过" : `未通过：${hud.failed}（${Math.round(hud.dbg.failMs)}ms）`, hud.dbg.ok ? "ok" : "bad"],
              ["基线修正", `${f3(hud.dbg.zero)} W0`],
              ["本轮峰值 u", f2(hud.dbg.peakU)],
              ["蓄力", `${hud.charge.toFixed(2)} s（上次 ${hud.dbg.lastCharge.toFixed(2)} s）`],
              ["需要蓄力", `${hud.needCharge.toFixed(2)} s（落点区 ${(hud.band.lo * barMax).toFixed(2)}–${(hud.band.hi * barMax).toFixed(2)}）`],
              ["蓄力速度", `${hud.dbg.rate.toFixed(2)} /s${hud.dbg.frozen ? " · 回升冻结" : ""} · 已蹲 ${hud.dbg.held.toFixed(2)} s`],
              ["上次跳跃", hud.dbg.lastDist ? `${hud.dbg.lastDist.toFixed(2)} / 需 ${hud.dbg.lastNeed.toFixed(2)}（${hud.last ?? ""}）` : "–"],
              ["上次释放", hud.dbg.releasedBy || "–"],
              ["幅度 A", `${f3(profile.amp)} W0 · W0 ${Math.round(profile.w0)}px`],
              ["实际入蹲门槛", `${(thresholds.downQ * profile.w0).toFixed(1)} px · ${f3(thresholds.downU)} A`],
              ["站回门槛", `${(thresholds.releaseU * profile.amp * profile.w0).toFixed(1)} px`],
            ] as DebugRow[]
          }
        />
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
                返回游戏选择
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
