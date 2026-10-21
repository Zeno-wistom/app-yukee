# Third-Party Notices

本项目包含以下来源的代码或数据。

## fluidkit

- 来源：https://github.com/runvendo/fluidkit
- 许可：MIT License
- 版权：Copyright (c) 2026 runvendo
- 使用范围：
  - `src/yukee/metaball.ts` — 真实 metaball 几何（`bridgePath` 表面张力桥、
    `neckWaist` 张力曲线、`CONNECT_STRETCH` / `SNAP_STRETCH` 回滞阈值）
    移植自 `src/liquid/geometry.ts` 与 `src/liquid/tension.ts`
- 说明：仅移植几何核心。fluidkit 的 Droplets/Thinking 为环境循环组件，
  无法编排一次性分裂序列，故不作为运行时依赖引入。

MIT License 全文同下（与 LaoA-GrokBot 一致的 MIT 条款）。

## LaoA-GrokBot

- 来源：https://github.com/zhulin025/LaoA-GrokBot
- 许可：MIT License
- 版权：Copyright (c) 2026 老A玩AI
- 使用范围：
  - `src/yukee/laoaData.ts` — 25 套 Expression 几何数据（`original-data.js`）、
    Expression Pool / Expression Cadence / Blink 节奏表
  - `src/yukee/YukeeEngine.ts` — Spring Morph、Blink 曲线、Gaze 叠加、
    Turn 透视（`asin/sin/cos` longitude）等动画机制移植自 `app.js`
  - `src/yukee/YukeeFace.tsx` — blob 身体轮廓 path 复用自 `index.html`
    （`shape-body-path`）
  - `src/yukee/yukee.css` — bounce / tilt / scan / pulse 动作关键帧
    派生自 `styles.css`（幅度已按挂灯小屏收敛）

以下为原许可文本：

```
MIT License

Copyright (c) 2026 老A玩AI

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
```
