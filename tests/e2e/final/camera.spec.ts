import { test, expect } from "@playwright/test";
import { choose, demo, installPose, pose, leave } from "./helpers";

test("D 合成姿态 G05：8px 舒适浅蹲校准、蓄力、真实站回释放、缺点与释放资源", async ({
  page,
}) => {
  test.setTimeout(120000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/?g05debug=1");
  await installPose(page);
  await choose(page, 3);
  const cal = page.getByTestId("squat-calibration");
  await expect(cal).toHaveAttribute("data-stage", "squat", { timeout: 15000 });
  await pose(page, { drop: 8 }); // 肩宽 160px；仅下降 5%，不是深蹲。
  await expect(cal).toHaveAttribute("data-stage", "rise");
  await pose(page, { drop: 0 });
  const game = page.getByTestId("squat-jump");
  await expect(game).toBeVisible();
  await expect(game).toHaveAttribute("data-mode", "camera");
  await page.waitForTimeout(1000);
  await expect(game).toHaveAttribute("data-state", "ready");
  await pose(page, { drop: 8 });
  await expect(game).toHaveAttribute("data-state", "charging");
  // 部分起身不能释放；有效幅度到站位后才出现飞行。
  await pose(page, { drop: 4.5 });
  await page.waitForTimeout(250);
  await expect(game).toHaveAttribute("data-state", "charging");
  await pose(page, { drop: 0 });
  await expect
    .poll(() =>
      page.evaluate(() =>
        (window as any).__g05debug.rows.some(
          (r: any) => r.src === "game" && r.rel === "stand",
        ),
      ),
    )
    .toBe(true);
  const logs = await page.evaluate(() => (window as any).__g05debug.rows);
  expect(logs.some((r: any) => r.src === "game" && r.phase === "down")).toBe(
    true,
  );
  await leave(page);
  expect(
    await page.evaluate(() =>
      (window as any).streams.every((s: MediaStream) =>
        s.getTracks().every((t) => t.readyState === "ended"),
      ),
    ),
  ).toBe(true);
  expect(
    await page.evaluate(() => (window as any).poseDiag().subscribers),
  ).toBe(0);
  // 再次开启另一游戏，原视频和旧订阅不残留。
  await choose(page, 1);
  expect(await page.evaluate(() => (window as any).streams.length)).toBe(2);
  await page.getByRole("button", { name: "返回游戏选择", exact: true }).click();
  expect(
    await page.evaluate(() => (window as any).poseDiag().subscribers),
  ).toBe(0);
  expect(errors).toEqual([]);
});

test("D 合成姿态 G05：站立不蓄力，缺点取消且必须站回后恢复", async ({
  page,
}) => {
  await page.goto("/?g05debug=1");
  await installPose(page);
  await choose(page, 3);
  await expect(page.getByTestId("squat-calibration")).toHaveAttribute(
    "data-stage",
    "squat",
  );
  await pose(page, { drop: 8 });
  await expect(page.getByTestId("squat-calibration")).toHaveAttribute(
    "data-stage",
    "rise",
  );
  await pose(page, { drop: 0 });
  const game = page.getByTestId("squat-jump");
  await expect(game).toBeVisible();
  await page.waitForTimeout(1500);
  await expect(game).toHaveAttribute("data-state", "ready");
  await pose(page, { drop: 8 });
  await expect(game).toHaveAttribute("data-state", "charging");
  await pose(page, { missing: 11 });
  await expect(game).toHaveAttribute("data-tracking", "lost");
  await expect(game).toHaveAttribute("data-state", "ready");
  await pose(page, { missing: -1, drop: 8 });
  await page.waitForTimeout(1100);
  await expect(game).toHaveAttribute("data-state", "ready");
  await pose(page, { drop: 0 });
  await page.waitForTimeout(1300);
  await expect(game).toHaveAttribute("data-tracking", "ok");
  await pose(page, { drop: 8 });
  await expect(game).toHaveAttribute("data-state", "charging");
  await pose(page, { frozen: true });
  await expect(game).toHaveAttribute("data-tracking", "lost");
  await expect(game).toHaveAttribute("data-state", "ready");
  await leave(page);
});

test("D 合成姿态 G03：自然肩线校准，平移不计分，左右侧倾与回中才计分", async ({ page }) => {
  await page.goto("/"); await installPose(page); await choose(page, 2);
  const game = page.getByTestId("lean-surf"); await expect(game).toBeVisible();
  await expect(game).toHaveAttribute("data-mode", "camera");
  await pose(page, { drop: 15 }); await page.waitForTimeout(800); await expect(game).toHaveAttribute("data-reps", "0");
  await pose(page, { drop: 0 }); await page.waitForTimeout(500);
  for (let i = 1; i <= 2; i++) {
    const target = Number(await game.getAttribute("data-target"));
    await pose(page, { lean: -target }); await expect(game).toHaveAttribute("data-reps", String(i));
    await page.waitForTimeout(400); await expect(game).toHaveAttribute("data-reps", String(i));
    await pose(page, { lean: 0 }); await expect(game).toHaveAttribute("data-returning", "0");
  }
  await leave(page); expect(await page.evaluate(() => (window as any).poseDiag().subscribers)).toBe(0);
});

test("D 合成姿态 G02：真实校准交接，缺点不计数，视频连续与退出释放", async ({
  page,
}) => {
  await page.goto("/");
  await installPose(page);
  await choose(page, 1);
  const cal = page.getByTestId("wing-calibration");
  await expect(cal).toHaveAttribute("data-stage", "spread", { timeout: 20000 });
  await pose(page, { wing: 0.8 });
  await expect(cal).toHaveAttribute("data-stage", "ready");
  const game = page.getByTestId("winglight");
  await expect(game).toBeVisible({ timeout: 12000 });
  await pose(page, { wing: 0.1 });
  await page.waitForTimeout(900);
  const before = await page.evaluate(() => (window as any).poseDiag());
  await page.waitForTimeout(500);
  const after = await page.evaluate(() => (window as any).poseDiag());
  expect(after.videoTime).toBeGreaterThan(before.videoTime);
  expect(after.frames).toBeGreaterThan(before.frames);
  await pose(page, { missing: 15, wing: 0.8 });
  await expect(game).toHaveAttribute("data-tracking", "lost");
  await expect(game).toHaveAttribute("data-reps", "0");
  await pose(page, { missing: -1, wing: 0.1 });
  await expect(game).toHaveAttribute("data-tracking", "ok");
  await page.waitForTimeout(1200);
  await pose(page, { wing: 0.8 });
  await expect(game).toHaveAttribute("data-stage", "open");
  await expect(game).toHaveAttribute("data-charged", "1");
  await pose(page, { wing: 0.1 });
  await expect(game).toHaveAttribute("data-reps", "1");
  await leave(page);
  expect(
    await page.evaluate(() => (window as any).poseDiag().subscribers),
  ).toBe(0);
});

test("摄像头权限被拒绝时可退出或使用明确标记的键盘演示", async ({ page }) => {
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = async () => {
      throw new DOMException("camera denied", "NotAllowedError");
    };
  });
  await page.goto("/");
  await choose(page, 3);
  await expect(page.getByRole("status")).toHaveText("摄像头暂不可用");
  await page.getByRole("button", { name: /键盘演示/ }).click();
  await expect(page.getByTestId("squat-jump")).toBeVisible();
  await leave(page);
  await demo(page, 0);
  await expect(page.getByTestId("yukee-run")).toBeVisible();
  await leave(page);
});
