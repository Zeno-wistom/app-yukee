/**
 * YUKEE RUN 像素精灵。字符串位图 + 无平滑绘制，保持像素锐利。
 *
 * Pixel Yukee 设计原则（与挂灯 Yukee 同一角色体系的「像素世界版本」）：
 * - 深墨绿圆润胶滴主体（对应挂灯本体的深色 blob 轮廓）
 * - 两只高亮薄荷色眼睛，无嘴（挂灯本体也只有眼睛）
 * - 近黑轮廓保证在亮色游戏背景上的可读性
 * - 简洁、亲切、略未来感，适配横版跑酷
 */
export const PALETTE = {
  skyTop: "#0c2420",
  skyBottom: "#123029",
  far: "#16382f",
  farWindow: "#2b5a4b",
  mid: "#1d4a3d",
  ground: "#2a5a4c",
  groundDark: "#0a1e1a",
  groundLine: "#3f7a64",
  O: "#06120e", // 轮廓（近黑墨绿）
  K: "#1e4a3d", // 主体：深墨绿
  k: "#133129", // 主体底部暗面
  H: "#3b7a63", // 主体高光（圆润感）
  E: "#8de9bc", // 眼睛：高亮薄荷
  F: "#0c241e", // 脚
  A: "#c7ffe7", // 庆祝闪光 / 高亮
  crate: "#c9905c",
  crateDark: "#8a5a33",
  rock: "#7d8d82",
  rockDark: "#55645a",
  bar: "#d9d9cc",
  barWarn: "#e8b45f",
  bird: "#b1f7d9",
  birdDark: "#4f8a70",
  energy: "#ffd98e",
  energyCore: "#fff3d0",
  finish: "#8de9bc",
} as const;

/** 滚动 A：底部右侧略收，像软团子向前滚动，没有手脚。 */
export const YUKEE_RUN_A = [
  "....OOOO....",
  "..OOKKKKOO..",
  ".OKKKKKKKKO.",
  ".OKKHHKKKKO.",
  ".OKEEKKKEEO.",
  ".OKEEKKKEEO.",
  ".OKKKKKKKKO.",
  "OKKKKKKKKKKO",
  "OKKKKKKKKKKO",
  ".OKkKKKKkKO.",
  "..OKKKKKKO..",
  "...OOOOOO...",
];
/** 滚动 B：下缘铺开一点，和 A 帧交替形成果冻回弹。 */
export const YUKEE_RUN_B = [
  "....OOOO....",
  "..OOKKKKOO..",
  ".OKKKKKKKKO.",
  ".OKKHHKKKKO.",
  ".OKEEKKKEEO.",
  ".OKEEKKKEEO.",
  ".OKKKKKKKKO.",
  "OKKKKKKKKKKO",
  "OKKKKKKKKKKO",
  ".OKkKKKKkKO.",
  ".OOKKKKKKOO.",
  "..OOOOOOOO..",
];
/** 待机：稳定的圆角多边形团子。 */
export const YUKEE_IDLE = [
  "....OOOO....",
  "..OOKKKKOO..",
  ".OKKKKKKKKO.",
  ".OKKHHKKKKO.",
  ".OKEEKKKEEO.",
  ".OKEEKKKEEO.",
  ".OKKKKKKKKO.",
  "OKKKKKKKKKKO",
  "OKKKKKKKKKKO",
  ".OKkKKKKkKO.",
  "..OKKKKKKO..",
  "...OOOOOO...",
];
/** 跳跃：身体本身拉长，形变由 Canvas 的 squash/stretch 继续放大。 */
export const YUKEE_JUMP = [
  ".....OO.....",
  "...OOKKOO...",
  "..OKKKKKKO..",
  ".OKKKKKKKKO.",
  ".OKKHHKKKKO.",
  ".OKEEKKKEEO.",
  ".OKEEKKKEEO.",
  ".OKKKKKKKKO.",
  "OKKKKKKKKKKO",
  "OKKKKKKKKKKO",
  ".OKkKKKKkKO.",
  "..OKKKKKKO..",
  "...OOOOOO...",
];
/** 下蹲：压扁成半球 */
export const YUKEE_DUCK = [
  "..OOOOOOOO..",
  ".OKKHHKKKKO.",
  ".OKEEKKKEEO.",
  ".OKEEKKKEEO.",
  "OKKKKKKKKKKO",
  "OKkKKKKKKkKO",
  ".OOOOOOOOOO.",
];
/** 受伤：错眼吃痛，整个团子横向压扁，没有独立肢体。 */
export const YUKEE_HIT = [
  "...OOOOOO...",
  ".OOKKKKKKOO.",
  "OKKKHHKKKKKO",
  "OKE.KKKK.EKO",
  "OKKKKKKKKKKO",
  "OKKKKKKKKKKO",
  ".OKkKKKKkKO.",
  "..OOOOOOOO..",
];
/** 庆祝：弯月笑眼 + 团子整体弹跳 + 薄荷闪光。 */
export const YUKEE_CELEBRATE = [
  "..A......A..",
  "....OOOO....",
  "..OOKKKKOO..",
  ".OKKHHKKKKO.",
  ".OK.EKK.EKO.",
  ".OKE.KE.EKO.",
  ".OKKKKKKKKO.",
  "OKKKKKKKKKKO",
  "OKKKKKKKKKKO",
  ".OKkKKKKkKO.",
  "..OKKKKKKO..",
  "...OOOOOO...",
];

export function drawSprite(
  ctx: CanvasRenderingContext2D,
  map: string[],
  x: number,
  y: number,
  px: number,
) {
  for (let row = 0; row < map.length; row++) {
    const line = map[row];
    for (let col = 0; col < line.length; col++) {
      const ch = line[col];
      if (ch === ".") continue;
      ctx.fillStyle = PALETTE[ch as keyof typeof PALETTE] ?? ch;
      ctx.fillRect(x + col * px, y + row * px, px, px);
    }
  }
}
export function spriteSize(map: string[], px: number) {
  return { w: map[0].length * px, h: map.length * px };
}
