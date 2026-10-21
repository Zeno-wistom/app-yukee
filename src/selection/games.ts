/**
 * 游戏目录 —— 挂灯卡片选择器的唯一数据源。
 *
 * 课堂选择器共 5 款：
 * 第 1 款是当前真正可玩的 Yukee Run（展示名「拾光跑者」），
 * 其余 4 款直接使用用户提供的像素场景图，界面标「开发中」。
 *
 * `available` 是 reducer LAMP_CONFIRM 事件的唯一依据：
 * true → 进入现有 activityIntro → calibration → yukeeRun 流程；
 * false → 卡片短暂显示「开发中」，停留原地。
 */

export type GamePreviewKind = "yukeeRun" | "winglight" | "image";

export interface GamePalette {
  /** 天空 / 底色 */
  sky: string;
  /** 纸面 / 高光 */
  paper: string;
  /** 地面 / 结构 */
  ground: string;
  /** 强调（金币、太阳、能量） */
  accent: string;
  /** 墨色（线条、剪影） */
  ink: string;
}

export interface GameCard {
  id: string;
  /** 展示名（当前无定名，第一张按现网游戏取名） */
  title: string;
  /** 英文小标 */
  en: string;
  /** 活动类型一句话 */
  type: string;
  /** 副标：玩法提示 / 状态 */
  subtitle: string;
  available: boolean;
  preview: GamePreviewKind;
  /** 用户提供的原始预览图；全部常驻 DOM 以避免切卡时闪白。 */
  previewImage?: string;
  /** 预览铺满整张卡片（信息栏用渐变蒙层叠在图上），图片按卡片比例专门构图。 */
  fullBleed?: boolean;
  palette: GamePalette;
}

export const GAMES: readonly GameCard[] = [
  {
    id: "yukeeRun",
    title: "拾光跑者",
    en: "YUKEE RUN",
    type: "头颈活动",
    subtitle: "抬头跳 · 低头躲 · 左右收能量",
    available: true,
    preview: "image",
    previewImage: "/game-previews/yukee-run.png",
    palette: {
      sky: "#0c2420",
      paper: "#8de9bc",
      ground: "#1c4438",
      accent: "#ffd98e",
      ink: "#04140f",
    },
  },
  {
    // G02：本轮新增的肩臂活动，与 G01 并列可选
    id: "winglight",
    title: "展翼接光",
    en: "WINGLIGHT",
    type: "肩臂伸展",
    subtitle: "缓慢展开 · 保持 · 回位收光",
    available: true,
    preview: "image",
    // 由真实 G02 场景（moon-night 背景 + 游戏内帆船/机器人图层）按卡片 6.3:1 重新构图导出
    previewImage: "/game-previews/winglight-card.png",
    fullBleed: true,
    palette: {
      sky: "#08222b",
      paper: "#c8f0e6",
      ground: "#17474f",
      accent: "#ffd98e",
      ink: "#03141a",
    },
  },
  {
    id: "leanSurf",
    title: "星海冲浪",
    en: "LEAN SURF",
    type: "躯干左右轻微侧倾",
    subtitle: "坐着就能玩 · 往星星那边轻轻歪",
    available: true,
    preview: "image",
    // 由 G03 实际 Canvas 场景函数（drawStarSea 预览构图）按卡片 6.3:1 导出
    previewImage: "/game-previews/star-sea-surf.png",
    fullBleed: true,
    palette: {
      sky: "#dcead8",
      paper: "#f4f8ee",
      ground: "#8fb382",
      accent: "#e8b45c",
      ink: "#33513c",
    },
  },
  {
    id: "moonwindVillage",
    title: "月野风车",
    en: "MOONWIND VILLAGE",
    type: "节奏活动",
    subtitle: "全新玩法，正在酝酿",
    available: false,
    preview: "image",
    previewImage: "/game-select/moonwind-village.png",
    palette: {
      sky: "#dfe4ee",
      paper: "#f6f8fc",
      ground: "#93a3c4",
      accent: "#e0b45f",
      ink: "#3d4a66",
    },
  },
  {
    id: "moonbridgeCity",
    title: "月桥城影",
    en: "MOONBRIDGE CITY",
    type: "平衡活动",
    subtitle: "全新玩法，正在酝酿",
    available: false,
    preview: "image",
    previewImage: "/game-select/moonbridge-city.png",
    palette: {
      sky: "#e6e7d8",
      paper: "#f7f8ee",
      ground: "#a3ad8a",
      accent: "#d8a262",
      ink: "#4c5a42",
    },
  },
  {
    id: "saintGateDawn",
    title: "圣门晨辉",
    en: "SAINT GATE DAWN",
    type: "伸展活动",
    subtitle: "全新玩法，正在酝酿",
    available: false,
    preview: "image",
    previewImage: "/game-select/saint-gate-dawn.png",
    palette: {
      sky: "#dceafa",
      paper: "#fff8e8",
      ground: "#6f8dad",
      accent: "#f4b85c",
      ink: "#243c58",
    },
  },
] as const;

export const getGameById = (id: string): GameCard | undefined =>
  GAMES.find((g) => g.id === id);

export const isGameAvailable = (id: string): boolean =>
  getGameById(id)?.available ?? false;
