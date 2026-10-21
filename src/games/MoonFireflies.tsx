import { forwardRef, useImperativeHandle, useRef } from "react";
import {
  bezier,
  FIREFLY_SOURCES,
  MoonFireflyField,
  moonCollectionKind,
  type Point,
} from "./moonFireflyField";

export interface MoonFirefliesHandle {
  step(
    dt: number,
    open: number,
    charged: boolean,
    reps: number,
    finished: boolean,
  ): void;
}

/** 全画幅 SVG 粒子层。沿用游戏现有 RAF，逐节点写坐标，不制造每帧 React 更新。 */
export default forwardRef<MoonFirefliesHandle>(function MoonFireflies(_, ref) {
  const root = useRef<SVGGElement>(null);
  const nodes = useRef<Array<SVGGElement | null>>([]);
  const trails = useRef<Array<SVGPathElement | null>>([]);
  const field = useRef(new MoonFireflyField());
  const burst = useRef<SVGGElement>(null);
  useImperativeHandle(
    ref,
    () => ({
      step(dt, open, charged, reps, finished) {
        const layer = root.current,
          svg = layer?.ownerSVGElement;
        if (!layer || !svg || dt <= 0) return;
        const boat = svg.querySelector<SVGGElement>("[data-moon-boat]");
        const left = svg.querySelector<SVGGElement>(".wing-sail-left");
        const right = svg.querySelector<SVGGElement>(".wing-sail-right");
        const world = svg.getCTM();
        if (!boat || !left || !right || !world) return;
        const inverse = world.inverse();
        const point = (group: SVGGElement, x: number, y: number): Point => {
          const matrix = group.getCTM();
          const p = matrix
            ? new DOMPoint(x, y)
                .matrixTransform(matrix)
                .matrixTransform(inverse)
            : new DOMPoint(x, y);
          return { x: p.x, y: p.y };
        };
        // 帆面目标取当前 SVG 变换，自动包含统一缩放、开合、浮动和前进。
        const targets = {
          left: point(left, 275, 145),
          right: point(right, 365, 145),
          mast: point(boat, 319, 184),
          lamp: point(boat, 320, 261),
        };
        const reduced = window.matchMedia(
          "(prefers-reduced-motion: reduce)",
        ).matches;
        if (!reduced)
          field.current.step(dt, open, charged, reps, finished, targets);
        const f = field.current;
        layer.dataset.collectionKind = moonCollectionKind(reps);
        for (const [i, p] of f.particles.entries()) {
          const node = nodes.current[i],
            trail = trails.current[i];
          if (!node || !trail) continue;
          node.setAttribute(
            "transform",
            `translate(${p.position.x.toFixed(2)} ${p.position.y.toFixed(2)})`,
          );
          node.dataset.flightPhase = p.phase;
          node.dataset.kind = p.kind;
          const pulse = 0.65 + 0.35 * Math.sin(f.time / (650 + i * 37) + i);
          const opacity =
            p.phase === "ambient"
              ? (0.18 + pulse * 0.23) * Math.min(1, p.ambientAge / 650)
              : 0.55 + pulse * 0.4;
          node.setAttribute(
            "opacity",
            (opacity * (p.kind === "meteor" && i % 3 ? 0.18 : 1)).toFixed(2),
          );
          if (p.phase === "flight") {
            const tail = bezier(
              p.start,
              targets[p.side],
              (i % 2 ? 1 : -1) * (0.12 + (i % 4) * 0.05),
              Math.max(0, p.progress - (p.kind === "meteor" ? 0.19 : 0.065)),
            );
            trail.setAttribute(
              "d",
              `M${tail.x} ${tail.y} L${p.position.x} ${p.position.y}`,
            );
            trail.setAttribute(
              "opacity",
              String((p.kind === "meteor" ? 0.4 : 0.12) + open * 0.3),
            );
            trail.setAttribute(
              "stroke-width",
              p.kind === "meteor" ? "2.2" : "1",
            );
          } else trail.setAttribute("opacity", "0");
        }
        layer.dataset.flights = String(
          f.particles.filter((p) => p.phase === "flight").length,
        );
        layer.dataset.clock = String(Math.round(f.time));
        if (burst.current) {
          const progress = Math.min(1, f.rewardAge / 1200);
          burst.current.setAttribute(
            "transform",
            `translate(${targets.lamp.x} ${targets.lamp.y}) scale(${0.3 + progress * 3})`,
          );
          burst.current.setAttribute("opacity", String((1 - progress) * 0.7));
        }
      },
    }),
    [],
  );
  return (
    <g ref={root} className="moon-fireflies" data-testid="moon-fireflies">
      {FIREFLY_SOURCES.map((source, i) => (
        <g key={i}>
          <path
            ref={(node) => {
              trails.current[i] = node;
            }}
            fill="none"
            stroke={i % 5 ? "#ffdc92" : "#b6f8ff"}
            strokeWidth="1"
            opacity="0"
          />
          <g
            ref={(node) => {
              nodes.current[i] = node;
            }}
            data-firefly={i}
            data-source-x={source.x}
            data-source-y={source.y}
            data-flight-phase="ambient"
            transform={`translate(${source.x} ${source.y})`}
            opacity=".3"
          >
            <path
              className="moon-firefly-wings"
              d="M-2 0Q-10-8-7-2L-2 2M2 0Q10-8 7-2L2 2"
              fill="#d9ffbc"
            />
            <path
              className="moon-firefly-glow"
              d="M-3-3H3V3H-3Z"
              fill={i % 5 ? "#ffcf78" : "#9defff"}
              opacity=".18"
              transform={`scale(${1 + (i % 3) * 0.35})`}
            />
            <path
              d={i % 3 ? "M-1-1H1V1H-1Z" : "M-1-4H1V-1H4V1H1V4H-1V1H-4V-1H-1Z"}
              fill={i % 5 ? "#ffe7a4" : "#d3ffff"}
              transform={`scale(${0.65 + (i % 4) * 0.16})`}
            />
          </g>
        </g>
      ))}
      <g ref={burst} opacity="0" fill="#ffe8b0">
        {[0, 60, 120, 180, 240, 300].map((angle) => (
          <path key={angle} d="M12-1H15V1H12Z" transform={`rotate(${angle})`} />
        ))}
      </g>
    </g>
  );
});
