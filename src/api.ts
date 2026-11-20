// Lớp lưu trữ. Có hai bản:
//  - bản chạy trên máy: gọi máy chủ (lưu tệp JSON, nhập tệp vào thư mục, xuất bằng bộ dựng của Remotion);
//  - bản web: mọi thứ nằm trong trình duyệt (IndexedDB), xuất video ngay trong trình duyệt.
import { durationInFrames, normalizeProject } from './model';
import type { Project } from './model';
import { IS_WEB, assetUrl, registerAsset } from './video/assets';

export type MediaFile = { file: string; name: string; size: number; mtime: number };
export type SfxFile = { id: string; file: string; dur: number };
export type ExportJob = { running: boolean; progress: number; message: string; file: string | null; error: string | null; name: string | null };

type Backend = {
  init: () => Promise<void>;
  projects: () => Promise<{ name: string; mtime: number }[]>;
  load: (name: string) => Promise<{ project: Project; mtime: number }>;
  mtime: (name: string) => Promise<{ mtime: number }>;
  save: (project: Project) => Promise<{ mtime: number }>;
  remove: (name: string) => Promise<unknown>;
  media: () => Promise<MediaFile[]>;
  sfx: () => Promise<SfxFile[]>;
  upload: (file: File) => Promise<{ file: string; name: string }>;
  exportStart: (name: string) => Promise<unknown>;
  exportStatus: () => Promise<ExportJob>;
};

// ---------------------------------------------------------------- bản chạy trên máy
const j = async (r: Response) => {
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || `Lỗi ${r.status}`);
  return data;
};
const enc = encodeURIComponent;

const server: Backend = {
  init: async () => {},
  projects: () => fetch('/api/projects').then(j),
  load: (name) => fetch(`/api/project/${enc(name)}`).then(j),
  mtime: (name) => fetch(`/api/project/${enc(name)}/mtime`).then(j),
  save: (project) => fetch(`/api/project/${enc(project.name)}`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ project }) }).then(j),
  remove: (name) => fetch(`/api/project/${enc(name)}`, { method: 'DELETE' }).then(j),
  media: () => fetch('/api/media').then(j),
  sfx: () => fetch('/api/sfx').then(j),
  upload: (file) => fetch(`/api/upload?name=${enc(file.name)}`, { method: 'POST', body: file }).then(j),
  exportStart: (name) => fetch(`/api/export/${enc(name)}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }).then(j),
  exportStatus: () => fetch('/api/export').then(j),
};

// ---------------------------------------------------------------- bản web
let dbp: Promise<IDBDatabase> | null = null;
const db = () =>
  (dbp ||= new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open('xuong-dung-video', 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore('projects');
      req.result.createObjectStore('media');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  }));
const tx = async <T,>(store: 'projects' | 'media', mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> => {
  const d = await db();
  return new Promise<T>((resolve, reject) => {
    const t = d.transaction(store, mode);
    const req = fn(t.objectStore(store));
    t.oncomplete = () => resolve(req.result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error || new Error('Trình duyệt không lưu được (có thể đã hết dung lượng)'));
  });
};

type StoredProject = { project: Project; mtime: number };
type StoredMedia = { blob: Blob; mtime: number };
const webSfx: SfxFile[] = [];
const job: ExportJob = { running: false, progress: 0, message: '', file: null, error: null, name: null };
let lastExportUrl: string | null = null;

const web: Backend = {
  init: async () => {
    // xin trình duyệt đừng tự dọn dữ liệu của trang này
    navigator.storage?.persist?.().catch(() => {});
    const { SFX_NAMES, synthSfx } = await import('../shared/sfx-synth.mjs');
    for (const id of SFX_NAMES as string[]) {
      const { bytes, dur } = synthSfx(id);
      const file = `sfx/${id}.wav`;
      registerAsset(file, URL.createObjectURL(new Blob([bytes], { type: 'audio/wav' })));
      webSfx.push({ id, file, dur: Math.round(dur * 1000) / 1000 });
    }
    const d = await db();
    await new Promise<void>((resolve, reject) => {
      const req = d.transaction('media').objectStore('media').openCursor();
      req.onsuccess = () => {
        const c = req.result;
        if (!c) return resolve();
        registerAsset(`media/${c.key}`, URL.createObjectURL((c.value as StoredMedia).blob));
        c.continue();
      };
      req.onerror = () => reject(req.error);
    });
    const names = await tx<IDBValidKey[]>('projects', 'readonly', (s) => s.getAllKeys());
    if (!names.length) {
      const { demoProject } = await import('../shared/demo.mjs');
      await web.save(demoProject('vi_du') as Project);
    }
  },
  projects: async () => {
    const d = await db();
    return new Promise((resolve, reject) => {
      const out: { name: string; mtime: number }[] = [];
      const req = d.transaction('projects').objectStore('projects').openCursor();
      req.onsuccess = () => {
        const c = req.result;
        if (!c) return resolve(out.sort((a, b) => b.mtime - a.mtime));
        out.push({ name: String(c.key), mtime: (c.value as StoredProject).mtime });
        c.continue();
      };
      req.onerror = () => reject(req.error);
    });
  },
  load: async (name) => {
    const v = await tx<StoredProject | undefined>('projects', 'readonly', (s) => s.get(name));
    if (!v) throw new Error('Không tìm thấy dự án');
    return v;
  },
  mtime: async (name) => ({ mtime: (await tx<StoredProject | undefined>('projects', 'readonly', (s) => s.get(name)))?.mtime || 0 }),
  save: async (project) => {
    const mtime = Date.now();
    await tx('projects', 'readwrite', (s) => s.put({ project, mtime } satisfies StoredProject, project.name));
    return { mtime };
  },
  remove: (name) => tx('projects', 'readwrite', (s) => s.delete(name)),
  media: async () => {
    const d = await db();
    return new Promise((resolve, reject) => {
      const out: MediaFile[] = [];
      const req = d.transaction('media').objectStore('media').openCursor();
      req.onsuccess = () => {
        const c = req.result;
        if (!c) return resolve(out.sort((a, b) => b.mtime - a.mtime));
        const v = c.value as StoredMedia;
        out.push({ file: `media/${c.key}`, name: String(c.key), size: v.blob.size, mtime: v.mtime });
        c.continue();
      };
      req.onerror = () => reject(req.error);
    });
  },
  sfx: async () => webSfx,
  upload: async (file) => {
    const taken = new Set((await web.media()).map((m) => m.name));
    const dot = file.name.lastIndexOf('.');
    const stem = dot > 0 ? file.name.slice(0, dot) : file.name;
    const ext = dot > 0 ? file.name.slice(dot) : '';
    let name = file.name;
    for (let i = 2; taken.has(name); i++) name = `${stem}_${i}${ext}`;
    await tx('media', 'readwrite', (s) => s.put({ blob: file, mtime: Date.now() } satisfies StoredMedia, name));
    registerAsset(`media/${name}`, URL.createObjectURL(file));
    return { file: `media/${name}`, name };
  },
  exportStart: async (name) => {
    if (job.running) throw new Error('Đang xuất một video khác, chờ xong đã nhé');
    const project = normalizeProject((await web.load(name)).project);
    Object.assign(job, { running: true, progress: 0, message: 'Đang chuẩn bị…', file: null, error: null, name });
    (async () => {
      try {
        const [{ renderMediaOnWeb }, { MainVideo }] = await Promise.all([import('@remotion/web-renderer'), import('./video/MainVideo')]);
        const total = durationInFrames(project);
        const result = await renderMediaOnWeb({
          composition: { id: 'Video', component: MainVideo as any, width: project.width, height: project.height, fps: project.fps, durationInFrames: total, defaultProps: { project } },
          inputProps: { project },
          container: 'mp4',
          videoCodec: 'h264',
          licenseKey: 'free-license', // Remotion miễn phí cho cá nhân và nhóm đến 3 người; tổ chức lớn hơn thay bằng khoá đã mua
          onProgress: (p: any) => Object.assign(job, { progress: p.progress, message: `Đã dựng ${p.renderedFrames}/${total} khung, đã nén ${p.encodedFrames}` }),
        } as any);
        const blob = await result.getBlob();
        if (lastExportUrl) URL.revokeObjectURL(lastExportUrl);
        lastExportUrl = URL.createObjectURL(blob);
        Object.assign(job, { running: false, progress: 1, message: 'Xong', file: lastExportUrl });
      } catch (e: any) {
        console.error(e);
        Object.assign(job, { running: false, error: String(e?.message || e).slice(0, 600) });
      }
    })();
  },
  exportStatus: async () => ({ ...job }),
};

export const api: Backend = IS_WEB ? web : server;
export { IS_WEB };

// Đo thời lượng và kích thước của tệp video/âm thanh ngay trong trình duyệt.
const metaCache = new Map<string, Promise<{ dur: number; w?: number; h?: number }>>();
export const mediaMeta = (file: string, kind: 'video' | 'audio' | 'image') => {
  if (!metaCache.has(file)) {
    metaCache.set(
      file,
      new Promise((resolve) => {
        const url = assetUrl(file);
        if (kind === 'image') {
          const img = new Image();
          img.onload = () => resolve({ dur: 4, w: img.naturalWidth, h: img.naturalHeight });
          img.onerror = () => resolve({ dur: 4 });
          img.src = url;
          return;
        }
        const el = document.createElement(kind);
        el.preload = 'metadata';
        el.onloadedmetadata = () => resolve({ dur: Number.isFinite(el.duration) ? el.duration : 5, w: (el as HTMLVideoElement).videoWidth, h: (el as HTMLVideoElement).videoHeight });
        el.onerror = () => resolve({ dur: 5 });
        el.src = url;
      }),
    );
  }
  return metaCache.get(file)!;
};
