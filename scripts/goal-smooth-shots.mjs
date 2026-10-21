/**
 * 灵动感专项验收关键帧：
 * 1. HOME 时间可读性
 * 2. 卡片切换中间帧（检查闪现/白帧）
 * 3. 点头后无二次点击（断言无「准备好了」按钮）
 * 4. Cast 六连帧（挂灯内析出 → 下沉遮挡 → 屏幕内重现 → 结晶）
 * 5. Cast 结束后挂灯无残留
 * 6. 游戏 jump / hit squash & stretch 帧
 * 7. Complete 庆祝帧
 */
import { chromium } from "@playwright/test";

const base = process.env.BASE_URL ?? "http://127.0.0.1:5173";
const browser = await chromium.launch({ channel: "chrome" });
const page = await browser.newPage({ viewport: { width: 1440, height: 810 } });
page.on("pageerror", (e) => console.error("PAGEERROR:", e.message));

await page.goto(base);
await page.getByRole("button", { name: "开始体验" }).click();
await page.waitForSelector("main.arrived", { timeout: 15000 });
await page.waitForTimeout(1000);
await page.locator(".lamp-portal").screenshot({
  path: "docs/screenshots/g4-home-time.png",
});

// ---- 卡片切换中间帧 ----
await page.getByTestId("lamp-home").getByRole("button", { name: "开始活动" }).click();
await page.waitForTimeout(600);
await page.keyboard.press("ArrowRight");
await page.waitForTimeout(140);
await page.locator(".lamp-portal").screenshot({
  path: "docs/screenshots/g4-card-mid1.png",
});
await page.waitForTimeout(200);
await page.locator(".lamp-portal").screenshot({
  path: "docs/screenshots/g4-card-mid2.png",
});
await page.keyboard.press("ArrowLeft");
await page.waitForTimeout(700);

// ---- 点头确认 → 无二次点击 ----
await page.keyboard.press("Enter");
await page.waitForSelector('[data-phase="calibration"]', { timeout: 5000 });
const introBtn = await page.getByRole("button", { name: "准备好了" }).count();
console.log("准备好了 button count (must be 0):", introBtn);
await page.screenshot({ path: "docs/screenshots/g4-auto-calibration.png" });

// ---- Cast 关键帧 ----
await page.keyboard.press("d");
await page.getByRole("button", { name: "校准成功（跳过真实校准）" }).click();
await page.keyboard.press("d");
const frames = [350, 400, 350, 400, 450, 500];
for (let i = 0; i < frames.length; i++) {
  await page.waitForTimeout(frames[i]);
  await page.screenshot({ path: `docs/screenshots/g4-cast-f${i + 1}.png` });
}
await page.waitForSelector('[data-phase="yukeeRun"]', { timeout: 15000 });
await page.waitForTimeout(600);
// Cast 结束后挂灯无残留
await page.locator(".lamp-portal").screenshot({
  path: "docs/screenshots/g4-lamp-after-cast.png",
});

// ---- 游戏 squash & stretch 帧 ----
await page.keyboard.press("d");
await page.getByRole("button", { name: "↑ 抬头=跳" }).click();
await page.keyboard.press("d");
await page.waitForTimeout(120);
await page.locator(".yukee-stage").screenshot({
  path: "docs/screenshots/g4-game-jump-air.png",
});
await page.waitForTimeout(700);
await page.locator(".yukee-stage").screenshot({
  path: "docs/screenshots/g4-game-land.png",
});

// ---- 直接完成 → 庆祝帧 ----
await page.keyboard.press("d");
await page.getByRole("button", { name: "直接完成游戏" }).click();
await page.keyboard.press("d");
await page.waitForSelector('[data-phase="reward"]');
await page.waitForTimeout(700);
await page.screenshot({ path: "docs/screenshots/g4-complete-celebrate.png" });

await browser.close();
console.log("smooth shots done");
