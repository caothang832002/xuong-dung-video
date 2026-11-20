import type { Project } from './model';

const j = async (r: Response) => {
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || `Lỗi ${r.status}`);
  return data;
};

export type MediaFile = { file: string; name: string; size: number; mtime: number };
export type SfxFile = { id: string; file: string; dur: number };
export type ExportJob = { running: boolean; progress: number; message: string; file: string | null; error: string | null; name: string | null };

export const api = {
  projects: (): Promise<{ name: string; mtime: number }[]> => fetch('/api/projects').then(j),
  load: (name: string): Promise<{ project: Project; mtime: number }> => fetch(`/api/project/${encodeURIComponent(name)}`).then(j),
  mtime: (name: string): Promise<{ mtime: number }> => fetch(`/api/project/${encodeURIComponent(name)}/mtime`).then(j),
  save: (project: Project): Promise<{ mtime: number }> =>
    fetch(`/api/project/${encodeURIComponent(project.name)}`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ project }) }).then(j),
  remove: (name: string) => fetch(`/api/project/${encodeURIComponent(name)}`, { method: 'DELETE' }).then(j),
  media: (): Promise<MediaFile[]> => fetch('/api/media').then(j),
  sfx: (): Promise<SfxFile[]> => fetch('/api/sfx').then(j),
  upload: (file: File): Promise<{ file: string; name: string }> => fetch(`/api/upload?name=${encodeURIComponent(file.name)}`, { method: 'POST', body: file }).then(j),
  exportStart: (name: string, scale = 1) =>
    fetch(`/api/export/${encodeURIComponent(name)}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ scale }) }).then(j),
  exportStatus: (): Promise<ExportJob> => fetch('/api/export').then(j),
};

// Đo thời lượng và kích thước của tệp video/âm thanh ngay trong trình duyệt.
const metaCache = new Map<string, Promise<{ dur: number; w?: number; h?: number }>>();
export const mediaMeta = (file: string, kind: 'video' | 'audio' | 'image') => {
  if (!metaCache.has(file)) {
    metaCache.set(
      file,
      new Promise((resolve) => {
        const url = '/' + file.split('/').map(encodeURIComponent).join('/');
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
