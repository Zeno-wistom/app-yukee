// Pure pose-to-input logic. Calibration learns the signs for the user's camera.
export class PoseControl {
  constructor() { this.jumpId = 0; this.reset(); }
  reset() {
    this.stage = 'neutral'; this.samples = []; this.base = null;
    this.yawSign = 1; this.pitchSign = 1; this.filtered = null;
    this.direction = 0; this.armed = false; this.holdStart = 0;
    this.lastTime = 0; this.lastJump = -10000;
  }
  lose() {
    this.direction = 0; this.armed = false; this.filtered = null;
    this.holdStart = 0; this.samples = [];
    return this.packet(false);
  }
  packet(tracked = true) {
    return { tracked, calibrated: this.stage === 'ready', direction: this.direction, jumpId: this.jumpId };
  }
  feed(yaw, pitch, now, turnThreshold = 12, jumpThreshold = 10) {
    if (!Number.isFinite(yaw) || !Number.isFinite(pitch)) return this.lose();
    if (now - this.lastTime > 600) this.lose();
    const alpha = 1 - Math.exp(-Math.min(100, Math.max(1, now - this.lastTime)) / 85);
    this.lastTime = now;
    if (!this.filtered) this.filtered = { yaw, pitch };
    else {
      this.filtered.yaw += alpha * (yaw - this.filtered.yaw);
      this.filtered.pitch += alpha * (pitch - this.filtered.pitch);
    }
    const p = this.filtered;
    if (this.stage === 'neutral') {
      this.samples.push({ ...p, time: now });
      while (this.samples.length && now - this.samples[0].time > 1500) this.samples.shift();
      if (this.samples.length >= 20 && now - this.samples[0].time > 1300) {
        const ys = this.samples.map(s => s.yaw), ps = this.samples.map(s => s.pitch);
        if (Math.max(...ys) - Math.min(...ys) < 5 && Math.max(...ps) - Math.min(...ps) < 5) {
          this.base = { yaw: ys.reduce((a,b) => a+b, 0)/ys.length, pitch: ps.reduce((a,b) => a+b, 0)/ps.length };
          this.stage = 'left'; this.holdStart = 0;
        }
      }
      return this.packet();
    }
    const dy = p.yaw - this.base.yaw, dp = p.pitch - this.base.pitch;
    if (this.stage === 'left') {
      if (Math.abs(dy) > 9) {
        if (!this.holdStart) this.holdStart = now;
        if (now - this.holdStart > 500) { this.yawSign = -Math.sign(dy); this.stage = 'center'; this.holdStart = 0; }
      } else this.holdStart = 0;
    } else if (this.stage === 'center') {
      if (Math.abs(dy) < 5 && Math.abs(dp) < 5) {
        if (!this.holdStart) this.holdStart = now;
        if (now - this.holdStart > 400) { this.stage = 'up'; this.holdStart = 0; }
      } else this.holdStart = 0;
    } else if (this.stage === 'up') {
      if (Math.abs(dp) > 8 && Math.abs(dy) < 12) {
        if (!this.holdStart) this.holdStart = now;
        if (now - this.holdStart > 500) { this.pitchSign = Math.sign(dp); this.stage = 'finish'; this.holdStart = 0; }
      } else this.holdStart = 0;
    } else if (this.stage === 'finish') {
      if (Math.abs(dp) < 5 && Math.abs(dy) < 5) { this.stage = 'ready'; this.armed = true; }
    } else {
      const turn = dy * this.yawSign, up = dp * this.pitchSign;
      // Hysteresis eliminates flicker close to a threshold.
      if (turn > turnThreshold) this.direction = 1;
      else if (turn < -turnThreshold) this.direction = -1;
      else if (Math.abs(turn) < turnThreshold * 0.55) this.direction = 0;
      // Looking down/returning to neutral rearms; holding the head up never repeats.
      if (up < jumpThreshold * 0.45) this.armed = true;
      if (up > jumpThreshold && this.armed && now - this.lastJump > 650) {
        this.jumpId++; this.armed = false; this.lastJump = now;
      }
    }
    return this.packet();
  }
}

export function anglesFromMatrix(matrix) {
  const m = matrix?.data;
  if (!m || m.length !== 16) return null;
  // The canonical face's forward basis, in the returned 4x4 transform.
  // Calibration learns polarity, independent of webcam mirroring.
  const yaw = Math.atan2(m[2], m[10]) * 180 / Math.PI;
  const pitch = Math.atan2(-m[6], Math.hypot(m[2], m[10])) * 180 / Math.PI;
  return Number.isFinite(yaw + pitch) ? { yaw, pitch } : null;
}
