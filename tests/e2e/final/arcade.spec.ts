import { test, expect } from "@playwright/test";
import { demo, games, leave, jump } from "./helpers";

test("暂停与切换取消 BGM、蓄力音及排队奖励音", async ({ page }) => {
  await page.goto("/"); await demo(page, 3);
  await page.keyboard.down("Space"); await page.waitForTimeout(250);
  await page.evaluate(async () => {
    const url = performance.getEntriesByType("resource").find(r => new URL(r.name).pathname === "/src/audio/engine.ts")!.name;
    const { audioEngine } = await import(/* @vite-ignore */ url);
    (window as any).audioAudit = audioEngine;
    audioEngine.sfx("complete");
  });
  expect(await page.evaluate(() => (window as any).audioAudit.getDiagnostics().effectsActive)).toBeGreaterThan(0);
  await page.keyboard.press("Escape"); await page.keyboard.up("Space");
  await expect.poll(() => page.evaluate(() => (window as any).audioAudit.getDiagnostics())).toEqual({ bgmActive: false, effectsActive: 0, charging: false });
  await page.getByRole("button", { name: "退出并返回选择", exact: true }).click();
  await expect(page.getByTestId("game-selection")).toBeVisible();
  expect(await page.evaluate(() => (window as any).audioAudit.getDiagnostics())).toEqual({ bgmActive: false, effectsActive: 0, charging: false });
});

test("直达四款真实游戏；初始不请求摄像头；左右箭头与目录可用", async ({
  page,
}) => {
  await page.addInitScript(() => {
    (window as any).cameraCalls = 0;
    navigator.mediaDevices.getUserMedia = async () => {
      (window as any).cameraCalls++;
      throw new Error("must not request on selection");
    };
  });
  await page.goto("/");
  await expect(page.getByTestId("game-selection")).toBeVisible();
  await expect(
    page.locator(".scene, .monitor-portal, .lamp-portal"),
  ).toHaveCount(0);
  await expect(
    page.getByRole("navigation", { name: "游戏目录" }).getByRole("button"),
  ).toHaveCount(4);
  await page.getByRole("button", { name: "下一款游戏" }).click();
  await expect(page.getByTestId("selection-preview")).toHaveAttribute(
    "data-card-id",
    "winglight",
  );
  await page.getByRole("button", { name: "上一款游戏" }).click();
  await expect(page.getByTestId("selection-preview")).toHaveAttribute(
    "data-card-id",
    "yukeeRun",
  );
  await page.getByRole("button", { name: "查看浅蹲跳一跳" }).click();
  const img = page.locator(".selection-preview img:not([hidden])");
  await expect(img).toHaveAttribute(
    "src",
    "/game-previews/squat-jump-card.png",
  );
  expect(await img.evaluate((el: HTMLImageElement) => el.naturalWidth)).toBe(
    1290,
  );
  expect(await page.evaluate(() => (window as any).cameraCalls)).toBe(0);
});

for (const [width, height] of [
  [1280, 720],
  [1366, 768],
  [1920, 1080],
  [2560, 1440],
  [390, 844],
]) {
  test(`${width}×${height}：选择、四游戏全视口、暂停继续、退出切换与截图`, async ({
    page,
  }) => {
    test.setTimeout(120000);
    await page.setViewportSize({ width, height });
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("/");
    await page.getByRole("button", { name: "查看浅蹲跳一跳" }).click();
    await expect(page.getByRole("button", { name: "进入游戏", exact: true })).toBeEnabled();
    const preview = await page.getByTestId("selection-preview").boundingBox();
    expect(preview!.width / preview!.height).toBeCloseTo(1290 / 205, 1);
    const styles = await page
      .locator(".selection-preview img:not([hidden])")
      .evaluate((el) => ({
        fit: getComputedStyle(el).objectFit,
        position: getComputedStyle(el).objectPosition,
      }));
    expect(styles).toEqual({ fit: "cover", position: "0% 50%" });
    expect(
      await page
        .locator("main")
        .evaluate((el) => el.scrollWidth <= el.clientWidth),
    ).toBe(true);
    await page.screenshot({
      path: `docs/screenshots/final-polish/selection-${width}.png`,
    });
    for (let index = 0; index < games.length; index++) {
      await demo(page, index);
      await page.waitForTimeout(600);
      const viewport = await page.locator(".game-viewport").boundingBox();
      expect(viewport!.x).toBe(0);
      expect(viewport!.width).toBe(width);
      expect(viewport!.height).toBe(height - (width <= 800 ? 60 : 72));
      await page.getByRole("button", { name: "暂停游戏", exact: true }).click();
      await expect(page.getByTestId("session-dialog")).toBeVisible();
      const modal = await page.getByTestId("session-dialog").boundingBox();
      expect(modal!.x).toBeGreaterThanOrEqual(0);
      expect(modal!.y).toBeGreaterThanOrEqual(0);
      await page.getByRole("button", { name: "继续游戏", exact: true }).click();
      await expect(page.getByTestId("session-dialog")).not.toBeVisible();
      await page.waitForTimeout(1200);
      if (index === 1) {
        const ratio = await page.locator(".wing-svg").evaluate((el: SVGSVGElement) => { const m = el.getScreenCTM()!; return m.a / m.d; });
        expect(ratio).toBeCloseTo(1, 3);
      }
      await page.screenshot({
        path: `docs/screenshots/final-polish/${games[index].id}-${width}.png`,
      });
      await leave(page);
      await expect(page.getByTestId(games[index].test)).toHaveCount(0);
      expect(
        await page
          .locator("main")
          .evaluate((el) => el.scrollWidth <= el.clientWidth),
      ).toBe(true);
    }
    expect(errors).toEqual([]);
  });
}

test("键盘、减少动态效果与弹窗焦点", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await page.keyboard.press("ArrowRight");
  await expect(page.getByTestId("selection-preview")).toHaveAttribute(
    "data-card-id",
    "winglight",
  );
  await page.keyboard.press("ArrowLeft");
  await expect(page.getByTestId("selection-preview")).toHaveAttribute(
    "data-card-id",
    "yukeeRun",
  );
  await page.keyboard.press("Enter");
  await page.getByRole("button", { name: /键盘演示/ }).click();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("session-dialog")).toBeVisible();
  expect(
    await page
      .getByTestId("session-dialog")
      .evaluate((el) => el.contains(document.activeElement)),
  ).toBe(true);
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("session-dialog")).not.toBeVisible();
  await leave(page);
});

test("G01：跳跃输入、自然关卡结束、结算与重开", async ({ page }) => {
  await page.goto("/");
  await demo(page, 0);
  await page.keyboard.press("ArrowUp");
  await expect(page.locator('.head-hud .on')).toHaveText("↑");
  await expect(page.locator("main")).toHaveAttribute("data-phase", "reward", {
    timeout: 55000,
  });
  await expect(page.getByText("键盘演示完成 · 非真人体感记录")).toBeVisible();
  await page.screenshot({
    path: "docs/screenshots/final-polish/run-result.png",
  });
  await page.getByRole("button", { name: "再玩一次", exact: true }).click();
  await expect(page.getByTestId("calibration-view")).toBeVisible();
});

test("G02：五次展开保持回位，结算与返回选择", async ({ page }) => {
  await page.goto("/");
  await demo(page, 1);
  for (let i = 1; i <= 5; i++) {
    await page.keyboard.down("Space");
    await expect(page.getByTestId("winglight")).toHaveAttribute("data-charged", "1");
    await page.keyboard.up("Space");
    await expect(page.getByTestId("winglight")).toHaveAttribute(
      "data-reps",
      String(i),
    );
    await page.waitForTimeout(500);
  }
  await expect(page.getByTestId("wing-complete")).toBeVisible();
  await page.waitForTimeout(1600);
  await page.screenshot({
    path: "docs/screenshots/final-polish/wing-result.png",
  });
  await page.getByTestId("wing-back").click();
  await expect(page.getByTestId("game-selection")).toBeVisible();
});

test("G03：六次左右交替，回中后才能再计数", async ({ page }) => {
  await page.goto("/");
  await demo(page, 2);
  const game = page.getByTestId("lean-surf");
  for (let i = 1; i <= 6; i++) {
    const side = await game.getAttribute("data-target");
    const key = side === "-1" ? "ArrowLeft" : "ArrowRight";
    await page.keyboard.down(key);
    await expect(game).toHaveAttribute("data-reps", String(i));
    await page.waitForTimeout(350);
    await expect(game).toHaveAttribute("data-reps", String(i));
    await page.keyboard.up(key);
    if (i < 6) await expect(game).toHaveAttribute("data-returning", "0");
  }
  await expect(page.getByTestId("lean-complete")).toBeVisible();
  await page.waitForTimeout(500);
  await page.screenshot({
    path: "docs/screenshots/final-polish/lean-result.png",
  });
  await page
    .getByRole("button", { name: "返回游戏选择", exact: true })
    .last()
    .click();
  await expect(page.getByTestId("game-selection")).toBeVisible();
});

test("G05：五连跳通关、得分、结算、暂停清蓄力、失败与重开", async ({
  page,
}) => {
  await page.goto("/");
  await demo(page, 3);
  const game = page.getByTestId("squat-jump");
  await page.keyboard.down("Space");
  await page.waitForTimeout(200);
  await page.keyboard.press("Escape");
  await page.keyboard.up("Space");
  await expect(page.getByTestId("session-dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await page.waitForTimeout(200);
  await expect(game).toHaveAttribute("data-jumps", "0");
  for (let i = 1; i <= 5; i++) {
    await jump(page);
    await expect(game).toHaveAttribute("data-jumps", String(i));
  }
  await expect(page.getByTestId("squat-clear")).toBeVisible();
  await page.waitForTimeout(500);
  await page.screenshot({
    path: "docs/screenshots/final-polish/squat-result.png",
  });
  await page.getByTestId("squat-restart").click();
  await expect(game).toHaveAttribute("data-state", "ready");
  await jump(page, 1.8);
  await expect(page.getByTestId("squat-fail")).toBeVisible();
  await page.screenshot({
    path: "docs/screenshots/final-polish/squat-fail.png",
  });
  await page.getByRole("button", { name: "结束活动", exact: true }).click();
  await expect(page.getByTestId("game-selection")).toBeVisible();
});
