import { test, expect, chromium } from "@playwright/test";
test("本地模型无外部网络依赖，模拟视频完成推理且停止释放轨道", async () => {
  const browser = await chromium.launch({
    channel: "chrome",
    args: [
      "--use-fake-device-for-media-stream",
      "--use-fake-ui-for-media-stream",
    ],
  });
  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const external: string[] = [];
    await page.route("**/*", (route) => {
      if (new URL(route.request().url()).hostname === "127.0.0.1")
        return route.continue();
      external.push(route.request().url());
      return route.abort();
    });
    await page.goto("http://127.0.0.1:5188/#vision");
    await page.getByRole("button", { name: "启用真实摄像头" }).click();
    await expect(page.getByRole("status")).toContainText("摄像头与模型已就绪", {
      timeout: 20000,
    });
    await expect
      .poll(async () => Number(await page.getByTestId("frames").textContent()))
      .toBeGreaterThan(0);
    const track = await page
      .locator("video")
      .evaluateHandle((v) =>
        (v as HTMLVideoElement).srcObject instanceof MediaStream
          ? (
              (v as HTMLVideoElement).srcObject as MediaStream
            ).getVideoTracks()[0]
          : null,
      );
    await page.getByRole("button", { name: "停止摄像头" }).click();
    expect(await track.evaluate((t) => t?.readyState)).toBe("ended");
    expect(external).toEqual([]);
    expect(errors).toEqual([]);
  } finally {
    await browser.close();
  }
});
