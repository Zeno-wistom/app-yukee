import { test, expect, chromium, type Page } from "@playwright/test";

async function withPage(run: (page: Page) => Promise<void>) {
  const browser = await chromium.launch({
    channel: "chrome",
    args: [
      "--use-fake-device-for-media-stream",
      "--use-fake-ui-for-media-stream",
    ],
  });
  try {
    const page = await browser.newPage({
      viewport: { width: 1440, height: 900 },
      permissions: ["camera"],
    });
    await run(page);
  } finally {
    await browser.close();
  }
}
async function enter(page: Page) {
  await page.goto("http://127.0.0.1:5174/");
  await page.getByRole("button", { name: "开始体验", exact: true }).click();
  await expect(page.locator("main")).toHaveClass(/arrived/);
  await page
    .getByTestId("lamp-home")
    .getByRole("button", { name: "开始活动", exact: true })
    .click();
  for (let i = 0; i < 2; i++) {
    await page.getByRole("button", { name: "下一个活动", exact: true }).click();
    await page.waitForTimeout(700);
  }
  await expect(page.locator(".lamp-card.is-current")).toHaveAttribute(
    "data-card-id",
    "leanSurf",
  );
  await page.getByRole("button", { name: "开始这个活动", exact: true }).click();
  await expect(page.getByTestId("lean-calibration")).toBeVisible();
}
async function demo(page: Page) {
  await enter(page);
  await page
    .getByRole("button", { name: "键盘演示 · 非人体识别", exact: true })
    .click();
  await expect(page.getByTestId("lean-surf")).toBeVisible();
}

test("G03 键盘演示：六次左右交替、回中集光、截图、结果退出", async () => {
  test.setTimeout(110000);
  await withPage(async (page) => {
    const errors: string[] = [],
      external: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.route("**/*", (route) => {
      const u = new URL(route.request().url());
      if (u.hostname === "127.0.0.1") return route.continue();
      external.push(u.href);
      return route.abort();
    });
    await demo(page);
    await page.waitForTimeout(4400);
    await page
      .getByTestId("lean-surf")
      .screenshot({ path: "docs/screenshots/g03-01-ocean.png" });
    for (let i = 0; i < 6; i++) {
      const direction = i % 2 ? "ArrowRight" : "ArrowLeft";
      await page.keyboard.down(direction);
      await page.waitForTimeout(1300);
      await expect(page.getByTestId("lean-surf")).toHaveAttribute(
        "data-arrived",
        "1",
      );
      await expect(page.getByTestId("lean-surf")).toHaveAttribute(
        "data-reps",
        String(i),
      );
      if (i === 0)
        await page
          .getByTestId("lean-surf")
          .screenshot({ path: "docs/screenshots/g03-02-arrived.png" });
      await page.keyboard.up(direction);
      await page.waitForTimeout(1100);
      await expect(page.getByTestId("lean-surf")).toHaveAttribute(
        "data-reps",
        String(i + 1),
      );
      if (i < 5) await page.waitForTimeout(3800);
    }
    await expect(page.getByTestId("lean-complete")).toBeVisible();
    await expect(page.locator(".lean-stars .lit")).toHaveCount(6);
    await expect(page.getByTestId("lean-complete")).toContainText(
      "键盘演示数据",
    );
    await page
      .getByTestId("lean-surf")
      .screenshot({ path: "docs/screenshots/g03-03-complete.png" });
    await page.getByRole("button", { name: "回到专注", exact: true }).click();
    await expect(page.locator("[data-phase]")).toHaveAttribute(
      "data-phase",
      "focus",
    );
    expect(errors).toEqual([]);
    expect(external).toEqual([]);
  });
});

test("G03 暂停冻结、退出关闭 Pose；G01/G02 入口保留", async () => {
  test.setTimeout(65000);
  await withPage(async (page) => {
    await demo(page);
    await page.waitForTimeout(4500);
    await page.keyboard.down("ArrowLeft");
    await page.waitForTimeout(500);
    await page.keyboard.press("Escape");
    await expect(page.locator(".display-overlay")).toBeVisible();
    await page.waitForTimeout(150);
    const frozen = await page.getByTestId("lean-time").innerText();
    await page.waitForTimeout(1000);
    expect(await page.getByTestId("lean-time").innerText()).toBe(frozen);
    await page.keyboard.up("ArrowLeft");
    await page.keyboard.press("Escape");
    await page.waitForTimeout(4400);
    await expect(page.getByTestId("lean-surf")).toHaveAttribute(
      "data-reps",
      "0",
    );
    await page.getByRole("button", { name: "退出冲浪", exact: true }).click();
    await page.getByRole("button", { name: "退出活动", exact: true }).click();
    await expect(page.getByTestId("lamp-home")).toBeVisible();
    for (const i of [0, 1]) {
      await page
        .getByTestId("lamp-home")
        .getByRole("button", { name: "开始活动", exact: true })
        .click();
      if (i) {
        await page
          .getByRole("button", { name: "下一个活动", exact: true })
          .click();
        await page.waitForTimeout(700);
      }
      await page
        .getByRole("button", { name: "开始这个活动", exact: true })
        .click();
      await expect(
        page.getByTestId(i ? "wing-calibration" : "calibration-view"),
      ).toBeVisible();
      if (i) {
        await page.keyboard.press("Escape");
        await page
          .getByRole("button", { name: "保存并退出", exact: true })
          .click();
      } else {
        await page
          .getByRole("button", { name: "返回工作", exact: true })
          .click();
        await page
          .getByRole("button", { name: "退出活动", exact: true })
          .click();
      }
    }
  });
});

// 明确为合成 Pose 帧注入：验证真实页面的校准/输入/生命周期，绝非人体识别实测。
async function injectPose(page: Page) {
  await page.evaluate(async () => {
    const resource = performance
      .getEntriesByType("resource")
      .find((r) => new URL(r.name).pathname === "/src/vision/CameraVision.ts")!;
    const { cameraVision: c } = await import(/* @vite-ignore */ resource.name);
    const w = window as any;
    w.leanTest = { c, a: 0, missing: false, timer: 0 };
    // 保留真实单视频流，替换推理输出以免合成摄像头空帧与注入竞争。
    c.tickPose = () => {};
    w.leanTest.timer = setInterval(() => {
      const s = w.leanTest;
      if (s.missing) {
        c.emitPose(null);
        return;
      }
      const dx = (-Math.tan(s.a) * (0.4 * 480)) / 640;
      const shift = s.shift || 0;
      const landmarks = Array.from({ length: 33 }, () => ({
        x: 0.5,
        y: 0.2,
        visibility: 1,
      }));
      landmarks[11] = { x: 0.4 + dx + shift, y: 0.3, visibility: 1 };
      landmarks[12] = { x: 0.6 + dx + shift, y: 0.3, visibility: 1 };
      landmarks[23] = { x: 0.43 + shift, y: 0.7, visibility: 1 };
      landmarks[24] = {
        x: 0.57 + shift,
        y: 0.7,
        visibility: s.hipHidden ? 0.2 : 1,
      };
      landmarks[0].x = s.noseX ?? 0.5;
      c.emitPose({
        landmarks,
        videoWidth: 640,
        videoHeight: 480,
        at: performance.now(),
      });
    }, 50);
  });
}
async function angle(page: Page, a: number) {
  await page.evaluate((a) => {
    (window as any).leanTest.a = a;
  }, a);
}
async function cameraGame(page: Page) {
  await enter(page);
  await injectPose(page);
  await expect(page.getByTestId("lean-calibration")).toHaveAttribute(
    "data-stage",
    "left",
    { timeout: 10000 },
  );
  await angle(page, -0.16);
  await expect(page.getByTestId("lean-calibration")).toHaveAttribute(
    "data-stage",
    "right",
  );
  await angle(page, 0.18);
  await expect(page.getByTestId("lean-calibration")).toHaveAttribute(
    "data-stage",
    "ready",
  );
  await angle(page, 0);
  await expect(page.getByTestId("lean-surf")).toHaveAttribute(
    "data-mode",
    "camera",
    { timeout: 7000 },
  );
}

test("G03 合成 Pose：校准、髋遮挡暂停、断流恢复准备、单流订阅释放", async () => {
  test.setTimeout(70000);
  await withPage(async (page) => {
    await cameraGame(page);
    await page.waitForTimeout(4500);
    await angle(page, -0.16);
    await expect(page.getByTestId("lean-surf")).toHaveAttribute(
      "data-arrived",
      "1",
    );
    await page.evaluate(() => {
      (window as any).leanTest.hipHidden = true;
    });
    await expect(page.getByTestId("lean-surf")).toHaveAttribute(
      "data-tracking",
      "lost",
    );
    const frozen = await page.getByTestId("lean-time").innerText();
    await page.waitForTimeout(600);
    expect(await page.getByTestId("lean-time").innerText()).toBe(frozen);
    await angle(page, 0);
    await page.evaluate(() => {
      (window as any).leanTest.hipHidden = false;
    });
    await page.waitForTimeout(2500);
    await expect(page.getByTestId("lean-surf")).toHaveAttribute(
      "data-reps",
      "0",
    );
    await page.waitForTimeout(2200);
    await expect(page.getByTestId("lean-surf")).toHaveAttribute(
      "data-tracking",
      "ok",
    );
    await page.evaluate(() => {
      const s = (window as any).leanTest;
      s.missing = true;
      s.c.stop();
    });
    await expect(page.getByTestId("lean-surf")).toHaveAttribute(
      "data-tracking",
      "lost",
    );
    await page
      .getByRole("button", { name: "重新连接摄像头", exact: true })
      .click();
    await page.evaluate(() => {
      (window as any).leanTest.missing = false;
    });
    await page.waitForTimeout(4600);
    await expect(page.getByTestId("lean-surf")).toHaveAttribute(
      "data-tracking",
      "ok",
    );
    expect(
      await page.evaluate(() => {
        const c = (window as any).leanTest.c;
        return c.getPoseDiagnostics().subscribers;
      }),
    ).toBe(1);
    await page.getByRole("button", { name: "退出冲浪", exact: true }).click();
    await page.getByRole("button", { name: "退出活动", exact: true }).click();
    expect(
      await page.evaluate(() => {
        const c = (window as any).leanTest.c;
        return c.getPoseDiagnostics().poseActive;
      }),
    ).toBe(false);
  });
});

test("G03 45 秒未完成提供结束或继续，不出现成功", async () => {
  test.setTimeout(80000);
  await withPage(async (page) => {
    await demo(page);
    await expect(page.getByTestId("lean-soft-limit")).toBeVisible({
      timeout: 55000,
    });
    await expect(page.getByTestId("lean-complete")).toHaveCount(0);
    await expect(page.getByTestId("lean-surf")).toHaveAttribute(
      "data-reps",
      "0",
    );
    await page.getByRole("button", { name: "结束本次", exact: true }).click();
    await expect(page.getByTestId("lamp-home")).toBeVisible();
  });
});

// 合成输入防误触回归；本用例不构成真人验收。
test("G03 合成 Pose：只摆头与整个人平移不集光，轻微个人侧倾可接住", async () => {
  test.setTimeout(50000);
  await withPage(async (page) => {
    await cameraGame(page);
    for (const shift of [-0.12, 0.12, -0.1, 0.1]) {
      await page.evaluate((shift) => {
        const s = (window as any).leanTest;
        s.shift = shift;
        s.noseX = shift < 0 ? 0.15 : 0.85;
      }, shift);
      await page.waitForTimeout(700);
      await expect(page.getByTestId("lean-surf")).toHaveAttribute(
        "data-arrived",
        "0",
      );
      await expect(page.getByTestId("lean-surf")).toHaveAttribute(
        "data-reps",
        "0",
      );
    }
    await page.evaluate(() => {
      (window as any).leanTest.shift = 0;
    });
    // -0.11rad is 69% of the calibrated comfortable -0.16rad, sufficient with no large motion.
    await angle(page, -0.11);
    await expect(page.getByTestId("lean-surf")).toHaveAttribute(
      "data-arrived",
      "1",
    );
    await angle(page, 0);
    await expect(page.getByTestId("lean-surf")).toHaveAttribute(
      "data-reps",
      "1",
    );
  });
});
