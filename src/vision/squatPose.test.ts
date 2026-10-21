import { describe, it, expect } from "vitest";
import { measureSquat, SquatCalibrator, SquatSession, SQUAT_CONFIG, type SquatProfile } from "./squatPose";
import type { PoseFrame } from "./wingPose";

const W = 640,
  H = 480;
/** 合成一帧：双肩在像素坐标的位置；drop 为整体下降像素，dl/dr 为单侧额外下降 */
function frame({ drop = 0, dl = 0, dr = 0, shiftX = 0, width = 160, vis = 0.9, at = 0 } = {}): PoseFrame {
  const lm = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, visibility: 0.2 }));
  const cx = 320 + shiftX,
    y = 200 + drop;
  lm[11] = { x: (cx + width / 2) / W, y: (y + dl) / H, visibility: vis };
  lm[12] = { x: (cx - width / 2) / W, y: (y + dr) / H, visibility: vis };
  return { landmarks: lm, videoWidth: W, videoHeight: H, at };
}
const profile: SquatProfile = { ly0: 200, ry0: 200, cx0: 320, w0: 160, tilt0: 0, amp: 0.3, jitterPx: 1 };
const AMP_PX = 0.3 * 160; // 48px

function drive(s: SquatSession, f: Parameters<typeof frame>[0], ms: number, step = 33) {
  let out = s.update(0, measureSquat(frame(f)));
  const events = { release: out.release ? 1 : 0, cancel: out.cancel ? 1 : 0, charging: 0 };
  for (let t = 0; t < ms; t += step) {
    out = s.update(step, measureSquat(frame(f)));
    if (out.release) events.release++;
    if (out.cancel) events.cancel++;
    if (out.charging) events.charging += step;
  }
  return { out, events };
}

describe("G05 浅蹲识别", () => {
  it("双肩可见度不足时不给样本", () => {
    expect(measureSquat(frame({ vis: 0.4 }))).toBeNull();
    expect(measureSquat(frame())).not.toBeNull();
  });

  it("站直 → 浅蹲保持（蓄力）→ 站回（释放一次）", () => {
    const s = new SquatSession(profile);
    drive(s, {}, 600);
    const down = drive(s, { drop: AMP_PX }, 900);
    expect(down.out.charging).toBe(true);
    expect(down.events.charging).toBeGreaterThan(400);
    expect(down.events.release).toBe(0);
    const up = drive(s, {}, 600);
    expect(up.events.release).toBe(1);
    expect(up.out.charging).toBe(false);
  });

  it("保持浅蹲不会重复释放；肩部抖动不释放", () => {
    const s = new SquatSession(profile);
    drive(s, {}, 600);
    drive(s, { drop: AMP_PX }, 500);
    let releases = 0;
    for (let i = 0; i < 60; i++) {
      // 在蹲位附近 ±20% 幅度抖动
      const o = s.update(33, measureSquat(frame({ drop: AMP_PX * (0.8 + (i % 2) * 0.4) })));
      if (o.release) releases++;
    }
    expect(releases).toBe(0);
  });

  it("半蹲未到本人阈值：不蓄力；单肩下降（耸肩/侧倾）不触发", () => {
    const s = new SquatSession(profile);
    drive(s, {}, 600);
    expect(drive(s, { drop: AMP_PX * 0.45 }, 800).events.charging).toBe(0);
    drive(s, {}, 600);
    expect(drive(s, { dl: AMP_PX * 1.6 }, 800).events.charging).toBe(0);
  });

  it("前探（肩宽变大）或横移出站位：不蓄力；蓄力中出现则取消", () => {
    const s = new SquatSession(profile);
    drive(s, {}, 600);
    expect(drive(s, { drop: AMP_PX, width: 160 * 1.35 }, 800).events.charging).toBe(0);
    drive(s, {}, 600);
    expect(drive(s, { drop: AMP_PX, shiftX: 160 * 0.4 }, 800).events.charging).toBe(0);
    drive(s, {}, 600);
    drive(s, { drop: AMP_PX }, 600);
    const brief = drive(s, { drop: AMP_PX, width: 160 * 1.35 }, 150);
    expect(brief.events.cancel).toBe(0); // 短暂失败不取消
    const r = drive(s, { drop: AMP_PX, width: 160 * 1.35 }, 400);
    expect(r.events.cancel).toBe(1);
  });

  it("丢失 >0.3 秒：取消本轮并暂停，回到站立稳定约 1 秒后才恢复", () => {
    const s = new SquatSession(profile);
    drive(s, {}, 600);
    drive(s, { drop: AMP_PX }, 600);
    let cancel = 0,
      o = s.update(0, null);
    for (let t = 0; t < 400; t += 33) {
      o = s.update(33, null);
      if (o.cancel) cancel++;
    }
    expect(cancel).toBe(1);
    expect(o.tracking).toBe("lost");
    // 重现后立刻蹲下：不蓄力
    expect(drive(s, { drop: AMP_PX }, 600).events.charging).toBe(0);
    const back = drive(s, {}, 1200);
    expect(back.out.tracking).toBe("ok");
    expect(drive(s, { drop: AMP_PX }, 700).events.charging).toBeGreaterThan(0);
  });

  it("短暂缺点（<0.3 秒）只冻结，不取消", () => {
    const s = new SquatSession(profile);
    drive(s, {}, 600);
    drive(s, { drop: AMP_PX }, 600);
    let cancel = 0;
    for (let t = 0; t < 200; t += 33) if (s.update(33, null).cancel) cancel++;
    expect(cancel).toBe(0);
    expect(drive(s, { drop: AMP_PX }, 100).out.charging).toBe(true);
  });

  it("校准：站直 2 秒 → 舒适浅蹲停住 → 站回，得到本人幅度", () => {
    const c = new SquatCalibrator();
    let t = 0;
    const feed = (f: Parameters<typeof frame>[0], ms: number) => {
      for (let e = 0; e < ms; e += 33) {
        t += 33;
        c.update(measureSquat(frame(f)), t);
      }
    };
    feed({}, SQUAT_CONFIG.standMs + 200);
    expect(c.stage).toBe("squat");
    feed({ drop: 6 }, 400); // 太浅：不算
    expect(c.stage).toBe("squat");
    feed({ drop: 44 }, 800);
    expect(c.stage).toBe("rise");
    feed({}, 600);
    expect(c.stage).toBe("ready");
    expect(c.profile!.amp).toBeGreaterThan(0.24);
    expect(c.profile!.amp).toBeLessThan(0.29);
    expect(c.profile!.w0).toBeCloseTo(160, 0);
  });

  it("校准：蹲下再站起一个来回（没刻意停住）也能通过", () => {
    const c = new SquatCalibrator();
    let t = 0;
    const feed = (f: Parameters<typeof frame>[0], ms: number) => {
      for (let e = 0; e < ms; e += 66) {
        t += 66;
        c.update(measureSquat(frame(f)), t);
      }
    };
    feed({}, SQUAT_CONFIG.standMs + 200);
    expect(c.stage).toBe("squat");
    // 下降过程中一直在动（每帧 ±6px），不满足「停住」，但在蹲位约 0.4 秒后站起
    for (let i = 0; i < 6; i++) feed({ drop: 40 + (i % 2 ? 6 : -6) }, 66);
    feed({}, 200);
    expect(["rise", "ready"]).toContain(c.stage);
    feed({}, 600);
    expect(c.stage).toBe("ready");
    expect(c.profile!.amp).toBeGreaterThan(0.15);
    expect(c.diag.passedBy).toBe("cycle");
  });

  it("校准：推理短暂掉帧（<0.6 秒）不清空进度", () => {
    const c = new SquatCalibrator();
    let t = 0;
    for (let e = 0; e < 1200; e += 33) c.update(measureSquat(frame()), (t += 33));
    for (let e = 0; e < 400; e += 33) c.update(null, (t += 33));
    for (let e = 0; e < 900; e += 33) c.update(measureSquat(frame()), (t += 33));
    expect(c.stage).toBe("squat");
  });

  it("校准：站回后姿势前后挪动回不到原基线，超时以当前站姿为新基线", () => {
    const c = new SquatCalibrator();
    let t = 0;
    const feed = (f: Parameters<typeof frame>[0], ms: number) => {
      for (let e = 0; e < ms; e += 33) c.update(measureSquat(frame(f)), (t += 33));
    };
    feed({}, SQUAT_CONFIG.standMs + 200);
    feed({ drop: 48 }, 700);
    expect(c.stage).toBe("rise");
    feed({ drop: 24 }, 3500); // u ≈ 0.5，一直停在这里
    expect(c.stage).toBe("ready");
    expect(c.diag.rebased).toBe(true);
    expect(c.profile!.ly0).toBeGreaterThan(215);
  });

  it("游戏：回升停在中间区（站姿变了）也会释放，不会卡住", () => {
    const s = new SquatSession(profile);
    drive(s, {}, 600);
    drive(s, { drop: AMP_PX }, 600);
    const mid = drive(s, { drop: AMP_PX * 0.42 }, 700);
    expect(mid.events.release).toBe(1);
    // 之后以新站姿为基准，还能再次蓄力与释放
    drive(s, { drop: AMP_PX * 0.42 }, 400);
    expect(drive(s, { drop: AMP_PX * 1.3 }, 500).out.charging).toBe(true);
    expect(drive(s, { drop: AMP_PX * 0.42 }, 600).events.release).toBe(1);
  });

  it("游戏：确认蹲位时报告等待时长，供控制器补进蓄力", () => {
    const s = new SquatSession(profile);
    drive(s, {}, 600);
    let entered = 0;
    for (let i = 0; i < 20; i++) entered += s.update(33, measureSquat(frame({ drop: AMP_PX }))).enteredDownSec;
    expect(entered).toBeGreaterThan(0.05);
    expect(entered).toBeLessThan(0.2);
  });

  it("游戏：站立基线缓慢漂移（人略往下坐）仍能识别站直", () => {
    const s = new SquatSession(profile);
    drive(s, {}, 300);
    // 站姿逐渐下移 0.25A
    for (let i = 0; i < 60; i++) s.update(50, measureSquat(frame({ drop: (AMP_PX * 0.25 * i) / 60 })));
    drive(s, { drop: AMP_PX * 0.25 }, 3000);
    drive(s, { drop: AMP_PX * 1.15 }, 500);
    expect(drive(s, { drop: AMP_PX * 0.25 }, 500).events.release).toBe(1);
  });
});
