// 真实摄像头推理性能测量（一次性脚本，不纳入测试套件）
// 使用真实摄像头 + 自动授权（fake-ui 仅跳过权限弹窗，设备仍是真实的）
import { chromium } from "@playwright/test";

const browser = await chromium.launch({
  channel: "chrome",
  headless: false,
  args: ["--use-fake-ui-for-media-stream"],
});
try {
  const page = await (await browser.newContext()).newPage();
  page.on("pageerror", (e) => console.error("PAGE ERROR:", e.message));
  await page.goto("http://127.0.0.1:5173/#vision");
  await page.getByRole("button", { name: "启用真实摄像头" }).click();
  await page.getByText("摄像头与模型已就绪", { exact: false }).waitFor({ timeout: 30000 });
  await page.bringToFront();
  await page.waitForTimeout(1500);
  console.log("摄像头与模型已就绪（前台），开始采样 24 秒…");
  const samples = [];
  for (let i = 0; i < 12; i++) {
    await page.waitForTimeout(2000);
    const dl = await page.locator(".spike-grid dl").innerText();
    const grab = (label) => {
      const m = dl.match(new RegExp(label + "\\n([^\\n]+)"));
      return m ? m[1] : "?";
    };
    const row = {
      t: (i + 1) * 2,
      frames: grab("检测帧数"),
      fps: grab("实际推理 FPS"),
      source: grab("视频源 / 回调 FPS"),
      ms: grab("本帧 / P95"),
      faces: grab("检测人脸"),
      yaw: grab("原始 yaw / pitch"),
    };
    samples.push(row);
    console.log(JSON.stringify(row));
  }
} finally {
  await browser.close();
}
