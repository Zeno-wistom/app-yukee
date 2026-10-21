/**
 * Goal Mode 验收截图：
 * 1) 挂灯 HOME 特写（24 小时矩阵 + 时段节律）
 * 2) 游戏内左右转头箭头信号特写
 * 3) GAME COMPLETE 奖励画面
 */
import { chromium } from "@playwright/test";

const base = process.env.BASE_URL ?? "http://127.0.0.1:5173";
const browser = await chromium.launch({ channel: "chrome" });
const page = await browser.newPage({ viewport: { width: 1440, height: 810 } });
page.on("pageerror", (e) => console.error("PAGEERROR:", e.message));

await page.goto(base);
await page.getByRole("button", { name: "开始体验" }).click();
await page.waitForSelector("main.arrived", { timeout: 15000 });
await page.waitForTimeout(1200);
await page.locator(".lamp-portal").screenshot({
  path: "docs/screenshots/goal-home-timematrix.png",
});

// 进入游戏：HOME 开始活动 → Enter 确认 → 准备好了 → 调试跳过校准
await page.getByTestId("lamp-home").getByRole("button", { name: "开始活动" }).click();
await page.waitForTimeout(600);
await page.keyboard.press("Enter");
await page.waitForTimeout(900);
await page.getByRole("button", { name: "准备好了" }).click();
await page.waitForSelector('[data-testid="calibration-view"]');
await page.keyboard.press("d");
await page.getByRole("button", { name: "校准成功（跳过真实校准）" }).click();
await page.keyboard.press("d");
await page.waitForSelector('[data-phase="yukeeRun"]', { timeout: 15000 });
await page.getByTestId("energy-left").waitFor({ timeout: 25000 });
await page.waitForTimeout(800);
await page.locator(".yukee-stage").screenshot({
  path: "docs/screenshots/goal-game-arrows.png",
});

// 收集左侧能量 → 芯片亮起
await page.keyboard.press("d");
await page.getByRole("button", { name: "← 左转" }).click();
await page.keyboard.press("d");
await page.waitForTimeout(400);
await page.locator(".yukee-stage").screenshot({
  path: "docs/screenshots/goal-game-arrow-collected.png",
});

// 跑完全程 → reward
await page.waitForSelector('[data-phase="reward"]', { timeout: 60000 });
await page.waitForTimeout(900);
await page.screenshot({ path: "docs/screenshots/goal-complete-celebrate.png" });

await browser.close();
console.log("shots done");
