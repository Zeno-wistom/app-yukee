import { test, expect, chromium, type Page } from "@playwright/test";

async function withPage(run: (p: Page) => Promise<void>) {
  const b = await chromium.launch({
    channel: "chrome",
    args: [
      "--use-fake-device-for-media-stream",
      "--use-fake-ui-for-media-stream",
    ],
  });
  try {
    const p = await b.newPage({
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 2,
      permissions: ["camera"],
    });
    await run(p);
  } finally {
    await b.close();
  }
}
async function selection(p: Page) {
  await p.goto("http://127.0.0.1:5174/");
  await p.getByRole("button", { name: "开始体验", exact: true }).click();
  await expect(p.locator("main")).toHaveClass(/arrived/);
  await p
    .getByTestId("lamp-home")
    .getByRole("button", { name: "开始活动", exact: true })
    .click();
}
async function next(p: Page) {
  await p.getByRole("button", { name: "下一个活动", exact: true }).click();
  await expect(p.getByTestId("lamp-card-stage")).not.toHaveClass(
    /is-transitioning/,
  );
}

test("G02/G03 全画面预览，切换和不同窗口无空白或拉伸", async () => {
  test.setTimeout(80000);
  await withPage(async (p) => {
    const errors: string[] = [];
    p.on("pageerror", (e) => errors.push(e.message));
    await selection(p);
    for (const size of [
      { width: 1440, height: 900 },
      { width: 1024, height: 768 },
      { width: 1920, height: 1080 },
    ]) {
      await p.setViewportSize(size);
      // Explicitly settle on G02, then G03, including repeated wrap-around transitions.
      for (const id of ["winglight", "leanSurf"]) {
        for (
          let i = 0;
          i < 6 &&
          (await p
            .locator(".lamp-card.is-current")
            .getAttribute("data-card-id")) !== id;
          i++
        )
          await next(p);
        const card = p.locator(".lamp-card.is-current");
        await expect(card).toHaveAttribute("data-card-id", id);
        const data = await card.evaluate((el) => {
          const img = el.querySelector("img")!,
            preview = el.querySelector(".lamp-card-preview")!;
          const r = el.getBoundingClientRect(),
            s = preview.getBoundingClientRect();
          return {
            loaded: img.complete && img.naturalWidth > 0,
            ratio: s.width / r.width,
            fit: getComputedStyle(img).objectFit,
            position: getComputedStyle(img).objectPosition,
          };
        });
        expect(data.loaded).toBe(true);
        expect(data.ratio).toBeGreaterThan(0.98);
        expect(data.fit).toBe("cover");
        if (id === "leanSurf") await expect(card).toContainText("星海冲浪");
      }
    }
    expect(errors).toEqual([]);
  });
});

test("G03 实时动作提示、900ms靠近、HiDPI画布与回中计分", async () => {
  test.setTimeout(45000);
  await withPage(async (p) => {
    await selection(p);
    await next(p);
    await next(p);
    await p.getByRole("button", { name: "开始这个活动", exact: true }).click();
    await p
      .getByRole("button", { name: "键盘演示 · 非人体识别", exact: true })
      .click();
    const game = p.getByTestId("lean-surf");
    await expect(game).toHaveAttribute("data-cruising", "0", { timeout: 3000 });
    const canvas = await p.locator(".lean-ocean").evaluate((el) => ({
      width: (el as HTMLCanvasElement).width,
      css: el.getBoundingClientRect().width,
    }));
    expect(canvas.width / canvas.css).toBeGreaterThan(1.9);
    await expect(p.getByRole("meter", { name: "侧倾幅度" })).toBeVisible();
    await expect(p.locator(".lean-hud")).toContainText("SUNLIT SURF");
    await expect(p.locator(".lean-stars i").first()).toHaveText("☀");
    await expect(p.locator(".lean-ocean")).toHaveAttribute(
      "aria-label",
      /阳光采集机器人/,
    );
    await p.keyboard.down("ArrowLeft");
    await expect(game).toHaveAttribute("data-arrived", "1");
    await expect(p.locator(".lean-action-state")).toContainText("回中点亮");
    await p.waitForTimeout(1800);
    await expect(game).toHaveAttribute("data-reps", "0");
    await p
      .getByTestId("lean-surf")
      .screenshot({
        path: "docs/screenshots/g03-sunlight-return-feedback.png",
      });
    await p.keyboard.up("ArrowLeft");
    await expect(game).toHaveAttribute("data-reps", "1");
    await expect(game).toHaveAttribute("data-cruising", "0", { timeout: 2000 });
    await p.keyboard.down("ArrowRight");
    await expect(game).toHaveAttribute("data-arrived", "1");
    await p.keyboard.up("ArrowRight");
    await expect(game).toHaveAttribute("data-reps", "2");
    await p.getByRole("button", { name: "退出冲浪", exact: true }).click();
    await p.getByRole("button", { name: "退出活动", exact: true }).click();
    await expect(p.getByTestId("lamp-home")).toBeVisible();
  });
});
