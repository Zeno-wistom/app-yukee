import { test, expect, chromium, type Page } from "@playwright/test";

/**
 * G02「展翼接光」端到端用例（开发者演示模式）。
 *
 * 说明：本用例只验证 UI / 状态机 / 计次 / 暂停恢复 / 退出清理，
 * 真实摄像头动作识别无法在自动化环境复现，属于「待真人验证」范围。
 * 演示模式带明显「键盘演示」标识，结果不会被当成摄像头识别通过。
 *
 * 每个用例单独启动浏览器：Chrome 的合成摄像头在同一浏览器进程内
 * 只稳定提供一次，复用会得到 NotFoundError，与产品逻辑无关。
 */

async function withPage(run: (page: Page) => Promise<void>) {
  const browser = await chromium.launch({
    channel: "chrome",
    args: [
      "--use-fake-device-for-media-stream",
      "--use-fake-ui-for-media-stream",
    ],
  });
  try {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      permissions: ["camera"],
    });
    await run(await context.newPage());
  } finally {
    await browser.close();
  }
}

async function enterWinglight(page: Page) {
  await page.goto("http://127.0.0.1:5174/");
  await page.getByRole("button", { name: "开始体验" }).click();
  await expect(page.locator("main")).toHaveClass(/arrived/);
  await page
    .getByTestId("lamp-home")
    .getByRole("button", { name: "开始活动" })
    .click();
  await expect(page.getByTestId("lamp-selection")).toBeVisible();
  // 第 2 张卡即 G02
  await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(700);
  await page.keyboard.press("Enter");
  await expect(page.locator("[data-phase]")).toHaveAttribute(
    "data-phase",
    "wingCalibration",
  );
}

async function openDemo(page: Page) {
  await expect(page.getByTestId("wing-calibration")).toBeVisible({
    timeout: 15000,
  });
  await page.getByRole("button", { name: /开发者演示/ }).click();
  await expect(page.locator("[data-phase]")).toHaveAttribute(
    "data-phase",
    "winglight",
  );
  await expect(page.getByTestId("winglight")).toHaveAttribute(
    "data-mode",
    "demo",
  );
  // 等首帧渲染与键盘监听就绪，避免节奏抖动影响后续按键
  await page.waitForTimeout(350);
}

/** 演示模式下一次完整「展开 → 保持 → 回位」 */
async function spreadOnce(page: Page) {
  await page.keyboard.down("Space");
  await page.waitForTimeout(1300);
  await page.keyboard.up("Space");
  await page.waitForTimeout(1400);
}

test("G02：从挂灯入口完成校准 → 五次接光 → 返回工作态", async () => {
  test.setTimeout(150_000);
  await withPage(async (page) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    // 离线可用性：除本机 dev server 外不允许任何外部请求（模型必须本地加载）
    const external: string[] = [];
    await page.route("**/*", (route) => {
      const url = new URL(route.request().url());
      if (url.hostname === "127.0.0.1") return route.continue();
      external.push(url.href);
      return route.abort();
    });

    await enterWinglight(page);
    await openDemo(page);
    await expect(page.getByTestId("winglight")).toHaveAttribute(
      "data-reps",
      "0",
    );

    for (let rep = 1; rep <= 5; rep++) {
      await spreadOnce(page);
      await expect(page.getByTestId("winglight")).toHaveAttribute(
        "data-reps",
        String(rep),
      );
    }

    await expect(page.getByTestId("wing-complete")).toBeVisible();
    await expect(page.getByTestId("wing-final-reps")).toHaveText("5/5");
    await expect(page.locator(".wing-demo-note")).toContainText("键盘演示");

    await page.getByTestId("wing-back").click();
    await expect(page.locator("[data-phase]")).toHaveAttribute(
      "data-phase",
      "focus",
    );
    expect(errors).toEqual([]);
    expect(external).toEqual([]);
  });
});

test("G02：Esc 暂停冻结计时与计数，退出后可以再次进入", async () => {
  test.setTimeout(150_000);
  await withPage(async (page) => {
    await enterWinglight(page);
    await openDemo(page);

    // 先完成一次，再在半程暂停
    await spreadOnce(page);
    await expect(page.getByTestId("winglight")).toHaveAttribute(
      "data-reps",
      "1",
    );

    await page.keyboard.down("Space");
    await page.waitForTimeout(500);
    await page.keyboard.press("Escape");
    await expect(page.locator(".display-overlay")).toBeVisible();
    const frozen = await page.getByTestId("wing-time").innerText();
    await page.waitForTimeout(1200);
    expect(await page.getByTestId("wing-time").innerText()).toBe(frozen);
    await page.keyboard.up("Space");

    // 再次 Esc 继续：暂停期间按住的空格不会造成瞬间计分
    await page.keyboard.press("Escape");
    await expect(page.locator(".display-overlay")).toBeHidden();
    await page.waitForTimeout(600);
    await expect(page.getByTestId("winglight")).toHaveAttribute(
      "data-reps",
      "1",
    );

    // 退出 → 回到工作态，不记录完成
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "保存并退出" }).click();
    await expect(page.locator("[data-phase]")).toHaveAttribute(
      "data-phase",
      "focus",
    );

    // 再次进入 G02：校准页仍能挂载并可继续游戏（摄像头与推理任务已清理）
    await page
      .getByTestId("lamp-home")
      .getByRole("button", { name: "开始活动" })
      .click();
    await expect(page.getByTestId("lamp-selection")).toBeVisible();
    await page.keyboard.press("ArrowRight");
    await page.waitForTimeout(700);
    await page.keyboard.press("Enter");
    await openDemo(page);
    await spreadOnce(page);
    await expect(page.getByTestId("winglight")).toHaveAttribute(
      "data-reps",
      "1",
    );
  });
});
