import { useEffect, useRef, type MutableRefObject } from "react";
import { drawSprite, YUKEE_IDLE, YUKEE_CELEBRATE } from "./sprites";
import type { LeanUpdate } from "../vision/leanPose";

function star(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5,
      s = i % 2 ? r * 0.46 : r;
    ctx.lineTo(x + Math.cos(a) * s, y + Math.sin(a) * s);
  }
  ctx.closePath();
  ctx.fill();
}
/** 画面只消费动作会话；有效时钟驱动海面运动，暂停时整个世界冻结。 */
export default function LeanSurfScene({
  frame,
}: {
  frame: MutableRefObject<LeanUpdate>;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const ctx = canvas.current!.getContext("2d")!;
    let raf = 0,
      x = 480,
      previousReps = 0,
      collectAt = -10000,
      collectSide = -1,
      lastT = -1;
    const draw = () => {
      const v = frame.current,
        t = v.effectiveMs / 1000;
      // 显示平滑随有效时间推进，不在丢失/暂停期间偷偷移动。
      const dest = 480 + v.u * 270;
      if (t > lastT && v.tracking === "ok" && !v.recovering && !v.complete)
        x += (dest - x) * 0.13;
      lastT = t;
      const sky = ctx.createLinearGradient(0, 0, 0, 540);
      sky.addColorStop(0, "#061323");
      sky.addColorStop(0.48, "#102e48");
      sky.addColorStop(1, "#073b46");
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, 960, 540);
      const glow = ctx.createRadialGradient(480, 225, 10, 480, 225, 440);
      glow.addColorStop(0, "#21607580");
      glow.addColorStop(1, "#21607500");
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, 960, 540);
      for (let i = 0; i < 48; i++) {
        ctx.globalAlpha = 0.22 + (0.35 * (1 + Math.sin(t * 0.5 + i))) / 2;
        ctx.fillStyle = i % 4 ? "#a7d8df" : "#ffd98e";
        ctx.fillRect((i * 137) % 960, 22 + ((i * 37) % 168), i % 4 ? 2 : 3, 2);
      }
      ctx.globalAlpha = 1;
      for (let layer = 0; layer < 3; layer++) {
        ctx.strokeStyle = ["#427b8c44", "#60b7ba55", "#8de9bc55"][layer];
        ctx.lineWidth = layer === 2 ? 2 : 1;
        for (let row = 0; row < 8; row++) {
          const y = 218 + row * 49 + layer * 17 + ((t * (5 + layer * 4)) % 49);
          ctx.beginPath();
          for (let xx = -30; xx <= 990; xx += 12) {
            const yy =
              y + Math.sin(xx / 95 + t * 0.3 + row + layer) * (4 + layer * 2);
            if (xx === -30) ctx.moveTo(xx, yy);
            else ctx.lineTo(xx, yy);
          }
          ctx.stroke();
        }
      }
      // 光路与双侧目标区：目标保持直到完整回中。
      ctx.strokeStyle = "#8de9bc18";
      ctx.setLineDash([3, 13]);
      for (const lane of [210, 480, 750]) {
        ctx.beginPath();
        ctx.moveTo(480 + (lane - 480) * 0.24, 225);
        ctx.lineTo(lane, 530);
        ctx.stroke();
      }
      ctx.setLineDash([]);
      const targetX = 480 + v.target * 240;
      if (!v.complete && !v.cruising) {
        ctx.strokeStyle = v.arrived ? "#8de9bc" : "#ffd98e88";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.ellipse(targetX, 400, 77, 24, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = v.arrived ? "#8de9bc" : "#ffd98e";
        ctx.shadowColor = ctx.fillStyle;
        ctx.shadowBlur = 15;
        star(ctx, targetX, 340 + Math.sin(t * 1.5) * 5, v.arrived ? 12 : 20);
        ctx.shadowBlur = 0;
        ctx.strokeStyle = "#ffd98e";
        ctx.beginPath();
        ctx.arc(
          targetX,
          340,
          31,
          -Math.PI / 2,
          -Math.PI / 2 + Math.PI * 2 * v.hold,
        );
        ctx.stroke();
      }
      if (v.reps > previousReps) {
        collectAt = t;
        collectSide = -v.target;
        previousReps = v.reps;
      }
      const absorbed = Math.min(1, (t - collectAt) / 0.85);
      if (absorbed < 1) {
        ctx.globalAlpha = 1 - absorbed;
        ctx.fillStyle = "#fff0b5";
        star(
          ctx,
          480 + collectSide * 240 * (1 - absorbed),
          340 - absorbed * 210,
          22 * (1 - absorbed) + 3,
        );
        ctx.globalAlpha = 1;
      }
      const bob = Math.sin(t * 1.7) * 4;
      ctx.save();
      ctx.translate(x, 408 + bob);
      ctx.rotate(v.u * 0.095);
      ctx.strokeStyle = "#8de9bc66";
      for (let i = 0; i < 7; i++) {
        const d = (t * 45 + i * 19) % 135;
        ctx.globalAlpha = (1 - d / 140) * 0.65;
        ctx.beginPath();
        ctx.ellipse(0, 12 + d, 42 + d * 0.24, 6, 0, 0, Math.PI);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      ctx.shadowColor = "#66f4d9";
      ctx.shadowBlur = 22;
      ctx.fillStyle = "#63dbc6";
      ctx.beginPath();
      ctx.ellipse(0, 0, 88, 16, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = "#c7ffe7";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(0, -3, 77, 8, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = "#153d39";
      ctx.fillRect(-24, -14, 17, 10);
      ctx.fillRect(8, -14, 17, 10);
      ctx.imageSmoothingEnabled = false;
      drawSprite(ctx, v.complete ? YUKEE_CELEBRATE : YUKEE_IDLE, -36, -83, 6);
      ctx.restore();
      ctx.fillStyle = "#b4dad5";
      ctx.font = "12px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("LEFT", 210, 490);
      ctx.fillText("RIGHT", 750, 490);
      raf = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, [frame]);
  return (
    <canvas
      className="lean-ocean"
      ref={canvas}
      width={960}
      height={540}
      aria-label="Yukee 站在青绿色冲浪板上，沿星光海面缓慢前进"
    />
  );
}
