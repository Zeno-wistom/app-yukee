/** G03 only: same silver/blue body and mint eyes as G02; no changes to G01 sprites. */
export function surfStar(
  c: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
) {
  c.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5,
      s = i % 2 ? r * 0.43 : r;
    c.lineTo(x + Math.cos(a) * s, y + Math.sin(a) * s);
  }
  c.closePath();
  c.fill();
}
export function drawSurfRobot(
  c: CanvasRenderingContext2D,
  lean: number,
  t: number,
) {
  c.save();
  c.translate(0, -9);
  c.rotate(lean * 0.1);
  const limb = (points: number[], color: string, width: number) => {
    c.beginPath();
    c.moveTo(points[0], points[1]);
    for (let i = 2; i < points.length; i += 2)
      c.lineTo(points[i], points[i + 1]);
    c.strokeStyle = color;
    c.lineWidth = width;
    c.lineJoin = "round";
    c.lineCap = "round";
    c.stroke();
  };
  // Wide comfortable stance, articulated balancing arms.
  limb([-14, -36, -20, -17, -30, -6], "#18354c", 14);
  limb([14, -36, 21, -17, 30, -6], "#18354c", 14);
  limb([-14, -36, -20, -17, -30, -6], "#7aabb8", 7);
  limb([14, -36, 21, -17, 30, -6], "#7aabb8", 7);
  c.fillStyle = "#d4e7e4";
  c.fillRect(-39, -10, 23, 8);
  c.fillRect(19, -10, 23, 8);
  const body = c.createLinearGradient(-22, -75, 25, -32);
  body.addColorStop(0, "#b4d8d8");
  body.addColorStop(0.5, "#446c8d");
  body.addColorStop(1, "#1f405c");
  c.fillStyle = body;
  c.beginPath();
  c.roundRect(-23, -76, 46, 43, 8);
  c.fill();
  c.fillStyle = "#102d47";
  c.fillRect(-12, -61, 24, 20);
  c.fillStyle = "#9bffde";
  c.shadowColor = "#7bf4cc";
  c.shadowBlur = 10;
  c.fillRect(-5, -57, 10, 10);
  c.shadowBlur = 0;
  const sway = Math.sin(t * 1.7) * 2;
  limb([-23, -67, -40, -55 + sway, -54, -66 - lean * 12], "#244b66", 12);
  limb([23, -67, 40, -55 - sway, 54, -66 + lean * 12], "#244b66", 12);
  limb([-23, -67, -40, -55 + sway, -54, -66 - lean * 12], "#a7cace", 5);
  limb([23, -67, 40, -55 - sway, 54, -66 + lean * 12], "#a7cace", 5);
  for (const side of [-1, 1]) {
    c.fillStyle = "#a2f3d6";
    c.beginPath();
    c.arc(side * 54, -66 + side * lean * 12, 6, 0, Math.PI * 2);
    c.fill();
  }
  c.fillStyle = "#799daa";
  c.fillRect(-2, -125, 4, 14);
  c.fillStyle = "#f5d89b";
  c.fillRect(-5, -130, 10, 7);
  c.fillStyle = "#102a44";
  c.beginPath();
  c.roundRect(-36, -114, 72, 48, 13);
  c.fill();
  const shell = c.createLinearGradient(-35, -115, 30, -65);
  shell.addColorStop(0, "#e3f1e9");
  shell.addColorStop(0.5, "#8eb9c7");
  shell.addColorStop(1, "#46718b");
  c.fillStyle = shell;
  c.beginPath();
  c.roundRect(-33, -112, 66, 43, 10);
  c.fill();
  c.fillStyle = "#0c243d";
  c.beginPath();
  c.roundRect(-26, -103, 52, 26, 7);
  c.fill();
  c.fillStyle = "#b4ffe2";
  c.shadowColor = "#92ffe2";
  c.shadowBlur = 8;
  c.beginPath();
  c.roundRect(-16, -97, 7, 15, 3);
  c.roundRect(9, -97, 7, 15, 3);
  c.fill();
  c.shadowBlur = 0;
  c.fillStyle = "#f1ffe8";
  c.fillRect(-25, -110, 43, 2);
  c.restore();
}

/** Shared real-game painters allow faithful full-bleed preview recomposition. */
export function drawSurfBackdrop(c: CanvasRenderingContext2D, t: number) {
  const sky = c.createLinearGradient(0, 0, 0, 540);
  sky.addColorStop(0, "#061326");
  sky.addColorStop(0.43, "#153650");
  sky.addColorStop(0.47, "#236579");
  sky.addColorStop(1, "#062c3c");
  c.fillStyle = sky;
  c.fillRect(0, 0, 960, 540);
  const haze = c.createRadialGradient(570, 205, 5, 570, 205, 390);
  haze.addColorStop(0, "#65d4cd33");
  haze.addColorStop(1, "#6cddd000");
  c.fillStyle = haze;
  c.fillRect(0, 0, 960, 540);
  // Quiet celestial light, island silhouettes and a bright distant inlet.
  c.fillStyle = "#c4e6db";
  c.shadowColor = "#b9fff3";
  c.shadowBlur = 24;
  c.beginPath();
  c.arc(750, 102, 24, 0, Math.PI * 2);
  c.fill();
  c.shadowBlur = 0;
  c.fillStyle = "#102d46";
  c.beginPath();
  c.arc(761, 94, 24, 0, Math.PI * 2);
  c.fill();
  for (let i = 0; i < 65; i++) {
    const sx = (i * 137 + 41) % 960,
      sy = 24 + ((i * 47) % 177);
    c.globalAlpha = 0.24 + 0.4 * (0.5 + 0.5 * Math.sin(t * 0.6 + i));
    c.fillStyle = i % 8 ? "#aedee1" : "#e9d5a5";
    if (i % 9 === 0) surfStar(c, sx, sy, 3);
    else c.fillRect(sx, sy, 1.3, 1.3);
  }
  c.globalAlpha = 1;
  for (let layer = 0; layer < 3; layer++) {
    const h = 205 + layer * 14;
    c.fillStyle = ["#1b425b", "#173c51", "#102e43"][layer];
    c.beginPath();
    c.moveTo(0, h + 20);
    c.lineTo(0, h - 52 + layer * 16);
    for (let i = 0; i < 8; i++)
      c.lineTo(i * 44, h - 16 - Math.sin(i * 1.7 + layer) * 17);
    c.lineTo(370 - layer * 40, h + 22);
    c.closePath();
    c.fill();
    c.beginPath();
    c.moveTo(960, h + 24);
    c.lineTo(960, h - 67 + layer * 13);
    for (let i = 0; i < 7; i++)
      c.lineTo(960 - i * 49, h - 22 - Math.cos(i * 1.4 + layer) * 18);
    c.lineTo(615 + layer * 45, h + 24);
    c.closePath();
    c.fill();
  }
  // Perspective water: scattered short glints fan out from the horizon instead of parallel lines.
  const road = c.createLinearGradient(0, 230, 0, 540);
  road.addColorStop(0, "#82f5de35");
  road.addColorStop(1, "#54e1bb00");
  c.fillStyle = road;
  c.beginPath();
  c.moveTo(490, 232);
  c.bezierCurveTo(470, 310, 560, 380, 365, 540);
  c.lineTo(720, 540);
  c.bezierCurveTo(590, 385, 582, 310, 540, 232);
  c.closePath();
  c.fill();
  for (let i = 0; i < 125; i++) {
    const depth = (i * 0.137 + t * 0.055) % 1,
      spread = ((i * 79) % 997) / 997 - 0.5;
    const yy = 238 + depth * depth * 310,
      xx = 515 + spread * (95 + depth * 1140);
    c.strokeStyle =
      i % 7
        ? `rgba(113,217,208,${0.06 + depth * 0.18})`
        : `rgba(240,225,174,${0.1 + depth * 0.17})`;
    c.lineWidth = 0.5 + depth * 1.2;
    c.beginPath();
    c.moveTo(xx, yy);
    c.quadraticCurveTo(
      xx + 8 + depth * 15,
      yy - 1 - depth * 2,
      xx + 12 + depth * 28,
      yy,
    );
    c.stroke();
  }
  // Soft side currents frame a playable central channel.
  for (const side of [-1, 1]) {
    c.strokeStyle = "#61dcca21";
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(510 + side * 45, 236);
    c.bezierCurveTo(
      500 + side * 140,
      280,
      470 + side * 240,
      390,
      480 + side * 430,
      540,
    );
    c.stroke();
  }
}
export function drawSurfRider(
  c: CanvasRenderingContext2D,
  lean: number,
  t: number,
  tilt = lean * 0.12,
) {
  c.save();
  c.translate(0, Math.sin(t * 1.8) * 3);
  c.rotate(tilt);
  c.fillStyle = "#020f2466";
  c.beginPath();
  c.ellipse(0, 12, 104, 15, 0, 0, Math.PI * 2);
  c.fill();
  const board = c.createLinearGradient(0, -12, 0, 16);
  board.addColorStop(0, "#c3ffdf");
  board.addColorStop(0.4, "#48d9bc");
  board.addColorStop(1, "#146b77");
  c.shadowColor = "#5fffd3";
  c.shadowBlur = 20;
  c.fillStyle = board;
  c.beginPath();
  c.moveTo(-109, 0);
  c.bezierCurveTo(-67, -26, 74, -20, 109, -7);
  c.bezierCurveTo(90, 20, -70, 27, -109, 0);
  c.fill();
  c.shadowBlur = 0;
  c.strokeStyle = "#b9ffdf";
  c.lineWidth = 1.8;
  c.beginPath();
  c.moveTo(-100, -1);
  c.bezierCurveTo(-58, -17, 61, -15, 99, -7);
  c.stroke();
  c.strokeStyle = "#236b70";
  c.lineWidth = 2;
  c.beginPath();
  c.moveTo(-73, 3);
  c.quadraticCurveTo(0, 12, 72, 0);
  c.stroke();
  drawSurfRobot(c, lean, t);
  c.restore();
}
