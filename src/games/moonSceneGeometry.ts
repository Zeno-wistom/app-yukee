/** 船、帆、角色及缆绳共用一次等比缩放；河面接触点保持上一版位置。 */
export const MOON_BOAT = {
  anchorX: 370,
  anchorY: 506.1,
  localX: 320,
  localY: 282,
  scale: 1.575, // 上一版 1.05 × 1.5
} as const;

export const MOON_BOAT_TRANSFORM =
  `translate(${MOON_BOAT.anchorX} ${MOON_BOAT.anchorY}) ` +
  `scale(${MOON_BOAT.scale}) translate(-${MOON_BOAT.localX} -${MOON_BOAT.localY})`;
