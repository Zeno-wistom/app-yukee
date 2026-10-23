import { test, expect } from "@playwright/test";
import { demo } from "./helpers";

test("首屏、定向切卡与独立舞台转场具有真实中间帧", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("game-selection")).toBeVisible();
  await page.waitForTimeout(750);
  await page.getByRole("button", { name: "下一款游戏", exact: true }).click();
  // Old card exits before the new card replaces it.
  await expect(page.getByTestId("selection-preview")).toHaveAttribute("data-card-id", "yukeeRun");
  await expect(page.getByTestId("selection-preview")).toHaveAttribute("data-card-id", "winglight");
  await page.getByRole("button", { name: "进入游戏", exact: true }).click();
  await expect(page.locator("main")).toHaveAttribute("data-transition", "entering");
  const captured = await page.evaluate(async () => {
    const url = performance.getEntriesByType("resource").find(r => new URL(r.name).pathname.endsWith("/gsap.js"))!.name;
    const { gsap } = await import(/* @vite-ignore */ url);
    const tween = gsap.globalTimeline.getChildren(true, true, false).find((t: any) => t.targets().some((e: Element) => e.classList?.contains("stage-transition")));
    (window as any).navContext = tween?._ctx;
    return !!(window as any).navContext;
  });
  expect(captured).toBe(true);
  const frames = await page.evaluate(() => new Promise<any[]>(resolve => {
    const frames: any[] = [], start = performance.now();
    const sample = () => {
      const layer = document.querySelector(".stage-transition")!;
      frames.push({ at: performance.now() - start, phase: document.querySelector("main")!.getAttribute("data-phase"), clip: getComputedStyle(layer).clipPath, visible: getComputedStyle(layer).visibility });
      if (performance.now()-start > 1100) resolve(frames); else requestAnimationFrame(sample);
    }; sample();
  }));
  expect(new Set(frames.map(f=>f.clip)).size).toBeGreaterThan(8);
  expect(frames.some(f=>f.phase === "lampSelection")).toBe(true);
  expect(frames.some(f=>f.phase === "wingCalibration")).toBe(true);
  await expect(page.locator("main")).toHaveAttribute("data-transition", "idle");
  await expect(page.getByTestId("stage-transition")).not.toBeVisible();
  await expect(page.getByTestId("wing-calibration")).toBeVisible();
  // Completed transitions must not retain unmounted pages through GSAP's context history.
  const detached = await page.evaluate(() => (window as any).navContext.getTweens().flatMap((t: any) => t.targets()).filter((e: any) => e instanceof Element && !e.isConnected).length);
  expect(detached).toBe(0);
});

test("进入未结束时返回可中断，重复进入不重复挂载", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", e=>errors.push(e.message));
  await page.addInitScript(() => { navigator.mediaDevices.getUserMedia = async () => { throw new DOMException("test", "NotAllowedError"); }; });
  await page.goto("/");
  for (let i=0;i<3;i++) {
    const start = page.getByRole("button", { name: "进入游戏", exact: true });
    await expect(start).toBeEnabled();
    const box = await start.boundingBox();
    await page.mouse.click(box!.x + box!.width/2, box!.y + box!.height/2, { clickCount: 4, delay: 10 });
    await expect(page.getByTestId("calibration-view")).toBeVisible();
    await page.getByRole("button", { name: "返回游戏选择", exact: true }).click();
    await expect(page.getByTestId("game-selection")).toBeVisible();
    await expect(page.locator("main")).toHaveAttribute("data-transition", "idle");
    await expect(page.locator(".selection-active")).toHaveCSS("opacity", "1");
    await expect(page.getByTestId("calibration-view")).toHaveCount(0);
  }
  expect(errors).toEqual([]);
});

test("悬停预备加载不请求权限，暂停退出保持所选游戏", async ({ page }) => {
  await page.addInitScript(() => {
    (window as any).cameraCalls = 0;
    navigator.mediaDevices.getUserMedia = async () => { (window as any).cameraCalls++; throw new DOMException("test", "NotAllowedError"); };
  });
  await page.goto("/");
  await page.getByRole("button", { name: "进入游戏", exact: true }).hover();
  await page.waitForTimeout(350);
  expect(await page.evaluate(()=>(window as any).cameraCalls)).toBe(0);
  await demo(page, 2);
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("session-dialog")).toBeVisible();
  await page.waitForTimeout(350);
  await page.getByRole("button", { name: "继续游戏", exact: true }).click();
  await expect(page.locator("main")).toHaveAttribute("data-paused", "true");
  await expect(page.getByTestId("session-dialog")).not.toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "退出并返回选择", exact: true }).click();
  await expect(page.getByTestId("game-selection")).toBeVisible();
  await expect(page.getByTestId("selection-preview")).toHaveAttribute("data-card-id", "leanSurf");
  await expect(page.locator("main")).toHaveAttribute("data-transition", "idle");
});

test("空闲音频预热不恢复音频、不播放，启动仍由点击触发", async ({ page }) => {
  const audioRequests: string[] = [];
  page.on("request", request => { if (new URL(request.url()).pathname.startsWith("/audio/")) audioRequests.push(request.url()); });
  await page.addInitScript(() => {
    const RealContext = window.AudioContext;
    (window as any).audioWarmup = { created: 0, resumed: 0 };
    window.AudioContext = new Proxy(RealContext, { construct(target, args) {
      (window as any).audioWarmup.created++;
      const ctx = Reflect.construct(target, args);
      const resume = ctx.resume.bind(ctx);
      ctx.resume = () => { (window as any).audioWarmup.resumed++; return resume(); };
      return ctx;
    } });
  });
  await page.goto("/");
  await expect.poll(()=>page.evaluate(()=>(window as any).audioWarmup.created)).toBe(1);
  expect(await page.evaluate(()=>(window as any).audioWarmup.resumed)).toBe(0);
  expect(audioRequests).toEqual([]);
  const bgmRequest = page.waitForRequest(/\/audio\/yukee-run-bgm\.mp3/);
  await page.getByRole("button", { name: "进入游戏", exact: true }).click();
  await bgmRequest;
  expect(await page.evaluate(()=>(window as any).audioWarmup.created)).toBe(1);
});

test("减少动态效果跳过展开，按钮、焦点和退出均可用", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await demo(page, 3);
  await expect(page.locator("main")).toHaveAttribute("data-transition", "idle");
  await expect(page.getByTestId("stage-transition")).not.toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("session-dialog")).toBeVisible();
  expect(await page.getByTestId("session-dialog").evaluate(el=>el.contains(document.activeElement))).toBe(true);
  await page.getByRole("button", { name: "退出并返回选择", exact: true }).click();
  await expect(page.getByTestId("selection-preview")).toHaveAttribute("data-card-id", "squatJump");
  const durations = await page.locator(".selection-active, .squat-hud").evaluateAll(es=>es.map(e=>getComputedStyle(e).animationDuration));
  expect(durations.every(d=>d === "1e-05s" || d === "0s")).toBe(true);
});
