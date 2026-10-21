/**
 * 游戏卡片顶视图预览。
 *
 * 两种预览类型：
 *  - "yukeeRun"（拾光跑者）：还原真实游戏观感 —— 深夜跑道、霓虹 Yukee、
 *    障碍与左右能量球，让用户在看板就能认出「这就是那个游戏」。
 *  - "image"：用户提供的四张原始像素场景图，直接裁切显示。
 *
 * 全部为静态 SVG，仅外层卡片做 transform 动画，避免每帧重排。
 */
import type { GameCard } from "./games";

export interface CardPreviewProps {
  card: GameCard;
  /** 当前卡 1 / 邻卡 0.85 / 背卡 0.55，由父级控制透明度 */
  dim: number;
}

export function CardPreview({ card, dim }: CardPreviewProps) {
  return (
    <div className="lamp-card-preview" style={{ opacity: dim }} aria-hidden>
      {card.preview === "yukeeRun" && (
        <YukeeRunPreview palette={card.palette} />
      )}
      {card.preview === "image" && card.previewImage && (
        <img
          src={card.previewImage}
          alt=""
          loading="eager"
          decoding="async"
          draggable={false}
        />
      )}
    </div>
  );
}

/** 真实 Yukee Run 观感：深色跑道 + 霓虹角色 + 障碍 + 左右能量球 */
function YukeeRunPreview({ palette }: { palette: GameCard["palette"] }) {
  return (
    <svg viewBox="0 0 650 280" preserveAspectRatio="xMidYMid slice">
      <rect width="650" height="280" fill={palette.sky} />
      {/* 地平线光晕 */}
      <ellipse
        cx="325"
        cy="235"
        rx="330"
        ry="60"
        fill={palette.paper}
        opacity="0.06"
      />
      {/* 跑道 */}
      <rect
        x="0"
        y="212"
        width="650"
        height="4"
        fill={palette.paper}
        opacity="0.35"
      />
      {/* 跑道刻度 */}
      {[60, 190, 320, 450, 580].map((x) => (
        <rect
          key={x}
          x={x}
          y={222}
          width={26}
          height={3}
          rx={1.5}
          fill={palette.paper}
          opacity="0.22"
        />
      ))}
      {/* 远景像素山 */}
      <path
        d="M0 190 L90 150 L170 190 L260 138 L350 190 L440 152 L540 190 L650 146 L650 280 L0 280 Z"
        fill={palette.ground}
        opacity="0.8"
      />
      {/* 能量球（左） */}
      <g transform="translate(96 96)">
        <circle r="15" fill={palette.accent} opacity="0.18" />
        <circle r="8" fill={palette.accent} />
        <circle r="3.4" cx="-2" cy="-2" fill="#fff4d6" />
      </g>
      {/* 能量球（右） */}
      <g transform="translate(552 118)">
        <circle r="15" fill={palette.accent} opacity="0.18" />
        <circle r="8" fill={palette.accent} />
        <circle r="3.4" cx="-2" cy="-2" fill="#fff4d6" />
      </g>
      {/* 障碍：箱 + 横杆 */}
      <g transform="translate(352 178)">
        <rect
          x="0"
          y="0"
          width="24"
          height="22"
          fill={palette.ground}
          stroke={palette.paper}
          strokeOpacity="0.5"
          strokeWidth="2"
        />
        <rect
          x="5"
          y="5"
          width="6"
          height="6"
          fill={palette.paper}
          opacity="0.5"
        />
      </g>
      <g transform="translate(452 168)">
        <rect
          x="0"
          y="0"
          width="34"
          height="7"
          rx="2"
          fill={palette.ground}
          stroke={palette.paper}
          strokeOpacity="0.5"
          strokeWidth="1.6"
        />
        <rect x="12" y="7" width="5" height="14" fill={palette.ground} />
      </g>
      {/* Yukee（奔跑剪影 + 霓虹眼） */}
      <g transform="translate(120 158)">
        {/* 身体 */}
        <path
          d="M16 0 C30 0 40 10 40 24 C40 38 30 48 16 48 C7 48 0 42 0 30 C0 14 6 0 16 0 Z"
          fill="#0a1d18"
          stroke={palette.paper}
          strokeOpacity="0.6"
          strokeWidth="2"
        />
        {/* 双眼 */}
        <rect x="12" y="16" width="6" height="13" rx="3" fill={palette.paper} />
        <rect x="24" y="16" width="6" height="13" rx="3" fill={palette.paper} />
        {/* 速度线 */}
        <rect
          x="-26"
          y="26"
          width="16"
          height="3"
          rx="1.5"
          fill={palette.paper}
          opacity="0.4"
        />
        <rect
          x="-34"
          y="34"
          width="22"
          height="3"
          rx="1.5"
          fill={palette.paper}
          opacity="0.28"
        />
      </g>
      {/* 终点微光 */}
      <rect
        x="620"
        y="150"
        width="3"
        height="64"
        fill={palette.paper}
        opacity="0.5"
      />
      <rect x="620" y="150" width="16" height="10" fill={palette.accent} />
    </svg>
  );
}
