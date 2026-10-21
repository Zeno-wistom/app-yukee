/**
 * SelectionCardStack —— 挂灯屏内的持久绝对定位卡片栈。
 *
 * 每张真实卡片始终 mounted、key 稳定；selectionIndex 只改变卡片的空间档位。
 * 一条 GSAP timeline 同时完成旧卡离场、目标卡补位与后层洗牌。
 */
import { useRef, useState } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { GAMES } from "./games";
import { CardPreview } from "./CardPreview";

gsap.registerPlugin(useGSAP);

const TOTAL = GAMES.length;
const DURATION = 0.6;

function wrapIndex(index: number) {
  return ((index % TOTAL) + TOTAL) % TOTAL;
}

function offsetFor(cardIndex: number, selectedIndex: number) {
  let offset = (cardIndex - selectedIndex) % TOTAL;
  if (offset < -TOTAL / 2) offset += TOTAL;
  if (offset >= TOTAL / 2) offset -= TOTAL;
  return offset;
}

function tier(offset: number, stageWidth: number) {
  const depth = Math.abs(offset);
  if (depth === 0) return { x: 0, y: 0, scale: 1, opacity: 1, zIndex: 5 };
  if (depth === 1)
    return {
      x: Math.sign(offset) * stageWidth * 0.235,
      y: stageWidth * 0.006,
      scale: 0.76,
      opacity: 0.58,
      zIndex: 3,
    };
  return {
    x: Math.sign(offset) * stageWidth * 0.355,
    y: stageWidth * 0.012,
    scale: 0.58,
    opacity: 0.24,
    zIndex: 1,
  };
}

export function SelectionCardStack({
  selectionIndex,
  devNoticeId,
  confirming,
  onConfirm,
}: {
  selectionIndex: number;
  devNoticeId: string | null;
  confirming: boolean;
  onConfirm?: () => void;
}) {
  const normalizedIndex = wrapIndex(selectionIndex);
  const stageRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<Array<HTMLDivElement | null>>([]);
  const visualIndexRef = useRef(normalizedIndex);
  const [settledIndex, setSettledIndex] = useState(normalizedIndex);
  const [transition, setTransition] = useState<{
    from: number;
    to: number;
    direction: -1 | 1;
  } | null>(null);

  useGSAP(
    () => {
      const stage = stageRef.current;
      const cards = cardRefs.current;
      if (!stage || cards.some((card) => !card)) return;
      const stageWidth = stage.getBoundingClientRect().width;

      const from = visualIndexRef.current;
      if (from === normalizedIndex) {
        cards.forEach((card, index) => {
          gsap.set(card, {
            xPercent: -50,
            yPercent: -50,
            ...tier(offsetFor(index, normalizedIndex), stageWidth),
          });
        });
        visualIndexRef.current = normalizedIndex;
        setSettledIndex(normalizedIndex);
        return;
      }

      const forward = (normalizedIndex - from + TOTAL) % TOTAL;
      const direction: -1 | 1 = forward > 0 && forward <= TOTAL / 2 ? 1 : -1;
      stage.dataset.transitionStartedAt = String(performance.now());
      setTransition({ from, to: normalizedIndex, direction });

      const timeline = gsap.timeline({
        defaults: {
          duration: DURATION,
          ease: "power3.inOut",
          overwrite: "auto",
        },
        onComplete: () => {
          visualIndexRef.current = normalizedIndex;
          setSettledIndex(normalizedIndex);
          setTransition(null);
        },
      });

      cards.forEach((card, index) => {
        if (!card) return;
        const oldOffset = offsetFor(index, from);
        const nextOffset = offsetFor(index, normalizedIndex);
        const target = tier(nextOffset, stageWidth);
        const wrapsBehind =
          Math.abs(oldOffset) === 2 &&
          Math.abs(nextOffset) === 2 &&
          Math.sign(oldOffset) !== Math.sign(nextOffset);

        if (wrapsBehind) {
          timeline
            .to(card, { opacity: 0, duration: 0.11, ease: "power2.in" }, 0)
            .set(
              card,
              {
                x: target.x,
                y: target.y,
                scale: target.scale,
                zIndex: 0,
              },
              0.12,
            )
            .to(
              card,
              {
                opacity: target.opacity,
                zIndex: target.zIndex,
                duration: 0.3,
                ease: "power2.out",
              },
              0.18,
            );
          return;
        }

        gsap.set(card, {
          zIndex:
            index === from ? 6 : index === normalizedIndex ? 5 : target.zIndex,
        });
        timeline.to(
          card,
          {
            x: target.x,
            y: target.y,
            scale: target.scale,
            opacity: target.opacity,
            zIndex: target.zIndex,
          },
          0,
        );
      });

      return () => timeline.kill();
    },
    {
      scope: stageRef,
      dependencies: [normalizedIndex],
      revertOnUpdate: false,
    },
  );

  return (
    <div
      ref={stageRef}
      className={`lamp-card-stage ${transition ? "is-transitioning" : ""}`}
      data-testid="lamp-card-stage"
      data-transition-direction={transition?.direction ?? 0}
    >
      {GAMES.map((card, index) => {
        const isCurrent = settledIndex === index && !transition;
        const isLeaving = transition?.from === index;
        const isEntering = transition?.to === index;
        const showDev = devNoticeId === card.id;
        return (
          <div
            ref={(node) => {
              cardRefs.current[index] = node;
            }}
            key={card.id}
            className={[
              "lamp-card",
              isCurrent ? "is-current" : "",
              isLeaving ? "is-leaving" : "",
              isEntering ? "is-entering" : "",
              showDev ? "dev-notice" : "",
              isCurrent && confirming ? "is-confirming" : "",
            ]
              .filter(Boolean)
              .join(" ")}
            data-card-id={card.id}
            data-card-role={
              isLeaving
                ? "leaving"
                : isEntering
                  ? "entering"
                  : isCurrent
                    ? "current"
                    : "back"
            }
            aria-hidden={!isCurrent && !isEntering}
            role={isCurrent && onConfirm ? "button" : undefined}
            tabIndex={isCurrent && onConfirm ? 0 : undefined}
            aria-label={isCurrent && onConfirm ? `选择${card.title}` : undefined}
            onClick={isCurrent && !confirming ? onConfirm : undefined}
            onKeyDown={isCurrent && !confirming ? (event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                event.stopPropagation();
                onConfirm?.();
              }
            } : undefined}
          >
            <CardPreview card={card} dim={1} />
            {!card.available && <span className="lamp-card-badge">开发中</span>}
            <div className="lamp-card-side">
              <b>{card.title}</b>
              <span>
                {card.available ? card.subtitle : `${card.type} · 敬请期待`}
              </span>
            </div>
            {showDev && (
              <div className="lamp-card-dev" role="status">
                <div>
                  <b>开发中</b>
                  <span>这款活动还在准备，先试试「{GAMES[0].title}」</span>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
