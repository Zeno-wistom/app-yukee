import { useEffect, useRef, useState } from "react";
import { ScanFace, Zap } from "lucide-react";
import type { MotionBus } from "../demo/MotionBus";
import { cameraVision } from "../vision/CameraVision";
import type {
  HeadDirection,
  MotionAction,
  VisionStatus,
} from "../vision/types";
import {
  ENERGY_LEAD,
  ENERGY_WINDOW,
  FINISH_AT,
  LEVEL,
  OUTRO_SECONDS,
  TOTAL_SECONDS,
} from "./level";
import {
  YUKEE_CELEBRATE,
  YUKEE_DUCK,
  YUKEE_IDLE,
  YUKEE_JUMP,
  YUKEE_RUN_A,
  YUKEE_RUN_B,
  YUKEE_HIT,
  PALETTE,
  drawSprite,
} from "./sprites";
import { hasReachedCompletion, shouldPauseForTracking } from "./gameFlow";

export type GameEventKind =
  "jump" | "duck" | "left" | "right" | "stumble" | "complete" | "finale"
  // G05：自带音效，只驱动挂灯与信号条
  | "land" | "fall";

const W = 480;
const H = 170;
const GROUND_Y = 138;
const YUKEE_X = 84;
const SPEED = 150; // px/s
const SPAWN_X = W + 40;
const JUMP_VY = -295;
const GRAVITY = 950;
const DUCK_MS = 650;
const INVULN_MS = 1100;
const PX = 2; // 精灵像素粒度

interface Obstacle {
  kind: "jump" | "duck";
  variant: string;
  x: number;
  w: number;
  h: number;
  cleared: boolean;
}
interface Orb {
  side: "left" | "right";
  at: number;
  x: number;
  state: "armed" | "collected" | "missed";
}
interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  color: string;
  size: number;
}
interface SignalView {
  key: number;
  side: "left" | "right";
  state: "armed" | "collected" | "missed";
}

const OBSTACLE_SIZE: Record<string, { w: number; h: number }> = {
  box: { w: 22, h: 20 },
  rock: { w: 20, h: 14 },
  stack: { w: 22, h: 36 },
  bar: { w: 30, h: 8 },
  bird: { w: 16, h: 10 },
};

export default function YukeeRun({
  paused,
  visionActive,
  bus,
  onGameEvent,
  onComplete,
  onDirection,
}: {
  paused: boolean;
  visionActive: boolean;
  bus: MotionBus;
  onGameEvent: (kind: GameEventKind) => void;
  onComplete: () => void;
  onDirection: (x: number) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [energy, setEnergy] = useState(0);
  const [progress, setProgress] = useState(0);
  const [hud, setHud] = useState<HeadDirection>("center");
  const [signals, setSignals] = useState<SignalView[]>([]);
  const [faceLost, setFaceLost] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [finished, setFinished] = useState(false);
  const [intro, setIntro] = useState(true);
  const sceneImage = useRef<HTMLImageElement | null>(null);

  // 用户参考图经内置图像工具重绘后的像素自然场景；Canvas 只在本地读取。
  useEffect(() => {
    const image = new Image();
    image.src = "/game/yukee-run-nature-pixel.png";
    image.onload = () => {
      sceneImage.current = image;
    };
    return () => {
      image.onload = null;
    };
  }, []);

  const world = useRef({
    t: 0,
    yukeeY: 0, // 离地高度
    vy: 0,
    grounded: true,
    duckUntil: 0,
    stumbleUntil: -1,
    invulnUntil: -1,
    leanUntil: -1,
    leanDir: 0,
    successUntil: -1,
    obstacles: [] as Obstacle[],
    orbs: [] as Orb[],
    particles: [] as Particle[],
    spawned: new Set<number>(),
    energyCount: 0,
    completed: false,
    countdownEnd: 0,
    finaleSent: false,
    /** squash & stretch 时间戳：起跳压缩 / 落地压扁 */
    jumpAt: -1,
    landAt: -1,
  });
  const statusRef = useRef<VisionStatus | null>(null);
  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  const callbacks = useRef({ onGameEvent, onComplete, onDirection });
  callbacks.current = { onGameEvent, onComplete, onDirection };
  // 摄像头状态：HUD 方向、丢脸检测、挂灯连续方向
  useEffect(() => {
    if (!visionActive) return;
    return cameraVision.onStatus((status) => {
      statusRef.current = status;
      setHud(status.direction);
      callbacks.current.onDirection(Math.max(-1, Math.min(1, status.dYaw * 8)));
    });
  }, [visionActive]);

  // 动作输入：摄像头与调试按钮同一总线
  useEffect(() => {
    return bus.subscribe((input) => {
      const w = world.current;
      if (w.completed || w.t >= TOTAL_SECONDS) return;
      const now = performance.now();
      const action = input.action as MotionAction;
      if (action === "up") {
        if (w.grounded) {
          w.vy = JUMP_VY;
          w.grounded = false;
          w.jumpAt = now;
          burst(YUKEE_X + 14, GROUND_Y, 5, PALETTE.A, 40);
        }
        setHud("up");
      } else if (action === "down") {
        w.duckUntil = now + DUCK_MS;
        setHud("down");
      } else if (action === "left" || action === "right") {
        const side = action;
        const orb = w.orbs.find(
          (o) =>
            o.side === side &&
            o.state === "armed" &&
            Math.abs(w.t - o.at) <= ENERGY_WINDOW,
        );
        w.leanDir = side === "left" ? -1 : 1;
        w.leanUntil = now + 220;
        if (orb) {
          orb.state = "collected";
          w.energyCount++;
          w.successUntil = now + 360;
          setEnergy(w.energyCount);
          burst(orb.x, GROUND_Y - 64, 12, PALETTE.energy, 80);
          callbacks.current.onGameEvent(side);
        }
        setHud(side);
      }
    });
  }, [bus]);

  function burst(
    x: number,
    y: number,
    n: number,
    color: string,
    power: number,
  ) {
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) n = Math.min(n, 3);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      world.current.particles.push({
        x,
        y,
        vx: Math.cos(a) * power * (0.4 + Math.random()),
        vy: Math.sin(a) * power * (0.4 + Math.random()) - 30,
        life: 0,
        max: 0.5 + Math.random() * 0.4,
        color,
        size: 2,
      });
    }
  }

  // 主循环：世界推进 + 渲染（独立 rAF，不与视觉推理耦合）
  useEffect(() => {
    const canvas = canvasRef.current!;
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d")!;
    ctx.imageSmoothingEnabled = false;
    let raf = 0;
    let last = performance.now();
    let hudFlush = 0;

    const frame = (nowMs: number) => {
      const dt = Math.min((nowMs - last) / 1000, 0.05);
      last = nowMs;
      const w = world.current;
      const status = statusRef.current;

      // ---- 丢脸暂停 / 恢复倒计时 ----
      const visionWatching = visionActive && status?.running === true;
      const lost = shouldPauseForTracking({
        visionWatching,
        facePresent: status?.facePresent ?? false,
        worldTime: w.t,
        completed: w.completed,
      });
      if (lost !== faceLost) setFaceLost(lost);
      let frozen = pausedRef.current || lost;
      if (!lost && w.countdownEnd > nowMs) {
        frozen = true;
        setCountdown(Math.ceil((w.countdownEnd - nowMs) / 750));
      } else if (w.countdownEnd && w.countdownEnd <= nowMs) {
        w.countdownEnd = 0;
        setCountdown(null);
      }
      if (!lost && faceLost && !w.countdownEnd) {
        // 脸刚恢复 → 3-2-1 继续
        w.countdownEnd = nowMs + 2250;
        frozen = true;
      }

      if (!frozen && !w.completed) {
        w.t += dt;
        // ---- 生成障碍与能量球 ----
        LEVEL.forEach((event, i) => {
          if (w.spawned.has(i)) return;
          const travel = (SPAWN_X - YUKEE_X) / SPEED;
          const lead = event.kind === "energy" ? travel + ENERGY_LEAD : travel;
          if (w.t >= event.at - lead) {
            w.spawned.add(i);
            if (event.kind === "energy") {
              w.orbs.push({
                side: event.side,
                at: event.at,
                x: SPAWN_X + ENERGY_LEAD * SPEED,
                state: "armed",
              });
            } else {
              const size = OBSTACLE_SIZE[event.variant];
              w.obstacles.push({
                kind: event.kind,
                variant: event.variant,
                x: SPAWN_X,
                w: size.w,
                h: size.h,
                cleared: false,
              });
            }
          }
        });
        // ---- 物理 ----
        if (!w.grounded) {
          w.yukeeY += w.vy * dt;
          w.vy += GRAVITY * dt;
          if (w.yukeeY >= 0) {
            w.yukeeY = 0;
            w.vy = 0;
            w.grounded = true;
            w.landAt = nowMs;
            burst(YUKEE_X + 14, GROUND_Y, 3, PALETTE.groundLine, 25);
          }
        }
        const ducking = nowMs < w.duckUntil;
        // ---- 世界滚动与碰撞 ----
        for (const o of w.obstacles) {
          o.x -= SPEED * dt;
          const oTop = o.kind === "duck" ? GROUND_Y - 26 - o.h : GROUND_Y - o.h;
          const mTop = ducking
            ? GROUND_Y - 16 + w.yukeeY
            : GROUND_Y - 30 + w.yukeeY;
          const mBottom = GROUND_Y + w.yukeeY;
          const overlap =
            o.x < YUKEE_X + 24 &&
            o.x + o.w > YUKEE_X + 4 &&
            oTop + o.h > mTop + 2 &&
            oTop < mBottom - 2;
          if (overlap && nowMs > w.invulnUntil && w.stumbleUntil < nowMs) {
            w.stumbleUntil = nowMs + 600;
            w.invulnUntil = nowMs + INVULN_MS;
            burst(YUKEE_X + 14, mTop + 8, 8, "#f4a17f", 60);
            callbacks.current.onGameEvent("stumble");
          }
          if (!o.cleared && o.x + o.w < YUKEE_X + 4) {
            o.cleared = true;
            w.successUntil = nowMs + 320;
            callbacks.current.onGameEvent(o.kind === "jump" ? "jump" : "duck");
          }
        }
        w.obstacles = w.obstacles.filter((o) => o.x + o.w > -20);
        for (const orb of w.orbs) {
          orb.x -= SPEED * dt;
          if (orb.state === "armed" && w.t > orb.at + ENERGY_WINDOW)
            orb.state = "missed";
        }
        w.orbs = w.orbs.filter(
          (o) => o.x > -30 && (o.state === "armed" || w.t - o.at < 1),
        );
        // ---- 粒子 ----
        for (const p of w.particles) {
          p.life += dt;
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          p.vy += 300 * dt;
        }
        w.particles = w.particles.filter((p) => p.life < p.max);
        // ---- 完成 ----
        if (!w.finaleSent && !w.completed && w.t >= FINISH_AT - 4) {
          // 接近终点：通知外部把 BGM 压低，给收尾奖励音让位
          w.finaleSent = true;
          callbacks.current.onGameEvent("finale");
        }
        if (hasReachedCompletion(w.t) && !w.completed) {
          w.completed = true;
          callbacks.current.onGameEvent("complete");
          callbacks.current.onComplete();
        }
        if (w.t >= FINISH_AT && !finished) {
          setFinished(true);
          burst(YUKEE_X + 14, GROUND_Y - 40, 20, PALETTE.energy, 90);
        }
        if (w.t > 3 && intro) setIntro(false);
      }

      // ---- 渲染 ----
      draw(ctx, w, nowMs, ducking(nowMs, w), frozen);
      // ---- HUD 快照（8Hz）----
      if (nowMs - hudFlush > 125) {
        hudFlush = nowMs;
        setProgress(Math.min(w.t / TOTAL_SECONDS, 1));
        setSignals(
          w.orbs
            .filter((o) => Math.abs(w.t - o.at) <= ENERGY_WINDOW + 0.6)
            .map((o, k) => ({ key: k, side: o.side, state: o.state })),
        );
      }
      raf = requestAnimationFrame(frame);
    };
    const ducking = (nowMs: number, w: (typeof world)["current"]) =>
      nowMs < w.duckUntil;
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visionActive, faceLost, finished, intro]);

  function draw(
    ctx: CanvasRenderingContext2D,
    w: (typeof world)["current"],
    nowMs: number,
    duck: boolean,
    frozen: boolean,
  ) {
    const worldX = w.t * SPEED;
    // Layer 1：像素自然场景底图（树、机械遗迹、远林、天空），最慢速。
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, "#4aaee3");
    sky.addColorStop(1, "#c9eef0");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);

    const scenic = sceneImage.current;
    if (scenic?.complete && scenic.naturalWidth > 0) {
      const cropH = Math.floor(scenic.naturalWidth / 2.82);
      const cropY = Math.max(
        0,
        Math.floor((scenic.naturalHeight - cropH) * 0.42),
      );
      ctx.save();
      ctx.globalAlpha = 0.84;
      ctx.filter = "saturate(0.82) contrast(0.9)";
      ctx.drawImage(
        scenic,
        0,
        cropY,
        scenic.naturalWidth,
        cropH,
        0,
        0,
        W,
        GROUND_Y,
      );
      ctx.restore();
      ctx.imageSmoothingEnabled = false;
    }

    // Layer 2：独立白云，速度比底图更慢；矩形簇保持像素边缘。
    const cloudSpan = W + 140;
    const cloudOff = (worldX * 0.035) % cloudSpan;
    const clouds = [
      [44, 24, 38],
      [226, 16, 48],
      [392, 34, 32],
      [548, 21, 44],
    ];
    ctx.fillStyle = "#f7fbecdd";
    for (const [baseX, y, width] of clouds) {
      const x =
        ((((baseX - cloudOff) % cloudSpan) + cloudSpan) % cloudSpan) - 70;
      ctx.fillRect(x + 8, y, width - 16, 4);
      ctx.fillRect(x, y + 4, width, 7);
      ctx.fillRect(x + 5, y + 11, width - 9, 4);
    }

    // Layer 3：低对比远山/远树色带。
    const farOff = worldX * 0.16;
    ctx.fillStyle = "#5aa995aa";
    for (let x = 0; x < W; x += 4) {
      const y =
        102 +
        Math.round(Math.sin((x + farOff) / 44) * 4) +
        Math.round(Math.sin((x + farOff) / 19) * 2);
      ctx.fillRect(x, y, 4, GROUND_Y - y);
    }

    // Layer 4：青绿草坡，中速滚动。
    const hillOff = worldX * 0.28;
    ctx.fillStyle = "#63c982";
    for (let x = 0; x < W; x += 3) {
      const y = 118 + Math.round(Math.sin((x + hillOff) / 55) * 5);
      ctx.fillRect(x, y, 3, GROUND_Y - y);
    }
    ctx.fillStyle = "#8fe39a";
    for (let x = 0; x < W; x += 6) {
      const y = 118 + Math.round(Math.sin((x + hillOff) / 55) * 5);
      ctx.fillRect(x, y, 4, 2);
    }

    // Layer 5：近景草叶与小花，较快滚动且只贴近地面，不干扰能量球。
    const grassOff = (worldX * 0.55) % 36;
    ctx.fillStyle = "#227663";
    for (let x = -grassOff; x < W + 12; x += 12) {
      const h = 3 + ((Math.floor((x + worldX) / 12) * 7) % 5);
      ctx.fillRect(x, GROUND_Y - h, 2, h);
      ctx.fillRect(x + 3, GROUND_Y - Math.max(2, h - 2), 2, Math.max(2, h - 2));
    }
    const flowerOff = (worldX * 0.55) % 84;
    ctx.fillStyle = "#d9b953";
    for (let x = 18 - flowerOff; x < W + 20; x += 84) {
      ctx.fillRect(x, GROUND_Y - 7, 2, 2);
      ctx.fillStyle = "#246f58";
      ctx.fillRect(x, GROUND_Y - 5, 1, 5);
      ctx.fillStyle = "#d9b953";
    }

    // Layer 6：可玩地面，最快；深色稳定轮廓保证角色与障碍清楚。
    ctx.fillStyle = "#163c34";
    ctx.fillRect(0, GROUND_Y, W, H - GROUND_Y);
    ctx.fillStyle = "#b2e58b";
    ctx.fillRect(0, GROUND_Y, W, 2);
    const dashOff = worldX % 28;
    ctx.fillStyle = "#3f7a64";
    for (let x = -dashOff; x < W; x += 28)
      ctx.fillRect(x, GROUND_Y + 10, 12, 2);
    // 终点旗
    const finishX = YUKEE_X + (FINISH_AT - w.t) * SPEED;
    if (finishX > -20 && finishX < W + 20) {
      ctx.fillStyle = PALETTE.finish;
      ctx.fillRect(finishX, GROUND_Y - 56, 3, 56);
      for (let r = 0; r < 4; r++)
        for (let c = 0; c < 4; c++) {
          ctx.fillStyle = (r + c) % 2 ? PALETTE.finish : PALETTE.groundDark;
          ctx.fillRect(finishX + 3 + c * 5, GROUND_Y - 56 + r * 5, 5, 5);
        }
    }
    // 障碍
    for (const o of w.obstacles) {
      const y = o.kind === "duck" ? GROUND_Y - 26 - o.h : GROUND_Y - o.h;
      if (o.variant === "box" || o.variant === "stack") {
        const boxes = o.variant === "stack" ? 2 : 1;
        const bh = o.h / boxes;
        for (let i = 0; i < boxes; i++) {
          const by = GROUND_Y - bh * (i + 1);
          ctx.fillStyle = PALETTE.crate;
          ctx.fillRect(o.x, by, o.w, bh);
          ctx.fillStyle = PALETTE.crateDark;
          ctx.fillRect(o.x, by, o.w, 2);
          ctx.fillRect(o.x, by + bh - 2, o.w, 2);
          ctx.fillRect(o.x, by, 2, bh);
          ctx.fillRect(o.x + o.w - 2, by, 2, bh);
          for (let d = 0; d < bh - 4; d += 2)
            ctx.fillRect(o.x + 3 + d, by + 3 + d, 2, 2);
        }
      } else if (o.variant === "rock") {
        ctx.fillStyle = PALETTE.rock;
        ctx.fillRect(o.x + 3, y + 4, o.w - 6, o.h - 4);
        ctx.fillRect(o.x + 6, y, o.w - 10, 5);
        ctx.fillStyle = PALETTE.rockDark;
        ctx.fillRect(o.x + 5, y + o.h - 4, o.w - 9, 3);
      } else if (o.variant === "bar") {
        ctx.fillStyle = PALETTE.bar;
        ctx.fillRect(o.x - 6, 0, 2, y);
        ctx.fillRect(o.x + o.w + 4, 0, 2, y);
        ctx.fillRect(o.x - 8, y, o.w + 16, o.h);
        ctx.fillStyle = PALETTE.barWarn;
        for (let sx = o.x - 8; sx < o.x + o.w + 8; sx += 8)
          ctx.fillRect(sx, y + o.h - 3, 4, 3);
      } else if (o.variant === "bird") {
        const flap = Math.floor(nowMs / 180) % 2;
        const bob = Math.sin(nowMs / 240) * 3;
        ctx.fillStyle = PALETTE.bird;
        ctx.fillRect(o.x + 3, y + 3 + bob, o.w - 5, 5);
        ctx.fillRect(o.x + o.w - 5, y + 1 + bob, 5, 4);
        if (flap) ctx.fillRect(o.x + 4, y - 3 + bob, 6, 3);
        else ctx.fillRect(o.x + 4, y + 8 + bob, 6, 3);
        ctx.fillStyle = PALETTE.birdDark;
        ctx.fillRect(o.x + o.w - 3, y + 2 + bob, 2, 2);
      }
    }
    // 能量球
    for (const orb of w.orbs) {
      if (orb.state !== "armed") continue;
      const pulse = 1 + Math.sin(nowMs / 160) * 0.25;
      const oy = GROUND_Y - 64 + Math.sin(nowMs / 300) * 4;
      ctx.fillStyle = PALETTE.energy;
      const r = 4 * pulse;
      ctx.fillRect(orb.x - r, oy - r, r * 2, r * 2);
      ctx.fillStyle = PALETTE.energyCore;
      ctx.fillRect(orb.x - 2, oy - 2, 4, 4);
      ctx.fillStyle = PALETTE.energy;
      ctx.fillRect(orb.x - 1, oy - r - 4, 2, 3);
      ctx.fillRect(orb.x - 1, oy + r + 1, 2, 3);
      // 方向箭头：明确表达「往哪边转头」，箭头指向即转头方向
      const dirSign = orb.side === "left" ? -1 : 1;
      const tipX = Math.round(orb.x + dirSign * 16);
      const ay = Math.round(oy);
      ctx.fillStyle = PALETTE.energyCore;
      ctx.fillRect(tipX, ay - 1, 3, 3);
      ctx.fillRect(tipX - dirSign * 4, ay - 5, 3, 3);
      ctx.fillRect(tipX - dirSign * 4, ay + 3, 3, 3);
      ctx.fillRect(tipX - dirSign * 8, ay - 9, 3, 3);
      ctx.fillRect(tipX - dirSign * 8, ay + 7, 3, 3);
    }
    // Yukee
    const celebrating = w.t >= FINISH_AT;
    const stumbling = nowMs < w.stumbleUntil;
    const succeeding = nowMs < w.successUntil;
    const blink = nowMs < w.invulnUntil && Math.floor(nowMs / 90) % 2 === 0;
    if (!blink) {
      const sprite = celebrating
        ? YUKEE_CELEBRATE
        : stumbling
          ? YUKEE_HIT
          : duck
            ? YUKEE_DUCK
            : !w.grounded
              ? YUKEE_JUMP
              : frozen
                ? YUKEE_IDLE
                : succeeding
                  ? YUKEE_CELEBRATE
                  : Math.floor(nowMs / 140) % 2
                    ? YUKEE_RUN_A
                    : YUKEE_RUN_B;
      const lean = nowMs < w.leanUntil ? w.leanDir * 3 : 0;
      const bob =
        w.grounded && !duck && !frozen && !celebrating
          ? Math.abs(Math.sin(nowMs / 140)) * -1.5
          : celebrating
            ? Math.sin(nowMs / 180) * -2
            : 0;
      // ---- 团子式 squash & stretch（锚定底部中心，纯形变无位移） ----
      let sx = 1;
      let sy = 1;
      let rot = 0;
      if (stumbling) {
        // 碰撞：横向压扁 + 回弹（600ms 内弹簧衰减）
        const k = Math.max(0, (w.stumbleUntil - nowMs) / 600);
        const spring = Math.sin(k * Math.PI * 2.2) * k;
        sx = 1 + 0.24 * k - 0.06 * spring;
        sy = 1 - 0.26 * k + 0.05 * spring;
      } else if (!w.grounded) {
        // 空中：起跳先压缩(120ms)，随后拉长
        const sinceJump = w.jumpAt > 0 ? nowMs - w.jumpAt : 999;
        if (sinceJump < 120) {
          const k = 1 - sinceJump / 120;
          sx = 1 + 0.14 * k;
          sy = 1 - 0.16 * k;
        } else {
          sx = 0.93;
          sy = 1.12;
        }
      } else if (w.landAt > 0 && nowMs - w.landAt < 170) {
        // 落地 squash，快速回弹
        const k = 1 - (nowMs - w.landAt) / 170;
        sx = 1 + 0.17 * k;
        sy = 1 - 0.19 * k;
      } else if (celebrating) {
        // 庆祝：blob bounce + 轻微左右摇摆
        const wave = Math.sin(nowMs / 150);
        sx = 1 - 0.07 * wave;
        sy = 1 + 0.1 * wave;
        rot = Math.sin(nowMs / 320) * 0.09;
      } else if (duck) {
        sx = 1.05;
        sy = 0.95;
      } else if (!frozen && w.grounded) {
        // 跑动：squash → stretch 循环，配合 A/B 帧交替形成滚动感
        const wave = Math.sin((nowMs / 280) * Math.PI * 2);
        sx = 1 - 0.05 * wave;
        sy = 1 + 0.07 * wave;
        rot = 0.05 * Math.sin((nowMs / 280) * Math.PI * 2 + Math.PI / 3);
      }
      const sw = sprite[0].length * PX;
      const sh = sprite.length * PX;
      ctx.save();
      ctx.translate(
        YUKEE_X + lean + sw / 2 + (stumbling ? Math.sin(nowMs / 40) * 2 : 0),
        GROUND_Y + w.yukeeY + bob,
      );
      if (rot !== 0) ctx.rotate(rot);
      ctx.scale(sx, sy);
      drawSprite(ctx, sprite, -sw / 2, -sh, PX);
      ctx.restore();
    }
    // 粒子
    for (const p of w.particles) {
      ctx.globalAlpha = 1 - p.life / p.max;
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x, p.y, p.size, p.size);
    }
    ctx.globalAlpha = 1;
    // FINISH 横幅
    if (w.t >= FINISH_AT && w.t < TOTAL_SECONDS) {
      ctx.fillStyle = PALETTE.energyCore;
      ctx.font = "bold 18px monospace";
      ctx.textAlign = "center";
      ctx.fillText("FINISH!", W / 2, 46);
      ctx.font = "10px monospace";
      ctx.fillStyle = PALETTE.A;
      ctx.fillText("做得很好，Yukee 陪你到达终点", W / 2, 64);
    }
  }

  const hudChip = (dir: HeadDirection, label: string) => (
    <i className={hud === dir ? "on" : ""}>{label}</i>
  );

  return (
    <div className="yukee-run" data-testid="yukee-run">
      <div className="yukee-hud-top">
        <span className="yukee-title">
          YUKEE RUN <small>头颈活动 · 约 35 秒</small>
        </span>
        <span className="yukee-energy" data-testid="energy-count">
          <Zap size={13} /> ENERGY × {energy}
        </span>
      </div>
      <div className="yukee-stage">
        <canvas ref={canvasRef} aria-label="Yukee Run 像素跑酷画面" />
        {signals.map((s) => (
          <div
            key={s.key}
            className={`energy-signal ${s.side} ${s.state}`}
            data-testid={`energy-${s.side}`}
          >
            <div className="energy-signal-main">
              {s.side === "left" && <b className="energy-arrow">←</b>}
              <span>
                {s.state === "collected"
                  ? "收集成功"
                  : s.side === "left"
                    ? "往左转头"
                    : "往右转头"}
              </span>
              {s.side === "right" && <b className="energy-arrow">→</b>}
            </div>
            <small>
              {s.state === "collected"
                ? "做得好"
                : s.state === "missed"
                  ? "错过了"
                  : "ENERGY"}
            </small>
          </div>
        ))}
        {intro && !faceLost && (
          <div className="yukee-intro">
            <b>抬头 = 跳 · 低头 = 蹲</b>
            <span>左右转头 = 收集能量 · 不用碰鼠标</span>
          </div>
        )}
        {faceLost && (
          <div className="yukee-facelost" role="alert">
            <ScanFace size={22} />
            <b>暂时看不到你</b>
            <span>请回到屏幕中央</span>
          </div>
        )}
        {countdown !== null && !faceLost && (
          <div className="yukee-countdown" aria-live="polite">
            {countdown}
          </div>
        )}
        {finished && <div className="yukee-finish-glow" />}
      </div>
      <div className="yukee-hud-bottom">
        <div className="head-hud" aria-label="当前头部方向">
          {hudChip("left", "←")}
          {hudChip("up", "↑")}
          {hudChip("center", "●")}
          {hudChip("down", "↓")}
          {hudChip("right", "→")}
        </div>
        <div className="yukee-progress" aria-label="活动进度">
          <div style={{ width: `${progress * 100}%` }} />
        </div>
        <span className="yukee-mode">
          {visionActive ? "摄像头体感中" : "调试输入模式"}
        </span>
      </div>
    </div>
  );
}
