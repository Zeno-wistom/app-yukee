import { memo, useLayoutEffect, useRef, useState, type RefObject } from "react";
import type { YukeeState } from "../yukee/yukeeTypes";
import "./moonWing.css";
import { MOON_BOAT_TRANSFORM } from "./moonSceneGeometry";
import MoonFireflies, { type MoonFirefliesHandle } from "./MoonFireflies";

/** 场景仅消费显示变量与已确认的计分事件，不参与摄像头、校准或动作判定。 */
export default memo(function MoonWingScene({
  finished,
  mood,
  reps,
  firefliesRef,
}: {
  finished: boolean;
  mood: YukeeState;
  reps: number;
  firefliesRef: RefObject<MoonFirefliesHandle | null>;
}) {
  // 宽于 16:9 的舞台：横向扩展 viewBox，原画两侧用镜像延伸 + 渐暗收边；
  // 船、角色、萤火虫仍在 960×540 坐标里，比例与判定不变。
  const wrap = useRef<HTMLDivElement>(null);
  const [extra, setExtra] = useState(0);
  useLayoutEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const apply = () => {
      const w = el.clientWidth,
        h = el.clientHeight;
      if (!w || !h) return;
      const vbW = Math.min(960 * 2, (540 * w) / h);
      const next = Math.max(0, Math.round((vbW - 960) / 2));
      setExtra((prev) => (Math.abs(prev - next) > 1 ? next : prev));
    };
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <div
      ref={wrap}
      className={`wing-world moon-world ${finished ? "is-finished" : ""}`}
      aria-hidden="true"
    >
      <svg
        className="wing-svg"
        viewBox={`${-extra} 0 ${960 + extra * 2} 540`}
        preserveAspectRatio="xMidYMid meet"
      >
        <defs>
          <linearGradient id="moonCloth" x2="0.8" y2="1">
            <stop stopColor="#e5f5ed" />
            <stop offset=".45" stopColor="#83bacc" />
            <stop offset="1" stopColor="#365783" />
          </linearGradient>
          <linearGradient id="moonWater" x2="0" y2="1">
            <stop stopColor="#65c9ff" stopOpacity="0" />
            <stop offset="1" stopColor="#a6eaff" stopOpacity=".4" />
          </linearGradient>
        </defs>
        {extra > 0 && (
          <g className="moon-extend">
            <defs>
              <linearGradient id="moonEdgeL" x1="1" x2="0">
                <stop stopColor="#04183a" stopOpacity="0.05" />
                <stop offset="1" stopColor="#03122e" stopOpacity="0.62" />
              </linearGradient>
              <linearGradient id="moonEdgeR" x1="0" x2="1">
                <stop stopColor="#04183a" stopOpacity="0.05" />
                <stop offset="1" stopColor="#03122e" stopOpacity="0.62" />
              </linearGradient>
            </defs>
            <image href="/art/g02/moon-night.png" width="960" height="540" preserveAspectRatio="xMidYMid slice" transform="scale(-1 1)" />
            <image href="/art/g02/moon-night.png" width="960" height="540" preserveAspectRatio="xMidYMid slice" transform="translate(1920 0) scale(-1 1)" />
            <rect x={-extra} width={extra} height="540" fill="url(#moonEdgeL)" />
            <rect x="960" width={extra} height="540" fill="url(#moonEdgeR)" />
          </g>
        )}
        <image
          href="/art/g02/moon-night.png"
          width="960"
          height="540"
          preserveAspectRatio="xMidYMid slice"
        />
        {/* 不移动整幅图；仅在前景叠加像素反光，保持桥梁与河流透视。 */}
        <g className="moon-water" fill="#a0e6ff">
          {Array.from({ length: 18 }, (_, i) => (
            <rect
              key={i}
              x={210 + ((i * 71) % 540)}
              y={452 + ((i * 17) % 80)}
              width={10 + ((i * 13) % 42)}
              height={i % 3 === 0 ? 2 : 1}
              opacity={0.1 + (i % 4) * 0.05}
            />
          ))}
        </g>
        <path
          className="moon-light-road"
          d="M670 440 L710 540 H550 L650 440Z"
          fill="url(#moonWater)"
        />
        <g fill="#fff1bf">
          {Array.from({ length: 16 }, (_, i) => (
            <path
              key={i}
              className="moon-star"
              d="M-1-4H1V-1H4V1H1V4H-1V1H-4V-1H-1Z"
              transform={`translate(${85 + ((i * 137) % 800)} ${20 + ((i * 43) % 165)}) scale(${i % 4 === 0 ? 0.8 : 0.4})`}
              style={{ animationDelay: `-${i * 0.71}s` }}
            />
          ))}
        </g>
        <path
          className="moon-meteor"
          d="M740 72l23-9"
          stroke="#d2f6ff"
          strokeWidth="1"
        />
        {/* 航程只随已完成次数前进；浮动包在内层，不覆盖前进变换。 */}
        <g
          className="moon-voyage"
          style={{ transform: `translate(${reps * 8}px, 0px)` }}
        >
          <g transform={MOON_BOAT_TRANSFORM}>
            <g className="moon-bob" data-moon-boat="true">
              <ellipse
                cx="320"
                cy="282"
                rx="109"
                ry="8"
                fill="#061e52"
                opacity=".65"
              />
              <g className="moon-reflection" opacity=".3" fill="#83d7ff">
                <path d="M241 285H398V288H241ZM265 293H379V296H265ZM281 302H358V304H281Z" />
              </g>
              <g key={`ripple-${reps}`} className={reps ? "moon-ripple" : ""}>
                <ellipse
                  cx="320"
                  cy="284"
                  rx="108"
                  ry="7"
                  fill="none"
                  stroke="#c6f5ff"
                  strokeWidth="1.5"
                  opacity="0"
                />
              </g>
              {/* 桅杆在面孔后方偏左折向甲板，避免穿头；下方全部为实体船舷。 */}
              <path d="M316 86H323V160H316Z" fill="#344771" />
              <path
                d="M316 154H323V177H306V193H296V249H289V188H299V172H316Z"
                fill="#304066"
              />
              <path
                d="M317 87H320V159H317ZM290 193H292V249H290Z"
                fill="#b2d5d8"
              />
              <path d="M323 87H343V91H351V95H343V100H323Z" fill="#e8c886" />
              <g className="wing-sail wing-sail-left moon-sail">
                <path
                  d="M317 96H304V102H290V110H277V120H261V132H246V144H233V153H222V161L246 169L270 177L293 182H317Z"
                  fill="url(#moonCloth)"
                  stroke="#c1e3e3"
                  strokeWidth="2"
                />
                <path
                  className="moon-cloth-light"
                  d="M312 102H304V111H288V122H273V134H257V147H243V156H252V162H277V170H312Z"
                  fill="#fff1b9"
                />
                <path
                  d="M315 125H295V132H279V143H260V153H243M314 151H297V158H280V166H262"
                  fill="none"
                  stroke="#426b8c"
                  strokeWidth="1.5"
                />
              </g>
              <g className="wing-sail wing-sail-right moon-sail">
                <path
                  d="M322 96H335V102H349V110H362V120H378V132H393V144H406V153H417V161L393 169L369 177L346 182H322Z"
                  fill="url(#moonCloth)"
                  stroke="#c1e3e3"
                  strokeWidth="2"
                />
                <path
                  className="moon-cloth-light"
                  d="M327 102H335V111H351V122H366V134H382V147H396V156H387V162H362V170H327Z"
                  fill="#fff1b9"
                />
                <path
                  d="M324 125H344V132H360V143H379V153H396M325 151H342V158H359V166H377"
                  fill="none"
                  stroke="#426b8c"
                  strokeWidth="1.5"
                />
              </g>
              {/* 绳端与 IK 手部、帆角共用同一组坐标；画在角色后面。 */}
              <path data-moon-rope="L" className="moon-rope" />
              <path data-moon-rope="R" className="moon-rope" />
              <g transform="translate(38 0)">
                <g
                  className={`moon-robot ${mood === "celebrate" ? "is-happy" : ""}`}
                >
                  <path
                    d="M309 221H318V239H313V244H303V239H309ZM323 221H332V238H337V244H324V238H323Z"
                    fill="#223b64"
                    stroke="#8ebbc9"
                    strokeWidth="1"
                  />
                  <path
                    d="M304 239H316V243H304ZM326 239H336V243H326Z"
                    fill="#b3c9ce"
                  />
                  <path
                    d="M308 200H332V207H335V223H330V228H310V224H305V207H308Z"
                    fill="#38577c"
                    stroke="#132b54"
                    strokeWidth="2"
                  />
                  <path
                    d="M309 203H330V208H309ZM308 209H312V221H308Z"
                    fill="#9bc6ce"
                  />
                  <path d="M313 210H327V223H313Z" fill="#142b50" />
                  <rect
                    className="moon-core"
                    x="317"
                    y="213"
                    width="6"
                    height="7"
                    fill="#ffe6a0"
                  />
                  <path d="M318 166H321V174H318Z" fill="#87b7c9" />
                  <rect x="317" y="164" width="5" height="4" fill="#ffdc8b" />
                  <path
                    d="M305 173H335V177H339V194H335V200H305V196H301V179H305Z"
                    fill="#9bbdcd"
                    stroke="#142c55"
                    strokeWidth="2"
                  />
                  <path
                    d="M306 174H334V178H306ZM303 180H306V193H303Z"
                    fill="#e0ece1"
                  />
                  <path
                    d="M307 180H333V193H329V197H310V193H307Z"
                    fill="#112846"
                  />
                  <path
                    className="moon-eyes"
                    d={
                      mood === "celebrate"
                        ? "M311 187V184H314V187M325 187V184H328V187"
                        : "M311 183H315V189H311ZM325 183H329V189H325Z"
                    }
                    fill="#b4ffe9"
                    stroke={mood === "celebrate" ? "#b4ffe9" : "none"}
                    strokeWidth="2"
                  />
                  {(["l", "r"] as const).map((side) => (
                    <g key={side}>
                      <g className={`wing-arm wing-arm-${side}`}>
                        <rect
                          y="-3.5"
                          width="14"
                          height="7"
                          fill="#779bb7"
                          stroke="#183459"
                        />
                        <rect y="-3" width="6" height="6" fill="#d1dfd9" />
                      </g>
                      <g className={`wing-fore wing-fore-${side}`}>
                        <rect
                          y="-3"
                          width="13.5"
                          height="6"
                          fill="#3d6286"
                          stroke="#132a4e"
                        />
                        <rect y="-2" width="10" height="2" fill="#a5c7d0" />
                        <rect
                          x="11"
                          y="-4"
                          width="6"
                          height="8"
                          fill="#efcf8c"
                          stroke="#253956"
                        />
                      </g>
                    </g>
                  ))}
                </g>
              </g>
              {/* 木船用阶梯轮廓与离散高光，统一像素颗粒而非圆滑几何梯形。 */}
              <path
                d="M218 243H239V248H401V243H422V254H413V263H401V273H386V279H255V273H240V264H230V255H218Z"
                fill="#162c50"
                stroke="#142344"
                strokeWidth="3"
              />
              <path
                d="M228 248H246V252H395V248H415V253H402V258H243V254H228Z"
                fill="#c49d65"
              />
              <path d="M242 259H400V264H392V269H252V265H242Z" fill="#695771" />
              <path d="M256 271H386V276H256Z" fill="#344566" />
              <path
                d="M242 255H398M260 267H388"
                stroke="#a8c6c8"
                strokeWidth="1"
                opacity=".7"
              />
              {[260, 280, 300, 340, 360, 380].map((x) => (
                <rect
                  key={x}
                  x={x}
                  y="260"
                  width="3"
                  height="3"
                  fill="#cdb98a"
                />
              ))}
              <rect
                key={`lamp-${reps}`}
                className={`moon-hull-core ${reps ? "is-rewarded" : ""}`}
                x="315"
                y="258"
                width="10"
                height="7"
                fill="#ffda87"
              />
              <g
                key={`gather-${reps}`}
                className={reps ? "moon-gather" : ""}
                fill="#fff3bd"
              >
                <path
                  d="M317 179H321V184H317ZM317 204H321V209H317ZM317 228H321V233H317Z"
                  opacity="0"
                />
              </g>
              <g className="moon-charged" fill="none" stroke="#fff0b8">
                <path d="M223 162L317 184H322L417 162" />
              </g>
            </g>
          </g>
        </g>
        <MoonFireflies ref={firefliesRef} />
      </svg>
    </div>
  );
});
