import { describe, it, expect } from "vitest";
import { LeanSession, DEMO_LEAN_PROFILE } from "../vision/leanPose";
import { layoutFor, targetPose, type SunSurfState } from "./sunSurfScene";
import {
  stepSurfMotion,
  surfJump,
  resizeSurfX,
  surfChapter,
} from "./sunSurfMotion";
const L = layoutFor(960, 540);
const state = (): SunSurfState => ({
  t: 0,
  x: L.cx,
  u: 0,
  target: -1,
  approach: 0,
  hold: 0,
  arrived: false,
  returning: false,
  reps: 0,
  complete: false,
  catchT: -10,
  catchSide: -1,
  spawnT: 0,
  completeT: 0,
  tracking: "ok",
});
const frame = () => ({ ...new LeanSession(DEMO_LEAN_PROFILE).current });
describe("G03 continuous display", () => {
  it("30/60/120 Hz produce the same displacement and clock", () => {
    const ends = [30, 60, 120].map((hz) => {
      const s = state(),
        v = { ...frame(), u: 1 };
      for (let i = 0; i < hz; i++) stepSurfMotion(s, v, 1000 / hz, true, L);
      return s;
    });
    for (const s of ends) {
      expect(s.t).toBeCloseTo(1);
      expect(s.x).toBeCloseTo(ends[0].x, 6);
    }
  });
  it("a 500ms stall never replays a half-second jump", () => {
    const s = state();
    stepSurfMotion(s, { ...frame(), u: 1 }, 500, true, L);
    expect(s.x - L.cx).toBeLessThan(L.laneDX * 0.13);
    expect(s.t).toBeCloseTo(1 / 60);
  });
  it("pause, brief tracking gaps and recovery freeze both clock and position", () => {
    for (const opts of [
      { tracking: "unstable" as const, recovering: false, run: true },
      { tracking: "lost" as const, recovering: true, run: true },
      { tracking: "ok" as const, recovering: true, run: true },
      { tracking: "ok" as const, recovering: false, run: false },
    ]) {
      const s = state();
      stepSurfMotion(
        s,
        {
          ...frame(),
          u: 1,
          tracking: opts.tracking,
          recovering: opts.recovering,
        },
        50,
        opts.run,
        L,
      );
      expect(s.x).toBe(L.cx);
      expect(s.t).toBe(0);
    }
  });
  it("resizing preserves lane fraction rather than the old width ratio", () => {
    const next = layoutFor(700, 700);
    expect(
      (resizeSurfX(L.cx + L.laneDX * 0.8, L, next) - next.cx) / next.laneDX,
    ).toBeCloseTo(0.8);
  });
  it("target flight joins the bob at zero offset", () => {
    const s = state(),
      a = targetPose(L, { ...s, t: 0.99999 }),
      b = targetPose(L, { ...s, t: 1.00001 });
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeLessThan(0.01);
  });
  it("three chapters only follow the existing confirmed six counts", () => {
    expect([0, 1, 2, 3, 4, 5, 6].map(surfChapter)).toEqual([
      0, 0, 1, 1, 2, 2, 2,
    ]);
    const s = state(),
      v = frame();
    for (let i = 0; i < 100; i++) stepSurfMotion(s, v, 16, true, L);
    expect(v.reps).toBe(0);
    expect(s.reps).toBe(0);
  });
});

it("final catch jump joins celebration bounce without a positional snap", () => {
  expect(
    Math.abs(
      surfJump(0.54999, 0, true, 0, 1) - surfJump(0.55001, 0, true, 0, 1),
    ),
  ).toBeLessThan(0.01);
  expect(surfJump(0.55, 0, true, 0, 1)).toBe(0);
});

it("optional hips appearing/disappearing keep the seated shoulder signal and display continuous",()=>{
 const session=new LeanSession({...DEMO_LEAN_PROFILE,a0:0}),s=state();
 let maxStep=0;
 for(let i=0;i<360;i++){
  const v=session.update(1000/60,{shoulder:.05,torso:Math.floor(i/30)%2 ? null : .01});
  const prev=s.x;stepSurfMotion(s,v,1000/60,true,L);maxStep=Math.max(maxStep,Math.abs(s.x-prev));
  expect(v.tracking).toBe("ok");
 }
 expect(maxStep/L.laneDX).toBeLessThan(.06);expect(session.current.reps).toBe(0);
});
