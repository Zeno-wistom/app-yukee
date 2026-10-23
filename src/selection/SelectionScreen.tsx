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
import { MOTION, reducedMotion } from "../motion/tokens";

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
  onPrepare,
  launching = false,
}: {
  selectionIndex: number;
  onMove: (direction: -1 | 1) => void;
  onStart: () => void;
  onPrepare: () => void;
  launching?: boolean;
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
  const direction = useRef(1);
  const launchingRef = useRef(launching);
  launchingRef.current = launching;
  const { contextSafe } = useGSAP({ scope: root });
  const select = contextSafe((delta: number) => {
    if (busyRef.current || launchingRef.current || !delta) return;
    busyRef.current = true;
    setBusy(true);
    direction.current = Math.sign(delta);
    const commit = () => {
      for (let i = 0; i < Math.abs(delta); i++) moveRef.current(delta > 0 ? 1 : -1);
    };
    if (reducedMotion()) { commit(); return; }
    gsap.to(root.current!.querySelector(".selection-active"), {
      x: -direction.current * 48, opacity: 0, scale: 0.985,
      duration: MOTION.exit, ease: "power2.in", onComplete: commit,
    });
  });
  const move = (dir: -1 | 1) => select(dir);
  useGSAP(() => {
    if (reducedMotion()) return;
    const tl = gsap.timeline({ defaults: { ease: MOTION.ease } });
    tl.from(".selection-heading .arcade-kicker, .selection-heading h1, .selection-heading p", {
      y: 16, opacity: 0, duration: 0.5, stagger: 0.065,
    }, 0)
      .from(".selection-companion", { y: 14, opacity: 0, scale: 0.94, duration: 0.6 }, 0.12)
      .from(".selection-pagination, .selection-footer", { y: 12, opacity: 0, duration: 0.4, stagger: 0.06 }, 0.26);
  }, { scope: root });
  useGSAP(
    () => {
      const reduced = reducedMotion();
      gsap.fromTo(
        ".selection-active",
        { x: reduced ? 0 : direction.current * 64, opacity: reduced ? 1 : 0, scale: reduced ? 1 : 0.985 },
        {
          x: 0,
          opacity: 1,
          scale: 1,
          duration: reduced ? 0 : MOTION.card,
          ease: MOTION.ease,
          onComplete: () => {
            busyRef.current = false;
            setBusy(false);
          },
        },
      );
      if (!reduced) gsap.fromTo(".selection-story > *, .selection-how > *", { y: 9, opacity: 0 }, {
        y: 0, opacity: 1, duration: 0.32, stagger: 0.025, delay: 0.08, ease: MOTION.ease,
      });
    },
    { scope: root, dependencies: [selectionIndex], revertOnUpdate: true },
  );
  useLayoutEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || launchingRef.current) return;
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
      data-moving={busy}
      aria-busy={launching}
    >
      <div className="selection-heading">
        <div>
          <span className="arcade-kicker"><i className="status-seed" /> A SMALL RESET / 每天一点轻活动</span>
          <h1>
            挑一个，一起动一动<span>。</span>
          </h1>
          <p>不用赶进度。找到舒服的姿势，让 Yukee 陪你玩一会儿。</p>
        </div>
        <div className="selection-companion">
          <YukeeFace state="calm" sizeVariant="select" />
          <span>准备好就出发<small>YUKEE IS HERE FOR YOU</small></span>
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
          disabled={busy || launching}
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
              <span className="selection-tag"><span>G{detail.label}</span> {card.type}</span>
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
                onPointerEnter={onPrepare}
                onFocus={onPrepare}
                disabled={busy || launching}
                aria-label="进入游戏"
                aria-busy={launching}
              >
                <span>{launching ? "正在出发" : "进入游戏"}</span> <ArrowUpRight size={20} />
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
          disabled={busy || launching}
          onClick={() => move(1)}
        >
          <ArrowRight size={24} />
        </button>
      </div>
      <nav className="selection-pagination" aria-label="游戏目录">
        {GAMES.map((item, index) => (
          <button
            key={item.id}
            disabled={busy || launching}
            aria-label={`查看${item.title}`}
            aria-current={index === selectionIndex ? "true" : undefined}
            onClick={() => {
              if (index === selectionIndex) return;
              select(index - selectionIndex);
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
