// 定位 rAF 低帧率根因的对照实验（一次性诊断脚本）
import { chromium } from "@playwright/test";

const rafFps = (page, ms = 3000) =>
  page.evaluate(
    (dur) =>
      new Promise((res) => {
        let n = 0;
        const t0 = performance.now();
        const loop = () => {
          n++;
          if (performance.now() - t0 < dur) requestAnimationFrame(loop);
          else res(((n / (performance.now() - t0)) * 1000).toFixed(1));
        };
        requestAnimationFrame(loop);
      }),
    ms,
  );

const webglMs = (page) =>
  page.evaluate(() => {
    const c = document.createElement("canvas");
    const gl = c.getContext("webgl2") || c.getContext("webgl");
    if (!gl) return "no-webgl";
    const dbg = gl.getExtension("WEBGL_debug_renderer_info");
    return dbg
      ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)
      : gl.getParameter(gl.RENDERER);
  });

const browser = await chromium.launch({
  channel: "chrome",
  headless: false,
  args: ["--use-fake-ui-for-media-stream"],
});
try {
  const page = await (await browser.newContext()).newPage();
  await page.goto("http://127.0.0.1:5173/");
  await page.waitForTimeout(5000);
  console.log("WebGL 渲染器:", await webglMs(page));
  console.log("可见性:", await page.evaluate(() => document.visibilityState));
  console.log("A. 首页含 3D 场景 rAF FPS:", await rafFps(page));
  // 隐藏 3D 场景
  await page.evaluate(() => {
    document.querySelector(".scene").style.display = "none";
  });
  console.log("B. 隐藏 3D 场景后 rAF FPS:", await rafFps(page));
  await page.evaluate(() => {
    document.querySelector(".scene").style.display = "";
  });
  console.log("C. 恢复 3D 场景 rAF FPS:", await rafFps(page));
  // 新标签页空白页对照
  const blank = await page.context().newPage();
  await blank.goto("about:blank");
  await blank.bringToFront();
  console.log("D. about:blank 前台 rAF FPS:", await rafFps(blank));
  await page.bringToFront();
  console.log("E. 回到产品页前台 rAF FPS:", await rafFps(page));
} finally {
  await browser.close();
}
