# YUKEE 产品体验演示 · 首段样片（Hark 版）

> 状态：样片已完成，等待 A/B 验收。本轮到此为止，没有继续制作其余三款游戏的段落。

## 1. 基线与工作区

| 项 | 值 |
|---|---|
| 仓库 | `Zeno-wistom/app-yukee` |
| 游戏基线 | `feature/yukee-audio-final` @ **`f3802d4302ce3af81fe398647c1ccdba7bd82d23`**（motion-polish → final-polish-v2 → audio-final，四款游戏 G01/G02/G03/G05 的最新已交付版本） |
| 旧第三视角场景参考 | `master` @ `d398701` 的 `src/scene/DeskScene.tsx`（与基线中的同名文件逐字相同） |
| 本工作区 | `/workspace/work/hark-video-demo`（git worktree） |
| 本分支 | `hark/video-demo`（从 `f3802d4` 新建；不合并、不改动任何游戏分支） |
| 产品模型 | 用户提供的 `挂燈外殼.3dm`，SHA-256 `86e4cd11…dad3d30e`，原件保存在 `video/model/source/`，未修改 |

正式游戏代码（`src/`）**没有任何改动**；演示相关的一切都在 `video/` 目录。

## 2. 成片

- `video/dist/yukee-demo-sample-hark.mp4`：1920×1080，30 fps，H.264 High / yuv420p，AAC 48 kHz 立体声，31.0 s。
- 实际画面截图：`docs/video-demo/frames/` 与 `docs/video-demo/contact-sheet.jpg`（从 MP4 中解码的帧，不是渲染预览）。
- 模型安装验证截图：`docs/video-demo/model/`（正面 / 侧面剖视 / 3/4 / 背面 / 场景中），汇总见 `docs/video-demo/model-install-sheet.jpg`。
- 成片检查：ffprobe 确认 930 帧、30/1 fps、1920×1080、yuv420p、AAC 48 kHz 立体声、31.000 s；ffmpeg 全片解码无错误；响度归一后平均 −18.3 dB、峰值 −0.9 dB；逐帧核对过两次跳跃中人物下蹲 / 站直与游戏蓄力 / 起跳 / 落地是否同步。

### 镜头表（`video/src/timeline.mjs` 为唯一来源）

| 时间 | 镜头 | 内容 |
|---|---|---|
| 0.0–5.0 | S1 全景缓推 | 用户坐姿打字；显示器为真实办公界面；YUKEE 装在显示器顶部，小屏为平静表情，灯条常亮 |
| 5.0–8.6 | S2 产品近景 | 5.6 s YUKEE 提醒：小屏切 `attentive` + `notice`，灯条呼吸 3 次；6.0 s 主屏切到提醒界面 |
| 8.6–11.6 | S3 人物后方推向屏幕 | 用户抬头看 YUKEE、点头，右手握鼠标；10.9 s 光标按下「开始活动」，镜头推进至屏幕 |
| 11.6–17.3 | S4 屏幕全画面 | 真实网页录制：游戏选择 → 选中浅蹲跳一跳 → 进入游戏 → 键盘演示 → G05 开局 |
| 17.3–20.3 | S5a 第三视角 | 用户站在屏幕前浅蹲 → 站直，第一跳完美落点（屏幕上同步可见） |
| 20.3–23.7 | S5b 游戏全画面 + 画中画 | 第二跳：蓄力 → 起跳 → 完美落点 +2、连击，右下角是同一时刻的人物侧面 |
| 23.7–31.0 | S6 收尾 | 镜头拉远，YUKEE 小屏 `celebrate` 表情；28.4 s 片尾卡与演示说明 |

## 3. 真实完成了什么

### 3.1 产品模型（`video/model/`）
- 3dm 检查：单位毫米，61 个对象，6 个图层（殼 / 屏幕 / 攝像頭 / 后蓋 / 電路板 / 燈罩），6 个材质，Brep/Extrusion 都带渲染网格，可以直接导入；另有 15 条辅助曲线（不导出）。
- 文件里有 4 组空间分离的实体：A 早期外壳、B 爆炸图（含电路板、LED 条、扩散板）、**C 完整装配态**、C2（C 的平移副本）。演示使用 C，四组都会导出，方便核对。
- `convert_3dm.py`：只做格式与单位换算（mm→m，Z-up→Y-up 由场景旋转完成），不重新细分、不简化、不拉伸。
- 材质：颜色取自文件内材质（外壳 #50C9FF 塑胶、灯罩 #FFA245 塑胶、后盖磨砂玻璃、屏幕与摄像头黑色玻璃）；场景中改用 PBR 材质，以便在 WebGL 里得到相近的塑胶 / 玻璃观感。
- **安装方式是根据模型推断的，需要确认**：文件里没有夹具、配重或卡扣件。模型最低的承重面是外壳底面（z = −14.4 mm，前后 y ∈ [−83.2, −64.2]），灯条（y ∈ [−99.7, −83.2]）位于其正前方，扩散板朝下。因此场景这样摆放：外壳底面压在显示器顶面上，灯条后沿与显示器前表面对齐，伸出屏幕前方向下照明；后盖底面比承重面高 2.2 mm，悬在顶面之上，不与显示器穿插。显示器顶部厚度按 64 mm 建模，正好承托到后盖末端（y = −24.2）。
- YUKEE 小屏：在模型屏幕件（obj 23，90 × 27 mm）的前表面叠一层 0.15 mm 的显示平面，贴上 `YukeeFace` 的实时录制画面；与电脑主屏是两个独立的显示区域。

### 3.2 三维场景（`video/src/scene.ts`、`mannequin.ts`）
- 复用旧 `DeskScene.tsx` 的思路：桌面 + 显示器 + 「屏幕门户」把真实 UI 投到屏幕上 + 镜头从全景推向座位视角 + 暖色灯光。实现上改为原生 three.js 逐帧确定性渲染（不依赖实时帧率），以便离线输出无掉帧的 30 fps。
- 旧场景里的长条灯和旧机器人已经去掉，换成新 3dm 模型。
- 人物：程序化「设计人台」风格角色，配合两骨 IK，没有使用任何第三方角色模型，不存在许可问题。姿态有坐姿打字（左右手交替敲击、呼吸）、抬头看 YUKEE、点头、伸手点鼠标、站姿呼吸与重心摆动、浅蹲（骨盆后坐下沉、躯干前倾、手臂前伸平衡）、起身踮脚、完美落地后握拳。
- 渲染：SwiftShader 软件 WebGL（沙箱没有 GPU），ACES 色调映射，RoomEnvironment 反射，2048 阴影贴图。

### 3.3 真实界面与游戏录制（`video/capture/`）
- `vtime.js`：虚拟时间垫片。接管 `performance.now / Date / rAF / setTimeout / setInterval`，并把 CSS 动画、过渡按虚拟时间逐帧设置；`Math.random` 固定种子，所以每次录制的关卡一致。逐帧截图，严格 30 fps，不丢帧。
- 音频：把 `AudioContext` 换成按虚拟时间逐帧推进的 `OfflineAudioContext`，得到游戏音频引擎的**真实输出**（选择页 UI 音、G05 BGM、蓄力、起跳、落地、完美、连击）。
- `capture-g05.mjs`：在真实应用（基线代码，`npm run dev`）里操作：选择页 → 查看浅蹲跳一跳 → 进入游戏 → 键盘演示 → 两次起跳。每跳之前读取页面 `data-need-charge`（游戏自身公开的属性），按住空格对应时长后松开。**输入只走游戏既有的「键盘演示」接口，没有改游戏逻辑，也没有伪造结果**；两次「完美」都是游戏物理自己判出来的。
- `capture-screens.mjs`：主显示器的办公 / 提醒界面使用仓库组件 `MonitorDisplay`（focus → weakReminder）；挂灯小屏使用 `YukeeFace`，状态映射与产品 `yukeeStateForPhase` 一致（calm → attentive → playful → celebrate，叠加 notice / enterGame / success 事件）。

### 3.4 统一时间轴与同步
- `events.json`：录制时写出的真实事件（press / release / landed 的帧号、得分、结果）。
- `timeline.mjs` → `buildTimeline()`：成片时间 = 录制时间 + 11.0 s。人物从 press 前 0.32 s 开始下蹲，在 press 时到达浅蹲；蓄力期间继续下沉，最多 15%；release 前 0.26 s 开始站起，release 时站直并踮脚。第一跳 press 18.167 s、release 18.733 s、落地 19.5 s；第二跳 press 20.8 s、release 21.5 s、落地 22.3 s。三维人物、屏幕贴图、画中画和混音都从同一份数据推导。
- 摄像头模式下，游戏在「站回」时释放；键盘演示在「松开空格」时释放。人物在 release 时刻站直，两种语义一致。

### 3.5 声音（`video/compose/mix_audio.py`）
- 游戏段：录制得到的真实引擎输出。
- 开场：仓库已有的 CC0 曲目 `g02-happy-lullaby.mp3` 作为低电平音乐床。
- 演示合成音（产品里没有，已标注）：房间底噪、键盘敲击、YUKEE 提醒双音、点击「开始活动」时的 `ui-click.wav`（产品素材）。
- 片尾：`g05-complete.wav`（产品素材，Kenney CC0）。

## 4. 演示与实测的边界
- 样片中的人物动作是**预设时间轴驱动的演示**，游戏输入来自「键盘演示」接口。游戏画面里一直显示 `keyboard_demo · 非人体识别`，片尾卡也写明了。**这不是真人摄像头识别实测。**
- 录制环境没有摄像头，校准页会显示「摄像头暂不可用」，还会发出 `ui-error` 提示音。成片在 15.0–16.6 s 停在 G05 开场画面并溶解进游戏，该提示音也被静音；游戏本身的画面与时间不受影响。

## 5. 仍存在的缺陷 / 未验证
1. **产品安装结构需要你确认**：模型没有夹具或卡扣，目前是「外壳底面压在显示器顶面、灯条前伸」的推断方式。如果实际有夹具，请提供对应零件。
2. 提醒流程界面（`MonitorDisplay` 的 focus / weakReminder）来自仓库里保留的旧产品流程；当前正式版本直接从游戏选择页开始。是否沿用这套提醒 UI，需要你确认。
3. 人物是风格化人台，没有面部和手指；坐下 / 站起的过渡用剪辑省略了（S4 屏幕全画面期间完成）。
4. YUKEE 的提醒双音是演示合成音，产品里还没有提醒音效。
5. 软件渲染：没有屏幕空间 AO 和泛光，灯条的发光主要靠自发光与聚光灯。渲染速度约每帧 5 s（两进程并行）。
6. 模型 C 组没有内部电路板（B 爆炸图里有），外观不受影响。
7. 未做 60 fps 版本。
8. S5/S6 中挪开的椅子正好落在人物身后的视线上，构图略显拥挤（不影响动作读取），下一轮可以移到桌侧。
9. 第二跳的游戏提示是「完美 +4」（连续完美的连击加成），字幕写的是「+2，连续完美触发连击」，两者一致。

## 6. 复现与重新导出

```bash
cd /workspace/work/hark-video-demo
# 依赖：Node 22、chromium、ffmpeg、python3（pip: rhino3dm trimesh numpy pillow）
npx vite --host 127.0.0.1 --port 5188 --strictPort &          # 真实应用（基线代码）
npx vite --config video/vite.config.ts &                      # 演示素材 / 三维场景（:5290）

python3 video/model/convert_3dm.py video/model/source/挂燈外殼.3dm video/model/out
cp video/model/out/yukee-lamp-C.glb video/public/models/yukee-lamp-assembled.glb

cd video/capture
JUMPS=2 node capture-g05.mjs /workspace/work/hark-video-demo/video/out/g05   # 真实 G05 + 真实音频 + events.json
node capture-screens.mjs                                                     # 主屏办公/提醒 + YUKEE 小屏
./render-all.sh                                                              # 三维镜头逐帧渲染
cd ../compose
node export-timeline.mjs && python3 mix_audio.py && python3 compose.py ../dist/yukee-demo-sample-hark.mp4
```

- 改镜头 / 时间：`video/src/timeline.mjs`（SHOTS、CUES、GAME_OFFSET）与 `scene.ts` 的 `CAMS`。
- 改动作：`scene.ts` 的 `seated / standing / squat` 姿态与 `poseAt()`。
- 预览：`python3 compose.py --preview 0,150,300` 输出接触表；单帧三维：`http://127.0.0.1:5290/scene.html?f=540`。
