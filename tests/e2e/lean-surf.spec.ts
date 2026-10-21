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
  await page.goto("http://127.0.0.1:5176/");
  await page.getByRole("button", { name: "开始体验", exact: true }).click();
  await expect(page.locator("main")).toHaveClass(/arrived/, { timeout: 20000 });
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

const shot = (page: Page, name: string) =>
  page
    .getByTestId("lean-surf")
    .screenshot({ path: `docs/screenshots/${name}.png` });

test("G03 星海冲浪 键盘演示：六次左右交替、即时接星、截图、结果退出", async () => {
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
    await page.goto("http://127.0.0.1:5176/");
    await page.getByRole("button", { name: "开始体验", exact: true }).click();
    await expect(page.locator("main")).toHaveClass(/arrived/, {
      timeout: 20000,
    });
    await page
      .getByTestId("lamp-home")
      .getByRole("button", { name: "开始活动", exact: true })
      .click();
    await page.getByRole("button", { name: "下一个活动", exact: true }).click();
    await page.waitForTimeout(800);
    await page
      .locator(".lamp-card.is-current")
      .screenshot({ path: "docs/screenshots/g02-00-card.png" });
    await page.getByRole("button", { name: "下一个活动", exact: true }).click();
    await page.waitForTimeout(800);
    const card = page.locator(".lamp-card.is-current");
    await expect(card).toHaveAttribute("data-card-id", "leanSurf");
    await expect(card).toContainText("星海冲浪");
    await expect(card).toHaveClass(/is-full-bleed/);
    // 预览铺满整卡（不是左侧 70% 局部图），且图片按卡片比例构图（不拉伸）
    const fit = await card.evaluate((el) => {
      const r = el.getBoundingClientRect();
      const img = el.querySelector(
        ".lamp-card-preview img",
      ) as HTMLImageElement;
      const q = img.getBoundingClientRect();
      return {
        cover: q.width / r.width,
        cardRatio: r.width / r.height,
        imgRatio: img.naturalWidth / img.naturalHeight,
      };
    });
    expect(fit.cover).toBeGreaterThan(0.98);
    expect(Math.abs(fit.cardRatio - fit.imgRatio) / fit.cardRatio).toBeLessThan(
      0.06,
    );
    await card.screenshot({ path: "docs/screenshots/g03-00-card.png" });
    await page
      .getByRole("button", { name: "开始这个活动", exact: true })
      .click();
    await expect(page.getByTestId("lean-calibration")).toBeVisible();
    await page.waitForTimeout(1500);
    await page
      .getByTestId("lean-calibration")
      .screenshot({ path: "docs/screenshots/g03-00-calibration.png" });
    await page
      .getByRole("button", { name: "键盘演示 · 非人体识别", exact: true })
      .click();
    const game = page.getByTestId("lean-surf");
    await expect(game).toBeVisible();
    await expect(page.locator(".lean-title")).toContainText("星海冲浪");
    await page.waitForTimeout(1600);
    await shot(page, "g03-01-ocean");
    for (let i = 0; i < 6; i++) {
      const direction = i % 2 ? "ArrowRight" : "ArrowLeft";
      await expect(game).toHaveAttribute("data-target", i % 2 ? "1" : "-1");
      await page.keyboard.down(direction);
      // 不再需要保持 600ms + 回中 400ms + 巡航 4.2s：约 0.5 秒内接住
      await expect(game).toHaveAttribute("data-reps", String(i + 1), {
        timeout: 2500,
      });
      await expect(game).toHaveAttribute(
        "data-chapter",
        String(Math.min(3, Math.floor((i + 1) / 2) + 1)),
      );
      if (i === 0 || i === 2 || i === 4) {
        await page.waitForTimeout(900);
        await shot(page, `g03-v4-stage-${Math.floor(i / 2) + 1}`);
      }
      if (i === 0) await shot(page, "g03-02-catch");
      if (i === 2) {
        await page.waitForTimeout(350);
        await shot(page, "g03-03-absorb");
      }
      if (i < 5) {
        await expect(game).toHaveAttribute("data-returning", "1");
        // 保持侧倾不会继续得分：必须回中
        await page.waitForTimeout(600);
        await expect(game).toHaveAttribute("data-reps", String(i + 1));
      }
      await page.keyboard.up(direction);
      if (i < 5)
        await expect(game).toHaveAttribute("data-returning", "0", {
          timeout: 2500,
        });
      if (i === 3) {
        await page.waitForTimeout(500);
        await shot(page, "g03-04-next-star");
      }
      await page.waitForTimeout(700);
    }
    await expect(page.getByTestId("lean-complete")).toBeVisible();
    await page.waitForTimeout(1800);
    await shot(page, "g03-v4-complete");
    await expect(page.locator(".lean-stars .lit")).toHaveCount(6);
    await expect(page.getByTestId("lean-complete")).toContainText(
      "键盘演示数据",
    );
    await page.waitForTimeout(2000);
    await shot(page, "g03-05-complete");
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
    await page.waitForTimeout(1200);
    // 刚开始侧倾（尚未达到 220ms 保持）就暂停：暂停会清空保持，不允许偷偷计分
    await page.keyboard.down("ArrowLeft");
    await page.waitForTimeout(60);
    await page.keyboard.press("Escape");
    await expect(page.locator(".display-overlay")).toBeVisible();
    await page.waitForTimeout(150);
    const frozen = await page.getByTestId("lean-time").innerText();
    await page.waitForTimeout(1000);
    expect(await page.getByTestId("lean-time").innerText()).toBe(frozen);
    await page.keyboard.up("ArrowLeft");
    await page.keyboard.press("Escape");
    await page.waitForTimeout(1500);
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
// 合成一位坐姿用户：以髋为轴侧倾 deg 度，肩线随躯干一起倾斜（与单元测试同一几何）。
async function injectPose(page: Page) {
  await page.evaluate(async () => {
    const resource = performance
      .getEntriesByType("resource")
      .find((r) => new URL(r.name).pathname === "/src/vision/CameraVision.ts")!;
    const { cameraVision: c } = await import(/* @vite-ignore */ resource.name);
    const w = window as any;
    w.leanTest = {
      c,
      deg: 0,
      shift: 0,
      noseX: 0.5,
      missing: false,
      hipHidden: false,
      timer: 0,
    };
    // 保留真实单视频流，替换推理输出以免合成摄像头空帧与注入竞争。
    c.tickPose = () => {};
    w.leanTest.timer = setInterval(() => {
      const s = w.leanTest;
      if (s.missing) {
        c.emitPose(null);
        return;
      }
      const W = 640,
        H = 480,
        a = (s.deg * Math.PI) / 180;
      const hip = { x: 320 + s.shift * W, y: 420 };
      const sc = { x: hip.x - Math.sin(a) * 230, y: hip.y - Math.cos(a) * 230 };
      const ux = Math.cos(a),
        uy = Math.sin(a);
      const landmarks = Array.from({ length: 33 }, () => ({
        x: 0.5,
        y: 0.2,
        visibility: 0.2,
      }));
      landmarks[0] = { x: s.noseX, y: (sc.y - 90) / H, visibility: 1 };
      landmarks[11] = {
        x: (sc.x + ux * 80) / W,
        y: (sc.y - uy * 80) / H,
        visibility: 0.95,
      };
      landmarks[12] = {
        x: (sc.x - ux * 80) / W,
        y: (sc.y + uy * 80) / H,
        visibility: 0.95,
      };
      landmarks[23] = {
        x: (hip.x + 50) / W,
        y: hip.y / H,
        visibility: s.hipHidden ? 0.1 : 0.9,
      };
      landmarks[24] = {
        x: (hip.x - 50) / W,
        y: hip.y / H,
        visibility: s.hipHidden ? 0.1 : 0.9,
      };
      c.emitPose({
        landmarks,
        videoWidth: W,
        videoHeight: H,
        at: performance.now(),
      });
    }, 50);
  });
}
async function set(page: Page, patch: Record<string, unknown>) {
  await page.evaluate((patch) => {
    Object.assign((window as any).leanTest, patch);
  }, patch);
}
async function cameraGame(page: Page, hipHidden = false) {
  await enter(page);
  await injectPose(page);
  await set(page, { hipHidden });
  // 一步校准：看到双肩、自然坐好约 1 秒即进入游戏（无左右校准、无 3 秒倒计时）
  await expect(page.getByTestId("lean-surf")).toHaveAttribute(
    "data-mode",
    "camera",
    { timeout: 6000 },
  );
}

test("G03 合成 Pose：一步校准、3° 小幅侧倾即可接星、甩头/平移不计分", async () => {
  test.setTimeout(70000);
  await withPage(async (page) => {
    await cameraGame(page);
    const game = page.getByTestId("lean-surf");
    // 静止 3 秒：0 分
    await page.waitForTimeout(3000);
    await expect(game).toHaveAttribute("data-reps", "0");
    // 只动头（鼻子大幅横移）+ 整体平移：0 分
    for (const [noseX, shift] of [
      [0.2, 0.15],
      [0.8, -0.15],
      [0.3, 0.1],
      [0.7, -0.1],
    ]) {
      await set(page, { noseX, shift });
      await page.waitForTimeout(500);
    }
    await set(page, { noseX: 0.5, shift: 0 });
    await page.waitForTimeout(400);
    await expect(game).toHaveAttribute("data-reps", "0");
    // 约 3° 的轻微侧倾就能接住
    await set(page, { deg: -3 });
    await expect(game).toHaveAttribute("data-reps", "1", { timeout: 2500 });
    await set(page, { deg: 0 });
    await expect(game).toHaveAttribute("data-returning", "0", {
      timeout: 2500,
    });
    await set(page, { deg: 3 });
    await expect(game).toHaveAttribute("data-reps", "2", { timeout: 2500 });
    await set(page, { deg: 0 });
    await page.getByRole("button", { name: "退出冲浪", exact: true }).click();
    await page.getByRole("button", { name: "退出活动", exact: true }).click();
  });
});

test("G03 合成 Pose：髋部被桌沿挡住也能玩；断流冻结不计分，恢复后无需倒计时；单流订阅释放", async () => {
  test.setTimeout(70000);
  await withPage(async (page) => {
    await cameraGame(page, true);
    const game = page.getByTestId("lean-surf");
    await expect(page.locator(".lean-mode")).toContainText("肩线");
    await set(page, { deg: -3 });
    await expect(game).toHaveAttribute("data-reps", "1", { timeout: 2500 });
    await set(page, { deg: 0 });
    await page.waitForTimeout(600);
    // 肩膀也看不到（离开画面）：冻结、提示，侧倾不会补算
    await set(page, { missing: true });
    await expect(game).toHaveAttribute("data-tracking", "lost");
    await expect(page.getByTestId("lean-lost")).toBeVisible();
    const frozen = await page.getByTestId("lean-time").innerText();
    await page.waitForTimeout(700);
    expect(await page.getByTestId("lean-time").innerText()).toBe(frozen);
    await expect(game).toHaveAttribute("data-reps", "1");
    await set(page, { missing: false });
    await expect(game).toHaveAttribute("data-tracking", "ok", {
      timeout: 1500,
    });
    await set(page, { deg: 3 });
    await expect(game).toHaveAttribute("data-reps", "2", { timeout: 2500 });
    await set(page, { deg: 0 });
    // 摄像头真断流后重新连接
    await page.evaluate(() => {
      const s = (window as any).leanTest;
      s.missing = true;
      s.c.stop();
    });
    await expect(game).toHaveAttribute("data-tracking", "lost");
    await page
      .getByRole("button", { name: "重新连接摄像头", exact: true })
      .click();
    await set(page, { missing: false });
    await expect(game).toHaveAttribute("data-tracking", "ok", {
      timeout: 4000,
    });
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

test("G03 static cache invalidation, pause pixels and aspect-ratio resize", async () => {
  test.setTimeout(65000);
  await withPage(async (page) => {
    await demo(page);
    await page.waitForTimeout(1400);
    const cache = await page.evaluate(async () => {
      const { drawSunSurf, layoutFor } =
        await import("/src/games/sunSurfScene.ts");
      const c = document.createElement("canvas");
      c.width = 960;
      c.height = 540;
      const ctx = c.getContext("2d")!;
      const image = new Image();
      image.src = "/art/g03-sunlit-castle.png";
      await image.decode();
      const assets: any = { img: image, off: { c: null } };
      const s: any = {
        t: 0,
        x: layoutFor(960, 540).cx,
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
      };
      for (let i = 0; i < 80; i++) {
        s.t = i / 120;
        drawSunSurf(ctx, s, assets);
      }
      const normal = assets.backgroundBuilds;
      c.width = 800;
      drawSunSurf(ctx, s, assets);
      const resized = assets.backgroundBuilds;
      assets.img = null;
      drawSunSurf(ctx, s, assets);
      return { normal, resized, imageChanged: assets.backgroundBuilds };
    });
    expect(cache).toEqual({ normal: 1, resized: 2, imageChanged: 3 });
    await page.keyboard.press("Escape");
    await expect(page.locator(".display-overlay")).toBeVisible();
    await page.waitForTimeout(200);
    const pixels = () =>
      page
        .locator(".lean-ocean")
        .evaluate((el) => (el as HTMLCanvasElement).toDataURL());
    const paused = await pixels();
    await page.waitForTimeout(650);
    expect(await pixels()).toBe(paused);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(600);
    for (const viewport of [
      { width: 1024, height: 900 },
      { width: 1920, height: 1080 },
    ]) {
      await page.setViewportSize(viewport);
      await page.waitForTimeout(350);
      const d = await page
        .locator(".lean-ocean")
        .evaluate((el) => ({
          w: (el as HTMLCanvasElement).width,
          h: (el as HTMLCanvasElement).height,
          cw: el.clientWidth,
          ch: el.clientHeight,
        }));
      expect(Math.abs(d.w / d.h - d.cw / d.ch)).toBeLessThan(0.01);
    }
  });
});
