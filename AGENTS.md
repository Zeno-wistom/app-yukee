# 本项目开发约定

- 以用户最新审批为准。第一批：SVG 重建 UI、useReducer 状态机、假输入闭环、独立 Vision Spike。
- UI 基准：`docs/reference/Artificial_Intelligence_and_Industrial_Design_Process.svg`。原始资料只读，不修改。
- 最新审批已进入视觉升级：SVG 仅作信息结构参考，首页必须为真实 Three.js 桌面，允许重设计色彩、机器人与游戏。调试面板默认隐藏。
- Demo 只触发弱提醒；二次与强提醒必须由用户拒绝事件 + 短延迟触发，禁止自动串联升级。
- `src/state/machine.ts` 是业务状态唯一修改入口。动作输入使用 `src/vision/types.ts` 的契约，调试按钮通过 DebugAdapter 发送。
- 不增加后端、账户、数据库、云服务、健康诊断。不得采集保存上传摄像头画面。
- 运行 `npm test`、`npm run build`；交互改动运行 `npm run test:e2e` 并查看截图。
- 原始资料路径保留，派生截图位于 `docs/screenshots/`。下一批模块目录已预留，未实现目录不要误称完成。
