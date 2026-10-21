// 真人选择闭环验收：真实摄像头，Head 与 Hand 分段执行；不保存视频帧。
import { chromium } from "@playwright/test";

const browser = await chromium.launch({
  channel: "chrome",
  headless: false,
  args: ["--use-fake-ui-for-media-stream"],
});

async function runMode(mode) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.addInitScript((value) => {
    localStorage.setItem("gameSelectionInputMode", value);
    localStorage.removeItem("gameSelectionHintSeen");
  }, mode);
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("http://127.0.0.1:5173/");
  await page.bringToFront();
  await page.getByRole("button", { name: "开始体验" }).click();
  await page.locator("main.arrived").waitFor({ timeout: 12000 });
  await page.getByTestId("lamp-home").getByRole("button", { name: "开始活动" }).click();
  await page.getByTestId("lamp-selection").waitFor();
  await page.waitForFunction(
    (value) => {
      const label = document.querySelector(".lamp-selection-mode")?.textContent ?? "";
      return value === "head" ? label.includes("头部切换") : label.includes("手势切换");
    },
    mode,
    { timeout: 30000 },
  );

  const initial = await page.locator(".lamp-card.is-current").getAttribute("data-card-id");
  console.log(`[${mode}] 已就绪，当前=${initial}；请完成两次切换并点头确认。`);
  const seen = new Set([initial]);
  await page.waitForFunction(
    () => document.querySelector(".lamp-card.is-current")?.getAttribute("data-card-id") !== "yukeeRun",
    undefined,
    { timeout: 45000 },
  );
  seen.add(await page.locator(".lamp-card.is-current").getAttribute("data-card-id"));
  const afterFirst = await page.locator(".lamp-card.is-current").getAttribute("data-card-id");
  await page.waitForTimeout(900);
  const held = await page.locator(".lamp-card.is-current").getAttribute("data-card-id");
  const heldStable = held === afterFirst;
  await page.waitForFunction(
    (known) => {
      const current = document.querySelector(".lamp-card.is-current")?.getAttribute("data-card-id");
      return current !== known;
    },
    afterFirst,
    { timeout: 45000 },
  );
  seen.add(await page.locator(".lamp-card.is-current").getAttribute("data-card-id"));
  await page.locator('[data-phase="activityIntro"]').waitFor({ timeout: 45000 });
  const path = `docs/screenshots/goal-${mode}-real.png`;
  await page.screenshot({ path });
  const result = { mode, seen: [...seen], heldStable, confirmed: true, errors, screenshot: path };
  console.log(JSON.stringify(result));
  await context.close();
  return result;
}

try {
  const head = await runMode("head");
  const hand = await runMode("hand");
  if (!head.heldStable || !hand.heldStable || head.errors.length || hand.errors.length)
    process.exitCode = 1;
} catch (error) {
  console.error("真人验收未完成：", error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await browser.close();
}
