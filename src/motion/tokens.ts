/** UI motion only. Game clocks, scoring and vision never depend on these values. */
export const MOTION = {
  micro: 0.16,
  exit: 0.18,
  card: 0.42,
  scene: 0.64,
  ease: "power3.out",
  inOut: "power3.inOut",
} as const;
export const reducedMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
