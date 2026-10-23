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
    gsap.set(art, {
      width: rect.width, height: rect.height,
      x: rect.left - stage.left, y: rect.top - stage.top,
      opacity: fromCard ? 1 : 0.28, scale: 1, transformOrigin: "50% 50%",
    });
    gsap.set(title, { opacity: 0, y: 12 });
    const outgoing = app.querySelectorAll(fromCard ? ".selection-heading, .selection-detail, .selection-pagination, .selection-footer" : ".game-viewport, .arcade-dialog[open]");
    outgoingRef.current = outgoing;
    const timeline = gsap.timeline({ onComplete: () => {
      gsap.set(layer, { visibility: "hidden", clearProps: "clipPath,opacity" });
      locked.current = false;
      setTransition("idle");
      flight.current = null;
      outgoingRef.current = null;
      // Completed timelines otherwise stay in the lifetime context and retain
      // detached selection/game DOM. No styles are reverted at the visual end.
      context.clear();
    } });
    flight.current = timeline;
    timeline.to(outgoing, { y: fromCard ? -12 : 8, opacity: 0, duration: MOTION.exit }, 0)
      .to(layer, { clipPath: "inset(0px 0px 0px 0px round 0px)", duration: fromCard ? 0.48 : 0.32, ease: MOTION.inOut }, 0)
      .to(art, {
        x: (stage.width - rect.width) / 2, y: (stage.height - rect.height) / 2,
        scale: fromCard ? Math.max(stage.width / rect.width, stage.height / rect.height) : 1.035,
        duration: 0.58, ease: MOTION.inOut,
      }, 0)
      .to(title, { opacity: 1, y: 0, duration: 0.22 }, 0.19)
      .call(commit, [], fromCard ? 0.27 : 0.28)
      .to(title, { opacity: 0, y: -8, duration: 0.15 }, 0.52)
      .to(art, { opacity: 0, duration: 0.28 }, 0.47)
      .to(layer, { clipPath: "inset(0px 0px 100% 0px round 0px)", duration: 0.38, ease: MOTION.inOut }, 0.59);
  });
  return { navigate, transition, locked };
}
