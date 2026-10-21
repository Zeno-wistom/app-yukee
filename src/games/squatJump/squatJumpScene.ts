/**
 * G05 浅蹲跳一跳：Canvas 2D 等轴（正交）渲染与动画。
 * 所有方块位置、尺寸、角色坐标与跳跃轨迹都来自 jumpLogic 的世界坐标；
 * 本文件只负责投影、绘制和缓动，不做任何判定。
 */
import { PLATFORM_COLORS, type Landing, type Platform } from "./jumpLogic";

const COS30 = Math.cos(Math.PI / 6),
  SIN30 = 0.5;

export interface JumpFx {
  kind: "ripple" | "text";
  x: number;
  z: number;
  t: number;
  text?: string;
  strong?: boolean;
}

type Phase = "idle" | "jump" | "land" | "fall" | "topple" | "gone";

function shade(hex: string, f: number) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.round(((n >> 16) & 255) * f),
    g = Math.round(((n >> 8) & 255) * f),
    b = Math.round((n & 255) * f);
  return `rgb(${Math.min(255, r)},${Math.min(255, g)},${Math.min(255, b)})`;
}
const easeOutBack = (t: number) => {
  const c = 1.6;
  const x = t - 1;
  return 1 + (c + 1) * x * x * x + c * x * x;
};
const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);

/** 画面状态（每帧由游戏组件推进） */
export class JumpScene {
  platforms: Platform[] = [];
  /** 平台出现时间（秒，场景时钟） */
  private born = new Map<number, number>();
  /** 已离开的平台：淡出后移除 */
  private leaving = new Map<number, number>();
  t = 0;
  /** 角色世界坐标（y 为离台面高度，台面 y=0） */
  cx = 0;
  cz = 0;
  cy = 0;
  /** 0..1 蓄力 */
  charge = 0;
  private phase: Phase = "idle";
  private phaseT = 0;
  private from = { x: 0, z: 0 };
  private to = { x: 0, z: 0 };
  private jumpDur = 0.5;
  private jumpH = 1;
  private axis: "x" | "z" = "x";
  private landing: Landing | null = null;
  private onDone: (() => void) | null = null;
  private stretch = 0;
  /** 落地弹性时钟 */
  private landT = 10;
  private flip = 0;
  private fallVy = 0;
  private toppleA = 0;
  private alpha = 1;
  /** 镜头（世界坐标）与速度 */
  private camX = 0;
  private camZ = 0;
  private camVX = 0;
  private camVZ = 0;
  private camTX = 0;
  private camTZ = 0;
  fx: JumpFx[] = [];
  /** 当前所在平台 id、目标平台 id */
  curId = 0;
  targetId = 1;
  /** 可选取景覆盖（只用于选卡预览图渲染）：S 为每单位像素，ox/oy 为画面比例位置 */
  view: { S?: number; ox?: number; oy?: number } = {};

  reset(platforms: Platform[], cur: Platform, target: Platform) {
    this.platforms = [...platforms];
    this.born.clear();
    this.leaving.clear();
    for (const p of platforms) this.born.set(p.id, -10);
    this.cx = cur.x;
    this.cz = cur.z;
    this.cy = 0;
    this.phase = "idle";
    this.alpha = 1;
    this.flip = 0;
    this.toppleA = 0;
    this.fx = [];
    this.curId = cur.id;
    this.targetId = target.id;
    this.camTX = this.camX = (cur.x + target.x) / 2;
    this.camTZ = this.camZ = (cur.z + target.z) / 2;
    this.camVX = this.camVZ = 0;
    this.axis = target.axis;
  }

  get busy() {
    return this.phase !== "idle" && this.phase !== "gone";
  }

  /** 开始一次跳跃动画；结束（落稳或掉落完）后回调 */
  startJump(l: Landing, axis: "x" | "z", onDone: () => void) {
    this.from = { x: this.cx, z: this.cz };
    this.to = { x: l.x, z: l.z };
    this.landing = l;
    this.axis = axis;
    this.jumpDur = 0.44 + l.dist * 0.035;
    this.jumpH = 0.95 + l.dist * 0.16;
    this.phase = "jump";
    this.phaseT = 0;
    this.stretch = 1;
    this.onDone = onDone;
    this.charge = 0;
  }

  /** 成功落地后：加入新平台、更新镜头目标 */
  advance(platforms: Platform[], cur: Platform, target: Platform) {
    for (const p of platforms) if (!this.born.has(p.id)) this.born.set(p.id, this.t + 0.12);
    for (const p of this.platforms)
      if (!platforms.find((q) => q.id === p.id) && !this.leaving.has(p.id)) this.leaving.set(p.id, this.t);
    const keep = this.platforms.filter((p) => this.leaving.has(p.id) && this.t - this.leaving.get(p.id)! < 0.6);
    this.platforms = [...keep.filter((p) => !platforms.find((q) => q.id === p.id)), ...platforms];
    this.curId = cur.id;
    this.targetId = target.id;
    this.camTX = (cur.x + target.x) / 2;
    this.camTZ = (cur.z + target.z) / 2;
    this.axis = target.axis;
  }

  addFx(f: Omit<JumpFx, "t">) {
    this.fx.push({ ...f, t: this.t });
  }

  step(dt: number) {
    this.t += dt;
    this.phaseT += dt;
    this.landT += dt;
    this.stretch = Math.max(0, this.stretch - dt * 6);
    // 镜头：临界阻尼弹簧，平滑重组画面
    const w = 5.5;
    for (const k of ["X", "Z"] as const) {
      const pos = this[`cam${k}`],
        vel = this[`camV${k}`],
        tgt = this[`camT${k}`];
      const x = pos - tgt,
        e = Math.exp(-w * dt);
      this[`cam${k}`] = tgt + (x + (vel + w * x) * dt) * e;
      this[`camV${k}`] = (vel - w * (vel + w * x) * dt) * e;
    }
    if (this.phase === "jump") {
      const f = Math.min(1, this.phaseT / this.jumpDur);
      this.cx = this.from.x + (this.to.x - this.from.x) * f;
      this.cz = this.from.z + (this.to.z - this.from.z) * f;
      this.cy = 4 * this.jumpH * f * (1 - f);
      this.flip = easeInOut(f) * Math.PI * 2;
      if (f >= 1) {
        this.flip = 0;
        this.cy = 0;
        const k = this.landing!.kind;
        if (k === "hit" || k === "perfect" || k === "stay") {
          this.phase = "land";
          this.phaseT = 0;
          this.landT = 0;
        } else if (k === "edgeShort" || k === "edgeLong") {
          this.phase = "topple";
          this.phaseT = 0;
          this.toppleA = 0;
        } else {
          this.phase = "fall";
          this.phaseT = 0;
          this.fallVy = -2;
        }
      }
    } else if (this.phase === "land") {
      if (this.phaseT > 0.18) this.finish();
    } else if (this.phase === "topple") {
      this.toppleA = Math.min(Math.PI / 2, this.toppleA + dt * (2 + this.phaseT * 9));
      if (this.toppleA >= Math.PI / 2) {
        this.phase = "fall";
        this.phaseT = 0;
        this.fallVy = -1;
      }
    } else if (this.phase === "fall") {
      this.fallVy -= 22 * dt;
      this.cy += this.fallVy * dt;
      this.alpha = Math.max(0, 1 - this.phaseT / 0.9);
      if (this.phaseT > 0.75) this.finish();
    }
    this.fx = this.fx.filter((f) => this.t - f.t < 1.2);
  }

  private finish() {
    const cb = this.onDone;
    this.onDone = null;
    // 掉落结束：角色离场（不回到 idle，避免在台面下方继续绘制）
    this.phase = this.phase === "fall" ? "gone" : "idle";
    cb?.();
  }

  /** 失败后保持掉落结果画面（角色不再出现） */
  get fallen() {
    return this.alpha <= 0.01;
  }

  // ———————————————————— 绘制 ————————————————————
  draw(ctx: CanvasRenderingContext2D) {
    const W = ctx.canvas.width,
      H = ctx.canvas.height;
    const S = this.view.S ?? Math.min(W / 14, H / 8.4);
    const ox = W * (this.view.ox ?? 0.5),
      oy = H * (this.view.oy ?? 0.5);
    const cX = this.camX,
      cZ = this.camZ;
    const P = (x: number, z: number, y = 0) => ({
      x: ox + (x - cX - (z - cZ)) * COS30 * S,
      y: oy - (x - cX + (z - cZ)) * SIN30 * S - y * S,
    });
    // 背景：极浅灰的柔和渐变
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, "#f7f8fa");
    bg.addColorStop(1, "#e4e8ee");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    const cur = this.platforms.find((p) => p.id === this.curId);
    const press = this.phase === "idle" ? this.charge : 0;
    // 排序：远（x+z 大）先画
    const sorted = [...this.platforms].sort((a, b) => b.x + b.z - (a.x + a.z));
    // 阴影层（投在远处地面上，整体在方块之下）
    for (const p of sorted) this.drawShadow(ctx, p, P, S);
    const charKey = this.cx + this.cz;
    const onSupport = this.phase !== "fall" && this.phase !== "topple";
    let charDrawn = false;
    for (const p of sorted) {
      const key = p.x + p.z;
      if (!charDrawn && !onSupport && key < charKey) {
        this.drawChar(ctx, P, S, cur);
        charDrawn = true;
      }
      this.drawPlatform(ctx, p, P, S, p.id === this.curId ? press : 0);
      if (!charDrawn && onSupport && this.supportId() === p.id) {
        this.drawChar(ctx, P, S, cur);
        charDrawn = true;
      }
    }
    if (!charDrawn) this.drawChar(ctx, P, S, cur);
    this.drawFx(ctx, P, S);
  }

  /** 角色此刻所在 / 将落上的平台 */
  private supportId() {
    if (this.phase === "jump") {
      // 空中：画在起跳台与目标台中较近的一块之后，避免穿插
      const f = Math.min(1, this.phaseT / this.jumpDur);
      return f < 0.5 ? this.curId : this.targetId;
    }
    let best = this.curId;
    for (const p of this.platforms) {
      if (p.shape === "round" ? Math.hypot(this.cx - p.x, this.cz - p.z) <= p.w / 2 + 0.01 : Math.abs(this.cx - p.x) <= p.w / 2 + 0.01 && Math.abs(this.cz - p.z) <= p.d / 2 + 0.01) best = p.id;
    }
    return best;
  }

  private appear(p: Platform) {
    const b = this.born.get(p.id) ?? -10;
    const f = Math.min(1, Math.max(0, (this.t - b) / 0.42));
    const l = this.leaving.get(p.id);
    const fade = l === undefined ? 1 : Math.max(0, 1 - (this.t - l) / 0.5);
    return { drop: (1 - easeOutBack(f)) * 2.2, a: Math.min(1, f * 1.6) * fade };
  }

  private emphasis(p: Platform) {
    // 当前与目标清晰；更远的预告块与离开的旧块淡一些
    if (p.id === this.curId || p.id === this.targetId) return 1;
    return p.id > this.targetId ? 0.5 : 0.8;
  }

  private drawShadow(ctx: CanvasRenderingContext2D, p: Platform, P: (x: number, z: number, y?: number) => { x: number; y: number }, S: number) {
    const { drop, a } = this.appear(p);
    if (a <= 0) return;
    const off = 1.6 + drop * 0.2; // 投到台面下方约 1.6 个单位的「地面」，并向右下偏
    ctx.globalAlpha = 0.06 * a * this.emphasis(p);
    ctx.fillStyle = "#5b6b80";
    if (p.shape === "round") {
      const c = P(p.x + 0.35, p.z - 0.35, -p.h - off);
      ctx.beginPath();
      ctx.ellipse(c.x, c.y, (p.w / 2) * 1.2247 * S, (p.w / 2) * 0.7071 * S, 0, 0, Math.PI * 2);
      ctx.fill();
    } else {
      const hw = p.w / 2,
        hd = p.d / 2,
        y = -p.h - off;
      const pts = [P(p.x - hw + 0.35, p.z - hd - 0.35, y), P(p.x + hw + 0.35, p.z - hd - 0.35, y), P(p.x + hw + 0.35, p.z + hd - 0.35, y), P(p.x - hw + 0.35, p.z + hd - 0.35, y)];
      ctx.beginPath();
      pts.forEach((q, i) => (i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)));
      ctx.closePath();
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  private drawPlatform(ctx: CanvasRenderingContext2D, p: Platform, P: (x: number, z: number, y?: number) => { x: number; y: number }, S: number, press: number) {
    const { drop, a } = this.appear(p);
    if (a <= 0) return;
    const top = p.bonus ? "#ffffff" : PLATFORM_COLORS[p.color];
    const yTop = drop - press * 0.16;
    const h = p.h - press * 0.16;
    ctx.globalAlpha = a * this.emphasis(p);
    if (p.shape === "round") {
      const R = p.w / 2,
        rx = R * 1.2247 * S,
        ry = R * 0.7071 * S;
      const c = P(p.x, p.z, yTop),
        b = P(p.x, p.z, yTop - h);
      const side = ctx.createLinearGradient(c.x - rx, 0, c.x + rx, 0);
      side.addColorStop(0, shade(top, 0.9));
      side.addColorStop(1, shade(top, 0.76));
      ctx.fillStyle = side;
      ctx.beginPath();
      ctx.ellipse(b.x, b.y, rx, ry, 0, 0, Math.PI);
      ctx.lineTo(c.x - rx, c.y);
      ctx.ellipse(c.x, c.y, rx, ry, 0, Math.PI, 0, true);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = top;
      ctx.beginPath();
      ctx.ellipse(c.x, c.y, rx, ry, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.55)";
      ctx.lineWidth = Math.max(1, S * 0.015);
      ctx.stroke();
      if (p.bonus) this.drawBonusMark(ctx, c, S);
    } else {
      const hw = p.w / 2,
        hd = p.d / 2;
      const t0 = P(p.x - hw, p.z - hd, yTop),
        t1 = P(p.x + hw, p.z - hd, yTop),
        t2 = P(p.x + hw, p.z + hd, yTop),
        t3 = P(p.x - hw, p.z + hd, yTop);
      const dy = h * S;
      // 左前侧面（法向 −x）：t3 → t0
      const lg = ctx.createLinearGradient(0, t0.y, 0, t0.y + dy);
      lg.addColorStop(0, shade(top, 0.92));
      lg.addColorStop(1, shade(top, 0.84));
      ctx.fillStyle = lg;
      ctx.beginPath();
      ctx.moveTo(t3.x, t3.y);
      ctx.lineTo(t0.x, t0.y);
      ctx.lineTo(t0.x, t0.y + dy);
      ctx.lineTo(t3.x, t3.y + dy);
      ctx.closePath();
      ctx.fill();
      // 右前侧面（法向 −z）：t0 → t1
      const rg = ctx.createLinearGradient(0, t0.y, 0, t0.y + dy);
      rg.addColorStop(0, shade(top, 0.8));
      rg.addColorStop(1, shade(top, 0.72));
      ctx.fillStyle = rg;
      ctx.beginPath();
      ctx.moveTo(t0.x, t0.y);
      ctx.lineTo(t1.x, t1.y);
      ctx.lineTo(t1.x, t1.y + dy);
      ctx.lineTo(t0.x, t0.y + dy);
      ctx.closePath();
      ctx.fill();
      // 顶面
      ctx.fillStyle = top;
      ctx.beginPath();
      ctx.moveTo(t0.x, t0.y);
      ctx.lineTo(t1.x, t1.y);
      ctx.lineTo(t2.x, t2.y);
      ctx.lineTo(t3.x, t3.y);
      ctx.closePath();
      ctx.fill();
      // 前沿高光：让边缘清晰可读
      ctx.strokeStyle = "rgba(255,255,255,0.6)";
      ctx.lineWidth = Math.max(1, S * 0.014);
      ctx.beginPath();
      ctx.moveTo(t3.x, t3.y);
      ctx.lineTo(t0.x, t0.y);
      ctx.lineTo(t1.x, t1.y);
      ctx.stroke();
      if (p.bonus) this.drawBonusMark(ctx, P(p.x, p.z, yTop), S);
    }
    // 目标台：中心淡淡的落点圈（不显示精确落点，只提示中心）
    if (p.id === this.targetId && this.phase !== "fall") {
      const c = P(p.x, p.z, yTop);
      ctx.strokeStyle = "rgba(255,255,255,0.7)";
      ctx.lineWidth = Math.max(1, S * 0.012);
      ctx.beginPath();
      ctx.ellipse(c.x, c.y, 0.24 * 1.2247 * S, 0.24 * 0.7071 * S, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  private drawBonusMark(ctx: CanvasRenderingContext2D, c: { x: number; y: number }, S: number) {
    // 加分台：白色台面 + 薄荷色同心圈
    ctx.strokeStyle = "#7fdcc8";
    ctx.lineWidth = Math.max(1.5, S * 0.03);
    for (const r of [0.55, 0.34]) {
      ctx.beginPath();
      ctx.ellipse(c.x, c.y, r * 1.2247 * S, r * 0.7071 * S, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.fillStyle = "#7fdcc8";
    ctx.beginPath();
    ctx.ellipse(c.x, c.y, 0.1 * 1.2247 * S, 0.1 * 0.7071 * S, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  private drawChar(ctx: CanvasRenderingContext2D, P: (x: number, z: number, y?: number) => { x: number; y: number }, S: number, cur: Platform | undefined) {
    if (this.alpha <= 0 || this.phase === "gone") return;
    const press = this.phase === "idle" ? this.charge : 0;
    const sink = this.phase === "idle" && cur ? press * 0.16 : 0;
    // 接触阴影：角色在台面上方时投在台面上
    if (this.phase === "jump" || this.phase === "idle" || this.phase === "land") {
      const sh = P(this.cx, this.cz, -sink);
      const k = 1 / (1 + Math.max(0, this.cy) * 0.9);
      ctx.fillStyle = `rgba(40,55,75,${0.22 * k})`;
      ctx.beginPath();
      ctx.ellipse(sh.x, sh.y, 0.2 * 1.2247 * S * k, 0.2 * 0.7071 * S * k, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    const base = P(this.cx, this.cz, this.cy - sink);
    // 形变：蓄力压扁、起跳拉长、落地回弹
    let sx = 1 + 0.22 * press,
      sy = 1 - 0.36 * press;
    if (this.stretch > 0) {
      sy *= 1 + 0.18 * this.stretch;
      sx *= 1 - 0.1 * this.stretch;
    }
    if (this.landT < 0.5) {
      const b = Math.exp(-this.landT * 9) * Math.cos(this.landT * 26);
      sy *= 1 - 0.16 * b;
      sx *= 1 + 0.1 * b;
    }
    const bw = 0.42 * S,
      bh = 0.56 * S;
    ctx.save();
    ctx.globalAlpha = this.alpha;
    ctx.translate(base.x, base.y);
    if (this.phase === "topple" || (this.phase === "fall" && this.toppleA > 0)) {
      const dir = this.axis === "x" ? 1 : -1;
      const sgn = this.landing && (this.landing.kind === "edgeShort" || this.landing.kind === "short") ? -1 : 1;
      ctx.rotate(this.toppleA * dir * sgn * 0.9);
    }
    if (this.phase === "jump") {
      // 空翻：围绕身体中心旋转一周
      ctx.translate(0, -bh / 2);
      ctx.rotate(this.flip * (this.axis === "x" ? 1 : -1));
      ctx.translate(0, bh / 2);
    }
    ctx.scale(sx, sy);
    // 朝向：右上跳时略偏右，左上跳时略偏左
    const face = this.axis === "x" ? 1 : -1;
    // 身体
    const r = bw * 0.36;
    ctx.fillStyle = "#ffffff";
    ctx.strokeStyle = "rgba(60,80,100,0.18)";
    ctx.lineWidth = Math.max(1, S * 0.012);
    roundRect(ctx, -bw / 2, -bh, bw, bh * 0.86, r);
    ctx.fill();
    ctx.stroke();
    // 底座
    ctx.fillStyle = "#e7ecf1";
    roundRect(ctx, -bw * 0.38, -bh * 0.17, bw * 0.76, bh * 0.17, bw * 0.08);
    ctx.fill();
    // 面屏
    const fw = bw * 0.74,
      fh = bh * 0.36;
    const fx = -fw / 2 + face * bw * 0.04;
    ctx.fillStyle = "#1e2b34";
    roundRect(ctx, fx, -bh * 0.86, fw, fh, fh * 0.42);
    ctx.fill();
    // 青色双眼（蓄力时眯起）
    const eh = fh * (0.42 - 0.22 * press),
      ew = fw * 0.15;
    ctx.fillStyle = "#59f0e2";
    for (const ex of [-0.22, 0.22]) {
      roundRect(ctx, fx + fw / 2 + ex * fw - ew / 2 + face * fw * 0.05, -bh * 0.86 + fh / 2 - eh / 2, ew, eh, ew / 2);
      ctx.fill();
    }
    // 天线（与 Yukee 挂灯的薄荷点呼应）
    ctx.strokeStyle = "#c9d3dc";
    ctx.lineWidth = Math.max(1, S * 0.02);
    ctx.beginPath();
    ctx.moveTo(0, -bh);
    ctx.lineTo(0, -bh * 1.16);
    ctx.stroke();
    ctx.fillStyle = "#8de9bc";
    ctx.beginPath();
    ctx.arc(0, -bh * 1.2, bw * 0.08, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    // 蓄力：脚下收拢的细小光点（节制）
    if (press > 0.02) {
      const c = P(this.cx, this.cz, -sink);
      ctx.fillStyle = "rgba(120,200,190,0.75)";
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + this.t * 1.5;
        const rr = (1 - ((this.t * 1.4 + i / 6) % 1)) * 0.75;
        ctx.beginPath();
        ctx.arc(c.x + Math.cos(a) * rr * 1.2247 * S, c.y + Math.sin(a) * rr * 0.7071 * S, Math.max(1, S * 0.022), 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  private drawFx(ctx: CanvasRenderingContext2D, P: (x: number, z: number, y?: number) => { x: number; y: number }, S: number) {
    for (const f of this.fx) {
      const age = this.t - f.t;
      const c = P(f.x, f.z, 0);
      if (f.kind === "ripple") {
        for (const d of [0, 0.16]) {
          const k = Math.max(0, Math.min(1, (age - d) / 0.7));
          if (k <= 0 || k >= 1) continue;
          const r = 0.2 + k * 0.9;
          ctx.strokeStyle = `rgba(255,255,255,${(1 - k) * 0.9})`;
          ctx.lineWidth = Math.max(1.5, S * 0.03 * (1 - k));
          ctx.beginPath();
          ctx.ellipse(c.x, c.y, r * 1.2247 * S, r * 0.7071 * S, 0, 0, Math.PI * 2);
          ctx.stroke();
        }
      } else if (f.text) {
        const k = Math.min(1, age / 1.0);
        ctx.globalAlpha = 1 - k * k;
        ctx.fillStyle = f.strong ? "#2fb59c" : "#5c6b7a";
        ctx.font = `600 ${Math.round(S * (f.strong ? 0.36 : 0.3))}px "Inter","PingFang SC","Microsoft YaHei",sans-serif`;
        ctx.textAlign = "center";
        ctx.fillText(f.text, c.x, c.y - S * (0.95 + k * 0.6));
        ctx.globalAlpha = 1;
      }
    }
  }
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
