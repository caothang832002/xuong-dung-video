import React, { useEffect, useRef, useState } from 'react';
import { api, type ExportJob } from './api';
import { emptyProject } from './model';
import {
  copySel,
  duplicate,
  getFrame,
  getState,
  loadProject,
  markSaved,
  paste,
  player,
  redo,
  removeItems,
  select,
  setEditing,
  setSaving,
  splitAt,
  getTime,
  toast,
  undo,
  useStore,
} from './store';
import { Library } from './ui/Library';
import { Stage } from './ui/Stage';
import { Inspector } from './ui/Inspector';
import { Timeline } from './ui/Timeline';

const typing = (e: KeyboardEvent) => {
  const t = e.target as HTMLElement | null;
  return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
};

const ExportDialog: React.FC<{ name: string; onClose: () => void }> = ({ name, onClose }) => {
  const [job, setJob] = useState<ExportJob | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    let timer: any;
    const poll = async () => {
      try {
        const j = await api.exportStatus();
        if (!alive) return;
        setJob(j);
        if (j.running) timer = setTimeout(poll, 700);
      } catch (e: any) {
        setErr(e.message);
      }
    };
    api
      .exportStart(name)
      .then(poll)
      .catch((e) => (e.message.includes('Đang xuất') ? poll() : setErr(e.message)));
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [name]);
  const pct = Math.round((job?.progress || 0) * 100);
  const failed = err || job?.error;
  return (
    <div className="modal-back">
      <div className="modal">
        <h2>Xuất video</h2>
        {failed ? (
          <>
            <p className="bad">Không xuất được video.</p>
            <pre className="errbox">{failed}</pre>
          </>
        ) : job?.file && !job.running ? (
          <>
            <p>Đã xong. Tệp nằm ở thư mục <code>xuat/</code> của công cụ.</p>
            <video src={`/${job.file}?t=${Date.now()}`} controls className="result" />
            <a className="btn primary wide" href={`/${job.file}`} download={`${name}.mp4`}>
              ⬇ Tải {name}.mp4
            </a>
          </>
        ) : (
          <>
            <div className="bar">
              <i style={{ width: `${pct}%` }} />
            </div>
            <p className="hint">
              {pct}% · {job?.message || 'Đang chuẩn bị…'}
            </p>
            <p className="hint">Lần xuất đầu tiên lâu hơn vì phải chuẩn bị bộ dựng hình.</p>
          </>
        )}
        <button className="btn wide" onClick={onClose}>
          {job?.running ? 'Ẩn (vẫn tiếp tục xuất)' : 'Đóng'}
        </button>
      </div>
    </div>
  );
};

const TopBar: React.FC<{ projects: string[]; onOpen: (n: string) => void; onNew: () => void; onExport: () => void; theme: string; setTheme: (t: string) => void }> = ({ projects, onOpen, onNew, onExport, theme, setTheme }) => {
  const name = useStore((s) => s.project.name);
  const dirty = useStore((s) => s.dirty);
  const saving = useStore((s) => s.saving);
  const canUndo = useStore((s) => s.past.length > 0);
  const canRedo = useStore((s) => s.future.length > 0);
  const count = useStore((s) => s.project.items.length);
  return (
    <header className="topbar">
      <div className="brand">
        <span className="logo">🎞️</span> Xưởng dựng video
      </div>
      <select className="proj" value={name} onChange={(e) => (e.target.value === '__new' ? onNew() : onOpen(e.target.value))} title="Chọn dự án">
        {projects.includes(name) ? null : <option value={name}>{name}</option>}
        {projects.map((p) => (
          <option key={p} value={p}>
            {p}
          </option>
        ))}
        <option value="__new">＋ Dự án mới…</option>
      </select>
      <span className="chip soft">{count} khối</span>
      <span className="grow" />
      <button className="btn ghost" onClick={undo} disabled={!canUndo} title="Hoàn tác (Ctrl+Z)">
        ↩ Hoàn tác
      </button>
      <button className="btn ghost" onClick={redo} disabled={!canRedo} title="Làm lại (Ctrl+Shift+Z)">
        ↪ Làm lại
      </button>
      <span className={`save${dirty || saving ? ' busy' : ''}`}>{saving ? 'Đang lưu…' : dirty ? 'Chưa lưu' : '✓ Đã lưu'}</span>
      <button className="btn ghost" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} title="Đổi nền sáng/tối">
        {theme === 'dark' ? '☀️' : '🌙'}
      </button>
      <button className="btn primary" onClick={onExport}>
        🎬 Xuất video
      </button>
    </header>
  );
};

export const App: React.FC = () => {
  const [projects, setProjects] = useState<string[]>([]);
  const [ready, setReady] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [theme, setTheme] = useState(() => {
    try {
      return localStorage.getItem('studio.theme') || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    } catch {
      return 'light';
    }
  });
  const toastMsg = useStore((s) => s.toast);
  const project = useStore((s) => s.project);
  const dirty = useStore((s) => s.dirty);
  const mtimeRef = useRef(0);
  mtimeRef.current = useStore((s) => s.mtime);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem('studio.theme', theme);
    } catch {}
  }, [theme]);

  const open = async (name: string) => {
    try {
      const { project, mtime } = await api.load(name);
      loadProject(project, mtime);
      player.seek(0);
      history.replaceState(null, '', `?du_an=${encodeURIComponent(name)}`);
    } catch (e: any) {
      toast(e.message);
    }
  };

  const flush = async () => {
    const p = getState().project;
    if (!getState().dirty) return;
    setSaving(true);
    try {
      const { mtime } = await api.save(p);
      markSaved(mtime, p);
    } catch (e: any) {
      setSaving(false);
      toast(`Không lưu được: ${e.message}`);
    }
  };

  useEffect(() => {
    (async () => {
      const list = await api.projects().catch(() => []);
      setProjects(list.map((p) => p.name));
      const want = new URLSearchParams(location.search).get('du_an');
      const name = (want && list.find((p) => p.name === want)?.name) || list[0]?.name;
      if (name) await open(name);
      setReady(true);
    })();
  }, []);

  // tự lưu sau khi ngừng sửa một lát
  useEffect(() => {
    if (!ready || !dirty) return;
    const t = setTimeout(flush, 700);
    return () => clearTimeout(t);
  }, [project, dirty, ready]);

  // Claude (hay ai đó) sửa tệp dự án từ bên ngoài thì nạp lại ngay
  useEffect(() => {
    if (!ready) return;
    const t = setInterval(async () => {
      const st = getState();
      if (st.dirty || st.saving) return;
      try {
        const { mtime } = await api.mtime(st.project.name);
        if (mtime && mtime !== mtimeRef.current && !getState().dirty) {
          const f = getFrame();
          const { project, mtime: m } = await api.load(st.project.name);
          loadProject(project, m, true);
          player.seek(f / project.fps);
          toast('Tệp dự án vừa được sửa từ bên ngoài, đã nạp lại');
        }
      } catch {}
    }, 2000);
    return () => clearInterval(t);
  }, [ready]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (typing(e)) return;
      const mod = e.ctrlKey || e.metaKey;
      const st = getState();
      const k = e.key.toLowerCase();
      if (e.key === ' ') player.toggle();
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        const d = (e.key === 'ArrowLeft' ? -1 : 1) * (e.shiftKey ? st.project.fps : 1);
        player.pause();
        player.seek((getFrame() + d) / st.project.fps);
      } else if (e.key === 'Home') player.seek(0);
      else if (mod && k === 'z') e.shiftKey ? redo() : undo();
      else if (mod && k === 'y') redo();
      else if (mod && k === 'b') splitAt(getTime());
      else if (mod && k === 'd') duplicate(st.sel);
      else if (mod && k === 'c') copySel();
      else if (mod && k === 'v') paste();
      else if (mod && k === 's') flush();
      else if (mod && k === 'a') select(st.project.items.map((i) => i.id));
      else if (e.key === 'Delete' || e.key === 'Backspace') removeItems(st.sel);
      else if (e.key === 'Escape') (setEditing(null), select([]));
      else if (e.key === 'Enter' && st.sel.length === 1 && st.project.items.find((i) => i.id === st.sel[0])?.type === 'text') setEditing(st.sel[0]);
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    const onLeave = (e: BeforeUnloadEvent) => {
      if (getState().dirty) e.preventDefault();
    };
    window.addEventListener('beforeunload', onLeave);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('beforeunload', onLeave);
    };
  }, []);

  const onNew = async () => {
    const raw = prompt('Tên dự án mới (không dấu cách càng tốt, ví dụ: bai_anh_sang):');
    const name = (raw || '').trim().replace(/[\\/:*?"<>|]/g, '').slice(0, 60);
    if (!name) return;
    if (projects.includes(name)) return open(name);
    await flush();
    await api.save(emptyProject(name));
    setProjects((p) => [name, ...p]);
    await open(name);
  };

  const onExport = async () => {
    await flush();
    player.pause();
    setExporting(true);
  };

  if (!ready) return <div className="loading">Đang mở xưởng dựng…</div>;
  return (
    <div className="app">
      <TopBar projects={projects} onOpen={async (n) => (await flush(), open(n))} onNew={onNew} onExport={onExport} theme={theme} setTheme={setTheme} />
      <main className="work">
        <Library />
        <Stage />
        <Inspector />
      </main>
      <Timeline />
      {toastMsg ? <div className="toast">{toastMsg}</div> : null}
      {exporting ? <ExportDialog name={project.name} onClose={() => setExporting(false)} /> : null}
    </div>
  );
};
