// Kho trạng thái của xưởng dựng: dự án, lựa chọn, hoàn tác/làm lại và mọi thao tác chỉnh sửa.
import { useSyncExternalStore } from 'react';
import { KIND_ACCEPTS, clamp, emptyProject, itemEnd, normalizeProject, projectDuration, round3, uid } from './model';
import type { Item, ItemType, Project, Track } from './model';

export type State = {
  project: Project;
  sel: string[];
  editing: string | null; // khối chữ đang sửa ngay trên hình
  past: Project[];
  future: Project[];
  magnet: boolean;
  pps: number; // điểm ảnh mỗi giây trên thanh thời gian
  dirty: boolean;
  saving: boolean;
  mtime: number;
  toast: string | null;
  notice: { title: string; lines: string[] } | null; // hộp báo cần người dùng đọc kỹ
  clipboard: Item[];
};

let state: State = {
  project: emptyProject(),
  sel: [],
  editing: null,
  past: [],
  future: [],
  magnet: true,
  pps: 60,
  dirty: false,
  saving: false,
  mtime: 0,
  toast: null,
  notice: null,
  clipboard: [],
};

const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());
export const getState = () => state;
const set = (patch: Partial<State>) => {
  state = { ...state, ...patch };
  emit();
};
export const useStore = <T,>(sel: (s: State) => T): T =>
  useSyncExternalStore(
    (cb) => {
      subs.add(cb);
      return () => subs.delete(cb);
    },
    () => sel(state),
  );

// ---- vị trí đầu phát (tách riêng để không vẽ lại cả giao diện mỗi khung hình)
let frame = 0;
const frameSubs = new Set<() => void>();
export const setFrame = (f: number) => {
  if (f === frame) return;
  frame = f;
  frameSubs.forEach((s) => s());
};
export const getFrame = () => frame;
export const getTime = () => frame / state.project.fps;
export const useFrame = () =>
  useSyncExternalStore(
    (cb) => {
      frameSubs.add(cb);
      return () => frameSubs.delete(cb);
    },
    () => frame,
  );

// Trình phát đăng ký hàm tua ở đây để nơi khác gọi được.
export const player: { seek: (sec: number) => void; toggle: () => void; pause: () => void; playing: () => boolean } = {
  seek: () => {},
  toggle: () => {},
  pause: () => {},
  playing: () => false,
};

let toastTimer: any;
export const toast = (msg: string) => {
  clearTimeout(toastTimer);
  set({ toast: msg });
  toastTimer = setTimeout(() => set({ toast: null }), 3200);
};

export const setNotice = (notice: State['notice']) => set({ notice });

// ---- lịch sử
const LIMIT = 120;
export const snapshot = () => {
  set({ past: [...state.past.slice(-LIMIT), state.project], future: [] });
};
const apply = (project: Project, history = true) => {
  if (history) state = { ...state, past: [...state.past.slice(-LIMIT), state.project], future: [] };
  set({ project, dirty: true });
};
export const undo = () => {
  const prev = state.past[state.past.length - 1];
  if (!prev) return;
  const ids = new Set(prev.items.map((i) => i.id));
  set({ project: prev, past: state.past.slice(0, -1), future: [state.project, ...state.future], dirty: true, sel: state.sel.filter((id) => ids.has(id)), editing: null });
};
export const redo = () => {
  const next = state.future[0];
  if (!next) return;
  const ids = new Set(next.items.map((i) => i.id));
  set({ project: next, past: [...state.past, state.project], future: state.future.slice(1), dirty: true, sel: state.sel.filter((id) => ids.has(id)), editing: null });
};

// ---- tiện ích
const trackOf = (p: Project, id: string) => p.tracks.find((t) => t.id === id);
const isMain = (p: Project, it: Item) => trackOf(p, it.track)?.kind === 'main';
export const findItem = (id: string | null | undefined) => state.project.items.find((i) => i.id === id);

// Dồn các khối trên lớp chính sát nhau từ 0, không chừa khoảng trống.
const packMain = (items: Item[], p: Project): Item[] => {
  const mains = p.tracks.filter((t) => t.kind === 'main').map((t) => t.id);
  let out = items;
  for (const tid of mains) {
    const mine = out.filter((i) => i.track === tid).sort((a, b) => a.start + a.dur / 2 - (b.start + b.dur / 2));
    let at = 0;
    const pos = new Map<string, number>();
    for (const i of mine) {
      pos.set(i.id, round3(at));
      at += i.dur;
    }
    out = out.map((i) => (pos.has(i.id) ? { ...i, start: pos.get(i.id)! } : i));
  }
  return out;
};

// Tìm chỗ trống trên một lớp, bắt đầu từ thời điểm mong muốn.
const freeStart = (items: Item[], track: string, start: number, dur: number, ignore?: string) => {
  const mine = items.filter((i) => i.track === track && i.id !== ignore).sort((a, b) => a.start - b.start);
  let s = Math.max(0, start);
  for (const i of mine) {
    if (s + dur <= i.start + 1e-6) break;
    if (s < itemEnd(i) - 1e-6) s = itemEnd(i);
  }
  return round3(s);
};

export const pickTrack = (p: Project, type: ItemType, prefer?: string): Track | undefined => {
  const ok = (t: Track) => KIND_ACCEPTS[t.kind].includes(type);
  const pref = prefer ? p.tracks.find((t) => t.id === prefer) : undefined;
  if (pref && ok(pref)) return pref;
  if (type === 'video') return p.tracks.find((t) => t.kind === 'main') || p.tracks.find(ok);
  if (type === 'image' || type === 'solid') return p.tracks.find((t) => t.kind === 'overlay') || p.tracks.find(ok);
  return p.tracks.find(ok);
};

// ---- thao tác
export const loadProject = (raw: any, mtime: number, keepHistory = false) => {
  const project = normalizeProject(raw);
  const ids = new Set(project.items.map((i) => i.id));
  set({
    project,
    mtime,
    dirty: false,
    sel: state.sel.filter((id) => ids.has(id)),
    editing: null,
    past: keepHistory ? [...state.past, state.project] : [],
    future: [],
  });
};

export const select = (ids: string[], additive = false) => {
  if (additive) {
    const cur = new Set(state.sel);
    for (const id of ids) cur.has(id) ? cur.delete(id) : cur.add(id);
    set({ sel: [...cur], editing: null });
  } else set({ sel: ids, editing: state.editing && ids.includes(state.editing) ? state.editing : null });
};
export const setEditing = (id: string | null) => set({ editing: id, sel: id ? [id] : state.sel });
export const setMagnet = (magnet: boolean) => set({ magnet });
export const setPps = (pps: number) => set({ pps: clamp(pps, 8, 400) });
export const markSaved = (mtime: number, project: Project) => set({ saving: false, mtime, dirty: state.project !== project });
export const setSaving = (saving: boolean) => set({ saving });

export const patchItems = (ids: string[], patch: Partial<Item> | ((it: Item) => Partial<Item>), history = true) => {
  const idset = new Set(ids);
  const items = state.project.items.map((it) => (idset.has(it.id) ? { ...it, ...(typeof patch === 'function' ? patch(it) : patch) } : it));
  apply({ ...state.project, items }, history);
};

export const patchProject = (patch: Partial<Project>, history = true) => apply({ ...state.project, ...patch }, history);

export const patchTrack = (id: string, patch: Partial<Track>) =>
  apply({ ...state.project, tracks: state.project.tracks.map((t) => (t.id === id ? { ...t, ...patch } : t)) });

export const addTrack = (kind: Track['kind'], name: string) => {
  const p = state.project;
  const t: Track = { id: uid('t'), name, kind };
  // đặt lớp mới ngay trên lớp cùng loại đầu tiên
  const idx = p.tracks.findIndex((x) => x.kind === kind || (kind === 'overlay' && x.kind === 'main'));
  const tracks = [...p.tracks];
  tracks.splice(idx < 0 ? 0 : idx, 0, t);
  apply({ ...p, tracks });
  return t;
};

export const removeTrack = (id: string) => {
  const p = state.project;
  const t = trackOf(p, id);
  if (!t) return;
  if (t.kind === 'main' && p.tracks.filter((x) => x.kind === 'main').length === 1) return toast('Không xoá được lớp video chính duy nhất');
  apply({ ...p, tracks: p.tracks.filter((x) => x.id !== id), items: p.items.filter((i) => i.track !== id) });
};

export const addItem = (partial: Partial<Item> & { type: ItemType; dur: number }, opts: { at?: number; track?: string } = {}) => {
  const p = state.project;
  const track = pickTrack(p, partial.type, opts.track);
  if (!track) {
    toast('Chưa có lớp phù hợp cho mục này');
    return null;
  }
  const at = opts.at ?? getTime();
  let items = p.items;
  let start: number;
  if (track.kind === 'main' && state.magnet) {
    // lớp chính: chèn vào chỗ đầu phát, đẩy phần sau lùi lại
    const mine = items.filter((i) => i.track === track.id).sort((a, b) => a.start - b.start);
    const hit = mine.find((i) => at < i.start + i.dur / 2);
    start = hit ? hit.start : mine.length ? itemEnd(mine[mine.length - 1]) : 0;
    items = items.map((i) => (i.track === track.id && i.start >= start - 1e-6 ? { ...i, start: round3(i.start + partial.dur) } : i));
  } else {
    start = freeStart(items, track.id, at, partial.dur);
  }
  const it: Item = { id: uid(), name: partial.type, ...partial, track: track.id, start: round3(start) } as Item;
  apply({ ...p, items: [...items, it] });
  set({ sel: [it.id], editing: null });
  return it;
};

export const removeItems = (ids: string[]) => {
  if (!ids.length) return;
  const p = state.project;
  const idset = new Set(ids);
  const gone = p.items.filter((i) => idset.has(i.id));
  let items = p.items.filter((i) => !idset.has(i.id));
  if (state.magnet) {
    // xoá khối trên lớp chính: phần sau dồn lên, các lớp khác dời theo để chữ vẫn khớp hình
    const cuts = gone
      .filter((i) => isMain(p, i))
      .sort((a, b) => b.start - a.start);
    for (const c of cuts) {
      const end = itemEnd(c);
      items = items.map((i) => (i.start >= end - 1e-6 ? { ...i, start: round3(i.start - c.dur) } : i.start > c.start && !isMain(p, i) ? { ...i, start: round3(c.start) } : i));
    }
    items = packMain(items, p);
  }
  apply({ ...p, items });
  set({ sel: [], editing: null });
};

export const splitAt = (t: number) => {
  const p = state.project;
  const inside = (i: Item) => t > i.start + 0.04 && t < itemEnd(i) - 0.04;
  let targets = p.items.filter((i) => state.sel.includes(i.id) && inside(i));
  if (!targets.length && !state.sel.length) targets = p.items.filter((i) => isMain(p, i) && inside(i));
  if (!targets.length) return toast('Đặt đầu phát vào giữa một khối đang chọn rồi bấm Tách');
  const idset = new Set(targets.map((i) => i.id));
  const items: Item[] = [];
  const right: string[] = [];
  for (const i of p.items) {
    if (!idset.has(i.id)) {
      items.push(i);
      continue;
    }
    const a = round3(t - i.start);
    const b: Item = { ...i, id: uid(), start: round3(t), dur: round3(i.dur - a), fadeIn: 0 };
    if (i.type === 'video' || i.type === 'audio') b.trim = round3((i.trim || 0) + a * (i.speed || 1));
    if (i.type === 'text') b.animIn = 'none';
    items.push({ ...i, dur: a, fadeOut: 0, ...(i.type === 'text' ? { animOut: 'none' } : {}) }, b);
    right.push(b.id);
  }
  apply({ ...p, items });
  set({ sel: right, editing: null });
};

export const duplicate = (ids: string[]) => {
  const p = state.project;
  const src = p.items.filter((i) => ids.includes(i.id)).sort((a, b) => a.start - b.start);
  if (!src.length) return;
  let items = p.items;
  const made: string[] = [];
  for (const i of src) {
    const copy: Item = { ...i, id: uid() };
    if (isMain(p, i) && state.magnet) {
      const end = itemEnd(i);
      items = items.map((x) => (x.track === i.track && x.start >= end - 1e-6 ? { ...x, start: round3(x.start + i.dur) } : x));
      copy.start = round3(end);
    } else copy.start = freeStart(items, i.track, itemEnd(i), i.dur);
    items = [...items, copy];
    made.push(copy.id);
  }
  apply({ ...p, items });
  set({ sel: made, editing: null });
};

export const copySel = () => {
  const c = state.project.items.filter((i) => state.sel.includes(i.id));
  if (c.length) {
    set({ clipboard: c });
    toast(`Đã chép ${c.length} khối`);
  }
};
export const paste = () => {
  const c = state.clipboard;
  if (!c.length) return;
  const p = state.project;
  const t0 = Math.min(...c.map((i) => i.start));
  const at = getTime();
  let items = p.items;
  const made: string[] = [];
  for (const i of c) {
    const track = trackOf(p, i.track) ? i.track : pickTrack(p, i.type)?.id;
    if (!track) continue;
    const copy: Item = { ...i, id: uid(), track, start: freeStart(items, track, at + (i.start - t0), i.dur) };
    items = [...items, copy];
    made.push(copy.id);
  }
  if (state.magnet) items = packMain(items, p);
  apply({ ...p, items });
  set({ sel: made });
};

// Gọi khi thả tay sau một lần kéo/cắt trên thanh thời gian.
export const finishTimelineGesture = (id: string, before: Item | undefined, kind: 'move' | 'trimL' | 'trimR') => {
  const p = state.project;
  const it = p.items.find((i) => i.id === id);
  if (!it || !before) return;
  let items = p.items;
  if (state.magnet && (isMain(p, it) || isMain(p, before))) {
    if (kind !== 'move' && isMain(p, it)) {
      const oldEnd = itemEnd(before);
      items = packMain(items, p);
      const now = items.find((i) => i.id === id)!;
      const delta = round3(itemEnd(now) - oldEnd);
      if (Math.abs(delta) > 1e-4) {
        items = items.map((i) => (!isMain(p, i) && i.start >= oldEnd - 1e-6 ? { ...i, start: Math.max(0, round3(i.start + delta)) } : i));
      }
    } else items = packMain(items, p);
  } else if (!isMain(p, it)) {
    // không cho hai khối cùng lớp đè lên nhau
    const s = freeStart(items, it.track, it.start, it.dur, it.id);
    if (s !== it.start) items = items.map((i) => (i.id === id ? { ...i, start: s } : i));
  }
  if (items !== p.items) apply({ ...p, items }, false);
};

export const layerShift = (id: string, dir: -1 | 1) => {
  // đưa khối lên/xuống lớp cùng loại kế bên
  const p = state.project;
  const it = p.items.find((i) => i.id === id);
  if (!it) return;
  const idx = p.tracks.findIndex((t) => t.id === it.track);
  for (let j = idx + dir; j >= 0 && j < p.tracks.length; j += dir) {
    if (KIND_ACCEPTS[p.tracks[j].kind].includes(it.type)) {
      const tid = p.tracks[j].id;
      const items = p.items.map((i) => (i.id === id ? { ...i, track: tid, start: freeStart(p.items, tid, i.start, i.dur, id) } : i));
      apply({ ...p, items: state.magnet ? packMain(items, p) : items });
      return;
    }
  }
  toast(dir < 0 ? 'Đã ở lớp trên cùng' : 'Đã ở lớp dưới cùng');
};

export const totalDuration = () => projectDuration(state.project);
