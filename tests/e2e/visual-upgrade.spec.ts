import { test, expect } from "@playwright/test";
test("Yukee 分身转场、完整收尾与重复体验", async ({ page }) => {
  test.setTimeout(150000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(page.locator("canvas")).toBeVisible();
  await page.waitForTimeout(4500);
  await page.screenshot({ path: "docs/screenshots/v3-home.png" });
  await page.screenshot({ path: "docs/screenshots/goal-yukee-home.png" });
  await page.getByRole("button", { name: "开始体验" }).click();
  await expect(page.locator("main")).toHaveClass(/arrived/);
  await page.waitForTimeout(900);
  await page.screenshot({ path: "docs/screenshots/v3-first-person.png" });
  await page.screenshot({
    path: "docs/screenshots/goal-yukee-first-person.png",
  });
  // 可重复视觉姿态：隐藏调试输入驱动 gaze/body/turn；真人链路另行实测。
  await page.keyboard.press("d");
  await page.mouse.move(80, 180);
  await page.waitForTimeout(750);
  await page.keyboard.press("d");
  await page.screenshot({ path: "docs/screenshots/goal-yukee-follow.png" });
  await page
    .getByTestId("lamp-home")
    .getByRole("button", { name: "弱提示" })
    .click();
  await page.waitForTimeout(700);
  await page.screenshot({ path: "docs/screenshots/v3-weak.png" });
  await page.getByRole("button", { name: "继续工作", exact: true }).click();
  await expect(page.locator("[data-phase]")).toHaveAttribute(
    "data-phase",
    "focus",
  );
  await page
    .getByTestId("lamp-home")
    .getByRole("button", { name: "强提示" })
    .click();
  await expect(page.locator("[data-phase]")).toHaveAttribute(
    "data-phase",
    "strongReminder",
  );
  await page.waitForTimeout(850);
  await page.screenshot({
    path: "docs/screenshots/goal-strong-reminder.png",
  });
  await page.getByRole("button", { name: "开始活动", exact: true }).click();
  await page.waitForTimeout(600);
  // 提醒确认后进入挂灯游戏选择器（本轮 Goal Mode 新增）
  await expect(page.getByTestId("lamp-selection")).toBeVisible();
  await page.waitForTimeout(700);
  await page.screenshot({ path: "docs/screenshots/goal-selection.png" });
  await page.screenshot({ path: "docs/screenshots/v3-selection.png" });
  // 调试键盘兜底：→ 切下一张，Enter 确认（正式体验为挥手/转头/点头）
  await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(750);
  await page.screenshot({ path: "docs/screenshots/goal-selection-next.png" });
  // G03 已开放；跳过第三张，第四张仍是「开发中」。
  await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(750);
  await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(750);
  await expect(page.locator(".lamp-card.is-current")).toHaveAttribute("data-card-id", "moonwindVillage");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(450);
  await page.screenshot({ path: "docs/screenshots/goal-selection-dev.png" });
  await expect(page.getByTestId("lamp-selection")).toBeVisible();
  // 反向切三次回到 G01，校准与分身转场保持原样。
  await page.keyboard.press("ArrowLeft");
  await page.waitForTimeout(750);
  await page.keyboard.press("ArrowLeft");
  await page.waitForTimeout(750);
  await page.keyboard.press("ArrowLeft");
  await page.waitForTimeout(750);
  await page.keyboard.press("Enter");
  await page.waitForTimeout(180);
  await page.screenshot({
    path: "docs/screenshots/goal-selection-confirming.png",
  });
  await expect(page.locator("[data-phase]")).toHaveAttribute(
    "data-phase",
    "calibration",
  );
  // 自动化环境无真实人脸：校准视图出现，随后走调试旁路
  await expect(page.getByTestId("calibration-view")).toBeVisible();
  await page.waitForTimeout(700);
  await page.screenshot({ path: "docs/screenshots/v3-calibration.png" });
  await page.keyboard.press("d");
  await page.getByRole("button", { name: "校准成功（跳过真实校准）" }).click();
  await page.keyboard.press("d");
  await expect(page.getByTestId("yukee-cast")).toBeVisible();
  await expect(page.getByTestId("lamp-yukee-body")).toBeVisible();
  await page.waitForTimeout(420);
  await page.screenshot({ path: "docs/screenshots/goal-yukee-split.png" });
  await page.waitForTimeout(420);
  await page.screenshot({ path: "docs/screenshots/goal-yukee-cast.png" });
  const castGeometry = await page.evaluate(() => {
    const orb = document
      .querySelector(".yukee-cast-orb")!
      .getBoundingClientRect();
    const lamp = document
      .querySelector(".lamp-avatar")!
      .getBoundingClientRect();
    const monitor = document
      .querySelector(".monitor-portal")!
      .getBoundingClientRect();
    return {
      x: orb.left + orb.width / 2,
      y: orb.top + orb.height / 2,
      minX: Math.min(lamp.left, monitor.left),
      maxX: Math.max(lamp.right, monitor.right),
      minY: Math.min(lamp.top, monitor.top),
      maxY: Math.max(lamp.bottom, monitor.bottom),
    };
  });
  expect(castGeometry.x).toBeGreaterThanOrEqual(castGeometry.minX);
  expect(castGeometry.x).toBeLessThanOrEqual(castGeometry.maxX);
  expect(castGeometry.y).toBeGreaterThanOrEqual(castGeometry.minY);
  expect(castGeometry.y).toBeLessThanOrEqual(castGeometry.maxY);
  await expect(page.locator("[data-phase]")).toHaveAttribute(
    "data-phase",
    "yukeeRun",
  );
  await expect(page.getByTestId("yukee-run")).toBeVisible();
  await page.waitForTimeout(1200);
  await page.screenshot({ path: "docs/screenshots/v3-yukeerun-start.png" });
  await page.screenshot({ path: "docs/screenshots/goal-yukee-game.png" });
  await expect(page.getByTestId("lamp-yukee-body")).toContainText(
    "分身联机陪伴中",
  );
  // 调试方向输入：跳、蹲
  await page.keyboard.press("d");
  await page.getByRole("button", { name: "↑ 抬头=跳" }).click();
  await page.keyboard.press("d");
  await page.waitForTimeout(350);
  await page.screenshot({ path: "docs/screenshots/v3-yukeerun-jump.png" });
  // 等待左侧能量信号出现（at=11s，提前出现），出现后尽快点击
  await expect(page.getByTestId("energy-left")).toBeVisible({
    timeout: 20000,
  });
  await page.waitForTimeout(900);
  await page.screenshot({
    path: "docs/screenshots/v3-yukeerun-energy-left.png",
  });
  await page.keyboard.press("d");
  await page.getByRole("button", { name: "← 左转" }).click();
  await page.keyboard.press("d");
  await expect(page.getByTestId("energy-count")).toContainText("× 1");
  await page.keyboard.press("d");
  await page.getByRole("button", { name: "↓ 低头=蹲" }).click();
  await page.keyboard.press("d");
  await page.waitForTimeout(400);
  await page.screenshot({ path: "docs/screenshots/v3-yukeerun-duck.png" });
  // 右侧能量（at=19.2s）
  await expect(page.getByTestId("energy-right")).toBeVisible({
    timeout: 20000,
  });
  await page.waitForTimeout(900);
  await page.keyboard.press("d");
  await page.getByRole("button", { name: "→ 右转" }).click();
  await page.keyboard.press("d");
  await expect(page.getByTestId("energy-count")).toContainText("× 2");
  // 等自然跑完 → 奖励
  await expect(page.locator("[data-phase]")).toHaveAttribute(
    "data-phase",
    "reward",
    { timeout: 30000 },
  );
  await page.waitForTimeout(800);
  await page.screenshot({ path: "docs/screenshots/v3-reward.png" });
  await page.screenshot({ path: "docs/screenshots/goal-yukee-complete.png" });
  await page.getByRole("button", { name: "回到专注" }).click();
  await expect(page.locator("[data-phase]")).toHaveAttribute(
    "data-phase",
    "focus",
  );
  // 第二轮用调试完成动作缩短时长，验证可重复进入、奖励、返回。
  await page
    .getByTestId("lamp-home")
    .getByRole("button", { name: "开始活动" })
    .click();
  await page.keyboard.press("Enter");
  await expect(page.locator("[data-phase]")).toHaveAttribute(
    "data-phase",
    "calibration",
  );
  await page.keyboard.press("d");
  await page.getByRole("button", { name: "校准成功（跳过真实校准）" }).click();
  await page.keyboard.press("d");
  await expect(page.locator("[data-phase]")).toHaveAttribute(
    "data-phase",
    "yukeeRun",
  );
  await page.keyboard.press("d");
  await page.getByRole("button", { name: "直接完成游戏" }).click();
  await page.keyboard.press("d");
  await expect(page.locator("[data-phase]")).toHaveAttribute(
    "data-phase",
    "reward",
  );
  await page.getByRole("button", { name: "回到专注" }).click();
  await expect(page.locator("[data-phase]")).toHaveAttribute(
    "data-phase",
    "focus",
  );
  await page.getByRole("button", { name: "返回桌面" }).click();
  await expect(page.locator("main")).not.toHaveClass(/arrived/);
  expect(errors).toEqual([]);
});
