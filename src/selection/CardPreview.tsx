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
import type { CSSProperties } from "react";

export interface CardPreviewProps {
  card: GameCard;
  /** 当前卡 1 / 邻卡 0.85 / 背卡 0.55，由父级控制透明度 */
  dim: number;
}

export function CardPreview({ card, dim }: CardPreviewProps) {
  return (
    <div className="lamp-card-preview" style={{ opacity: dim,
      ...(card.id === "winglight" ? { "--moon-preview": `url("${card.previewImage}")` } : {}),
    } as CSSProperties} aria-hidden>
      {card.preview === "yukeeRun" && (
        <YukeeRunPreview palette={card.palette} />
      )}
      {card.preview === "winglight" && (
        <WinglightPreview palette={card.palette} />
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

/** G02「展翼接光」观感：光海、小帆船、张开的双翼帆与能量光球 */
function WinglightPreview({ palette }: { palette: GameCard["palette"] }) {
  return (
    <svg viewBox="0 0 650 280" preserveAspectRatio="xMidYMid slice">
      <defs>
        <linearGradient id="wingPreviewSky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={palette.sky} />
          <stop offset="62%" stopColor="#14505c" />
          <stop offset="100%" stopColor="#2c7d7d" />
        </linearGradient>
        <radialGradient id="wingPreviewGlow" cx="50%" cy="60%" r="55%">
          <stop offset="0%" stopColor={palette.accent} stopOpacity="0.32" />
          <stop offset="100%" stopColor={palette.accent} stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="650" height="280" fill="url(#wingPreviewSky)" />
      {/* 远处光带与海平线 */}
      <ellipse cx="325" cy="196" rx="360" ry="78" fill="url(#wingPreviewGlow)" />
      <path
        d="M0 186 Q 120 176 260 186 T 650 182 L650 210 L0 210 Z"
        fill={palette.paper}
        opacity="0.1"
      />
      {/* 光点 */}
      {[
        [72, 64, 2.4],
        [148, 108, 1.6],
        [520, 78, 2.2],
        [590, 132, 1.5],
        [240, 48, 1.4],
        [430, 52, 1.8],
        [96, 152, 1.3],
        [560, 176, 1.7],
      ].map(([x, y, r]) => (
        <circle key={`${x}-${y}`} cx={x} cy={y} r={r} fill={palette.paper} opacity="0.6" />
      ))}
      {/* 海面涟漪 */}
      {[214, 232, 250, 268].map((y, i) => (
        <path
          key={y}
          d={`M0 ${y} Q 90 ${y - 6} 190 ${y} T 390 ${y - 2} T 650 ${y + 1}`}
          fill="none"
          stroke={palette.paper}
          strokeOpacity={0.14 - i * 0.02}
          strokeWidth="2"
        />
      ))}
      {/* 船体 */}
      <g>
        <path
          d="M226 232 Q 325 252 424 232 L404 258 Q 325 274 246 258 Z"
          fill={palette.ink}
          stroke={palette.paper}
          strokeOpacity="0.55"
          strokeWidth="2"
        />
        <path
          d="M250 240 Q 325 250 400 240"
          fill="none"
          stroke={palette.accent}
          strokeOpacity="0.5"
          strokeWidth="2"
        />
        {/* 桅杆 */}
        <rect x="322" y="122" width="4" height="112" rx="2" fill={palette.ink} />
        {/* 双翼帆：向外张开 */}
        <path
          d="M320 130 C 282 148 254 176 246 214 L 320 214 Z"
          fill={palette.paper}
          opacity="0.82"
        />
        <path
          d="M328 130 C 366 148 394 176 402 214 L 328 214 Z"
          fill={palette.paper}
          opacity="0.82"
        />
        <path
          d="M320 138 C 292 154 270 178 262 206"
          fill="none"
          stroke={palette.sky}
          strokeOpacity="0.35"
          strokeWidth="2"
        />
        <path
          d="M328 138 C 356 154 378 178 386 206"
          fill="none"
          stroke={palette.sky}
          strokeOpacity="0.35"
          strokeWidth="2"
        />
        {/* 缆绳：手部 → 帆外角（与正式游戏同一连接关系） */}
        <line x1="295" y1="194" x2="248" y2="182" stroke={palette.paper} strokeWidth="1.4" opacity="0.75" />
        <line x1="345" y1="194" x2="402" y2="182" stroke={palette.paper} strokeWidth="1.4" opacity="0.75" />
        {/* 船上的 Yukee 火柴人机器人：与正式游戏同一形象（展开姿态） */}
        <g transform="translate(0 0)">
          {/* 腿 */}
          <rect x="315" y="224" width="3.4" height="14" rx="1.6" fill={palette.ink} stroke={palette.paper} strokeOpacity="0.6" strokeWidth="1" />
          <rect x="321.6" y="224" width="3.4" height="14" rx="1.6" fill={palette.ink} stroke={palette.paper} strokeOpacity="0.6" strokeWidth="1" />
          {/* 躯干 */}
          <rect x="314" y="207" width="12" height="17" rx="2.6" fill={palette.ink} stroke={palette.paper} strokeOpacity="0.7" strokeWidth="1.2" />
          <rect x="318" y="213" width="4" height="4" rx="1.2" fill={palette.accent} />
          {/* 双臂：肩→肘→手，拉住缆绳 */}
          <path d="M314 210 L304 202 L295 194" fill="none" stroke={palette.ink} strokeWidth="3.4" strokeLinecap="round" />
          <path d="M326 210 L336 202 L345 194" fill="none" stroke={palette.ink} strokeWidth="3.4" strokeLinecap="round" />
          <circle cx="304" cy="202" r="1.8" fill={palette.paper} />
          <circle cx="336" cy="202" r="1.8" fill={palette.paper} />
          <rect x="292.6" y="191.6" width="4.4" height="4.8" rx="1.4" fill={palette.accent} />
          <rect x="343" y="191.6" width="4.4" height="4.8" rx="1.4" fill={palette.accent} />
          {/* 天线 */}
          <rect x="319" y="181" width="1.6" height="7" rx="0.8" fill={palette.ink} />
          <circle cx="319.8" cy="180" r="1.7" fill={palette.accent} />
          {/* 头部：保留 Yukee 像素眼轮廓 */}
          <g transform="translate(308.8 187.6) scale(0.62)">
            <path
              d="M18 0 C 29 0 37 8 37 19 C 37 30 29 38 18 38 C 8 38 0 31 0 21 C 0 9 8 0 18 0 Z"
              fill={palette.ink}
              stroke={palette.paper}
              strokeOpacity="0.7"
              strokeWidth="2.2"
            />
            <rect x="12" y="13" width="5" height="10" rx="2.5" fill={palette.paper} />
            <rect x="22" y="13" width="5" height="10" rx="2.5" fill={palette.paper} />
          </g>
        </g>
      </g>
      {/* 能量光球 */}
      <g transform="translate(325 96)">
        <circle r="26" fill={palette.accent} opacity="0.12" />
        <circle r="13" fill={palette.accent} opacity="0.32" />
        <circle r="6.5" fill={palette.accent} />
        <circle r="2.6" cx="-2" cy="-2" fill="#fff6dd" />
      </g>
    </svg>
  );
}
