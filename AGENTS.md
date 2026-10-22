# 本项目开发约定

- 以用户最新审批为准。第一批：SVG 重建 UI、useReducer 状态机、假输入闭环、独立 Vision Spike。
- UI 基准：`docs/reference/Artificial_Intelligence_and_Industrial_Design_Process.svg`。原始资料只读，不修改。
- 2026-10-22/23 最新审批：浏览器直达游戏选择，游戏使用完整网页视口；不加载外部桌面、显示器、挂灯硬件场景。保留游戏内部像素场景与本机摄像头管线，调试默认隐藏。
- G05 最终预览入口 `G05_FINAL_PREVIEW_IMAGE` 保持 null，待用户交付；选择页兼容 1290×205（约 6.3:1）、cover + left center、右侧 38% 文字区，不生成或替换新图。
- Demo 只触发弱提醒；二次与强提醒必须由用户拒绝事件 + 短延迟触发，禁止自动串联升级。
- `src/state/machine.ts` 是业务状态唯一修改入口。动作输入使用 `src/vision/types.ts` 的契约，调试按钮通过 DebugAdapter 发送。
- 不增加后端、账户、数据库、云服务、健康诊断。不得采集保存上传摄像头画面。
- 运行 `npm test`、`npm run build`；交互改动运行 `npm run test:e2e` 并查看截图。
- 原始资料路径保留，派生截图位于 `docs/screenshots/`。下一批模块目录已预留，未实现目录不要误称完成。
