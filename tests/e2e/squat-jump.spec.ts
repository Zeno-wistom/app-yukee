import { test, expect, chromium, type Page } from "@playwright/test";

async function withPage(run: (page: Page) => Promise<void>) {
  const browser = await chromium.launch({
    channel: "chrome",
    args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"],
  });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, permissions: ["camera"] });
    await run(page);
  } finally {
    await browser.close();
  }
}
async function enter(page: Page) {
  await page.goto("http://127.0.0.1:5173/");
  await page.getByRole("button", { name: "开始体验", exact: true }).click();
  await expect(page.locator("main")).toHaveClass(/arrived/, { timeout: 20000 });
  await page.getByTestId("lamp-home").getByRole("button", { name: "开始活动", exact: true }).click();
  for (let i = 0; i < 4; i++) {
    await page.getByRole("button", { name: "下一个活动", exact: true }).click();
    await page.waitForTimeout(700);
  }
  await expect(page.locator(".lamp-card.is-current")).toHaveAttribute("data-card-id", "squatJump");
  await page.getByRole("button", { name: "开始这个活动", exact: true }).click();
  await expect(page.getByTestId("squat-calibration")).toBeVisible();
}
async function demo(page: Page) {
  await enter(page);
  await page.getByRole("button", { name: /keyboard_demo/ }).click();
  await expect(page.getByTestId("squat-jump")).toBeVisible();
  await expect(page.getByTestId("squat-jump")).toHaveAttribute("data-mode", "keyboard_demo");
  await page.waitForTimeout(800);
}
/** 按住空格的时长 = 到目标中心所需蓄力 × factor（读取游戏公开的距离，不读取判定结果） */
async function jump(page: Page, factor: number) {
  const g = page.getByTestId("squat-jump");
  const need = parseFloat((await g.getAttribute("data-need-charge")) ?? "0");
  await page.keyboard.down("Space");
  await page.waitForTimeout(Math.max(80, need * factor * 1000));
  await page.keyboard.up("Space");
  await page.waitForTimeout(1500);
}

test("G05 键盘演示：五连跳通关、得分、结算后回到专注", async () => {
  test.setTimeout(120000);
  await withPage(async (page) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await demo(page);
    const g = page.getByTestId("squat-jump");
    await g.screenshot({ path: "docs/screenshots/g05-01-start.png" });
    for (let i = 1; i <= 5; i++) {
      await jump(page, 1);
      await expect(g).toHaveAttribute("data-jumps", String(i));
      expect(["hit", "perfect"]).toContain(await g.getAttribute("data-last"));
      if (i === 2) await g.screenshot({ path: "docs/screenshots/g05-02-mid.png" });
    }
    await expect(page.getByTestId("squat-clear")).toBeVisible();
    expect(Number(await g.getAttribute("data-score"))).toBeGreaterThanOrEqual(5);
    await expect(page.getByTestId("squat-count")).toHaveText("5/5");
    await g.screenshot({ path: "docs/screenshots/g05-03-clear.png" });
    await page.getByRole("button", { name: "回到专注", exact: true }).click();
    await expect(page.locator("[data-phase]").first()).toHaveAttribute("data-phase", "focus");
    expect(errors).toEqual([]);
  });
});

test("G05 跳得不够 / 跳过头都会掉落并显示结算，可以重开", async () => {
  test.setTimeout(120000);
  await withPage(async (page) => {
    await demo(page);
    const g = page.getByTestId("squat-jump");
    // 过远
    await jump(page, 1.7);
    await expect(page.getByTestId("squat-fail")).toBeVisible();
    expect(["long", "edgeLong"]).toContain(await g.getAttribute("data-last"));
    await g.screenshot({ path: "docs/screenshots/g05-04-fail.png" });
    await page.getByTestId("squat-restart").click();
    await expect(g).toHaveAttribute("data-state", "ready");
    await expect(g).toHaveAttribute("data-jumps", "0");
    // 不够：落在两台之间的空隙
    const gapCharge = parseFloat((await g.getAttribute("data-gap-charge")) ?? "0");
    expect(gapCharge).toBeGreaterThan(0);
    await page.keyboard.down("Space");
    await page.waitForTimeout(gapCharge * 1000);
    await page.keyboard.up("Space");
    await page.waitForTimeout(1600);
    expect(["short", "edgeShort"]).toContain(await g.getAttribute("data-last"));
    await expect(page.getByTestId("squat-fail")).toBeVisible();
    // Enter 也可以重开（结算出现 0.6 秒后才接受，防止误触）
    await page.waitForTimeout(700);
    await page.keyboard.press("Enter");
    await expect(g).toHaveAttribute("data-state", "ready");
  });
});

test("G05 Esc 暂停：蓄力被清空、不会起跳；继续后正常游戏", async () => {
  test.setTimeout(90000);
  await withPage(async (page) => {
    await demo(page);
    const g = page.getByTestId("squat-jump");
    await page.keyboard.down("Space");
    await page.waitForTimeout(300);
    await page.keyboard.press("Escape");
    await expect(page.locator(".display-overlay")).toBeVisible();
    await page.keyboard.up("Space");
    await page.waitForTimeout(600);
    await expect(g).toHaveAttribute("data-jumps", "0");
    await expect(g).not.toHaveAttribute("data-state", "flying");
    await page.keyboard.press("Escape");
    await expect(page.locator(".display-overlay")).toHaveCount(0);
    await jump(page, 1);
    await expect(g).toHaveAttribute("data-jumps", "1");
  });
});

test("G05 摄像头校准：画面里没有人时停在「站直」，不会自动通过", async () => {
  test.setTimeout(60000);
  await withPage(async (page) => {
    await enter(page);
    await page.waitForTimeout(4000);
    await expect(page.getByTestId("squat-calibration")).toHaveAttribute("data-stage", "stand");
    await page.getByTestId("squat-calibration").screenshot({ path: "docs/screenshots/g05-00-calibration.png" });
  });
});
