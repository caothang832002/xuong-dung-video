// Mô hình dự án: một tệp JSON mà cả người dùng (qua xưởng dựng) lẫn Claude (sửa tệp) cùng chỉnh.

export type TrackKind = 'main' | 'overlay' | 'text' | 'fx' | 'audio';
export type ItemType = 'video' | 'image' | 'solid' | 'text' | 'effect' | 'audio';

export type Track = {
  id: string;
  name: string;
  kind: TrackKind;
  hidden?: boolean;
  muted?: boolean;
};

export type Item = {
  id: string;
  track: string;
  type: ItemType;
  name: string;
  start: number; // giây
  dur: number; // giây
  // tệp nguồn
  src?: string;
  trim?: number; // bỏ bao nhiêu giây đầu của tệp nguồn
  srcDur?: number;
  speed?: number;
  volume?: number;
  fadeIn?: number;
  fadeOut?: number;
  fit?: 'cover' | 'contain';
  // vị trí (px theo khung video, tính từ tâm)
  x?: number;
  y?: number;
  scale?: number;
  rot?: number;
  opacity?: number;
  // chữ
  text?: string;
  font?: string;
  size?: number;
  color?: string;
  bg?: string;
  stroke?: string;
  bold?: boolean;
  italic?: boolean;
  align?: 'left' | 'center' | 'right';
  preset?: string;
  animIn?: string;
  animOut?: string;
  // hiệu ứng
  fx?: string;
  amount?: number;
  // cảnh nền
  fill?: string;
};

export type Project = {
  name: string;
  width: number;
  height: number;
  fps: number;
  tracks: Track[];
  items: Item[];
};

export const KIND_ACCEPTS: Record<TrackKind, ItemType[]> = {
  main: ['video', 'image', 'solid'],
  overlay: ['video', 'image', 'solid'],
  text: ['text'],
  fx: ['effect'],
  audio: ['audio'],
};

export const KIND_LABEL: Record<TrackKind, string> = {
  main: 'Video chính',
  overlay: 'Cảnh chèn',
  text: 'Chữ',
  fx: 'Hiệu ứng',
  audio: 'Âm thanh',
};

let seq = 0;
export const uid = (p = 'm') => `${p}_${Date.now().toString(36)}${(seq++).toString(36)}${Math.random().toString(36).slice(2, 5)}`;

export const defaultTracks = (): Track[] => [
  { id: 't_phude', name: 'Phụ đề', kind: 'text' },
  { id: 't_nhan', name: 'Nhãn', kind: 'text' },
  { id: 't_chu', name: 'Chữ lớn', kind: 'text' },
  { id: 't_fx', name: 'Hiệu ứng', kind: 'fx' },
  { id: 't_chen', name: 'Cảnh chèn', kind: 'overlay' },
  { id: 't_chinh', name: 'Video chính', kind: 'main' },
  { id: 't_sfx', name: 'Tiếng động', kind: 'audio' },
  { id: 't_nhac', name: 'Nhạc nền', kind: 'audio' },
];

export const emptyProject = (name = 'du_an_moi'): Project => ({
  name,
  width: 1080,
  height: 1920,
  fps: 30,
  tracks: defaultTracks(),
  items: [],
});

export const itemEnd = (it: Item) => it.start + it.dur;

export const projectDuration = (p: Project) => p.items.reduce((m, it) => Math.max(m, itemEnd(it)), 0);

export const durationInFrames = (p: Project) => Math.max(p.fps, Math.ceil(projectDuration(p) * p.fps));

export const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

export const round3 = (v: number) => Math.round(v * 1000) / 1000;

export const fmtTime = (s: number) => {
  const m = Math.floor(s / 60);
  const r = s - m * 60;
  return `${String(m).padStart(2, '0')}:${r.toFixed(1).padStart(4, '0')}`;
};

// Sửa những chỗ thiếu khi tệp do người/Claude viết tay.
export const normalizeProject = (raw: any): Project => {
  const base = emptyProject(raw?.name || 'du_an_moi');
  const p: Project = {
    name: String(raw?.name || base.name),
    width: Number(raw?.width) || base.width,
    height: Number(raw?.height) || base.height,
    fps: Number(raw?.fps) || base.fps,
    tracks: Array.isArray(raw?.tracks) && raw.tracks.length ? raw.tracks : base.tracks,
    items: Array.isArray(raw?.items) ? raw.items : [],
  };
  const ids = new Set(p.tracks.map((t) => t.id));
  p.items = p.items
    .filter((it) => it && ids.has(it.track) && Number.isFinite(it.start) && Number.isFinite(it.dur))
    .map((it) => ({ ...it, id: it.id || uid(), name: it.name || it.type, start: Math.max(0, it.start), dur: Math.max(0.05, it.dur) }));
  return p;
};

export const mediaKind = (file: string): 'video' | 'image' | 'audio' | null => {
  const e = file.toLowerCase().split('.').pop() || '';
  if (['mp4', 'webm', 'mov', 'm4v', 'mkv'].includes(e)) return 'video';
  if (['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg', 'avif'].includes(e)) return 'image';
  if (['mp3', 'wav', 'm4a', 'aac', 'ogg', 'flac'].includes(e)) return 'audio';
  return null;
};
