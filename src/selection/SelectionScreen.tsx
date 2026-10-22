import { useLayoutEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Camera,
  Clock3,
  ScanLine,
} from "lucide-react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { GAMES } from "./games";
import YukeeFace from "../yukee/YukeeFace";

const DETAILS: Record<
  string,
  { label: string; duration: string; description: string; steps: string[] }
> = {
  yukeeRun: {
    label: "01",
    duration: "约 35 秒",
    description:
      "沿着森林里的小路，收集一路的微光。用轻轻的头部动作，陪 Yukee 跑一小段。",
    steps: ["抬头跳过障碍", "低头躲过横杆", "左右转头接能量"],
  },
  winglight: {
    label: "02",
    duration: "5 次舒展",
    description:
      "月光洒在河面，星点从四周慢慢汇集。展开双臂，给小帆船一点向前的力量。",
    steps: ["缓缓展开双臂", "保持片刻接住光", "放松回位完成一次"],
  },
  leanSurf: {
    label: "03",
    duration: "6 束阳光",
    description:
      "坐着也能去冲浪。向阳光轻轻侧倾，再回到中间，慢慢画出一道彩虹。",
    steps: ["坐稳，肩膀放松", "上身向阳光轻轻侧倾", "接住后回到中间"],
  },
  squatJump: {
    label: "05",
    duration: "5 连跳",
    description:
      "在云海浮岛间轻盈前进。小幅浅蹲就能蓄力，站直起跳；蹲多久，决定跳多远。",
    steps: ["站直，双肩入镜", "舒适浅蹲保持蓄力", "站直起跳，双脚不离地"],
  },
};

export default function SelectionScreen({
  selectionIndex,
  onMove,
  onStart,
}: {
  selectionIndex: number;
  onMove: (direction: -1 | 1) => void;
  onStart: () => void;
}) {
  const root = useRef<HTMLElement>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const card = GAMES[selectionIndex];
  const detail = DETAILS[card.id];
  const moveRef = useRef(onMove);
  moveRef.current = onMove;
  const startRef = useRef(onStart);
  startRef.current = onStart;
  const [direction, setDirection] = useState(1);
  const move = (dir: -1 | 1) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setDirection(dir);
    moveRef.current(dir);
  };
  useGSAP(
    () => {
      const reduced = window.matchMedia(
        "(prefers-reduced-motion: reduce)",
      ).matches;
      gsap.fromTo(
        ".selection-active",
        { x: reduced ? 0 : direction * 30, opacity: reduced ? 1 : 0.35 },
        {
          x: 0,
          opacity: 1,
          duration: reduced ? 0 : 0.42,
          ease: "power3.out",
          onComplete: () => {
            busyRef.current = false;
            setBusy(false);
          },
        },
      );
    },
    { scope: root, dependencies: [selectionIndex], revertOnUpdate: true },
  );
  useLayoutEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        e.preventDefault();
        move(e.key === "ArrowRight" ? 1 : -1);
      }
      if (e.key === "Enter" && e.target === document.body && !busyRef.current)
        startRef.current();
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);
  return (
    <section
      ref={root}
      className="selection-screen arcade-surface"
      data-testid="game-selection"
    >
      <div className="selection-heading">
        <div>
          <span className="arcade-kicker">A SMALL RESET / 每天一点轻活动</span>
          <h1>
            挑一个，一起动一动<span>。</span>
          </h1>
          <p>不用赶进度。找到舒服的姿势，让 Yukee 陪你玩一会儿。</p>
        </div>
        <div className="selection-companion">
          <YukeeFace state="calm" sizeVariant="select" />
          <span>准备好就出发</span>
        </div>
      </div>
      <div
        className="selection-carousel"
        aria-roledescription="轮播"
        aria-label="选择体感游戏"
      >
        <button
          className="selection-arrow prev"
          aria-label="上一款游戏"
          disabled={busy}
          onClick={() => move(-1)}
        >
          <ArrowLeft size={24} />
        </button>
        <div className="selection-active" aria-live="polite" aria-atomic="true">
          <div
            className="selection-preview"
            data-testid="selection-preview"
            data-card-id={card.id}
          >
            {/* 接图契约：6.3:1；右 38% 叠字，左 60% 保留图像主体。 */}
            {GAMES.map((item) => (
              <img
                key={item.id}
                src={item.previewImage}
                alt={item.id === card.id ? `${card.title}游戏场景预览` : ""}
                hidden={item.id !== card.id}
                decoding="async"
              />
            ))}
            <div className="selection-preview-caption">
              <span>
                G{detail.label} / {card.en}
              </span>
              <b>{card.title}</b>
            </div>
          </div>
          <div className="selection-detail">
            <div className="selection-story">
              <span className="selection-tag">{card.type}</span>
              <h2>{card.title}</h2>
              <p>{detail.description}</p>
              <span className="selection-duration">
                <Clock3 size={15} /> {detail.duration}
                <i /> 按自己的节奏
              </span>
            </div>
            <div className="selection-how">
              <span className="arcade-kicker">HOW TO PLAY / 这样玩</span>
              <ol>
                {detail.steps.map((step, i) => (
                  <li key={step}>
                    <span>0{i + 1}</span>
                    {step}
                  </li>
                ))}
              </ol>
              <button
                className="primary selection-start"
                onClick={onStart}
                disabled={busy}
              >
                进入游戏 <ArrowUpRight size={20} />
              </button>
              <small>
                <ScanLine size={14} /> 先校准，再开始 · 也可选择键盘演示
              </small>
            </div>
          </div>
        </div>
        <button
          className="selection-arrow next"
          aria-label="下一款游戏"
          disabled={busy}
          onClick={() => move(1)}
        >
          <ArrowRight size={24} />
        </button>
      </div>
      <nav className="selection-pagination" aria-label="游戏目录">
        {GAMES.map((item, index) => (
          <button
            key={item.id}
            disabled={busy}
            aria-label={`查看${item.title}`}
            aria-current={index === selectionIndex ? "true" : undefined}
            onClick={() => {
              if (index === selectionIndex) return;
              const delta = index - selectionIndex;
              busyRef.current = true;
              setBusy(true);
              setDirection(Math.sign(delta));
              for (let i = 0; i < Math.abs(delta); i++)
                moveRef.current(delta > 0 ? 1 : -1);
            }}
          >
            <span>G{DETAILS[item.id].label}</span>
            <b>{item.title}</b>
          </button>
        ))}
      </nav>
      <footer className="selection-footer">
        <span>
          <Camera size={15} /> 摄像头仅在进入游戏后开启 ·
          画面只在本机处理，不保存、不上传
        </span>
        <span>
          ← → 切换 <i /> ENTER 进入
        </span>
      </footer>
    </section>
  );
}
