# 第一批开发记录

## 资料与复刻

原始资料来自 `C:\Users\rjx58\Downloads\资料`，逐文件复制到 `docs/reference/`，未修改原文。SVG 为 5132 × 4651 总画布，包含信息架构和多张约 5:1 长条屏。网页没有嵌入总 SVG，而是以 React 按钮、布局、文本和 CSS 占位区域重建。

| SVG 结构                                     | React 对应               |
| -------------------------------------------- | ------------------------ |
| 左侧日期、时间、DAILY ROUTINE / EMOTION      | 首页左栏                 |
| 中央灰色 ROBOT FACE 交叉线占位               | Placeholder / robot-area |
| 右侧六个胶囊按钮和右上电源                   | 首页按钮网格和结束演示   |
| 中央叠放游戏卡、左右切换、左下返回、右下我的 | Library                  |
| GAME NAME / START 介绍卡                     | activityIntro            |
| A RECORD THERE / CONTINUE / NEW GAME         | archive 弹框             |
| RECORD THERE                                 | 本次页面完成记录和存档   |
| 游戏左上返回、右上暂停、中央灰色弹框         | quit / pause             |

## 与原 SVG 的明确差异

- 日期时间使用当前系统值，其他原始英文标签尽量保留；动作说明采用中文以便课堂体验。
- SVG 的游戏内容是灰色图片占位，本批按冻结流程补齐校准、左右、上下、轨迹与完成页，继续使用灰白、居中占位、胶囊按钮的视觉语言。
- 原始机器人是 ROBOT FACE 占位。本批保留该结构，仅用文字标识提醒情绪，没有自创新机器人造型。
- 新增屏幕外的演示控制与假输入区，明确不属于产品长条屏；新增独立 Vision Spike 页面。
- STRONG HINT 不直接触发强提醒，避免与本次审批的因果逻辑冲突。DRINK TIME / LIGHT / SOUND 保留可点击说明，实际功能未实现。
- 头颈活动可运行，其他三类卡片可切换但标注后续开放，不伪装为已实现。
- 存档和记录仅本次页面内有效，无数据库或持久化。未实现原 SVG 的示例记录删除、账户编辑等非核心内容。
- 窄窗口保持长条屏比例并允许横向滚动，避免压缩得无法读字；主展示以笔记本横屏为准。
- Three.js、旋钮控制、物理隐私遮挡、真实校准与游戏识别尚未接入，按审批留待后续批次。

## 状态与模块

`product → focus → weakReminder → focus（等待）→ secondaryReminder → focus（等待）→ strongReminder → activityIntro → calibration → gameHorizontal → gameVertical → gameTracking → reward → focus`

两个等待状态只分别由「继续工作」「稍后」产生；延迟 1.5 秒集中在 `src/config/demo.ts`。离开等待状态会取消旧计时器。useReducer 检查动作顺序、暂停状态和重复输入。

`DebugAdapter → MotionInput → reducer` 是假输入链。下一批将摄像头检测转换为相同动作事件，UI 不需要认识 MediaPipe。Vision Spike 当前只输出原始数据，不提前实现游戏算法。

已使用：`src/app/`、`src/ui/`、`src/state/`、`src/demo/`、`src/vision/`、`src/config/`。`scene`、`calibration`、`games`、`robot`、`feedback` 目录预留给下一批。

## 技术预检

- MediaPipe 使用 VIDEO、numFaces=1、关闭 blendshapes、输出面部变换矩阵；推理上限 15 FPS、逐帧同步执行。
- 模型与包内 WASM 已本地化。模型来源：https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/latest/face_landmarker.task 。
- 官方 API 依据：https://developers.google.com/edge/mediapipe/solutions/vision/face_landmarker/web_js 。矩阵用于输出原始 yaw/pitch，镜像符号和个人基准尚未真人标定。
- 2026-09-05，本机 Chrome 真实预检已看到视频就绪、人脸 1/1、478 关键点、有效 yaw/pitch。首次观察 18 帧，9.7 FPS，本帧 17.8ms / P95 27.8ms；独立启动后观察到 174 帧，5.9 FPS，本帧 18.2ms / P95 43.9ms，yaw 3.1° / pitch -16.9°。
- FPS 有波动，另一次刷新后观察到 35 帧、1.1 FPS、本帧 47.0ms / P95 71.2ms。测试期间存在其他浏览器测试及页面切换；此数据不能代表独占前台性能，也不能据此声称性能已通过。暂未引入 Worker。下一批真实游戏前先复测前台持续输入延迟，再决定优化。
- 未保存摄像头画面、人脸关键点序列或个人数据。只记录上述预检汇总指标。

## 验证记录

- 状态机与角度/错误映射单元测试：5 项通过。
- Chrome 三轮完整闭环通过；错误动作不计数、暂停/退出恢复通过。
- 曾发现标题覆盖暂停按钮，修复 pointer-events 后浏览器回归通过。
- 权限拒绝使用测试注入验证，不能等同实际手动拒绝；真实授权成功已在本机观察。
- 详细最终测试结果与补充检查见后续验收补记。

## 验收补记

- 7 个原始资料文件与源目录 SHA256 比较全部一致，SVG 未修改。派生预览已放到 `docs/screenshots/`。
- 自动化模拟摄像头的 video.currentTime 停留在 0，因此该项只验证完成一次真实模型推理、本地资产无外网依赖，以及停止后 track.readyState 为 ended；不将其报告为持续追踪成功。
- 实际 Chrome 真实摄像头曾持续检测至 174 帧，单人脸 478 关键点。真人多坐姿、方向符号和前台稳定 FPS 未作为本批通过项。
- 开发热更新和刷新可能清空本轮状态；现场应启动后停止改代码。正式刷新不自动申请摄像头。
- 曾在开发中安装依赖后出现 Vite 新旧 React 缓存混用，日志为 Invalid hook call；重启 Vite 并刷新页面恢复。锁定依赖后的全新加载主流程无此错误。
- 首次安装的 MediaPipe 1.0.1 尝试访问 `https://odml.pa.googleapis.com/v1/log`。发现后锁定为 **0.10.32**，替换同版本 WASM 并重启 Vite 强制重建依赖缓存。最终自动化阻断所有非 localhost 请求，模型推理及释放通过，观察到外部请求数量为 0。初始阶段的日志请求内容未采集，不能将初始版本称为完全无外发。
- **最终 0.10.32 真实复测**：检测至 163 帧，1 张人脸 / 478 关键点，累计 2.7 FPS，最后一帧 19.0ms / 最近窗口 P95 48.8ms；yaw -0.2° / pitch -0.1°。中途页面可见性为 visible。停止状态显示轨道已释放。FPS 偏低且原因尚未充分定位，不能简单归因后台节流；下一批先检查视频源帧率、页面渲染调度和前台推理预算。
- 预检控制台出现 MediaPipe 自身写入 error 通道的 `INFO: Created TensorFlow Lite XNNPACK delegate for CPU.`，属于 CPU 初始化信息；没有把它当作推理失败。主 UI 浏览器测试同时检查 console.error 与 pageerror，最终均为空。
- 最终验收：`npm test` 5/5；`npm run build` 通过；`npm run test:e2e` 5/5（27.8 秒），含三轮完整体验、暂停与存档恢复、拒绝权限、取消旧延迟、窄屏及本地模型/轨道释放。依赖审计 0 个漏洞。服务保留在 http://127.0.0.1:5173/ 。

# 第二批开发记录（Mori Run · 真实摄像头体感）

## 第一原则落地

- 正式游戏输入只有：真实摄像头 → MediaPipe Face Landmarker → 头部姿态 → 游戏控制。鼠标/键盘仅保留在按 D 打开的隐藏演示面板（调试输入，明确标注非正式体验）。
- 旧鼠标拖光点玩法（MotionGame）与第一批低保真原型（App/Screen/styles.css）已删除。

## MORI RUN

- Canvas 2D 像素横版跑酷，Mori 像素机器人主角（字符串位图精灵：跑/跳/蹲/踉跄），暗青数字办公世界 + 薄荷发光体视觉语言，远景/中景/地面三层视差。
- 固定编排关卡（`src/games/level.ts`）：0–3s 教学 → 跳箱/石块 → 左能量 → 低头横杆 → 右能量 → 连续障碍 → 混合 → 36s 终点 → 共约 38.6s。无随机生成。
- 四个动作：轻抬头=跳，轻低头=蹲（650ms），左/右转头=收集对应侧能量信号（◀/▶ ENERGY，提前 2s 出现，收集窗口 ±2.4s）。
- 健康产品原则：无 Game Over/生命/倒计时。未越过障碍 → Mori 踉跄 + 像素反馈 + 短暂无敌，继续跑。仅有 ENERGY 计数与 ACTIVITY PROGRESS。
- 丢脸即暂停：450ms 防抖后冻结世界，显示「暂时看不到你，请回到屏幕中央」；恢复后 3-2-1 倒计时继续，不重置进度。
- 头部方向 HUD（← ↑ ● ↓ →）8Hz 刷新；识别→动画→像素特效→挂灯脉冲同步反馈。

## 真实校准与动作判定

- `src/games/CalibrationView.tsx`：允许摄像头 → 检测人脸 → 「保持舒适坐姿，看向屏幕」→ 稳定约 1.3s 自动记录 baselineYaw/baselinePitch → 进入游戏。不要求刻意摆姿势。
- 动作判定（`src/vision/gesture.ts` 纯函数）：全部相对用户 baseline；信号为面部关键点几何分数（鼻尖相对双颊中点= yaw，相对双眼连线 = pitch），**符号由成像物理确定，不依赖 MediaPipe 矩阵坐标系假设**：用户左转 → 鼻尖画面右移 → dYaw>0 = left；抬头 → 鼻尖上移 → dPitch>0 = up。矩阵角仅作调试面板诊断显示。
- EMA 平滑（α=0.4）+ 阈值可配置（默认 yaw 0.075 / pitch 0.06）+ 45% 回正重新武装 + 450ms 全局 cooldown 防抖 + 斜向动作取主轴单触发。

## 摄像头性能根因与结论

- **根因**：此前 1–3 FPS 不是代码问题。对照实验（`scripts/diagnose-raf.mjs`）：同一页面非前台窗口 rAF 仅 1.0–1.3 FPS（Chrome 遮挡节流），bringToFront 后含 3D 场景 118.5 FPS；about:blank 前台 120.5 FPS。历史低 FPS 数据全部是窗口不在前台的测量假象。
- 新管线 `src/vision/CameraVision.ts`（全局单例）：共享 FaceLandmarker（校准/游戏复用不重复初始化）、输入 480×270、推理节流 12Hz、推理循环与 React 渲染完全解耦（状态 8Hz 广播，动作即时回调）、丢脸 450ms 防抖。
- **真人实测**（`scripts/measure-game-pipeline.mjs`，2026-09-05）：真实校准自动完成；Mori Run 游戏期间推理 **11.2–11.4 FPS**、单帧 17–26ms、页面 rAF **108.9 FPS**；HUD 实测识别出 ↑/←/● 方向变化。旧 spike 页前台实测 13.4 FPS（15fps 上限）。
- 未引入 Web Worker：主线程推理已达标，按审批不提前复杂化。

## 状态机与联动

- 相位：`activityIntro → calibration → moriRun → reward`（删除 gameHorizontal/Vertical/Tracking 序列）。游戏内方向动作由 `MotionBus` 直发 MoriRun，reducer 只处理 calibrated/gameComplete。保存退出后恢复需重新校准（摄像头已释放）。
- 挂灯联动（DeskScene pulse）：jump 全灯脉冲、left/right 能量对应侧亮、stumble 微暗、complete 绿色波浪；continuous yaw 驱动灯带左右半区。reward 相位沿用既有完成反馈。

## 验证记录

- `npm test` 12/12（状态机 3 + 手势判定 7 + 角度/错误 2）；`npm run build` 通过；`npm run test:e2e` 5/5。
- e2e 覆盖：Mori Run 全流程（调试旁路校准、跳/蹲/左右能量收集 ×2、自然跑完进 reward）、暂停保存恢复（恢复需重新校准）、权限拒绝路径、本地模型零外发请求。
- 已知测量环境限制：e2e 截图在窗口非前台时 portal 投影压扁（rAF 节流导致 CameraRig 停更），产品无此问题；真实前台截图见 `docs/screenshots/repro-headed.png`、`debug-morirun.png`。
- 待真人复核：丢脸暂停恢复全流程、四动作阈值手感（阈值集中在 `defaultGestureConfig` 可调）。

# 第三批开发记录（Luma 角色统一 · LaoA-GrokBot 动画核心移植）

## LaoA-GrokBot 实际复用的部分

源码克隆于 `.workbuddy/laoa-grokbot`（MIT，老A玩AI，见 THIRD_PARTY_NOTICES.md）。只提取角色动画核心，未复制页面/定制器/分享卡 UI：

- `original-data.js` → `src/luma/laoaData.ts`：25 套 Expression 几何（2 ring × 48 点）、POOLS、EXPR_CADENCE、BLINK 节奏表。已渲染 25 表情速查图 `docs/screenshots/laoa-expressions.png` 供视觉映射。
- `app.js` frame() → `src/luma/LumaEngine.ts`：Spring Morph（stiffness 49 / damping 14）、320ms Blink 曲线、gaze 叠加眼睛质心、turn 的 sin/cos longitude 透视、Expression Pool + Cadence 轮换。
- `index.html` shape-body-path → `src/luma/LumaFace.tsx` blob 身体轮廓。
- `styles.css` bounce/tilt/scan/pulse → `src/luma/luma.css` 收敛版（幅度约为原版 1/5~1/7，适配挂灯小屏）。

## 新增 Luma 模块

- `src/luma/lumaTypes.ts`：LumaState（8 个）/ LumaEvent / LumaCarrier / 帧输出类型。
- `src/luma/lumaStateMap.ts`：相位→LumaState 唯一映射；pool 选择基于速查图逐张视觉核对（非按原名机械映射）；事件→临时表情表。
- `src/luma/LumaEngine.ts`：动画核心（非业务状态机，仅 Visual Adapter）。新增呼吸 squash（4.2s ±0.8%）、身体 X 阻尼跟随（死区 0.08）、无输入时自主眼神微动。
- `src/luma/LumaFace.tsx`：SVG 面孔，imperative handle（setGaze/setBody/event），8~12Hz 摄像头输入与 60fps 动画帧直写 DOM，不走 React 重渲染。
- `src/luma/lumaMotion.ts`：头部 yaw/pitch→gaze、faceCenterX→body（镜像）、GazeCenter 自适应隐式 baseline（未校准也可 gaze）。
- `src/luma/LumaCast.tsx`：投屏转场（蓄力→贝塞尔滑入→ripple 展开，反向同理）。
- `src/ui/OfficeView.tsx`：Windows-like 办公场景（文档/表格/聊天窗口、任务栏、实时时钟、光标动画），提醒入口收进 LUMA CARE 挂件。

## 关键设计

- 持续状态（8）与瞬时事件（blink/success/miss/notice/enterGame/exitGame）分离；事件是临时表情 + 定时弹回，不增加业务 State。`src/state/machine.ts` 业务逻辑零改动。
- carrier：lamp / transition / monitor。carrier=monitor 时挂灯只显示 CONNECTED 呼吸点，不渲染第二个 Luma；提醒阶段主屏也不显示第二个 Luma（光环指向挂灯）。
- CameraVision 生命周期改为进入体验后持续运行（Luma 正常工作时也需要 gaze/身体跟随）；权限拒绝静默降级为自主微动。新增广播 rawYaw/rawPitch/faceCenterX（EMA 平滑）。
- 摄像头启动/停止仍只在本地处理，无画面采集上传。

## 验收记录

- `npm test` 12/12；`npm run build` 通过；`npm run test:e2e` 5/5（含更新后的 "认识 Luma" / "Luma Run" 用例）。
- headed Chrome 全流程截图：`docs/screenshots/luma-*.png`（home/focus/三级提醒/投屏/校准/游戏/奖励/返回）。
- 鼠标 gaze 仅调试面板打开时生效；正式体验为 MediaPipe 驱动。
- 待真人复核：真实摄像头下 gaze 方向手感与身体跟随符号（`lumaMotion.ts` 中 GAIN 与镜像符号可调）、三级提醒情绪强度。

# 第四批开发记录（Yukee 统一 · 分身融球 · 收尾修复）

- 用户可见品牌、状态文案、游戏标题与浏览器标题统一为 Yukee；主要工程模块同步改为 `src/yukee/YukeeEngine.ts`、`YukeeFace.tsx`、`YukeeCast.tsx` 与 `src/games/YukeeRun.tsx`，状态相位改为 `yukeeRun`。仅历史截图文件名与 LaoA-GrokBot 第三方来源名称保留原名。
- 游戏尾段卡住的根因是：36 秒越过终点后仍有 2.6 秒庆祝尾声，但人脸丢失逻辑会继续冻结世界时钟，导致 `TOTAL_SECONDS` 永远无法到达。现在识别暂停只覆盖终点前的可玩段，尾声始终确定性推进到 reward，并新增边界回归测试。
- 校准完成后，挂灯 Yukee 本体保持渲染；GSAP 时间线只析出带软连接的能量分身，在挂灯与屏幕之间的受限曲线路径内移动，落入屏幕后结晶成像素角色。返回工作不再播放“整个人飞回去”的反向动画。
- Pixel Yukee 具备 idle / run A / run B / jump / duck / hit / celebrate，成功、受伤、丢失识别与完成事件同步驱动挂灯本体表情及灯条反馈。
- 页面展示层统一 `user-select: none`，只给真实可编辑输入恢复文本选择；游戏舞台在进入时渐亮，随后使用低幅、低频边缘光呼吸。

# 第五批开发记录（Goal Mode · 真人选择闭环与挂灯 HOME）

## 真实输入根因与修复

- 首次 `lampSelection` 位于正式游戏校准之前，旧实现只有 `baseline` 存在时才会发出 Head 与 Nod 事件，因此 Head 完全不能切卡，Hand 即使能切卡也不能点头确认。现在选择页建立独立的 `selectionBaseline`：8 个稳定 Face 样本、yaw/pitch 波动均小于 `0.035` 后就绪；它不会替代后续 1.3 秒游戏校准。
- 旧 `NodDetector` 把 `dPitch > 0` 当成向下，但项目几何契约中正值是抬头。现在向下确认使用 `dPitch <= -0.055`，轨迹窗口 `420ms`、最短运动 `55ms`、最低速度 `0.12/s`、回中区 `|dPitch| < 0.0275`、冷却 `1100ms`；单帧尖峰与持续低头不会确认。
- Head 选择使用独立 `SelectionHeadDetector`：yaw 阈值 `0.065`、中心释放比例 `45%`、冷却 `620ms`。任一方向触发后使用全局 locked，必须回到 `|dYaw| < 0.02925` 才 re-arm，不能从左侧直接甩到右侧连续切卡。
- Hand 保留 EMA `α=0.32`、`380ms` 轨迹窗、最小位移 `0.16`、最小速度 `0.5/s`、`520ms` 冷却。触发后只有回到掌心中心区（`|palmX-0.5| < 0.09`）或手离场后重新出现才 re-arm；停在一侧不会仅因 cooldown 到期再次触发。
- 新增 `setSelectionActive()` 生命周期门。HandLandmarker 只在 `GAME SELECT + hand` 以 7Hz 运行，离开选择页立即清轨迹并停止 Hand 推理；Face 继续以约 12Hz 服务 Yukee gaze、Head 切换和两种模式的点头确认。设置切换会立即重置旧模式检测器，Hand 模式不会静默启用 yaw。
- 摄像头重进失败不再被完全吞掉；GAME SELECT 会显示“摄像头未连接 / 重新连接”，避免界面永久停在无反馈状态。

## HOME / GAME SELECT

- 挂灯 HOME 改为约 `29% / 42% / 29%`：左侧日期、时间与 24 点今日进度，中间 Yukee（motion safe area 内更明显的身体 X 跟随），右侧唯一主按钮“开始活动”与视觉降级的 DEMO 轻/强提醒。
- 删除电脑办公画面中的“体验一次提醒 / 主动活动”控件；选择阶段电脑继续显示办公内容，不再显示选择镜像。游戏选择器只存在于挂灯。
- 叠卡继续沿用中央前景、邻卡缩放、远卡降权与 `480ms` 重排。可用游戏点头后先播放 `420ms` 卡片确认光与 Yukee success，再进入现有 `activityIntro → calibration → YukeeCast → yukeeRun`。
- CloudHop 仅参考 `Interface.pde` 的三段 HOME 与五层中央卡片、`Navigation.pde` 的显式前置状态、`FlowScreens.pde` 的开始前反馈；未移植其完整游戏。

## 验证记录

- `npm test`：48/48；新增 Head 全局锁、Nod 极性/尖峰/持续低头、Hand 严格 re-arm 与 HOME 强提醒入口测试。
- `npm run build`：通过；保留既有 Vite 大 chunk 警告。
- `npm run test:e2e`：6/6（约 2 分钟），覆盖 HOME 入口边界、电脑主屏无控制按钮、选择动画、确认延迟、本地 Hand/Face 模型零外网、权限拒绝、游戏全流程与返回 HOME。
- 真人验收脚本：`scripts/selection-camera-acceptance.mjs`。自动脚本执行时未获得可判定人脸；随后用户已在真实摄像头下手动确认 Head 与 Hand 两套选择/点头闭环成功。
- 真人反馈指出首版叠卡仍有“直接闪切”感；切卡已改为约 `500ms` 两段动画：前卡先用 `140ms` 定向惯性滑出，随后整叠重排并用 `360ms` 从相反方向落稳，点头确认的 `420ms` 发光反馈保持独立。

# 第六批收尾（Reminder scheduler · Game Preview）

- Reminder 根因是 `CONTINUE_WORK` 仍把 `secondaryReminder` 写入 `pending`，通用延迟 effect 会继续升级；旧调度也没有绝对 due time、snooze deadline 或 callback 代际校验。现在 reducer 保存 `reminderDueAt`、`snoozeUntil` 与 `reminderGeneration`，React effect 只负责执行当前代际的单个 timer。
- 弱提示「继续工作」会确认并结束当前周期，从点击时刻建立新的 45 分钟 weak reminder 周期；强提示「稍后」沿用课堂原型既有 1.5 秒延迟作为可观察 snooze，在 deadline 前抑制强提示，到期后才重新打开。
- `public/game-previews/yukee-run.png` 保存用户提供的宽屏场景图，并作为唯一已完成游戏「拾光跑者」的真实 Preview。五张 Card 继续常驻 DOM，图片固定占位、`object-fit: cover`，没有改动 Persistent Card Stack。
- 回归验证：`npm test` 58/58；`npm run build` 通过（保留既有大 chunk 警告）；`npm run test:e2e` 12/12，覆盖 Reminder snooze、Preview 加载、卡片逐帧、主流程、Completion 与本地 Vision。

# G03 增量开发（2026-10-20）

第三张活动卡接入「躯干重心冲浪」；独立肩髋校准、左右交替六次、回中集星、键盘演示、暂停与断流恢复复用现有 React 系统。没有新增依赖，不重做 G01/G02、主页或提醒调度。详细实现、验收证据、双层进度及待真人/硬件实测清单见 [G03 本轮报告](G03-lean-surf-2026-10-20.md)。


### 2026-10-21 · G03体验升级独立方案

从 `d398701` 建立 `codex/g03-experience-v2`，隔离5174；[交付与验证记录](G03-experience-v2-2026-10-21.md)。本轮不合并Hark、不覆盖master。
