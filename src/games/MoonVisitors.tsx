import { forwardRef, useImperativeHandle, useRef } from "react";
import { bezier, type LightTargets, type Point } from "./moonFireflyField";

/**
 * G02「展翼接光」每一次收集的「光之访客」都不同（纯显示层，不参与计分）：
 *  第 1 次：月光球——从月亮缓缓落下的一颗大光球
 *  第 2 次：萤火虫群——从左侧树林盘旋飞来的一群萤火虫
 *  第 3 次：流星光团——划过夜空、拖着长尾的流星
 *  第 4 次：河灯——从水面升起的四盏小河灯
 *  第 5 次：终章——流星 + 萤火虫群 + 河灯一起来，月亮光晕变亮
 * 动作完全不变：展开双臂时访客飞向帆，回位收集后被送进船灯，下一波从别处登场。
 * 与原萤火虫层同一个 RAF；暂停 / 身体丢失时调用方不推进，访客随之冻结。
 */
export type VisitorKind = "orb" | "swarm" | "meteor" | "lantern";
export const WAVES: { kinds: VisitorKind[]; name: string }[] = [
  { kinds: ["orb"], name: "月光球" },
  { kinds: ["swarm"], name: "萤火虫群" },
  { kinds: ["meteor"], name: "流星光团" },
  { kinds: ["lantern"], name: "河灯" },
  { kinds: ["meteor", "swarm", "lantern"], name: "终章 · 群光" },
];
const MOON: Point = { x: 664, y: 88 };
const SWARM_N = 14,
  LANTERN_N = 4,
  TRAIL_N = 14;

type Phase = "enter" | "wait" | "fly" | "dock" | "deliver" | "gone";
interface Visitor {
  kind: VisitorKind;
  i: number;
  phase: Phase;
  age: number;
  prog: number;
  pos: Point;
  start: Point;
  home: Point;
  side: "left" | "right";
  trail: Point[];
}

function homeOf(kind: VisitorKind, i: number): Point {
  switch (kind) {
    case "orb":
      return { x: MOON.x - 40, y: MOON.y + 40 };
    case "swarm":
      return { x: 110 + Math.cos(i * 2.4) * 34, y: 210 + Math.sin(i * 2.4) * 24 };
    case "meteor":
      return { x: 820, y: 70 };
    case "lantern":
      return { x: 640 + i * 70, y: 492 - (i % 2) * 10 };
  }
}
function entryOf(kind: VisitorKind, i: number): Point {
  switch (kind) {
    case "orb":
      return { ...MOON };
    case "swarm":
      return { x: -30, y: 240 + Math.sin(i) * 40 };
    case "meteor":
      return { x: 1000, y: -20 };
    case "lantern":
      return { x: 640 + i * 70, y: 560 };
  }
}

export interface MoonVisitorsHandle {
  step(dt: number, open: number, charged: boolean, reps: number, finished: boolean, targets: LightTargets | null): void;
}

export default forwardRef<MoonVisitorsHandle>(function MoonVisitors(_, ref) {
  const root = useRef<SVGGElement>(null);
  const halo = useRef<SVGCircleElement>(null);
  const orbEl = useRef<SVGGElement>(null);
  const swarmEls = useRef<Array<SVGGElement | null>>([]);
  const meteorEl = useRef<SVGGElement>(null);
  const meteorTrail = useRef<SVGPolylineElement>(null);
  const lanternEls = useRef<Array<SVGGElement | null>>([]);
  const state = useRef({ time: 0, wave: -1, reps: 0, visitors: [] as Visitor[], waveAge: 0 });

  const spawn = (wave: number) => {
    const st = state.current;
    st.wave = wave;
    st.waveAge = 0;
    st.visitors = [];
    if (wave >= WAVES.length) return;
    for (const kind of WAVES[wave].kinds) {
      const n = kind === "swarm" ? SWARM_N : kind === "lantern" ? LANTERN_N : 1;
      for (let i = 0; i < n; i++) {
        const start = entryOf(kind, i);
        st.visitors.push({
          kind,
          i,
          phase: "enter",
          age: -(i * 90) - (kind === "lantern" ? 300 : 0),
          prog: 0,
          pos: { ...start },
          start,
          home: homeOf(kind, i),
          side: i % 2 ? "right" : "left",
          trail: [],
        });
      }
    }
  };

  const elFor = (v: Visitor) =>
    v.kind === "orb"
      ? orbEl.current
      : v.kind === "meteor"
        ? meteorEl.current
        : v.kind === "swarm"
          ? swarmEls.current[v.i]
          : lanternEls.current[v.i];

  useImperativeHandle(
    ref,
    () => ({
      step(dt, open, charged, reps, finished, targets) {
        const st = state.current;
        const layer = root.current;
        if (!layer || !targets) return;
        const elapsed = Math.max(0, Math.min(dt, 50));
        if (st.wave < 0) spawn(0);
        if (!elapsed) return;
        st.time += elapsed;
        st.waveAge += elapsed;
        // 收集成功：当前访客送进船灯，稍后下一波登场
        if (reps > st.reps) {
          st.reps = reps;
          for (const v of st.visitors) {
            v.phase = "deliver";
            v.prog = 0;
            v.start = { ...v.pos };
          }
        }
        const allGone = st.visitors.length > 0 && st.visitors.every((v) => v.phase === "gone");
        if (allGone && !finished && st.wave < reps) spawn(reps);
        const t = st.time;
        for (const v of st.visitors) {
          v.age += elapsed;
          if (v.age < 0) continue;
          const target = v.kind === "orb" ? targets.mast : targets[v.side];
          if (v.phase === "enter") {
            v.prog = Math.min(1, v.prog + elapsed / (v.kind === "meteor" ? 700 : 1300));
            v.pos = bezier(v.start, v.home, v.kind === "swarm" ? 0.2 : 0.08, 1 - Math.pow(1 - v.prog, 3));
            if (v.prog >= 1) {
              v.phase = "wait";
              v.prog = 0;
            }
          } else if (v.phase === "wait") {
            const h = v.home;
            if (v.kind === "swarm")
              v.pos = { x: h.x + Math.sin(t / 420 + v.i) * 14, y: h.y + Math.cos(t / 360 + v.i * 1.7) * 10 };
            else if (v.kind === "lantern") v.pos = { x: h.x + Math.sin(t / 900 + v.i) * 3, y: h.y + Math.sin(t / 700 + v.i) * 3 };
            else v.pos = { x: h.x + Math.sin(t / 800) * 6, y: h.y + Math.cos(t / 700) * 5 };
            if (open > 0.2) {
              v.phase = "fly";
              v.prog = 0;
              v.start = { ...v.pos };
            }
          } else if (v.phase === "fly") {
            // 展开越大飞得越快；收回时停在半路轻轻漂浮，不会倒退
            const speed = v.kind === "meteor" ? 1 / 900 : v.kind === "lantern" ? 1 / 2200 : 1 / 1700;
            v.prog = Math.min(1, v.prog + elapsed * speed * (0.25 + open * 1.1 + (finished ? 0.6 : 0)));
            const bend = v.kind === "meteor" ? -0.25 : v.kind === "lantern" ? 0.15 : (v.i % 2 ? 1 : -1) * 0.18;
            v.pos = bezier(v.start, target, bend, v.prog);
            if (v.prog >= 1) {
              v.phase = "dock";
              v.prog = 0;
            }
          } else if (v.phase === "dock") {
            const k = 1 - Math.exp(-elapsed / 140);
            const c = open < 0.35 ? targets.mast : target;
            v.pos.x += (c.x + Math.sin(t / 380 + v.i) * 7 - v.pos.x) * k;
            v.pos.y += (c.y + Math.cos(t / 450 + v.i) * 5 - v.pos.y) * k;
          } else if (v.phase === "deliver") {
            v.prog = Math.min(1, v.prog + elapsed / (700 + (v.i % 4) * 60));
            v.pos = bezier(v.start, targets.lamp, 0.12, v.prog);
            if (v.prog >= 1) v.phase = "gone";
          }
          if (v.kind === "meteor") {
            v.trail.unshift({ ...v.pos });
            if (v.trail.length > TRAIL_N) v.trail.length = TRAIL_N;
          }
        }
        // 渲染：只写变换 / 透明度属性
        const used = new Set<Element>();
        for (const v of st.visitors) {
          const el = elFor(v);
          if (!el) continue;
          used.add(el);
          const visible = v.age >= 0 && v.phase !== "gone";
          const pulse = 0.75 + 0.25 * Math.sin(t / 260 + v.i);
          const scale =
            v.phase === "deliver" ? 1 - v.prog * 0.6 : v.phase === "fly" || v.phase === "dock" ? 1 + 0.25 * open : 1;
          const tilt = v.kind === "lantern" ? Math.sin(t / 600 + v.i) * 6 : 0;
          el.setAttribute(
            "transform",
            `translate(${v.pos.x.toFixed(1)} ${v.pos.y.toFixed(1)}) rotate(${tilt.toFixed(1)}) scale(${scale.toFixed(3)})`,
          );
          el.setAttribute("opacity", visible ? (v.phase === "dock" && charged ? 1 : pulse).toFixed(2) : "0");
          if (v.kind === "meteor" && meteorTrail.current) {
            meteorTrail.current.setAttribute("points", visible ? v.trail.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ") : "");
          }
        }
        for (const el of [orbEl.current, meteorEl.current, ...swarmEls.current, ...lanternEls.current])
          if (el && !used.has(el)) el.setAttribute("opacity", "0");
        if (meteorTrail.current && !st.visitors.some((v) => v.kind === "meteor" && v.phase !== "gone"))
          meteorTrail.current.setAttribute("points", "");
        // 终章与完成：月亮光晕逐步变亮
        if (halo.current) {
          const glow = Math.min(1, reps / 5) * 0.35 + (finished ? 0.25 : 0) + (st.wave === 4 ? 0.1 * Math.sin(t / 500) : 0);
          halo.current.setAttribute("opacity", Math.max(0, glow).toFixed(3));
        }
        layer.dataset.wave = String(Math.min(st.wave, WAVES.length - 1));
        layer.dataset.waveKind = (WAVES[Math.min(st.wave, WAVES.length - 1)]?.kinds ?? []).join("+");
      },
    }),
    [],
  );

  return (
    <g ref={root} className="moon-visitors" data-testid="moon-visitors" data-wave="0">
      <defs>
        <radialGradient id="mvGlow">
          <stop offset="0" stopColor="#fff6cf" stopOpacity="0.95" />
          <stop offset="0.4" stopColor="#ffd77a" stopOpacity="0.45" />
          <stop offset="1" stopColor="#ffd77a" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="mvCyan">
          <stop offset="0" stopColor="#e6ffff" stopOpacity="0.95" />
          <stop offset="0.45" stopColor="#8ff3ff" stopOpacity="0.4" />
          <stop offset="1" stopColor="#8ff3ff" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="mvTrail" x1="0" x2="1">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.95" />
          <stop offset="1" stopColor="#9ff4ff" stopOpacity="0" />
        </linearGradient>
      </defs>
      <circle ref={halo} cx={MOON.x} cy={MOON.y} r="90" fill="url(#mvGlow)" opacity="0" />
      {/* 月光球 */}
      <g ref={orbEl} opacity="0">
        <g transform="scale(1.6)">
        <circle r="26" fill="url(#mvGlow)" />
        <circle r="8" fill="#fffbe6" stroke="#ffcf6a" strokeWidth="2" />
        {[0, 45, 90, 135, 180, 225, 270, 315].map((a) => (
          <rect key={a} x="12" y="-1.5" width="6" height="3" fill="#fff0b8" transform={`rotate(${a})`} />
        ))}
        </g>
      </g>
      {/* 萤火虫群 */}
      {Array.from({ length: SWARM_N }, (_, i) => (
        <g
          key={i}
          ref={(n) => {
            swarmEls.current[i] = n;
          }}
          opacity="0"
        >
          <circle r="14" fill={i % 3 ? "url(#mvGlow)" : "url(#mvCyan)"} />
          <rect x="-3" y="-3" width="6" height="6" fill={i % 3 ? "#fff1b0" : "#d9ffff"} />
        </g>
      ))}
      {/* 流星光团 */}
      <polyline ref={meteorTrail} fill="none" stroke="#bdf6ff" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" opacity="0.75" points="" />
      <g ref={meteorEl} opacity="0">
        <circle r="36" fill="url(#mvCyan)" />
        <circle r="11" fill="#ffffff" stroke="#9ff4ff" strokeWidth="3" />
      </g>
      {/* 河灯 */}
      {Array.from({ length: LANTERN_N }, (_, i) => (
        <g
          key={i}
          ref={(n) => {
            lanternEls.current[i] = n;
          }}
          opacity="0"
        >
          <circle r="20" fill="url(#mvGlow)" />
          <path d="M-7-9H7L9 7H-9Z" fill="#ff9a4a" stroke="#7a3410" strokeWidth="1.5" />
          <rect x="-4" y="-5" width="8" height="9" fill="#ffe49a" />
          <rect x="-10" y="7" width="20" height="3" fill="#7a3410" />
        </g>
      ))}
    </g>
  );
});
