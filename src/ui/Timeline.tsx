// Thanh thời gian nhiều lớp: kéo để dời, kéo mép để cắt, tách, nhân đôi, xoá, nam châm, thu phóng.
import React, { useEffect, useRef } from 'react';
import { KIND_ACCEPTS, clamp, itemEnd, projectDuration, round3 } from '../model';
import type { Item, Track } from '../model';
import {
  addTrack,
  duplicate,
  finishTimelineGesture,
  getState,
  getTime,
  patchItems,
  patchTrack,
  player,
  removeItems,
  removeTrack,
  select,
  setMagnet,
  setPps,
  snapshot,
  splitAt,
  useFrame,
  useStore,
} from '../store';
import { effectOf } from '../video/catalog';
import { dropFromLibrary } from './Library';

const ROW = 38;
const GUTTER = 196;
const KIND_ICON: Record<string, string> = { main: '🎬', overlay: '🖼️', text: '🔤', fx: '✨', audio: '🎵' };

const Playhead: React.FC<{ pps: number; fps: number }> = ({ pps, fps }) => {
  const f = useFrame();
  return <div className="playhead" style={{ transform: `translateX(${(f / fps) * pps}px)` }} />;
};

const label = (it: Item) => {
  if (it.type === 'text') return (it.text || '').replace(/\n/g, ' ⏎ ') || 'Chữ trống';
  if (it.type === 'effect') return `${effectOf(it.fx).icon} ${effectOf(it.fx).label}`;
  return it.name;
};

const step = (pps: number) => {
  for (const s of [0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300]) if (s * pps >= 64) return s;
  return 600;
};

export const Timeline: React.FC = () => {
  const project = useStore((s) => s.project);
  const sel = useStore((s) => s.sel);
  const pps = useStore((s) => s.pps);
  const magnet = useStore((s) => s.magnet);
  const scroller = useRef<HTMLDivElement>(null);
  const total = projectDuration(project);
  const span = Math.max(total + 8, 20);
  const width = span * pps;

  const timeAt = (clientX: number) => {
    const el = scroller.current!;
    const r = el.getBoundingClientRect();
    return Math.max(0, (clientX - r.left - GUTTER + el.scrollLeft) / pps);
  };

  const fit = () => {
    const el = scroller.current;
    if (!el) return;
    setPps((el.clientWidth - GUTTER - 24) / Math.max(2, total));
    el.scrollLeft = 0;
  };

  // lần đầu mở dự án thì thu cho vừa khung
  const fitted = useRef('');
  useEffect(() => {
    if (fitted.current !== project.name && total > 0) {
      fitted.current = project.name;
      fit();
    }
  });

  // Ctrl + lăn chuột để thu phóng
  useEffect(() => {
    const el = scroller.current!;
    const onWheel = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      setPps(getState().pps * (e.deltaY < 0 ? 1.15 : 1 / 1.15));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const scrub = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    player.pause();
    player.seek(timeAt(e.clientX));
    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture(e.pointerId);
    const mv = (ev: PointerEvent) => player.seek(timeAt(ev.clientX));
    const up = () => {
      target.removeEventListener('pointermove', mv);
      target.removeEventListener('pointerup', up);
    };
    target.addEventListener('pointermove', mv);
    target.addEventListener('pointerup', up);
  };

  // các mốc để hít: đầu phát, mép những khối khác, mốc 0
  const snapPoints = (ignore: string) => {
    const pts = [0, getTime()];
    for (const i of getState().project.items) if (i.id !== ignore) pts.push(i.start, itemEnd(i));
    return pts;
  };
  const snap = (t: number, pts: number[]) => {
    let best = t;
    let d = 8 / getState().pps;
    for (const p of pts) {
      if (Math.abs(p - t) < d) {
        d = Math.abs(p - t);
        best = p;
      }
    }
    return best;
  };

  const startDrag = (e: React.PointerEvent, it: Item, mode: 'move' | 'trimL' | 'trimR') => {
    if (e.button !== 0) return;
    e.stopPropagation();
    select([it.id], e.shiftKey);
    const before = { ...it };
    const sx = e.clientX;
    const sy = e.clientY;
    const pts = snapPoints(it.id);
    const media = it.type === 'video' || it.type === 'audio';
    const speed = it.speed || 1;
    const fps = getState().project.fps;
    const q = (v: number) => round3(Math.round(v * fps) / fps); // bám theo từng khung hình
    let moved = false;
    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture(e.pointerId);
    const mv = (ev: PointerEvent) => {
      if (!moved && Math.hypot(ev.clientX - sx, ev.clientY - sy) < 3) return;
      if (!moved) {
        moved = true;
        snapshot();
        player.pause();
      }
      const dt = (ev.clientX - sx) / getState().pps;
      const st = getState();
      if (mode === 'move') {
        let start = Math.max(0, before.start + dt);
        const s1 = snap(start, pts);
        const s2 = snap(start + before.dur, pts) - before.dur;
        // ưu tiên mép nào thật sự bắt được mốc; cả hai cùng bắt thì lấy mép gần hơn
        const d1 = Math.abs(s1 - start);
        const d2 = Math.abs(s2 - start);
        start = d1 === 0 ? s2 : d2 === 0 ? s1 : d1 <= d2 ? s1 : s2;
        // đổi lớp khi kéo lên/xuống sang lớp cùng loại
        let track = st.project.items.find((i) => i.id === it.id)?.track || before.track;
        const rows = scroller.current!.querySelectorAll<HTMLElement>('[data-track-row]');
        for (const row of rows) {
          const r = row.getBoundingClientRect();
          if (ev.clientY >= r.top && ev.clientY < r.bottom) {
            const tr = st.project.tracks.find((t) => t.id === row.dataset.trackRow);
            if (tr && KIND_ACCEPTS[tr.kind].includes(it.type)) track = tr.id;
          }
        }
        patchItems([it.id], { start: q(Math.max(0, start)), track }, false);
      } else if (mode === 'trimR') {
        let end = snap(before.start + before.dur + dt, pts);
        let dur = Math.max(0.1, end - before.start);
        if (media && before.srcDur) dur = Math.min(dur, (before.srcDur - (before.trim || 0)) / speed);
        patchItems([it.id], { dur: Math.max(q(dur), 1 / fps) }, false);
      } else {
        let start = snap(before.start + dt, pts);
        start = clamp(start, 0, before.start + before.dur - 0.1);
        if (media) start = Math.max(start, before.start - (before.trim || 0) / speed);
        start = q(start);
        const d = start - before.start;
        patchItems([it.id], { start: round3(start), dur: round3(before.dur - d), ...(media ? { trim: round3(Math.max(0, (before.trim || 0) + d * speed)) } : {}) }, false);
      }
    };
    const up = () => {
      target.removeEventListener('pointermove', mv);
      target.removeEventListener('pointerup', up);
      target.removeEventListener('pointercancel', up);
      if (moved) finishTimelineGesture(it.id, before, mode);
    };
    target.addEventListener('pointermove', mv);
    target.addEventListener('pointerup', up);
    target.addEventListener('pointercancel', up);
  };

  const onDrop = (e: React.DragEvent, track?: Track) => {
    e.preventDefault();
    const raw = e.dataTransfer.getData('application/x-studio');
    if (raw) dropFromLibrary(JSON.parse(raw), timeAt(e.clientX), track?.id);
  };

  const s = step(pps);
  const ticks: number[] = [];
  for (let t = 0; t <= span; t += s) ticks.push(t);

  return (
    <section className="timeline panel">
      <div className="tl-bar">
        <strong>Thanh thời gian</strong>
        <button className="btn" onClick={() => splitAt(getTime())} title="Tách khối tại đầu phát (Ctrl+B)">
          ✂️ Tách
        </button>
        <button className="btn" onClick={() => duplicate(getState().sel)} disabled={!sel.length} title="Nhân đôi (Ctrl+D)">
          👯 Nhân đôi
        </button>
        <button className="btn" onClick={() => removeItems(getState().sel)} disabled={!sel.length} title="Xoá (Delete)">
          🗑️ Xoá
        </button>
        <button className={`btn toggle${magnet ? ' on' : ''}`} onClick={() => setMagnet(!magnet)} title="Bật: lớp video chính luôn liền mạch, xoá/cắt thì phần sau tự dồn lên">
          🧲 Nam châm {magnet ? 'bật' : 'tắt'}
        </button>
        <span className="grow" />
        <div className="menu">
          <button className="btn ghost">＋ Thêm lớp</button>
          <div className="menu-list up">
            <button onClick={() => addTrack('text', 'Chữ')}>🔤 Lớp chữ</button>
            <button onClick={() => addTrack('overlay', 'Cảnh chèn')}>🖼️ Lớp cảnh chèn</button>
            <button onClick={() => addTrack('fx', 'Hiệu ứng')}>✨ Lớp hiệu ứng</button>
            <button onClick={() => addTrack('audio', 'Âm thanh')}>🎵 Lớp âm thanh</button>
          </div>
        </div>
        <label className="zoom" title="Thu phóng thanh thời gian (Ctrl + lăn chuột)">
          🔍
          <input type="range" min={8} max={400} value={pps} onChange={(e) => setPps(Number(e.target.value))} />
        </label>
        <button className="btn ghost" onClick={fit}>
          ⤢ Vừa khung
        </button>
      </div>
      <div className="tl-scroll" ref={scroller} onDragOver={(e) => e.preventDefault()} onDrop={(e) => onDrop(e)}>
        <div className="tl-inner" style={{ width: width + GUTTER }}>
          <div className="tl-ruler" style={{ marginLeft: GUTTER }} onPointerDown={scrub}>
            {ticks.map((t) => (
              <span key={t} className="tick" style={{ left: t * pps }}>
                {t >= 60 ? `${Math.floor(t / 60)}:${String(Math.round(t % 60)).padStart(2, '0')}` : `${t}s`}
              </span>
            ))}
          </div>
          {project.tracks.map((tr) => (
            <div key={tr.id} className={`tl-row kind-${tr.kind}${tr.hidden ? ' off' : ''}`} style={{ height: ROW }}>
              <div className="tl-head" style={{ width: GUTTER }}>
                <button
                  className="icon"
                  onClick={() => patchTrack(tr.id, tr.kind === 'audio' ? { muted: !tr.muted } : { hidden: !tr.hidden })}
                  title={tr.kind === 'audio' ? 'Tắt/bật tiếng lớp này' : 'Ẩn/hiện lớp này'}
                >
                  {tr.kind === 'audio' ? (tr.muted ? '🔇' : '🔊') : tr.hidden ? '🚫' : '👁️'}
                </button>
                <span className="k">{KIND_ICON[tr.kind]}</span>
                <input
                  className="tname"
                  value={tr.name}
                  onChange={(e) => patchTrack(tr.id, { name: e.target.value })}
                  onKeyDown={(e) => e.stopPropagation()}
                  title="Bấm để đổi tên lớp"
                />
                {tr.kind === 'main' || tr.kind === 'overlay' ? (
                  <button className="icon" onClick={() => patchTrack(tr.id, { muted: !tr.muted })} title="Tắt/bật tiếng của video trên lớp này">
                    {tr.muted ? '🔇' : '🔊'}
                  </button>
                ) : null}
                <button
                  className="icon del"
                  onClick={() => {
                    const n = project.items.filter((i) => i.track === tr.id).length;
                    if (!n || confirm(`Xoá lớp "${tr.name}" cùng ${n} khối trên đó?`)) removeTrack(tr.id);
                  }}
                  title="Xoá lớp"
                >
                  ×
                </button>
              </div>
              <div className="tl-lane" data-track-row={tr.id} style={{ width }} onPointerDown={(e) => (e.target === e.currentTarget ? (select([]), scrub(e)) : null)} onDrop={(e) => (e.stopPropagation(), onDrop(e, tr))} onDragOver={(e) => e.preventDefault()}>
                {project.items
                  .filter((i) => i.track === tr.id)
                  .map((it) => (
                    <div
                      key={it.id}
                      className={`clip type-${it.type}${sel.includes(it.id) ? ' sel' : ''}`}
                      style={{ left: it.start * pps, width: Math.max(6, it.dur * pps - 1) }}
                      onPointerDown={(e) => startDrag(e, it, 'move')}
                      onDoubleClick={() => player.seek(it.start + 0.01)}
                      title={label(it)}
                    >
                      <span className="grip l" onPointerDown={(e) => startDrag(e, it, 'trimL')} />
                      <span className="clip-label">{label(it)}</span>
                      <span className="grip r" onPointerDown={(e) => startDrag(e, it, 'trimR')} />
                    </div>
                  ))}
              </div>
            </div>
          ))}
          <div className="playhead-wrap" style={{ left: GUTTER }}>
            <Playhead pps={pps} fps={project.fps} />
          </div>
        </div>
      </div>
    </section>
  );
};
