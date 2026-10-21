/**
 * G02「展翼接光」自检脚本（开发者演示模式）。
 *
 * 覆盖：卡片入口 → 肩臂校准页 → 键盘演示 → 五次完整动作 → 完成页 → 回到工作态。
 * 注意：本脚本不验证真实摄像头识别，那部分必须由真人验证。
 *
 * 运行：node scripts/winglight-acceptance.mjs
 */
import { chromium } from "@playwright/test";

const base = process.env.BASE_URL ?? "http://127.0.0.1:5173";
const browser = await chromium.launch({
  channel: "chrome",
  args: [
    "--use-fake-device-for-media-stream",
    "--use-fake-ui-for-media-stream",
  ],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (msg) => {
  if (msg.type() === "error") errors.push(`console: ${msg.text()}`);
});

const shot = async (name) => {
  await page.locator(".monitor-portal").screenshot({
    path: `docs/screenshots/g02-${name}.png`,
  });
};

await page.goto(base);
await page.getByRole("button", { name: "开始体验" }).click();
await page.waitForSelector("main.arrived", { timeout: 20000 });
await page.waitForTimeout(800);

// 1) 挂灯 → 活动选择
await page
  .getByTestId("lamp-home")
  .getByRole("button", { name: "开始活动" })
  .click();
await page.waitForTimeout(700);
await page.keyboard.press("ArrowRight");
await page.waitForTimeout(900);
// 卡片在选择器里（挂灯小屏），单独截挂灯
await page.locator(".lamp-portal").screenshot({
  path: "docs/screenshots/g02-00-card.png",
});

// 2) 确认 G02 → 肩臂校准
await page.keyboard.press("Enter");
await page.waitForTimeout(500);
await page.waitForSelector('[data-phase="wingCalibration"]', {
  timeout: 10000,
});
await page.waitForTimeout(1200);
await shot("01-calibration");

const stageText = await page
  .locator(".wing-calib-hint")
  .innerText()
  .catch(() => "");
console.log("校准提示：", stageText);

// 3) 开发者演示（明确标注，不计为摄像头识别）
await page.getByRole("button", { name: /开发者演示/ }).click();
await page.waitForSelector('[data-phase="winglight"]', { timeout: 10000 });
await page.waitForTimeout(900);
await shot("02-game-idle");
// 整屏：确认挂灯与主屏的整体构图没有被新关卡破坏
await page.screenshot({ path: "docs/screenshots/g02-08-full-scene.png" });

// 4) 五次「展开 → 保持 → 回位」
for (let rep = 1; rep <= 5; rep++) {
  await page.keyboard.down("Space");
  await page.waitForTimeout(rep === 1 ? 1100 : 1300);
  if (rep === 1) await shot("03-sail-open");
  await page.keyboard.up("Space");
  await page.waitForTimeout(1400);
  const reps = await page
    .getByTestId("wing-reps")
    .innerText()
    .catch(() => "?");
  console.log(`第 ${rep} 次循环后进度：${reps}`);
  if (rep === 1) await shot("04-after-first-rep");
}

await page.waitForSelector('[data-testid="wing-complete"]', { timeout: 8000 });
await page.waitForTimeout(700);
await shot("05-complete");
const finalReps = await page.getByTestId("wing-final-reps").innerText();
const finalTime = await page
  .locator(".wing-complete-stats b")
  .nth(1)
  .innerText();
console.log("完成页：", finalReps, finalTime);

// 5) 回到工作态
await page.getByTestId("wing-back").click();
await page.waitForTimeout(900);
const phase = await page.locator("[data-phase]").getAttribute("data-phase");
console.log("返回后相位：", phase);
await shot("06-back-to-work");

console.log("页面错误：", errors.length ? errors : "无");
await browser.close();
