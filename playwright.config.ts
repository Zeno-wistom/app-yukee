import { defineConfig } from "@playwright/test";
export default defineConfig({
  // 旧 tests/e2e/*.spec.ts 保留为第三人称产品版本的历史验收。
  // 当前直达游戏系统使用新的完整流程，不伪造已移除的桌面/挂灯入口。
  testDir: "tests/e2e/final",
  timeout: 90000,
  use: {
    baseURL: "http://127.0.0.1:5188",
    channel: "chrome",
    viewport: { width: 1440, height: 900 },
    launchOptions: { args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"] },
  },
  webServer: {
    command: "npm run dev -- --port 5188 --strictPort",
    url: "http://127.0.0.1:5188",
    reuseExistingServer: true,
  },
  workers: 1,
});
