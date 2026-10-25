import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
// 演示视频专用开发服务器：根目录 video/，可以引用 ../src 下的真实组件（只读引用，不修改）。
export default defineConfig({
  root: __dirname,
  plugins: [react()],
  publicDir: path.resolve(__dirname, "public"),
  server: { host: "127.0.0.1", port: 5290, strictPort: true, fs: { allow: [path.resolve(__dirname, "..")] } },
});
