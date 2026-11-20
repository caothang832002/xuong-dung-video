import React from 'react';
import { AbsoluteFill, Audio, Img, OffthreadVideo, Sequence, interpolate, random, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import type { CSSProperties } from 'react';
import type { Item, Project } from '../model';
import { presetOf } from './catalog';
import { useFontsReady } from './fonts';

export type VideoProps = { project: Project; assetBase?: string };

const srcUrl = (src: string, base?: string) => {
  if (/^(https?:|data:|blob:)/.test(src)) return src;
  const path = src.split('/').map(encodeURIComponent).join('/');
  return `${base || ''}/${path}`;
};

const ANIM = 0.35; // giây cho chuyển động vào/ra

const fadeVolume = (it: Item, fps: number, muted: boolean) => (f: number) => {
  if (muted) return 0;
  const v = it.volume ?? 1;
  const total = it.dur * fps;
  let k = 1;
  if (it.fadeIn && it.fadeIn > 0) k = Math.min(k, f / (it.fadeIn * fps));
  if (it.fadeOut && it.fadeOut > 0) k = Math.min(k, (total - f) / (it.fadeOut * fps));
  return Math.max(0, Math.min(1, k)) * v;
};

const visualFade = (it: Item, frame: number, fps: number) => {
  const total = it.dur * fps;
  let k = 1;
  if (it.fadeIn && it.fadeIn > 0) k = Math.min(k, frame / (it.fadeIn * fps));
  if (it.fadeOut && it.fadeOut > 0) k = Math.min(k, (total - frame) / (it.fadeOut * fps));
  return Math.max(0, Math.min(1, k));
};

const Visual: React.FC<{ it: Item; base?: string; muted: boolean }> = ({ it, base, muted }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const opacity = (it.opacity ?? 1) * visualFade(it, frame, fps);
  const box: CSSProperties = {
    position: 'absolute',
    inset: 0,
    transform: `translate(${it.x || 0}px, ${it.y || 0}px) scale(${it.scale ?? 1}) rotate(${it.rot || 0}deg)`,
    opacity,
  };
  const media: CSSProperties = { width: '100%', height: '100%', objectFit: it.fit || 'cover', display: 'block' };
  return (
    <div data-item-id={it.id} style={box}>
      {it.type === 'video' && it.src ? (
        <OffthreadVideo
          src={srcUrl(it.src, base)}
          trimBefore={Math.round((it.trim || 0) * fps)}
          playbackRate={it.speed || 1}
          volume={fadeVolume(it, fps, muted)}
          style={media}
          pauseWhenBuffering
        />
      ) : it.type === 'image' && it.src ? (
        <Img src={srcUrl(it.src, base)} style={media} />
      ) : (
        <div style={{ ...media, background: it.fill || '#000' }} />
      )}
    </div>
  );
};

const TextItem: React.FC<{ it: Item }> = ({ it }) => {
  const frame = useCurrentFrame();
  const { fps, width } = useVideoConfig();
  const total = Math.max(1, Math.round(it.dur * fps));
  const n = ANIM * fps;
  const preset = presetOf(it.preset);
  let opacity = it.opacity ?? 1;
  let dx = 0;
  let dy = 0;
  let k = 1;
  let text = it.text ?? '';

  const tin = Math.min(1, frame / n);
  const ease = 1 - Math.pow(1 - tin, 3);
  switch (it.animIn) {
    case 'fade':
      opacity *= tin;
      break;
    case 'pop':
      k *= spring({ frame, fps, config: { damping: 11, stiffness: 180, mass: 0.6 } });
      break;
    case 'up':
      dy += (1 - ease) * 90;
      opacity *= tin;
      break;
    case 'down':
      dy -= (1 - ease) * 90;
      opacity *= tin;
      break;
    case 'left':
      dx -= (1 - ease) * 160;
      opacity *= tin;
      break;
    case 'zoom':
      k *= 1 + (1 - ease) * 0.8;
      opacity *= tin;
      break;
    case 'type': {
      const chars = Array.from(text);
      const span = Math.min(total * 0.6, Math.max(n, chars.length * 1.4));
      text = chars.slice(0, Math.ceil(interpolate(frame, [0, span], [0, chars.length], { extrapolateRight: 'clamp' }))).join('');
      break;
    }
  }
  const left = total - frame;
  if (it.animOut && it.animOut !== 'none' && left < n) {
    const t = Math.max(0, left / n);
    if (it.animOut === 'fade') opacity *= t;
    if (it.animOut === 'down') {
      dy += (1 - t) * 90;
      opacity *= t;
    }
    if (it.animOut === 'shrink') {
      k *= t;
      opacity *= t;
    }
  }

  const lines = text.split('\n');
  const twoTier = it.preset === 'phude2';
  return (
    <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
      <div
        data-item-id={it.id}
        style={{
          transform: `translate(${(it.x || 0) + dx}px, ${(it.y || 0) + dy}px) scale(${(it.scale ?? 1) * k}) rotate(${it.rot || 0}deg)`,
          opacity,
          maxWidth: width * 0.92,
          flexShrink: 0,
        }}
      >
        <div
          data-text-box
          style={{
            fontFamily: `"${it.font || 'Be Vietnam Pro'}", "Be Vietnam Pro", sans-serif`,
            fontSize: it.size || 72,
            fontWeight: it.bold ? 700 : 400,
            fontStyle: it.italic ? 'italic' : 'normal',
            color: it.color || '#fff',
            textAlign: it.align || 'center',
            lineHeight: 1.22,
            whiteSpace: 'pre-wrap',
            overflowWrap: 'anywhere',
            minWidth: '0.5em',
            minHeight: '1.22em',
            ...preset.style(it),
          }}
        >
          {twoTier
            ? lines.map((l, i) => (
                <div key={i} style={i === 0 ? undefined : { fontSize: '0.62em', color: '#ffffff', marginTop: '0.1em' }}>
                  {l || ' '}
                </div>
              ))
            : text}
        </div>
      </div>
    </AbsoluteFill>
  );
};

// Gộp mọi hiệu ứng đang chạy ở khung hiện tại thành một kiểu CSS cho lớp hình.
const useStageFx = (project: Project) => {
  const frame = useCurrentFrame();
  const { fps, width } = useVideoConfig();
  const t = frame / fps;
  const hiddenTracks = new Set(project.tracks.filter((tr) => tr.hidden).map((tr) => tr.id));
  let scale = 1;
  let tx = 0;
  let ty = 0;
  let rot = 0;
  const filters: string[] = [];
  let flash = 0;
  let black = 0;
  let vignette = 0;
  for (const it of project.items) {
    if (it.type !== 'effect' || hiddenTracks.has(it.track)) continue;
    if (t < it.start || t >= it.start + it.dur) continue;
    const p = Math.min(1, Math.max(0, (t - it.start) / it.dur));
    const a = (it.amount ?? 50) / 100;
    const f = frame - Math.round(it.start * fps);
    switch (it.fx) {
      case 'zoomIn':
        scale *= 1 + p * a * 0.6;
        break;
      case 'zoomOut':
        scale *= 1 + (1 - p) * a * 0.6;
        break;
      case 'punch':
        scale *= 1 + a * 0.5 * spring({ frame: f, fps, config: { damping: 14, stiffness: 220, mass: 0.5 } });
        break;
      case 'shake': {
        const amp = a * 36 * (1 - p * 0.3);
        tx += (random(`sx${f}`) - 0.5) * 2 * amp;
        ty += (random(`sy${f}`) - 0.5) * 2 * amp;
        rot += (random(`sr${f}`) - 0.5) * a * 2.4;
        scale *= 1 + a * 0.06;
        break;
      }
      case 'panL':
        scale *= 1 + a * 0.3;
        tx += (0.5 - p) * a * 0.28 * width;
        break;
      case 'panR':
        scale *= 1 + a * 0.3;
        tx += (p - 0.5) * a * 0.28 * width;
        break;
      case 'flash':
        flash = Math.max(flash, Math.pow(1 - p, 2) * (0.4 + a * 0.6));
        break;
      case 'fadeIn':
        black = Math.max(black, 1 - p);
        break;
      case 'fadeOut':
        black = Math.max(black, p);
        break;
      case 'blur':
        filters.push(`blur(${(a * 28).toFixed(1)}px)`);
        scale *= 1 + a * 0.06;
        break;
      case 'bw':
        filters.push(`grayscale(${Math.min(1, a * 2)})`);
        break;
      case 'sepia':
        filters.push(`sepia(${Math.min(1, a * 1.6)}) saturate(1.1)`);
        break;
      case 'vivid':
        filters.push(`saturate(${1 + a * 1.2}) contrast(${1 + a * 0.3})`);
        break;
      case 'vignette':
        vignette = Math.max(vignette, a);
        break;
      case 'glitch': {
        const on = random(`g${Math.floor(f / 2)}`) > 0.45;
        if (on) {
          tx += (random(`gx${f}`) - 0.5) * a * 60;
          filters.push(`hue-rotate(${Math.round((random(`gh${f}`) - 0.5) * a * 240)}deg) saturate(${1 + a * 2})`);
        }
        break;
      }
    }
  }
  const style: CSSProperties = {
    transform: `translate(${tx}px, ${ty}px) scale(${scale}) rotate(${rot}deg)`,
    filter: filters.length ? filters.join(' ') : undefined,
  };
  return { style, flash, black, vignette };
};

export const MainVideo: React.FC<VideoProps> = ({ project, assetBase }) => {
  const { fps } = useVideoConfig();
  useFontsReady(project);
  const fx = useStageFx(project);
  const trackOf = new Map(project.tracks.map((t) => [t.id, t]));
  // Lớp nằm trên cùng trong bảng thời gian thì vẽ sau cùng (đè lên trên).
  const order = new Map(project.tracks.map((t, i) => [t.id, project.tracks.length - i]));
  const sorted = [...project.items].sort((a, b) => (order.get(a.track)! - order.get(b.track)!) || a.start - b.start);
  const seq = (it: Item, child: React.ReactNode) => (
    <Sequence key={it.id} from={Math.round(it.start * fps)} durationInFrames={Math.max(1, Math.round(it.dur * fps))} layout="none">
      {child}
    </Sequence>
  );
  const visible = (it: Item) => !trackOf.get(it.track)?.hidden;
  return (
    <AbsoluteFill style={{ background: '#000', overflow: 'hidden' }}>
      <AbsoluteFill style={fx.style}>
        {sorted
          .filter((it) => ['video', 'image', 'solid'].includes(it.type) && visible(it))
          .map((it) => seq(it, <Visual it={it} base={assetBase} muted={!!trackOf.get(it.track)?.muted} />))}
      </AbsoluteFill>
      {fx.vignette > 0 ? (
        <AbsoluteFill style={{ background: `radial-gradient(ellipse at center, transparent 45%, rgba(0,0,0,${0.35 + fx.vignette * 0.6}) 100%)`, pointerEvents: 'none' }} />
      ) : null}
      {fx.black > 0 ? <AbsoluteFill style={{ background: '#000', opacity: fx.black, pointerEvents: 'none' }} /> : null}
      {fx.flash > 0 ? <AbsoluteFill style={{ background: '#fff', opacity: fx.flash, pointerEvents: 'none' }} /> : null}
      {sorted.filter((it) => it.type === 'text' && visible(it)).map((it) => seq(it, <TextItem it={it} />))}
      {sorted
        .filter((it) => it.type === 'audio' && it.src && !trackOf.get(it.track)?.muted && !trackOf.get(it.track)?.hidden)
        .map((it) =>
          seq(it, <Audio src={srcUrl(it.src!, assetBase)} trimBefore={Math.round((it.trim || 0) * fps)} playbackRate={it.speed || 1} volume={fadeVolume(it, fps, false)} />),
        )}
    </AbsoluteFill>
  );
};
