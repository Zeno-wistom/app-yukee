/**
 * YukeeCast —— 严格设备内的分身析出动画（第二版，推翻空中飞行路径）。
 *
 * 核心原则：动画依托真实硬件结构产生遮挡，分身永远不在「网页空气」中可见。
 *
 * 结构：两个与挂灯 / 显示器等大的 fixed 裁剪仓（overflow hidden），
 * 所有动画元素只存在于裁剪仓内部 —— 越过设备边界的部分被物理裁掉，
 * 形成「进入设备内部」的真实遮挡感，而不是 z-index 压盖。
 *
 * 流程：
 * 1. 挂灯内：本体能量鼓起 → 底部形成柔软鼓包 → metaball 液态连接
 *    → 连接收窄自然断裂（全程不离开挂灯显示屏）。
 * 2. 分身向下加速，越过挂灯下沿后被裁剪仓裁掉 —— 视觉上「进入灯条 / 硬件」。
 * 3. 设备内短暂 transit（完全不可见）。
 * 4. 显示器内容区顶部：分身从边框遮挡中重新显现，受重力下落。
 * 5. 落地 squash → 像素结晶 → 游戏舞台接管渐亮。
 *
 * 性能：metaball 仅存在于挂灯内前 ~1.2s（两条 SVG path 的 d 更新）；
 * 其余全部是 transform / opacity，无 blur / mask / 动画 filter。
 */
import { useRef, type RefObject } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { unionPath, type Blob } from "./metaball";

export default function YukeeCast({
  active,
  lampPortal,
  monitorPortal,
  onArrive,
  onComplete,
}: {
  active: boolean;
  lampPortal: RefObject<HTMLDivElement | null>;
  monitorPortal: RefObject<HTMLDivElement | null>;
  onArrive: () => void;
  onComplete: () => void;
}) {
  const lampClip = useRef<HTMLDivElement>(null);
  const monitorClip = useRef<HTMLDivElement>(null);
  const goo = useRef<SVGGElement>(null);
  const gooHaloLeft = useRef<SVGPathElement>(null);
  const gooHaloRight = useRef<SVGPathElement>(null);
  const gooCoreLeft = useRef<SVGPathElement>(null);
  const gooCoreRight = useRef<SVGPathElement>(null);
  const lampLobeLeft = useRef<HTMLDivElement>(null);
  const lampLobeRight = useRef<HTMLDivElement>(null);
  const monitorOrb = useRef<HTMLDivElement>(null);
  const ripple = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      if (
        !active ||
        !lampClip.current ||
        !monitorClip.current ||
        !goo.current ||
        !gooHaloLeft.current ||
        !gooHaloRight.current ||
        !gooCoreLeft.current ||
        !gooCoreRight.current ||
        !lampLobeLeft.current ||
        !lampLobeRight.current ||
        !monitorOrb.current ||
        !ripple.current ||
        !lampPortal.current ||
        !monitorPortal.current
      )
        return;

      // ---- 几何：两个裁剪仓精确贴合设备矩形 ----
      const lampRect = lampPortal.current.getBoundingClientRect();
      const monitorRect = monitorPortal.current.getBoundingClientRect();
      gsap.set(lampClip.current, {
        left: lampRect.left,
        top: lampRect.top,
        width: lampRect.width,
        height: lampRect.height,
        autoAlpha: 1,
      });
      gsap.set(monitorClip.current, {
        left: monitorRect.left,
        top: monitorRect.top,
        width: monitorRect.width,
        height: monitorRect.height,
        autoAlpha: 1,
      });

      // 本体中心（挂灯裁剪仓内坐标）
      const lampAvatar = lampPortal.current.querySelector(".lamp-avatar");
      const av = (lampAvatar ?? lampPortal.current).getBoundingClientRect();
      const start = {
        x: av.left + av.width * 0.5 - lampRect.left,
        y: av.top + av.height * 0.52 - lampRect.top,
      };
      // 落点（显示器裁剪仓内坐标）：游戏舞台中 Yukee 的站位
      const land = {
        x: monitorRect.width * 0.205,
        y: monitorRect.height * 0.69,
      };

      // 只抽出角色内部的一小团能量，不再用大圆覆盖 Yukee 本体。
      const bodyR = Math.max(8, Math.min(av.width, av.height) * 0.18);
      const dropR = bodyR * 0.46;
      /** 鼓包从本体底部一路向下到挂灯下沿之外的全程 */
      const dropTravel = lampRect.height + dropR * 2 - start.y;

      const state = {
        p: 0, // 鼓包下行进度 0~1（1 = 完全越出挂灯下沿）
        bodyR: 0,
        dropR: 0,
        gooA: 0,
        connected: false,
        squashX: 1,
        squashY: 1,
        split: 0,
      };

      const render = () => {
        const spread = state.split * bodyR * 0.72;
        const budLeft: Blob = {
          x: start.x - spread,
          y: start.y + state.p * dropTravel,
          r: state.dropR,
        };
        const budRight: Blob = { ...budLeft, x: start.x + spread };
        const body: Blob = { x: start.x, y: start.y, r: state.bodyR };
        const coreLeft = unionPath(body, budLeft, state.connected);
        const coreRight = unionPath(body, budRight, state.connected);
        state.connected = coreLeft.connected || coreRight.connected;
        const haloLeft = unionPath(
          { ...body, r: body.r + 6 },
          { ...budLeft, r: budLeft.r + 5 },
          state.connected,
        );
        const haloRight = unionPath(
          { ...body, r: body.r + 6 },
          { ...budRight, r: budRight.r + 5 },
          state.connected,
        );
        gooCoreLeft.current!.setAttribute("d", coreLeft.d);
        gooCoreRight.current!.setAttribute("d", coreRight.d);
        gooHaloLeft.current!.setAttribute("d", haloLeft.d);
        gooHaloRight.current!.setAttribute("d", haloRight.d);
        goo.current!.style.opacity = state.gooA.toFixed(3);
        goo.current!.style.transform =
          `translate(${start.x}px, ${start.y}px) ` +
          `scale(${state.squashX}, ${state.squashY}) ` +
          `translate(${-start.x}px, ${-start.y}px)`;
        gsap.set(lampLobeLeft.current, { x: budLeft.x, y: budLeft.y });
        gsap.set(lampLobeRight.current, { x: budRight.x, y: budRight.y });
      };

      const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
      const bulgeT = reduce ? 0.2 : 0.52;
      const stretchT = reduce ? 0.12 : 0.38;
      const tearP = reduce ? 0.22 : 0.3; // 断裂时鼓包仍在挂灯内
      const dropT = reduce ? 0.2 : 0.42; // 分身加速沉入灯条
      const transitT = reduce ? 0.12 : 0.3; // 设备内 transit（不可见）
      const fallT = reduce ? 0.22 : 0.5; // 从显示器顶部遮挡中出现并下落
      const landT = reduce ? 0.2 : 0.5;

      const shards = monitorClip.current.querySelectorAll(".yukee-cast-pixel");

      // 初始姿态
      gsap.set([lampLobeLeft.current, lampLobeRight.current], {
        x: start.x,
        y: start.y,
        scale: 0.3,
        autoAlpha: 0,
      });
      gsap.set(monitorOrb.current, {
        x: land.x,
        y: -26, // 显示器内容区上沿之外：先被边框完全遮挡
        scale: 0.9,
        autoAlpha: 0,
      });
      gsap.set(ripple.current, {
        x: land.x,
        y: land.y,
        scale: 0.12,
        autoAlpha: 0,
      });
      gsap.set(shards, { x: land.x, y: land.y, scale: 0, autoAlpha: 0 });
      render();

      const timeline = gsap.timeline({
        defaults: { ease: "power2.inOut" },
        onComplete: () => {
          // 彻底清理：两个裁剪仓整体隐藏，无任何残留层
          gsap.set([lampClip.current, monitorClip.current], { autoAlpha: 0 });
          onComplete();
        },
      });
      timeline
        // ---- 1. 挂灯内：能量鼓起 → 底部鼓包 → 液态连接收窄 ----
        .addLabel("bulge")
        .to(
          state,
          {
            bodyR,
            gooA: 1,
            duration: bulgeT,
            ease: "back.out(1.6)",
            onUpdate: render,
          },
          "bulge",
        )
        .to(
          state,
          {
            dropR,
            split: 1,
            duration: bulgeT * 0.85,
            ease: "back.out(1.7)",
            onUpdate: render,
          },
          "bulge+=0.12",
        )
        .to(
          state,
          {
            p: tearP * 0.55,
            duration: bulgeT,
            ease: "sine.out",
            onUpdate: render,
          },
          "bulge+=0.08",
        )
        // ---- 2. 连接拉伸、自然断裂（鼓包仍在挂灯内）----
        .addLabel("stretch")
        .to(
          state,
          {
            p: tearP,
            duration: stretchT,
            ease: "sine.inOut",
            onUpdate: render,
          },
          "stretch",
        )
        .addLabel("tear")
        .to(
          state,
          {
            squashX: 1.08,
            squashY: 0.88,
            duration: 0.1,
            ease: "sine.in",
            onUpdate: render,
          },
          "tear",
        )
        .to(
          state,
          {
            squashX: 1,
            squashY: 1,
            duration: 0.34,
            ease: "elastic.out(1, 0.45)",
            onUpdate: render,
          },
          "tear+=0.1",
        )
        .to(
          state,
          { dropR: 0, duration: 0.16, ease: "power1.in", onUpdate: render },
          "tear",
        )
        .to(
          [lampLobeLeft.current, lampLobeRight.current],
          { autoAlpha: 1, scale: 1, duration: 0.18, ease: "back.out(1.8)" },
          "tear",
        )
        // ---- 3. 本体能量收回；分身加速下沉，被挂灯下沿裁掉 ----
        .addLabel("sink")
        .to(
          state,
          {
            gooA: 0,
            bodyR: bodyR * 0.7,
            p: tearP + 0.06,
            duration: 0.3,
            ease: "sine.in",
            onUpdate: render,
          },
          "sink",
        )
        .to(
          [lampLobeLeft.current, lampLobeRight.current],
          {
            y: lampRect.height + 30, // 越出挂灯下沿 → 被裁剪仓物理裁掉
            x: start.x,
            scaleY: 1.18,
            scaleX: 0.86,
            duration: dropT,
            ease: "power2.in",
          },
          "sink+=0.05",
        )
        // ---- 4. 设备内 transit（完全不可见）----
        .addLabel("transit", `sink+=${0.05 + dropT + transitT}`)
        .set(
          [lampLobeLeft.current, lampLobeRight.current],
          { autoAlpha: 0 },
          "transit",
        )
        // ---- 5. 分身从显示器上沿遮挡中显现，受重力下落 ----
        .set(monitorOrb.current, { autoAlpha: 1 }, "transit")
        .to(
          monitorOrb.current,
          {
            y: land.y,
            scaleY: 1.16,
            scaleX: 0.9,
            duration: fallT,
            ease: "power2.in",
          },
          "transit",
        )
        // ---- 6. 落地 squash → 像素结晶 → 舞台接管 ----
        .addLabel("land")
        .call(onArrive, [], "land")
        .to(
          monitorOrb.current,
          {
            scaleX: 1.32,
            scaleY: 0.68,
            duration: landT * 0.24,
            ease: "sine.out",
          },
          "land",
        )
        .to(monitorOrb.current, {
          scale: 0.12,
          autoAlpha: 0,
          duration: landT * 0.5,
          ease: "power2.in",
        })
        .to(
          ripple.current,
          {
            scale: 1.6,
            keyframes: { autoAlpha: [0, 0.75, 0] },
            duration: landT,
            ease: "power2.out",
          },
          "land",
        )
        .to(
          shards,
          {
            x: (i) => land.x + Math.cos((i / shards.length) * Math.PI * 2) * 32,
            y: (i) => land.y + Math.sin((i / shards.length) * Math.PI * 2) * 22,
            scale: 1,
            keyframes: { autoAlpha: [0, 0.85, 0] },
            stagger: 0.024,
            duration: landT * 0.7,
            ease: "power2.out",
          },
          "land+=0.04",
        );

      return () => timeline.kill();
    },
    {
      scope: lampClip,
      dependencies: [active, lampPortal, monitorPortal, onArrive, onComplete],
      revertOnUpdate: true,
    },
  );

  return (
    <>
      {/* 挂灯裁剪仓：融球析出 + 分身下沉，全部被挂灯矩形物理裁剪 */}
      <div
        ref={lampClip}
        className="yukee-cast-clip lamp"
        data-testid="yukee-cast"
        aria-hidden="true"
        style={{ visibility: active ? "visible" : "hidden" }}
      >
        <svg className="yukee-cast-goo">
          <defs>
            <radialGradient id="yukee-goo-grad" cx="42%" cy="38%" r="72%">
              <stop offset="0%" stopColor="#eafff5" />
              <stop offset="55%" stopColor="#a9f2cf" />
              <stop offset="100%" stopColor="#8de9bc" />
            </radialGradient>
          </defs>
          <g ref={goo}>
            <path ref={gooHaloLeft} className="yukee-cast-goo-halo" />
            <path ref={gooHaloRight} className="yukee-cast-goo-halo" />
            <path ref={gooCoreLeft} className="yukee-cast-goo-core" />
            <path ref={gooCoreRight} className="yukee-cast-goo-core" />
          </g>
        </svg>
        <div ref={lampLobeLeft} className="yukee-cast-lobe" />
        <div ref={lampLobeRight} className="yukee-cast-lobe" />
      </div>
      {/* 显示器裁剪仓：分身从内容区上沿遮挡中显现、下落、结晶 */}
      <div
        ref={monitorClip}
        className="yukee-cast-clip monitor"
        aria-hidden="true"
        style={{ visibility: active ? "visible" : "hidden" }}
      >
        <div ref={monitorOrb} className="yukee-cast-orb" />
        <div ref={ripple} className="yukee-cast-ripple" />
        {Array.from({ length: 8 }, (_, i) => (
          <i key={i} className="yukee-cast-pixel" />
        ))}
      </div>
    </>
  );
}
