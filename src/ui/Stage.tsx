// Khung xem video ở giữa: phát thử, bấm chọn, kéo dời, kéo góc để phóng to, bấm đúp để sửa chữ ngay trên hình.
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Player, type PlayerRef } from '@remotion/player';
import { MainVideo } from '../video/MainVideo';
import { durationInFrames, fmtTime, round3 } from '../model';
import { findItem, getState, patchItems, player, select, setEditing, setFrame, snapshot, useFrame, useStore } from '../store';

type Box = { l: number; t: number; w: number; h: number };

const Clock: React.FC<{ total: number; fps: number }> = ({ total, fps }) => {
  const f = useFrame();
  return (
    <span className="clock">
      {fmtTime(f / fps)} <i>/</i> {fmtTime(total / fps)}
    </span>
  );
};

export const Stage: React.FC = () => {
  const project = useStore((s) => s.project);
  const sel = useStore((s) => s.sel);
  const editing = useStore((s) => s.editing);
  const ref = useRef<PlayerRef>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const frameEl = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 320, h: 568 });
  const [playing, setPlaying] = useState(false);
  const [box, setBox] = useState<Box | null>(null);
  const [editStyle, setEditStyle] = useState<React.CSSProperties | null>(null);
  const total = durationInFrames(project);
  const inputProps = useMemo(() => ({ project }), [project]);

  // vừa khít vùng trống mà vẫn giữ đúng tỉ lệ khung
  useLayoutEffect(() => {
    const el = wrap.current!;
    const fit = () => {
      const r = el.getBoundingClientRect();
      const k = Math.min(r.width / project.width, r.height / project.height);
      setSize({ w: Math.max(80, Math.floor(project.width * k)), h: Math.max(80, Math.floor(project.height * k)) });
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [project.width, project.height]);

  useEffect(() => {
    const p = ref.current;
    if (!p) return;
    const onFrame = (e: any) => setFrame(e.detail.frame);
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    p.addEventListener('frameupdate', onFrame);
    p.addEventListener('play', onPlay);
    p.addEventListener('pause', onPause);
    p.addEventListener('ended', onPause);
    player.seek = (sec) => {
      const st = getState().project;
      const f = Math.max(0, Math.min(durationInFrames(st) - 1, Math.round(sec * st.fps)));
      p.seekTo(f);
      setFrame(f);
    };
    player.toggle = () => {
      if (p.isPlaying()) return p.pause();
      if (p.getCurrentFrame() >= durationInFrames(getState().project) - 1) p.seekTo(0);
      p.play();
    };
    player.pause = () => p.pause();
    player.playing = () => p.isPlaying();
    return () => {
      p.removeEventListener('frameupdate', onFrame);
      p.removeEventListener('play', onPlay);
      p.removeEventListener('pause', onPause);
      p.removeEventListener('ended', onPause);
    };
  }, []);

  const k = size.w / project.width; // tỉ lệ màn hình / khung video
  const elOf = (id: string) => frameEl.current?.querySelector<HTMLElement>(`[data-item-id="${CSS.escape(id)}"]`) || null;

  // Bám theo vị trí thật của khối đang chọn (kể cả khi đang phát).
  const selId = sel.length === 1 ? sel[0] : null;
  useEffect(() => {
    if (!selId) {
      setBox(null);
      setEditStyle(null);
      return;
    }
    let raf = 0;
    let last = '';
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const host = frameEl.current;
      const el = elOf(selId);
      if (!host || !el) {
        if (last !== '') {
          last = '';
          setBox(null);
        }
        return;
      }
      const hr = host.getBoundingClientRect();
      const r = el.getBoundingClientRect();
      const b = { l: r.left - hr.left, t: r.top - hr.top, w: r.width, h: r.height };
      const key = `${b.l.toFixed(1)},${b.t.toFixed(1)},${b.w.toFixed(1)},${b.h.toFixed(1)}`;
      if (key !== last) {
        last = key;
        setBox(b);
        const tb = el.querySelector<HTMLElement>('[data-text-box]');
        if (tb && tb.offsetWidth) {
          const cs = getComputedStyle(tb);
          const m = r.width / tb.offsetWidth; // tỉ lệ thật trên màn hình
          const px = (v: string) => `${(parseFloat(v) || 0) * m}px`;
          setEditStyle({
            fontFamily: cs.fontFamily,
            fontWeight: cs.fontWeight as any,
            fontStyle: cs.fontStyle,
            fontSize: px(cs.fontSize),
            lineHeight: px(cs.lineHeight),
            letterSpacing: cs.letterSpacing === 'normal' ? undefined : px(cs.letterSpacing),
            textAlign: cs.textAlign as any,
            textTransform: cs.textTransform as any,
            padding: `${px(cs.paddingTop)} ${px(cs.paddingRight)} ${px(cs.paddingBottom)} ${px(cs.paddingLeft)}`,
          });
        }
      }
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [selId]);

  // Tìm khối nằm dưới con trỏ (ưu tiên chữ, rồi tới hình ở lớp trên).
  const hit = (cx: number, cy: number) => {
    const host = frameEl.current;
    if (!host) return null;
    const st = getState().project;
    const order = new Map(st.tracks.map((t, i) => [t.id, i]));
    const els = [...host.querySelectorAll<HTMLElement>('[data-item-id]')]
      .map((el) => ({ el, it: st.items.find((i) => i.id === el.dataset.itemId) }))
      .filter((x) => x.it)
      .sort((a, b) => (a.it!.type === 'text' ? 0 : 1) - (b.it!.type === 'text' ? 0 : 1) || order.get(a.it!.track)! - order.get(b.it!.track)!);
    for (const { el, it } of els) {
      const r = el.getBoundingClientRect();
      if (cx >= r.left && cx <= r.right && cy >= r.top && cy <= r.bottom) return it!;
    }
    return null;
  };

  const onDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    const it = hit(e.clientX, e.clientY);
    if (getState().editing && (!it || it.id !== getState().editing)) setEditing(null);
    if (!it) return select([]);
    select([it.id], e.shiftKey);
    player.pause();
    const sx = e.clientX;
    const sy = e.clientY;
    const ox = it.x || 0;
    const oy = it.y || 0;
    let moved = false;
    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture(e.pointerId);
    const mv = (ev: PointerEvent) => {
      const dx = (ev.clientX - sx) / k;
      const dy = (ev.clientY - sy) / k;
      if (!moved && Math.hypot(ev.clientX - sx, ev.clientY - sy) < 4) return;
      if (!moved) {
        moved = true;
        snapshot();
      }
      let nx = Math.round(ox + dx);
      let ny = Math.round(oy + dy);
      // hít vào tâm khung
      if (Math.abs(nx) < 14) nx = 0;
      if (Math.abs(ny) < 14) ny = 0;
      patchItems([it.id], { x: nx, y: ny }, false);
    };
    const up = () => {
      target.removeEventListener('pointermove', mv);
      target.removeEventListener('pointerup', up);
      target.removeEventListener('pointercancel', up);
    };
    target.addEventListener('pointermove', mv);
    target.addEventListener('pointerup', up);
    target.addEventListener('pointercancel', up);
  };

  const onDouble = (e: React.MouseEvent) => {
    const it = hit(e.clientX, e.clientY);
    if (it?.type === 'text') {
      player.pause();
      setEditing(it.id);
    }
  };

  const onResize = (e: React.PointerEvent) => {
    e.stopPropagation();
    const it = findItem(selId);
    if (!it || !box || !frameEl.current) return;
    const hr = frameEl.current.getBoundingClientRect();
    const cx = hr.left + box.l + box.w / 2;
    const cy = hr.top + box.t + box.h / 2;
    const d0 = Math.max(8, Math.hypot(e.clientX - cx, e.clientY - cy));
    const s0 = it.scale ?? 1;
    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture(e.pointerId);
    snapshot();
    const mv = (ev: PointerEvent) => {
      const d = Math.hypot(ev.clientX - cx, ev.clientY - cy);
      patchItems([it.id], { scale: round3(Math.max(0.05, Math.min(20, (s0 * d) / d0))) }, false);
    };
    const up = () => {
      target.removeEventListener('pointermove', mv);
      target.removeEventListener('pointerup', up);
    };
    target.addEventListener('pointermove', mv);
    target.addEventListener('pointerup', up);
  };

  const editItem = editing ? project.items.find((i) => i.id === editing) : null;
  const selItem = selId ? project.items.find((i) => i.id === selId) : null;
  const centerX = selItem && (selItem.x || 0) === 0;
  const centerY = selItem && (selItem.y || 0) === 0;

  return (
    <section className="stage panel">
      <div className="stage-fit" ref={wrap}>
        <div className="stage-frame" ref={frameEl} style={{ width: size.w, height: size.h }}>
          <Player
            ref={ref}
            component={MainVideo as any}
            inputProps={inputProps}
            durationInFrames={total}
            compositionWidth={project.width}
            compositionHeight={project.height}
            fps={project.fps}
            style={{ width: size.w, height: size.h }}
            controls={false}
            clickToPlay={false}
            doubleClickToFullscreen={false}
            spaceKeyToPlayOrPause={false}
            acknowledgeRemotionLicense
          />
          <div className="stage-overlay" onPointerDown={onDown} onDoubleClick={onDouble}>
            {box && selItem && centerX ? <div className="guide v" /> : null}
            {box && selItem && centerY ? <div className="guide h" /> : null}
            {box && selItem && selItem.type !== 'effect' && selItem.type !== 'audio' ? (
              <div className={`sel-box${editItem ? ' editing' : ''}`} style={{ left: box.l, top: box.t, width: box.w, height: box.h }}>
                {!editItem ? <span className="handle" onPointerDown={onResize} title="Kéo để phóng to, thu nhỏ" /> : null}
                {editItem && editStyle ? (
                  <textarea
                    autoFocus
                    className="inline-edit"
                    style={editStyle}
                    value={editItem.text ?? ''}
                    spellCheck={false}
                    onPointerDown={(e) => e.stopPropagation()}
                    onDoubleClick={(e) => e.stopPropagation()}
                    onFocus={(e) => {
                      snapshot();
                      e.currentTarget.select();
                    }}
                    onChange={(e) => patchItems([editItem.id], { text: e.target.value }, false)}
                    onKeyDown={(e) => {
                      e.stopPropagation();
                      if (e.key === 'Escape') setEditing(null);
                    }}
                    onBlur={() => setEditing(null)}
                  />
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      </div>
      <div className="transport">
        <button className="btn ghost" onClick={() => player.seek(getState().project.fps ? Math.max(0, ref.current!.getCurrentFrame() / project.fps - 1) : 0)} title="Lùi 1 giây">
          ⏪ 1s
        </button>
        <button className="btn play" onClick={() => player.toggle()} title="Phát / dừng (phím cách)">
          {playing ? '⏸' : '▶'}
        </button>
        <button className="btn ghost" onClick={() => player.seek(ref.current!.getCurrentFrame() / project.fps + 1)} title="Tới 1 giây">
          1s ⏩
        </button>
        <Clock total={total} fps={project.fps} />
      </div>
    </section>
  );
};
