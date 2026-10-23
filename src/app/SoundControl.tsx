import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Volume1, Volume2, VolumeX } from "lucide-react";
import { audioEngine } from "../audio/engine";

/**
 * 头部音量入口：沿用原来的圆形图标按钮，点开是一张小面板
 * （静音 / 音乐 / 音效）。设置写入 localStorage，刷新后保留。
 */
export default function SoundControl() {
  const settings = useSyncExternalStore(
    (fn) => audioEngine.subscribe(fn),
    () => snapshot(),
  );
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const outside = (e: PointerEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        // 只关面板，不触发游戏暂停
        e.stopImmediatePropagation();
        e.preventDefault();
        setOpen(false);
        button.current?.focus();
      }
    };
    window.addEventListener("pointerdown", outside, true);
    window.addEventListener("keydown", key, true);
    return () => {
      window.removeEventListener("pointerdown", outside, true);
      window.removeEventListener("keydown", key, true);
    };
  }, [open]);

  const muted = settings.muted;
  const Icon = muted ? VolumeX : settings.music + settings.sfx < 0.6 ? Volume1 : Volume2;
  const pct = (v: number) => `${Math.round(v * 100)}%`;

  return (
    <div className="sound-control" ref={wrap}>
      <button
        ref={button}
        className="icon-button"
        aria-label={muted ? "声音设置（已静音）" : "声音设置"}
        aria-expanded={open}
        aria-haspopup="dialog"
        data-testid="sound-button"
        onClick={() => {
          audioEngine.ui("ui-click");
          setOpen((v) => !v);
        }}
      >
        <Icon size={19} />
      </button>
      {open && (
        <div className="sound-panel" role="dialog" aria-label="声音设置" data-testid="sound-panel">
          <div className="sound-panel-head">
            <span className="arcade-kicker">SOUND / 声音</span>
            <button
              className={`sound-mute ${muted ? "is-on" : ""}`}
              aria-pressed={muted}
              data-testid="sound-mute"
              onClick={() => {
                audioEngine.updateSettings({ muted: !muted });
                if (muted) audioEngine.ui("ui-click");
              }}
            >
              {muted ? <VolumeX size={15} /> : <Volume2 size={15} />}
              {muted ? "已静音" : "静音"}
            </button>
          </div>
          <label className="sound-row">
            <span>音乐</span>
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={Math.round(settings.music * 100)}
              aria-label="音乐音量"
              data-testid="sound-music"
              disabled={muted}
              style={{ "--fill": pct(settings.music) } as React.CSSProperties}
              onChange={(e) => audioEngine.updateSettings({ music: Number(e.target.value) / 100 })}
            />
            <output>{pct(settings.music)}</output>
          </label>
          <label className="sound-row">
            <span>音效</span>
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={Math.round(settings.sfx * 100)}
              aria-label="音效音量"
              data-testid="sound-sfx"
              disabled={muted}
              style={{ "--fill": pct(settings.sfx) } as React.CSSProperties}
              onChange={(e) => audioEngine.updateSettings({ sfx: Number(e.target.value) / 100 })}
              // 松手时用当前音量试听一下
              onPointerUp={() => audioEngine.ui("ui-click")}
              onKeyUp={() => audioEngine.ui("ui-click")}
            />
            <output>{pct(settings.sfx)}</output>
          </label>
        </div>
      )}
    </div>
  );
}

// useSyncExternalStore 需要稳定引用：值不变时返回同一个对象
let last = audioEngine.getSettings();
function snapshot() {
  const s = audioEngine.getSettings();
  if (s.music !== last.music || s.sfx !== last.sfx || s.muted !== last.muted) last = s;
  return last;
}
