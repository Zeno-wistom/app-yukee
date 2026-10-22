# G05 游戏选择卡预览图接入规格

状态：尺寸规则已核对，最终专用图待用户交付。本轮未生成或替换任何预览图。

## 核对基准

- 代码仓库：`https://github.com/Zeno-wistom/app-yukee.git`。
- 本机 G05 基准：`feature/g05-hark`，`c85129916669b5bebbebe5acf130849be3b3358d`，开始时工作区干净。
- 工作目录：`C:\Users\rjx58\Documents\ChatGPT\app-yukee-g05-preview-contract`，独立分支 `codex/g05-preview-contract`。
- 原聊天目录的 `master/d398701` 没有 G05；旧 `feature/g05-codex` 使用另一套 `squatHop` 实现。本次核对的是上述 `app-yukee` 的 `squatJump` 卡片。
- 远程查询因 Git HTTPS TLS 握手失败未完成，因此不声称该提交为远程最新。这里只确认本机实际 G05 版本。
- 本文规格适用于现有挂灯卡片布局。附件中的选择页全屏改版属于另一范围；如果未来改变卡片布局，应先重新测量，再决定最终导出尺寸。

## 实际显示尺寸

当前图片文件为 `public/game-previews/squat-jump-card.png`，实测 **1290×205 px，258:41，约 6.293:1**。这是资源尺寸，不是浏览器中的固定显示尺寸。

以下通过本地 Chrome、默认 DPR 1、正常点击进入 G05 选择卡测得；测量时卡片切换已结束，当前卡 `scale=1`。单位为 CSS 像素，取两位小数。

| 浏览器视口 | 卡片外框（含边框） | 实际图片容器（不含边框） |
| --- | --- | --- |
| 1280×720 | 344.30×54.64 | 342.30×52.64 |
| 1366×768 | 367.25×58.28 | 365.25×56.28 |
| 1440×900 | 430.42×68.36 | 428.42×66.36 |
| 1920×1080 | 516.48×82.03 | 514.48×80.03 |
| 2560×1440 | 688.70×109.44 | 686.70×107.44 |

外框约 **6.3:1**；固定 1px 边框使内框比例约 **6.39–6.50:1**，所以即便使用 1290×205 的图片也有少量上下裁切。显示尺寸由挂灯投影大小决定，并非简单按浏览器宽度乘固定百分比。

测量证据：[原始数据](screenshots/g05-preview-audit/measurements.json)、[1920×1080 全页](screenshots/g05-preview-audit/1920x1080.png)、[1280×720 卡片](screenshots/g05-preview-audit/1280x720-card.png)。

## 容器、裁切与适配规则

来源：`src/selection/games.ts`、`CardPreview.tsx`、`SelectionCardStack.tsx`、`src/app/product.css` 与 `src/scene/DeskScene.tsx`。

- G05 的 `fullBleed: true` 使图片覆盖整张卡片。普通卡片的左 70% 预览规则在此被覆盖，不能按 70% 区域为 G05 出图。
- 卡片舞台：挂灯容器的 `left: 10.5%`、`right: 17%`、`top/bottom: 7%`。
- 当前卡：`width: calc(50 * var(--portal-cqw))`，`height: 86%`，绝对定位居中。`--portal-cqw` 由 Three.js 相机投影得到的挂灯宽度除以 100 提供。没有直接设置 `aspect-ratio`。
- 卡片是 `border-box`，1px 边框，`border-radius: calc(0.7 * var(--portal-cqw))`，`overflow: hidden`，底色 `#0f2823`；选中卡边框为 `#57b98e`，带阴影。
- 图片：`width/height: 100%`，`object-fit: cover`，**`object-position: left center`**，`display: block`，`image-rendering: auto`，底色 `#0c2420`。按比例放大到铺满容器，不拉伸。
- 图片比容器更宽时裁右侧、保留左侧；图片比容器更高时上下居中裁切。当前 1290×205 图片在上述桌面视口合计裁掉约 **1.55%–3.23% 高度**，上下各一半。圆角还会遮掉极少量角落内容。
- 右侧信息栏覆盖图片的 **38%**，左内边距为整卡内容宽度的 8%，右内边距 3.5%。其渐变为 `#06121e00 → #06121eb8（栏内34%处）→ #06121ee0`，白色文字另加阴影。背景可以延伸到此，但主体不宜被压在其下。
- 所有卡片和图片常驻 DOM，图片 `loading="eager"`、`decoding="async"`。当前卡缩放 1，邻卡 0.76、更远卡 0.58；切换时约 0.6 秒的 GSAP 动画仅改变位移、缩放、透明度，不切换图片资源或比例。
- 桌面以上尺寸未见页面横向溢出。移动端没有专门重排卡片；`max-width: 900px` 时整个体验设置 `min-width: 760px`。实测 390×844 时卡片 403.66×64.16、左边约 -221.92px，主体被视口截断，并有页面横向溢出。这是现有布局限制，更换图片无法解决，本轮未改布局。

## 交给 ChatGPT 的最终图片规格

**建议交付 PNG，1290×205 px；需要更高分辨率时交付 2580×410 px，保持相同比例。** 不需要 DPI 印刷设置；浏览器使用像素尺寸。最终图应由用户另行生成、确认后再接入。

- 构图为约 **6.3:1 的超宽横幅**。不使用 16:9 成图直接硬裁。
- 包含用户已确认的像素背景、交错跳台，以及合适的 YUKEE 角色，让人看懂浅蹲蓄力、起身跳台的玩法。游戏内纯背景资源保持原状。
- 主角及关键跳台放在横向 **5%–60%** 的区域；右侧 **38%** 留给界面文字蒙层，以低细节背景延伸为主。此为基于遮挡规则的构图建议，并非额外代码裁切。
- 上下各留至少 **5%** 安全边距，不把头部、脚部、平台落点贴边。不要在角落安排关键元素。
- 图片不内嵌游戏名称、按钮或玩法说明，文字由网页叠加，避免重复和缩小后难读。
- 现有图片只是继续使用的素材，不代表最终专用图已验收。

## 已预留的接入入口

唯一开关位于 `src/selection/games.ts`：

```ts
export const G05_FINAL_PREVIEW_IMAGE: string | null = null;
// G05 卡片：
previewImage: G05_FINAL_PREVIEW_IMAGE ?? "/game-previews/squat-jump-card.png",
```

现在为 `null`，浏览器继续请求现有图片，不请求尚不存在的文件。

最终图交付后的接入步骤：

1. 核实成图像素尺寸、比例、主体安全区和用户确认结果。
2. 放入 `public/game-previews/g05-selection-final.png`。该路径当前只预留，尚无文件。
3. 将 `G05_FINAL_PREVIEW_IMAGE` 改为 `"/game-previews/g05-selection-final.png"`。浏览器 URL 不带 `public/`。
4. 运行测试、构建和本文测量脚本，查看上述桌面视口的截图，确认资源 HTTP 200、主体和落点未被裁切、文字不冲突。
5. 如需回退，将入口恢复为 `null`，即可重新显示原有素材。不要覆盖游戏内背景，也不要先把缺失文件路径设为活动入口。

## 验证与复测

- `npm test`：22 个文件、155 个测试通过。
- 浏览器测量：5 种桌面视口及 1 种移动视口，均正常加载原素材、无 `pageerror`；已查看桌面全页及卡片截图。移动端裁切如上记录。
- `npm run build`：通过；Vite 提示现有主包大于 500kB，这是构建体积警告，本轮未扩展进行分包优化。
- 这些是代码与浏览器布局验证，不涉及真人摄像头体感验收。

复测命令（使用本项目现有 Playwright / Chrome，不需要新增依赖）：

```powershell
npm run dev -- --port 5186 --strictPort
# 另一个 PowerShell，进入相同工作目录：
node scripts/audit-g05-preview.mjs
```

脚本只走真实选择流程、读取 DOM 尺寸并保存截图，不覆盖 CSS 或注入替代图片。测试浏览器使用合成摄像头设备，不接入真实摄像头。DevTools MCP 本会话不可用，因此使用项目现有 Playwright 完成浏览器核对。

## 备份与恢复

备份：`C:\Users\rjx58\Documents\ChatGPT\YUKEE-g05-preview-backup-20261022\baseline.bundle`。

修改前已生成完整历史 bundle，`git bundle verify` 通过；另已从 bundle 成功克隆到备份目录内的 `restore-check`（不检出工作文件），并核实基准提交中 `src/selection/games.ts` 可读。基准 ref 为上述 `c851299`。原 `feature/g05-hark` 和聊天目录的 `master` 均未修改。本轮不合并、不发布。

在一个新的空目录位置恢复（依赖与构建缓存可重新安装，不包含在 bundle 中）：

```powershell
git clone 'C:\Users\rjx58\Documents\ChatGPT\YUKEE-g05-preview-backup-20261022\baseline.bundle' 'C:\Users\rjx58\Documents\ChatGPT\app-yukee-restored'
git -C 'C:\Users\rjx58\Documents\ChatGPT\app-yukee-restored' switch -c restore/g05-baseline c85129916669b5bebbebe5acf130849be3b3358d
```
