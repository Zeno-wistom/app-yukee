# YUKEE 视觉与 Motion Design 交付

日期：2026-10-23（Asia/Shanghai）。本轮以本机 `app-yukee-final-polish` 的 `a6b1256` 为基准，独立分支 `feature/yukee-motion-polish`。恢复点：`backup/yukee-before-motion-20261023`。没有合并、推送或部署。

实现提交：`c9a6d54`（视觉、动效、性能修复与回归测试）。本文和验收媒体另存交付提交；当前最终提交可用 `git log -1 --oneline` 查看。

## 设计与实际实现

保留机器人和四款游戏的像素世界。外层采用深色、带少量环境光的舞台：森林偏绿、月夜偏蓝、阳光偏暖、云岛偏青。统一字体层级、浅色主操作、低对比次操作、细边线与留白；游戏预览继续承担主要图像焦点。背景使用静态渐变的交叉淡入，不运行新的环境 RAF、粒子或大面积模糊。

| 流程 | 已实现的节奏 |
| --- | --- |
| 首屏 | 提示、标题、文案、机器人、卡片、目录按层进入，主要内容约 0.7 秒内出现 |
| 选卡 | 原卡沿操作方向退场 180ms，新卡从对应方向进入 420ms；文字轻微错开；主题光和选中标识跟随 |
| 按钮 | Hover 抬升与掠光、按下回弹、忙碌文案与箭头反馈、禁用、键盘 Focus；不使用大幅弹跳 |
| 进入校准 | 读取预览图真实矩形；原图等比放大、遮罩展开；标题独立显现；270ms 后交给 reducer 切相位；约 970ms 内完成视觉交接 |
| 校准进入游戏 | 场景轻微缩放进入，上方 HUD 延后 120ms，下方引导延后 220ms；兼容延迟加载的组件 |
| 暂停与继续 | 原生 dialog 保留焦点约束；面板位移/缩放入场；继续时 160ms 退出完成后才恢复游戏 |
| 退出与重开 | 主题遮罩接管舞台，280ms 后卸载会话，再返回此前所选活动；未完成的进入过程可被返回操作取消 |
| 结算 | 面板、内容、分数分层出现；G01 展示已有收集数；G02/G03 新增重开入口；G05 保留原有成功/失败及重试逻辑 |

`src/motion/tokens.ts` 定义快速反馈、退场、卡片、场景时长与缓动；`src/motion/useStageTransition.ts` 统一拥有导航时间线及取消逻辑，并在完成时清空 GSAP context 历史、在中断时 kill，释放旧页面引用；`src/app/motion.css` 定义对应外层样式。业务相位仍只通过 `src/state/machine.ts` 的 reducer 改变。`prefers-reduced-motion` 跳过展开和大位移，缩短 CSS 动效，并保留全部操作。HTML 在脚本加载前即使用舞台底色。

未添加运行依赖。保留计分、校准阈值、浅蹲蓄力与起跳算法、摄像头识别实现。G02 仅调整显示层：像素光晕移除逐颗模糊滤镜；先读取 SVG 几何、再写样式，粒子目标允许一个显示帧的延迟，计分不经过该路径。

## 实际使用的 Skills

| Skill | 对设计或代码的具体影响 |
| --- | --- |
| `vibe-upgrader` | 使用 implementation / standard 路径与实际项目诊断；helper 确认无需外部参考或原型阶段；复用当前图像与控件，围绕连续舞台交接实施，不安装外部表现组件 |
| `frontend-skill` | 单一图像焦点、控制色彩数量、机器人品牌身份、简短文案与克制层次；避免增加仪表盘卡片和装饰性粒子 |
| `gsap-react` | 使用有 root scope 的 `useGSAP`、`contextSafe` 和 `revertOnUpdate`，避免时间线跨组件残留；返回时取消在途进入回调 |
| `gsap-performance` | 主要动画使用 transform/opacity；只在短时展开中使用矩形 clip-path；几何读取集中在写入之前；不新增常驻 UI RAF |
| `performance-optimization` | 先测基线，再做滤镜对照和首击 Trace；确定 AudioContext 初始化开销后，移到首屏结束后的空闲预热 |
| `browser-testing-with-devtools` | 按运行页面、DOM/样式、错误、动态帧、性能、回归的顺序验证；当前无 Chrome DevTools MCP，实际使用 Playwright + 本机 Chrome/CDP，未声称 MCP 测试 |
| `git-workflow-and-versioning` | 从最新本地版本建恢复分支和独立工作分支；保持稳定分支及原素材可恢复 |
| `code-review-and-quality` | 检查动画归属、取消/卸载、焦点、资源释放与测试证据；修正 CSS/GSAP 重叠及异步退出的测试边界 |

没有引入 MotionSites、React Bits 或新动画库。`codex-model-routing-team` 读取后采用 lead_only：核心样式、阶段切换和性能测量紧密关联，本轮由主 Agent 连续集成与验收，没有创建额外聊天。

## 可核验的性能对比

Windows；AMD Ryzen AI 9 H 465 / Radeon 880M；Chrome 155.0.8059.85；1920×1080、DPR1、未施加 CPU 限速。相同生产构建预览端口、本机 headless Chrome、开启 1280×720 视频记录。输入为键盘演示，摄像头权限在此性能脚本中被拒绝。

| 采样区间 | 修改前 | 修改后 |
| --- | ---: | ---: |
| 8 次切卡，RAF 帧间隔 P95 | 8.8ms | 8.4ms |
| G01 首次进入，>50ms 长任务 | 1 次，最大 144ms | 0 次 |
| G01 首次进入，帧间隔 P95 | 16.6ms | 8.5ms |
| G02 空闲场景，帧间隔 P95 | 25.1ms | 8.4ms |
| G02 空闲场景，RAF 回调频率 | 69.18/s | 119.99/s |
| G03 空闲场景，帧间隔 P95 | 8.6ms | 8.4ms |
| G05 空闲场景，帧间隔 P95 | 8.6ms | 8.4ms |

这些是短时、本机、录屏条件下的 RAF/主线程样本，不是每个画面都已提交到屏幕的 GPU FPS，也不代表真人摄像头或低性能电脑。最终本次样本没有 >33.4ms 帧间隔；更早的修改后独立样本中 G01 进入有 3 次，G02/G03 各 1 次，切卡也有 1 次，因此不能宣称普遍零掉帧或全设备稳定 60 FPS。切卡和进入动画增加了视觉过程，前后区间长度不同；应对比帧间隔与长任务，不能把耗时总长当成加载速度。

首击单独 Trace 测得 AudioContext 构造约 82.6ms。现在首屏 1.1 秒后空闲创建本地音频图，不 resume、不加载 BGM、不播放；用户点击后才恢复音频及预载 BGM。若用户在预热前非常快地点击，首次音频初始化开销仍可能出现。没有将一次性开销描述成彻底消失。

初始 JS gzip 163.90 → 165.68KB，CSS gzip 16.45 → 19.37KB；合计约增加 4.70KB，没有修改依赖清单。

- [修改前原始数据](screenshots/motion-polish/before/audit.json)
- [修改后原始数据](screenshots/motion-polish/after/audit.json)
- [较早的修改后样本](screenshots/motion-polish/after/sample-01.json)（包含前述帧间隔波动，不隐藏不理想的样本）
- [G02 滤镜对照诊断](screenshots/motion-polish/g02-diagnosis.json)（局部定位实验，非完整最终验收）
- [首击音频诊断](screenshots/motion-polish/first-entry-diagnosis.json)
- 复现：先 `npm run build`，再 `npm run preview -- --port 5194`，执行 `node scripts/audit-motion.mjs after`；脚本生成截图、数据及 `after/flow.webm`。性能复测应单独运行，避免同时执行 E2E 或其他浏览器负载。

## 浏览器验收与证据

- `npm test`：24 个文件、174 项测试通过。
- `npm run build`：TypeScript 与生产构建通过。
- `npm run test:e2e -- --reporter=line,json`：完整 **24/24** 通过；[机器可读报告](screenshots/motion-polish/e2e-report.json)。
- 在完整回归后，新增的资源断言复现了转场 context 持有 4 个已卸载节点引用；完成/中断时释放后为 **0**。随后动效专项 **5/5**、单元测试和构建再次通过；[专项报告](screenshots/motion-polish/e2e-motion-cleanup.json)。完整 24 项报告和该次小范围收尾复测分开保留。
- 生产 `dist` 独立预览的 **42 个运行文件**均返回 200，字节数与磁盘文件一致；[资源清单](screenshots/motion-polish/assets.json)。
- 最终构建独立生产冒烟：四款游戏均完成进入、暂停、继续及返回选择，页面运行错误和外部请求均为 0，同一资源清单包含逐款结果。
- 选择页及四款游戏动态采样无页面运行错误。实际查看了录屏逐帧图、桌面选择/暂停/结算图及窄屏结果；修复了游戏 CSS 延迟加载覆盖外层菜单样式的问题，补充窄屏面板至少 330px、G03 重开按钮文字对比度至少 4.5:1 的断言。
- 调试期间的两项失败分别是 1920 用例超时和音频测试错误假设；已针对性定位、复测，并在最终完整 24 项中通过。没有修改超时值来掩盖问题。旧 `docs/screenshots/final-polish` 内容已恢复原样，本轮截图单独保存在 `motion-polish`。

覆盖：1280×720、1366×768、1920×1080、2560×1440，补充 390×844；四款游戏的选择、校准/键盘演示、HUD、暂停、继续、退出；G01 自然结束、G02 五次完整动作、G03 六次回中收光、G05 成功/失败和重开；快速多击与进入过程取消；低动态偏好、弹窗焦点、预热不恢复音频、初始/悬停不请求摄像头。

摄像头证据分开看：合成肩点 + 生成视频流用于生命周期与姿态回归；浏览器 fake video 用于真实本地 MediaPipe 推理、无外网模型加载和停止轨道。它们均不是自然人的摄像头验收。本轮没有采集、保存或上传真人摄像头画面。

- [1280×720 选择页](screenshots/motion-polish/after/selection-1280.png)
- [1366×768 选择页](screenshots/motion-polish/after/selection-1366.png)
- [1920×1080 选择页](screenshots/motion-polish/after/selection-1920.png)
- [2560×1440 选择页](screenshots/motion-polish/after/selection-2560.png)
- [暂停菜单](screenshots/motion-polish/after/pause.png)
- [G01 结算](screenshots/motion-polish/regression/run-result.png)、[G02 结算](screenshots/motion-polish/regression/wing-result.png)、[G03 结算](screenshots/motion-polish/regression/lean-result.png)、[G05 结算](screenshots/motion-polish/regression/squat-result.png)
- [真实录屏逐帧图：切卡及舞台展开](screenshots/motion-polish/transition-filmstrip.png)
- [上述逐帧图对应的核心流程原始录屏](screenshots/motion-polish/after/core-flow.webm)
- [修改后流程录屏（键盘演示）](screenshots/motion-polish/after/flow.webm)

G05 的 `G05_FINAL_PREVIEW_IMAGE` 仍为 null，当前图片 SHA256 为 `C0D1AA34F2C5B9BD3911B894256804E000763E855DDD28F7BC1B755250AA9CF7`；文件与恢复点一致。预览容器 1290:205、cover / left center、右侧 38% 文字区保留；未生成或替换图片。

## 验收清单

| 项目 | 状态 |
| --- | --- |
| 首屏自然入场、选择页视觉体系、左右切卡、按钮微交互 | 已实现并检查动态中间帧 |
| 专用进入转场、场景与 HUD 衔接、暂停/继续/退出、结算 | 浏览器动态回归通过 |
| 四游戏进入/退出、视口位置、多尺寸 | 四桌面尺寸及窄屏回归通过 |
| 动画不破坏识别契约、资源释放 | 合成/模拟条件回归；真人待验收 |
| 流畅度 | 已完成本机前后测量；不同样本有波动，非零掉帧承诺 |
| 真实人像摄像头性能、体感与主观视觉满意度 | 待用户现场验收 |
| 游戏特色、G05 接图能力、源码恢复点 | 已核验保留 |

本地生产预览：[http://127.0.0.1:5194/](http://127.0.0.1:5194/)；开发预览 `http://127.0.0.1:5193/`。回滚时切回 `feature/yukee-final-polish` 或从 `backup/yukee-before-motion-20261023` 新建分支，重新安装已有依赖（必要时）并构建；不需要重置、覆盖或合并稳定分支。
