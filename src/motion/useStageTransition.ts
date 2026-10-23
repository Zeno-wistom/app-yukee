import { useRef, useState, type RefObject } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { MOTION, reducedMotion } from "./tokens";

/** One interrupt-safe owner for navigation. Only the reducer callback changes the product phase. */
export function useStageTransition(root: RefObject<HTMLElement | null>) {
  const locked = useRef(false);
  const flight = useRef<gsap.core.Timeline | null>(null);
  const outgoingRef = useRef<NodeListOf<Element> | null>(null);
  const [transition, setTransition] = useState("idle");
  const { context, contextSafe } = useGSAP({ scope: root });
  const navigate = contextSafe((commit: () => void, fromCard = false) => {
    if (locked.current) {
      if (fromCard) return;
      // Returning/restarting is always available, including during an unfinished entrance.
      context.kill();
      if (outgoingRef.current) gsap.set(outgoingRef.current, { clearProps: "transform,opacity" });
      locked.current = false;
    }
    if (reducedMotion() || !root.current) { commit(); return; }
    const app = root.current;
    const layer = app.querySelector<HTMLElement>(".stage-transition")!;
    const art = layer.querySelector<HTMLElement>(".transition-art")!;
    const title = layer.querySelector<HTMLElement>(".transition-label")!;
    // Read geometry once before writes. The artwork is cropped, never stretched.
    const stage = layer.getBoundingClientRect();
    const preview = app.querySelector<HTMLElement>(".selection-preview");
    const rect = fromCard && preview ? preview.getBoundingClientRect() : stage;
    const inset = `${Math.max(0, rect.top-stage.top)}px ${Math.max(0, stage.right-rect.right)}px ${Math.max(0, stage.bottom-rect.bottom)}px ${Math.max(0, rect.left-stage.left)}px`;
    locked.current = true;
    setTransition(fromCard ? "entering" : "returning");
    gsap.set(layer, { visibility: "visible", opacity: 1, clipPath: fromCard ? `inset(${inset} round 18px)` : "inset(0 0 100% 0 round 0px)" });
    // 画面先按「最终铺满舞台」的尺寸栅格化，再从预览矩形缩小态放大到 1：
    // 结束帧是原生分辨率（不是把 183px 高的位图放大 3.5 倍），且中心连续落到舞台中心。
    const cover = Math.max(stage.width / rect.width, stage.height / rect.height);
    const fullW = rect.width * cover, fullH = rect.height * cover;
    const fromX = rect.left - stage.left + rect.width / 2 - fullW / 2;
    const fromY = rect.top - stage.top + rect.height / 2 - fullH / 2;
    gsap.set(art, fromCard ? {
      width: fullW, height: fullH, x: fromX, y: fromY,
      opacity: 1, scale: 1 / cover, transformOrigin: "50% 50%", force3D: true, "--shade": 0,
    } : {
      width: stage.width, height: stage.height, x: 0, y: 0,
      opacity: 0.32, scale: 1.04, transformOrigin: "50% 50%", force3D: true, "--shade": 1,
    });
    gsap.set(title, { opacity: 0, y: 12 });
    const outgoing = app.querySelectorAll(fromCard ? ".selection-heading, .selection-detail, .selection-pagination, .selection-footer, .selection-arrow" : ".game-viewport, .arcade-dialog[open]");
    outgoingRef.current = outgoing;
    const timeline = gsap.timeline({ onComplete: () => {
      gsap.set(layer, { visibility: "hidden", clearProps: "clipPath,opacity" });
      gsap.set(art, { clearProps: "willChange" });
      locked.current = false;
      setTransition("idle");
      flight.current = null;
      outgoingRef.current = null;
      // Completed timelines otherwise stay in the lifetime context and retain
      // detached selection/game DOM. No styles are reverted at the visual end.
      context.clear();
    } });
    flight.current = timeline;
    if (fromCard) {
      // 预览 → 舞台：裁切窗口与画面同一条缓动曲线展开；新相位在画面全遮挡时挂载；
      // 结尾不再「画面淡成纯色再上卷」（会出现一帧暗屏），而是整层与目标页交叉溶解，画面轻推 3%。
      timeline.to(outgoing, { y: -12, opacity: 0, duration: MOTION.exit, ease: "power2.in" }, 0)
        .to(layer, { clipPath: "inset(0px 0px 0px 0px round 0px)", duration: 0.56, ease: MOTION.inOut }, 0)
        .to(art, { x: (stage.width - fullW) / 2, y: (stage.height - fullH) / 2, scale: 1, duration: 0.6, ease: MOTION.inOut }, 0)
        // 起始帧与卡片预览完全一致（不压暗），展开过程中才压暗，给标题留出对比
        .to(art, { "--shade": 1, duration: 0.42, ease: "power1.inOut" }, 0.08)
        .to(title, { opacity: 1, y: 0, duration: 0.26, ease: MOTION.ease }, 0.22)
        .call(commit, [], 0.3)
        .to(title, { opacity: 0, y: -8, duration: 0.18, ease: "power2.in" }, 0.62)
        .to(art, { scale: 1.03, duration: 0.5, ease: "power1.out" }, 0.6)
        .to(layer, { opacity: 0, duration: 0.4, ease: "power2.out" }, 0.66);
    } else {
      // 舞台 → 选择：同样的交叉溶解节奏，反向轻拉。
      gsap.set(layer, { clipPath: "inset(0px 0px 0px 0px round 0px)", opacity: 0 });
      timeline.to(outgoing, { opacity: 0, scale: 0.985, duration: 0.24, ease: "power2.in" }, 0)
        .to(layer, { opacity: 1, duration: 0.24, ease: "power2.out" }, 0)
        .to(art, { scale: 1, duration: 0.6, ease: MOTION.ease }, 0)
        .to(title, { opacity: 1, y: 0, duration: 0.22, ease: MOTION.ease }, 0.08)
        .call(commit, [], 0.28)
        .to(title, { opacity: 0, y: -8, duration: 0.16, ease: "power2.in" }, 0.4)
        .to(layer, { opacity: 0, duration: 0.36, ease: "power2.out" }, 0.44);
    }
  });
  return { navigate, transition, locked };
}
