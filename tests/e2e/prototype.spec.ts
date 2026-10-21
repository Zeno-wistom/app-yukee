import { test, expect } from "@playwright/test";
test("只有主按钮可进入，减少动态模式仍连续推进", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await page.waitForTimeout(3500);
  await expect(page).toHaveTitle(/Yukee/);
  await expect(
    page.getByRole("button", { name: "校准成功（跳过真实校准）", exact: true }),
  ).toHaveCount(0);
  await expect(page.getByRole("button", { name: "开始体验" })).toHaveCount(1);
  await expect(page.getByText("点击开始体验")).toHaveCount(0);
  expect(
    await page
      .locator(".product-experience")
      .evaluate((element) => getComputedStyle(element).userSelect),
  ).toBe("none");
  const heading = page.locator("h1").first();
  const box = await heading.boundingBox();
  if (box) {
    await page.mouse.move(box.x + 4, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width - 4, box.y + box.height / 2);
    await page.mouse.up();
  }
  expect(await page.evaluate(() => getSelection()?.toString() ?? "")).toBe("");
  await page.getByRole("button", { name: "开始体验" }).click();
  await expect(page.locator("main")).toHaveClass(/entered/);
  await page.waitForTimeout(900);
  await expect(page.locator("main")).not.toHaveClass(/arrived/);
  await expect(page.locator("main")).toHaveClass(/arrived/, { timeout: 2500 });
  await expect(page.getByTestId("lamp-home")).toBeVisible();
  await expect(page.getByTestId("office-view").getByRole("button")).toHaveCount(
    0,
  );
  await expect(
    page.getByTestId("lamp-home").getByRole("button", { name: "开始活动" }),
  ).toBeVisible();
  await page.keyboard.press("d");
  await expect(page.getByRole("heading", { name: "演示控制" })).toBeVisible();
  await page.keyboard.press("d");
  await expect(page.getByRole("heading", { name: "演示控制" })).toHaveCount(0);
  await page
    .getByTestId("lamp-home")
    .getByRole("button", { name: "弱提示" })
    .click();
  await page.waitForTimeout(2000);
  await expect(page.locator("[data-phase]")).toHaveAttribute(
    "data-phase",
    "weakReminder",
  );
  await page.getByRole("button", { name: "继续工作", exact: true }).click();
  await expect(page.locator("[data-phase]")).toHaveAttribute(
    "data-phase",
    "focus",
  );
  await page.waitForTimeout(1900);
  await expect(page.locator("[data-phase]")).toHaveAttribute(
    "data-phase",
    "focus",
  );
});
test("强提示稍后会完整经历 snooze，截止前不重开、到期后再出现", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "开始体验" }).click();
  await expect(page.locator("main")).toHaveClass(/arrived/);
  await page
    .getByTestId("lamp-home")
    .getByRole("button", { name: "强提示" })
    .click();
  await expect(page.locator("[data-phase]")).toHaveAttribute(
    "data-phase",
    "strongReminder",
  );

  await page.getByRole("button", { name: "稍后", exact: true }).click();
  await expect(page.locator("[data-phase]")).toHaveAttribute(
    "data-phase",
    "focus",
  );
  await page.waitForTimeout(900);
  await expect(page.locator("[data-phase]")).toHaveAttribute(
    "data-phase",
    "focus",
  );
  await expect(page.locator("[data-phase]")).toHaveAttribute(
    "data-phase",
    "strongReminder",
    { timeout: 1200 },
  );
});
test("游戏卡片切换为连续整叠洗牌，无瞬时内容替换", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "开始体验" }).click();
  await expect(page.locator("main")).toHaveClass(/arrived/);
  await page
    .getByTestId("lamp-home")
    .getByRole("button", { name: "开始活动" })
    .click();
  // 切卡瞬间：旧卡仍然挂载且内容不变（无 unmount / 无瞬时换内容）
  await page.keyboard.press("ArrowRight");
  await expect(
    page.locator(".lamp-card[data-card-id='yukeeRun']"),
  ).toBeAttached();
  // 新当前卡落稳为目标卡片（G02 加入后第 2 张是展翼接光）
  await expect(page.locator(".lamp-card.is-current")).toHaveAttribute(
    "data-card-id",
    "winglight",
  );
  // 过渡完成后所有卡片仍全部挂载（永不在动画中增删节点）
  // G02 也复用原始月夜图片；六张卡均保留常驻图片节点。
  await page.waitForTimeout(700);
  await expect(page.locator(".lamp-card")).toHaveCount(6);
  await expect(page.locator(".lamp-card-preview > *")).toHaveCount(6);
  await expect(page.locator(".lamp-card-preview img")).toHaveCount(6);
  await expect(page.locator("[data-card-id='winglight'] .lamp-card-preview img"))
    .toHaveAttribute('src', /g02-moon-original/);
  await expect
    .poll(async () =>
      page
        .locator(".lamp-card-preview img")
        .evaluateAll((images) =>
          images.every(
            (image) =>
              (image as HTMLImageElement).complete &&
              (image as HTMLImageElement).naturalWidth > 0,
          ),
        ),
    )
    .toBe(true);
  await expect(page.locator(".lamp-card.is-current")).toHaveAttribute(
    "data-card-id",
    "winglight",
  );
});
test("活动可暂停保存与继续，退出不遗留定时器", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "开始体验" }).click();
  await expect(page.locator("main")).toHaveClass(/arrived/);
  await page
    .getByTestId("lamp-home")
    .getByRole("button", { name: "开始活动" })
    .click();
  await page.keyboard.press("Enter");
  // 点头确认后无二次点击：420ms 确认反馈结束自动进入真人检测
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
  await page.getByRole("button", { name: "暂停游戏", exact: true }).click();
  await expect(page.getByText("按自己的节奏来。")).toBeVisible();
  await page.getByRole("button", { name: "保存并退出" }).click();
  await page
    .getByTestId("lamp-home")
    .getByRole("button", { name: "开始活动" })
    .click();
  await page.keyboard.press("Enter");
  // 恢复后需重新经过校准（摄像头已释放），且同样无二次点击
  await expect(page.locator("[data-phase]")).toHaveAttribute(
    "data-phase",
    "calibration",
  );
  await page.getByRole("button", { name: "返回桌面" }).click();
  await expect(page.locator("main")).not.toHaveClass(/arrived/);
});
test("权限拒绝保留明确错误与返回路径", async ({ page }) => {
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = async () => {
      throw new DOMException("denied", "NotAllowedError");
    };
  });
  await page.goto("/#vision");
  await page.getByRole("button", { name: "启用真实摄像头" }).click();
  await expect(page.getByRole("alert")).toContainText("权限被拒绝");
  await page.getByRole("button", { name: "返回体验" }).click();
  await expect(page.locator(".spike-modal")).toHaveCount(0);
});
