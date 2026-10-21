# G02 独立审查与修复记录（2026-10-20）

## 结论与边界

已在修改前的浏览器中复现并定位校准转游戏的停帧根因，已修复；A/B 级测试与 C 级真人验收分别记录。B 级合成姿态通过不能证明真人动作舒适性和识别成功率，C 级仍待用户实际动作确认。

## 原实现与调用链

- 入口：ProductApp → 挂灯活动选择（selection/games.ts）→ reducer LAMP_CONFIRM。
- G01：calibration → CalibrationView 通过 FaceLandmarker 建立头部 baseline → YukeeCast 抵达后 calibrated 事件 → yukeeRun → gameFlow 用人脸追踪判断暂停 → reward → 返回工作。
- G02：wingCalibration → WingCalibrationView 订阅 CameraVision.onPose → measureWing / WingCalibrator → ProductApp 保存 WingProfile 与 camera/demo 标记 → MOTION(calibrated) → reducer winglight → useWingSession → WingSession → 完成页 → FINISH_GAME 返回 focus。
- CameraVision 是唯一摄像头管理者，同一 MediaStream 上运行 Face、按需 Hand、按需 Pose。MotionBus 仍负责相位动作输入；machine.ts 仍是产品业务状态入口，本轮未改提醒 reducer。

## 可证实根因

旧 WingCalibrationView 将 cameraVision.getVideoElement() 返回的全局推理 video 直接 append 到校准 DOM。校准成功后 React 卸载该 DOM，Chrome 暂停已连接后被移除的视频；track 仍 live、running 仍 true、poseActive 仍 true，所以表面看似摄像头正常，实则 currentTime 不再前进。tickPose 的同帧保护因此不再推理，320ms 后样本过期，随后 WingSession 进入 Lost。

修改前实际日志（模拟视频 + 合成 Pose 输出，完整经过真实校准）：

| 时间点 | video.paused | video.currentTime | Pose调用数 | poseActive | running |
|---|---:|---:|---:|---|---|
| 校准 | false | 4.762218 | 42 | true | true |
| 游戏刚进入 | true | 8.304574 | 83 | true | true |
| 1.7s 后 | true | 8.304574 | 83 | true | true |

因此无需假设用户离开、不应靠降低可见度阈值解决。当前工作副本中 G02 并没有“未检测到人脸”这条字面文案，也没有用 facePresent 判断暂停；真人此前看到的那句精确文案的版本来源尚无法确认。实测的身体 Lost 来源已确认。

另一个边界风险是两个组件独立调用 setPoseActive(bool)，旧清理可影响新订阅；本轮改为由订阅者集合共同持有推理，最后一个订阅者释放才关闭。新订阅回放最近有效帧，保留原时间戳，过期数据仍无效。

## 实质改动

1. 推理 video 只属于 CameraVision，校准预览新建 video 共享现有 MediaStream。卸载仅清理预览绑定，不停止共享轨道。
2. 摄像头异步启动加入版本检查：退出后迟到的授权/模型结果只释放自身资源，不重新启动、不清理新会话；加载模型期间也可以释放已取得的视频轨道。
3. Face 推理错误单独记录，不能终止整条 RAF 连带冻结 Pose；Pose 错误不再静默吞掉，面板可见，过期帧仍会暂停游戏。
4. 校准和游戏统一检查肩、肘、腕六点的可见度、有限坐标与画面边界。模型置信度配置维持 0.5；关键点可见度仍 0.4。
5. 保留低计算量的 2D 手腕外移/肩宽特征。分母统一为当前帧肩宽，消除原游戏在 W0 与当前肩宽之间跳变及与校准不一致的问题。镜像、平移、前后等比缩放有逻辑覆盖。
6. 校准只采新 Pose 帧。双臂同时连续稳定窗口的中位数作为舒适端点，拒绝跨时刻左右峰值拼接与单帧尖峰。取景1s、自然准备2s、展开稳定450ms与3s倒计时保留，避免无真人数据时随意调快。
7. 展开仍取双臂较小值；准备位与回位必须双臂均回到个人阈值内，防止只收回一只手得分。保持展开不重复计分。
8. 丢失后稳定时间必须连续，间断可见不能拼接。主动暂停使未完成动作失效，恢复后先回位，不补计暂停期间的动作。
9. 左右风帆分别连续跟随左右臂；保留光海、机器人和现有配色。进入与恢复后明确提示收回准备。根据证据提示缺失的肩/肘/腕，旧帧过期时只给中性提示。
10. 预览保持完整取景，骨架坐标与等比留边对齐；骨架颜色阈值与判定一致。校准失败会显示实际原因。倒计时改为角落小标记，避免整屏遮住取景与下一步指令。重试不再替换 RAF 正在读的状态对象，也不会丢失订阅或预览。Esc 暂停冻结校准与倒计时。
11. D 面板新增视频轨道、播放状态、Pose帧数/帧龄、最近识别时间、六点可见度、动作阶段、暂停原因与推理错误；默认关闭，不记录图像。生产构建不显示键盘演示链接。

## 验证设计

A 级最终单测：91/91 通过，`npm run build` 通过（仅已有大包体警告）。旧的81个单测基线全通过；旧G02 E2E仅键盘演示，绕过了摄像头校准交接，无法捕获停帧。本轮新增 CameraVision 生命周期单测及 camera 模式浏览器回归，动作由合成关键点驱动，不用按键冒充摄像头动作。

新增浏览器用例使用 Canvas.captureStream 合成视频（真实浏览器视频播放/卸载/解码时钟），只替换 Pose 模型输出。G01 Face 模型仍实际运行且无脸，验证身体追踪独立性。单独用例恢复真正的本地 PoseLandmarker，在空合成视频上检查持续推理与如实无身体。

回归还覆盖游戏中刷新后从原入口重新进入、重新校准，旧局计数不继承。校准转游戏瞬间故意暂停送帧160ms，并记录追踪状态变化，断言交接不产生Lost。

故障敏感性验证：只重新注入旧版 appendChild(全局video) 这一操作，校准卸载后确实 videoPaused=true，帧数冻结，进入 Lost；正常版本的相同路径视频时间、Pose帧数持续增长。

控制台检查只排除精确的一条第三方初始化 INFO 文本：`INFO: Created TensorFlow Lite XNNPACK delegate for CPU.`（MediaPipe 输出到 error 通道）；其他 console.error 与 pageerror 均进入断言。

## 仍待真人确认

- C级：真实摄像头、真实人体完成个人校准与五次动作，尚未完成。
- 2D前视姿态对遮挡、侧身、弱光、镜头视野仍敏感；不能保证所有身高、取景与设备均同样易用。
- 当前保持时长/展开阈值沿用初值，不宣称最佳参数、成功率或提升百分比。
- 模型仍在主线程推理；无实际设备性能数据时未引入 Worker 或新依赖。
- 构建存在原有大包体警告，本轮未做无关拆包。

## 回退与真人测试

修改前独立备份：`C:\Users\rjx58\Documents\ChatGPT\YUKEE-G02-review-backup-20261020-153640`。保留原有 .workbuddy；未覆盖原始资料，未加生产依赖，未改ESP32固件。备份包含 src/tests/scripts 与构建配置；回退可逐文件从该目录恢复本轮修改文件。

本地：<http://127.0.0.1:5173/>。开始体验 → 开始活动 → 展翼接光 → 允许摄像头 → 双手在腰前/桌面入镜，保持准备位 → 自然向两侧展开并停一下 → 倒计时 → 收回准备 → 展开/保持/收回，共5次 → 返回工作。

若还有问题，只需反馈卡在哪一步、画面提示；按 D 可以查看数值诊断，无需理解代码。不要录制或保存摄像头画面。

技术事实核对：[MediaPipe Pose Landmarker Web 官方文档](https://developers.google.com/edge/mediapipe/solutions/vision/pose_landmarker/web_js)（VIDEO模式、新视频帧推理、关键点可见度、同步推理特性）。项目本身未新增外网模型请求。



## 最终执行结果

- A：`npm test` 91/91 通过；`npm run build` 通过。
- B：最终完整执行 `npm run test:e2e -- --reporter=list`，21/21 通过，耗时7.1分钟。包含7项新增摄像头生命周期/故障敏感性/真实本地Pose空画面/刷新测试，以及原有G01、提醒、稍后提醒、视觉、Hand和G02演示回归。
- 控制台：新增正常路径没有未处理页面错误或未解释的console.error；MediaPipe初始化INFO的精确例外见上文。
- 截图：已人工查看 `g02-review-camera-calibration.png`、`g02-review-camera-game.png` 与 `g02-review-camera-complete.png`；均为B级合成数据，非真人画面。
- C：普通Chrome已从原网站入口进入真实G02取景页，未注入测试数据。未截取、保存或上传该页摄像头图像；尚未收到用户完成五次真人动作的反馈。
- 项目进度：4/5；第五阶段A/B完成，C待用户验收。不存在已确认但未处理的自动化失败；构建仍提示既有大包体警告。

## 真人反馈与鼠标选择调整（2026-10-20）

用户反馈：真实摄像头下校准及5次计数基本正常，后期仍有些飘忽。因此C级已有用户完成基础闭环的反馈，但持续稳定性不能视为完全通过，后期漂移仍待继续定位。本次按用户最新指示，先停用选择页的头部/点头输入，改用鼠标，不调整G02识别参数。

- ProductApp 不再激活 useLampInput 的视觉选择路径；旧 head/hand 本机偏好也不能触发选择行为。摄像头仍可用于机器人陪伴、G01游戏及G02身体识别。
- 活动选择新增上一款/下一款、开始按钮；当前卡片也可点击进入。提示改为鼠标选择，不再提示摇头或点头。
- 修改前另存回退点：`C:\Users\rjx58\Documents\ChatGPT\YUKEE-mouse-selection-backup-20261020-162545`。

鼠标选择调整验证：91/91单测、生产构建通过；6项相关E2E通过（入口、稍后提醒、暂停保存、连续三次鼠标选择、G01完整体验、G02 camera模式校准到五次计数）。按钮布局收为两行并增加点击高度后，再次单独运行鼠标选择回归通过。已查看 `docs/screenshots/mouse-selection-controls.png`，右侧控制未溢出挂灯屏。
