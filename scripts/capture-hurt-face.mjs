// 受伤联动表情验收：进入游戏后不做任何操作，让分身撞上 5.5s 的箱子，
// 截取挂灯本体的受伤反馈表情（wince/startled/worried 随机）；
// 连续撞 5.5s 与 8.2s 两个障碍后 streak 升级 pained。
import { chromium } from "@playwright/test";

const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  const page = await (await browser.newContext()).newPage();
  await page.goto("http://127.0.0.1:5173/");
  await page.waitForTimeout(4500);
  await page.getByRole("button", { name: "开始体验" }).click();
  await page.locator("main.arrived").waitFor();
  await page.getByRole("button", { name: "体验一次提醒" }).click();
  await page.getByRole("button", { name: "开始活动", exact: true }).click();
  await page.getByRole("button", { name: "准备好了" }).click();
  await page.keyboard.press("d");
  await page.getByRole("button", { name: "校准成功（跳过真实校准）" }).click();
  await page.keyboard.press("d");
  await page.locator("[data-phase='yukeeRun']").waitFor();
  // 第一撞在游戏世界时间 5.5s；受伤表情持续 460-720ms，撞后 ~250ms 截取
  await page.waitForTimeout(5750);
  await page.screenshot({ path: "docs/screenshots/v4-hurt-light.png" });
  // 第二撞在 8.2s（窗口内 streak=1）
  await page.waitForTimeout(2700);
  await page.screenshot({ path: "docs/screenshots/v4-hurt-second.png" });
  console.log("hurt screenshots saved");
} finally {
  await browser.close();
}
