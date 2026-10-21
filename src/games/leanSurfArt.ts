/** G03 solar explorer: pixel silhouettes match the user supplied sunny castle. */
export function surfSun(
  c: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
) {
  c.save();
  c.translate(x, y);
  c.fillStyle = "#fff5b0";
  for (let i = 0; i < 8; i++) {
    c.save();
    c.rotate((i * Math.PI) / 4);
    c.fillRect(-r * 0.12, -r * 1.38, r * 0.24, r * 0.38);
    c.restore();
  }
  c.fillStyle = "#e7a62e";
  c.fillRect(-r * 0.7, -r * 0.85, r * 1.4, r * 1.7);
  c.fillRect(-r * 0.85, -r * 0.7, r * 1.7, r * 1.4);
  c.fillStyle = "#fff2a0";
  c.fillRect(-r * 0.58, -r * 0.74, r * 1.16, r * 1.48);
  c.fillRect(-r * 0.74, -r * 0.58, r * 1.48, r * 1.16);
  c.fillStyle = "#fffbdc";
  c.fillRect(-r * 0.4, -r * 0.5, r * 0.5, r * 0.3);
  c.restore();
}
export function drawSurfRobot(
  c: CanvasRenderingContext2D,
  lean: number,
  t: number,
) {
  c.save();
  c.translate(0, -10);
  c.rotate(lean * 0.08);
  // A new sun-gathering scout: ivory shell, brass joints, river-blue visor and solar backpack.
  const block = (x: number, y: number, w: number, h: number, color: string) => {
    c.fillStyle = color;
    c.fillRect(x, y, w, h);
  };
  block(-31, -87, 62, 42, "#254d58");
  block(-36, -83, 10, 33, "#d6a13e");
  block(26, -83, 10, 33, "#d6a13e");
  block(-29, -86, 58, 31, "#edf4c9");
  block(-23, -83, 46, 19, "#4d8c86");
  for (const s of [-1, 1]) {
    c.save();
    c.translate(s * 20, -22);
    c.rotate(s * 0.12 + lean * 0.08);
    block(-8, -20, 16, 27, "#285665");
    block(-6, -20, 12, 17, "#d6e1ba");
    block(-15, 5, 31, 10, "#1f5365");
    block(-13, 3, 27, 8, "#f5d182");
    c.restore();
    c.save();
    c.translate(s * 30, -73);
    c.rotate(s * (0.48 + Math.sin(t * 1.5) * 0.04) + lean * 0.2);
    block(-8, -2, 16, 25, "#234d5d");
    block(-6, 0, 12, 19, "#e9ebc5");
    block(-5, 19, 10, 7, "#d4a04a");
    block(-7, 25, 14, 13, "#e5edca");
    c.restore();
  }
  block(-24, -77, 48, 45, "#265766");
  block(-21, -77, 42, 39, "#e7edc6");
  block(-21, -77, 42, 8, "#fff9d9");
  block(-13, -62, 26, 20, "#c18a36");
  block(-10, -60, 20, 16, "#fff5aa");
  c.save();
  c.translate(0, -52);
  surfSun(c, 0, 0, 7);
  c.restore();
  block(-3, -134, 6, 14, "#254d58");
  block(-8, -140, 16, 8, "#f6d877");
  block(-4, -143, 8, 5, "#fff8ce");
  block(-34, -125, 68, 45, "#214d5c");
  block(-39, -119, 10, 26, "#d4a54d");
  block(29, -119, 10, 26, "#d4a54d");
  block(-31, -128, 62, 44, "#f4efcf");
  block(-25, -128, 50, 5, "#fffbe5");
  block(-31, -91, 62, 7, "#c7cda8");
  block(-25, -117, 50, 25, "#20576b");
  block(-21, -114, 42, 19, "#287b8b");
  block(-17, -110, 8, 10, "#ffeda0");
  block(9, -110, 8, 10, "#ffeda0");
  block(-4, -99, 8, 3, "#b5e6d2");
  block(-30, -96, 5, 4, "#e3b66a");
  block(25, -96, 5, 4, "#e3b66a");
  // Small leaf pennant, suited to this green river valley.
  block(27, -132, 4, 14, "#275d55");
  block(31, -134, 14, 6, "#78b861");
  block(31, -128, 9, 4, "#a9d57b");
  c.restore();
}
export function drawSurfBackdrop(
  c: CanvasRenderingContext2D,
  t: number,
  image?: CanvasImageSource,
) {
  c.fillStyle = "#4aaff0";
  c.fillRect(0, 0, 960, 540);
  if (image) c.drawImage(image, 0, 0, 960, 540);
  // A sparse current follows the foreground river; the original landscape stays intact.
  for (let i = 0; i < 22; i++) {
    const d = (i * 0.137 + t * 0.06) % 1,
      x = 490 + ((i * 79) % 401) - 100;
    c.fillStyle = `rgba(255,255,214,${0.1 + d * 0.18})`;
    c.fillRect(x, 443 + d * 95, 3 + d * 9, 1 + d);
  }
}
export function drawSurfRider(
  c: CanvasRenderingContext2D,
  lean: number,
  t: number,
  tilt = lean * 0.12,
) {
  c.save();
  c.translate(0, Math.sin(t * 1.8) * 2);
  c.rotate(tilt);
  c.fillStyle = "#154c6b55";
  c.beginPath();
  c.ellipse(0, 15, 100, 12, 0, 0, Math.PI * 2);
  c.fill();
  // River skimmer, warm wood and brass with a turquoise solar rail.
  c.fillStyle = "#28566b";
  c.beginPath();
  c.moveTo(-105, -1);
  c.lineTo(-88, -12);
  c.lineTo(80, -12);
  c.lineTo(106, -3);
  c.lineTo(83, 13);
  c.lineTo(-78, 16);
  c.closePath();
  c.fill();
  c.fillStyle = "#e1b763";
  c.beginPath();
  c.moveTo(-96, -3);
  c.lineTo(-82, -9);
  c.lineTo(78, -9);
  c.lineTo(96, -3);
  c.lineTo(76, 5);
  c.lineTo(-75, 9);
  c.closePath();
  c.fill();
  c.fillStyle = "#fff2bd";
  c.fillRect(-62, -7, 119, 3);
  c.fillStyle = "#46c9c3";
  c.fillRect(-67, 9, 133, 3);
  c.fillStyle = "#719d83";
  c.fillRect(-55, -4, 20, 5);
  c.fillRect(35, -4, 20, 5);
  drawSurfRobot(c, lean, t);
  c.restore();
}
