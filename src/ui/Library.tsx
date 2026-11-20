// Thư viện bên trái: nguồn (tệp nhập), âm thanh, chữ, hiệu ứng, cảnh. Bấm + hoặc kéo thả xuống thanh thời gian.
import React, { useEffect, useRef, useState } from 'react';
import { api, mediaMeta, type MediaFile, type SfxFile } from '../api';
import { mediaKind, round3 } from '../model';
import type { Item } from '../model';
import { addItem, getState, setNotice, toast } from '../store';
import { EFFECTS, SCENES, SFX, TEXT_PRESETS } from '../video/catalog';
import { assetUrl } from '../video/assets';

type Payload =
  | { k: 'media'; file: string; name: string }
  | { k: 'sfx'; file: string; name: string; dur: number }
  | { k: 'text'; preset: string }
  | { k: 'fx'; fx: string }
  | { k: 'scene'; id: string };

// Trình duyệt đọc được độ dài nhưng không giải mã được hình (thường là video HEVC/H.265 quay bằng iPhone).
export const warnUndecodable = (name: string) =>
  setNotice({
    title: 'Trình duyệt này không phát được hình của video',
    lines: [
      `Trình duyệt đọc được độ dài của "${name}" nhưng không giải mã được hình, nên video sẽ đen. Thường là do tệp nén kiểu HEVC (H.265), kiểu mặc định của iPhone.`,
      'Cách 1: đổi video sang MP4 kiểu H.264 rồi nhập lại (dùng HandBrake, CapCut hoặc một trang đổi đuôi video; chọn "H.264").',
      'Cách 2: mở trang này bằng Microsoft Edge sau khi cài "HEVC Video Extensions" từ Microsoft Store, rồi nhập lại tệp.',
      'Để các video quay sau không bị nữa: trên iPhone vào Cài đặt → Camera → Định dạng → chọn "Tương thích nhất".',
    ],
  });

const playable = async (file: string) => {
  const meta = await mediaMeta(file, 'video');
  return !!meta.w && !!meta.h;
};

export const dropFromLibrary = async (p: Payload, at?: number, track?: string) => {
  const proj = getState().project;
  if (p.k === 'media') {
    const kind = mediaKind(p.file);
    if (!kind) return;
    const meta = await mediaMeta(p.file, kind);
    if (kind === 'video' && !(meta.w && meta.h)) return warnUndecodable(p.name);
    const base: Partial<Item> = { name: p.name, src: p.file };
    if (kind === 'video') {
      // video ngang trong khung dọc (hoặc ngược lại) thì để vừa khung, còn lại phủ kín
      const sameShape = !meta.w || !meta.h || meta.w / meta.h > 1 === proj.width / proj.height > 1;
      addItem({ ...base, type: 'video', dur: round3(meta.dur), srcDur: round3(meta.dur), volume: 1, fit: sameShape ? 'cover' : 'contain' }, { at, track });
    } else if (kind === 'image') addItem({ ...base, type: 'image', dur: 4, fit: 'contain' }, { at, track });
    else addItem({ ...base, type: 'audio', dur: round3(meta.dur), srcDur: round3(meta.dur), volume: 1 }, { at, track });
  } else if (p.k === 'sfx') {
    addItem({ type: 'audio', name: p.name, src: p.file, dur: p.dur, srcDur: p.dur, volume: 0.9 }, { at, track: track || proj.tracks.find((t) => t.kind === 'audio')?.id });
  } else if (p.k === 'text') {
    const preset = TEXT_PRESETS.find((x) => x.id === p.preset)!;
    const sub = preset.id.startsWith('phude');
    addItem(
      { type: 'text', name: preset.label, preset: preset.id, text: 'Chữ mới', dur: 3, animIn: sub ? 'none' : 'pop', animOut: sub ? 'none' : 'fade', align: 'center', ...preset.defaults },
      { at, track: track || proj.tracks.find((t) => t.kind === 'text' && (sub ? /phụ đề/i.test(t.name) : !/phụ đề/i.test(t.name)))?.id },
    );
  } else if (p.k === 'fx') {
    const fx = EFFECTS.find((x) => x.id === p.fx)!;
    const short = ['flash', 'punch', 'shake', 'glitch', 'fadeIn', 'fadeOut'].includes(fx.id);
    addItem({ type: 'effect', name: fx.label, fx: fx.id, amount: 50, dur: short ? 0.6 : 3 }, { at, track });
  } else if (p.k === 'scene') {
    const sc = SCENES.find((x) => x.id === p.id)!;
    addItem({ type: 'solid', name: sc.label, fill: sc.fill, dur: 3 }, { at, track });
  }
};

const drag = (p: Payload) => ({
  draggable: true,
  onDragStart: (e: React.DragEvent) => {
    e.dataTransfer.setData('application/x-studio', JSON.stringify(p));
    e.dataTransfer.effectAllowed = 'copy';
  },
});

const url = (file: string) => assetUrl(file);

const TABS = [
  { id: 'nguon', icon: '📁', label: 'Nguồn' },
  { id: 'amthanh', icon: '🎵', label: 'Âm thanh' },
  { id: 'chu', icon: '🔤', label: 'Chữ' },
  { id: 'hieuung', icon: '✨', label: 'Hiệu ứng' },
  { id: 'canh', icon: '🎬', label: 'Cảnh' },
] as const;

export const Library: React.FC = () => {
  const [tab, setTab] = useState<(typeof TABS)[number]['id']>(() => {
    try {
      return (localStorage.getItem('studio.tab') as any) || 'nguon';
    } catch {
      return 'nguon';
    }
  });
  const [media, setMedia] = useState<MediaFile[]>([]);
  const [sfx, setSfx] = useState<SfxFile[]>([]);
  const [busy, setBusy] = useState(0);
  const [over, setOver] = useState(false);
  const [bad, setBad] = useState<Record<string, boolean>>({});
  const input = useRef<HTMLInputElement>(null);
  const audio = useRef<HTMLAudioElement | null>(null);

  const refresh = () =>
    api
      .media()
      .then((list) => {
        setMedia(list);
        for (const m of list)
          if (mediaKind(m.name) === 'video') playable(m.file).then((ok) => (ok ? null : setBad((b) => (b[m.file] ? b : { ...b, [m.file]: true }))));
      })
      .catch(() => {});
  useEffect(() => {
    refresh();
    api.sfx().then(setSfx).catch(() => {});
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem('studio.tab', tab);
    } catch {}
  }, [tab]);

  const upload = async (files: FileList | File[]) => {
    const list = [...files].filter((f) => mediaKind(f.name));
    if (!list.length) return toast('Chỉ nhận tệp video, ảnh hoặc âm thanh');
    setBusy(list.length);
    for (const f of list) {
      try {
        const up = await api.upload(f);
        if (mediaKind(up.name) === 'video' && !(await playable(up.file))) {
          setBad((b) => ({ ...b, [up.file]: true }));
          warnUndecodable(up.name);
        }
      } catch (e: any) {
        toast(`Không nhập được ${f.name}: ${e.message}`);
      }
      setBusy((n) => n - 1);
    }
    setBusy(0);
    refresh();
  };

  const preview = (file: string) => {
    audio.current?.pause();
    audio.current = new Audio(url(file));
    audio.current.play().catch(() => {});
  };

  const visual = media.filter((m) => mediaKind(m.name) !== 'audio');
  const sounds = media.filter((m) => mediaKind(m.name) === 'audio');

  return (
    <aside className="library panel">
      <nav className="lib-tabs">
        {TABS.map((t) => (
          <button key={t.id} className={tab === t.id ? 'on' : ''} onClick={() => setTab(t.id)}>
            <span>{t.icon}</span>
            {t.label}
          </button>
        ))}
      </nav>
      <div
        className={`lib-body${over ? ' over' : ''}`}
        onDragOver={(e) => {
          if (e.dataTransfer.types.includes('Files')) {
            e.preventDefault();
            setOver(true);
          }
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          if (e.dataTransfer.files.length) {
            e.preventDefault();
            setOver(false);
            upload(e.dataTransfer.files);
          }
        }}
      >
        <input ref={input} type="file" multiple hidden accept="video/*,image/*,audio/*" onChange={(e) => (e.target.files && upload(e.target.files), (e.target.value = ''))} />
        {tab === 'nguon' ? (
          <>
            <h3>Nguồn gốc</h3>
            <p className="hint">Video, ảnh bạn nhập. Bấm ＋ để đặt vào đầu phát, hoặc kéo xuống thanh thời gian.</p>
            <button className="btn primary wide" onClick={() => input.current?.click()} disabled={busy > 0}>
              {busy > 0 ? `Đang nhập… còn ${busy} tệp` : '＋ Nhập tệp từ máy'}
            </button>
            <p className="hint center">hoặc kéo thả tệp vào đây</p>
            <div className="grid">
              {visual.map((m) => (
                <div key={m.file} className="card media" {...drag({ k: 'media', file: m.file, name: m.name })}>
                  {mediaKind(m.name) === 'video' ? <video src={`${url(m.file)}#t=0.5`} muted preload="metadata" /> : <img src={url(m.file)} alt="" />}
                  <button className="add" onClick={() => dropFromLibrary({ k: 'media', file: m.file, name: m.name })} title="Thêm vào đầu phát">
                    ＋
                  </button>
                  {bad[m.file] ? (
                    <button className="badwarn" onClick={() => warnUndecodable(m.name)} title="Bấm để xem cách xử lý">
                      ⚠ Không phát được
                    </button>
                  ) : null}
                  <span className="cap">{m.name}</span>
                </div>
              ))}
            </div>
            {!visual.length ? <p className="empty">Chưa có tệp nào. Nhập video quay sẵn hoặc ảnh minh hoạ để bắt đầu.</p> : null}
          </>
        ) : null}
        {tab === 'amthanh' ? (
          <>
            <h3>Tiếng động có sẵn</h3>
            <p className="hint">Bấm ▶ để nghe thử, ＋ để chèn vào đầu phát.</p>
            <div className="list">
              {sfx.map((s) => {
                const name = SFX.find((x) => x.id === s.id)?.label || s.id;
                return (
                  <div key={s.id} className="row" {...drag({ k: 'sfx', file: s.file, name, dur: s.dur })}>
                    <button className="icon" onClick={() => preview(s.file)} title="Nghe thử">
                      ▶
                    </button>
                    <span className="grow">{name}</span>
                    <small>{s.dur.toFixed(1)}s</small>
                    <button className="add" onClick={() => dropFromLibrary({ k: 'sfx', file: s.file, name, dur: s.dur })} title="Thêm vào đầu phát">
                      ＋
                    </button>
                  </div>
                );
              })}
            </div>
            <h3>Nhạc và giọng đọc của bạn</h3>
            <button className="btn wide" onClick={() => input.current?.click()}>
              ＋ Nhập tệp âm thanh
            </button>
            <div className="list">
              {sounds.map((m) => (
                <div key={m.file} className="row" {...drag({ k: 'media', file: m.file, name: m.name })}>
                  <button className="icon" onClick={() => preview(m.file)} title="Nghe thử">
                    ▶
                  </button>
                  <span className="grow ell">{m.name}</span>
                  <button className="add" onClick={() => dropFromLibrary({ k: 'media', file: m.file, name: m.name })} title="Thêm vào đầu phát">
                    ＋
                  </button>
                </div>
              ))}
            </div>
          </>
        ) : null}
        {tab === 'chu' ? (
          <>
            <h3>Kiểu chữ</h3>
            <p className="hint">Bấm để thêm. Sau đó bấm đúp vào chữ trên hình để sửa nội dung.</p>
            <div className="grid text">
              {TEXT_PRESETS.map((p) => {
                const fake = { ...(p.defaults as Item), size: 20 } as Item;
                return (
                  <button key={p.id} className="card textcard" onClick={() => dropFromLibrary({ k: 'text', preset: p.id })} {...drag({ k: 'text', preset: p.id })}>
                    <span
                      className="sample"
                      style={{
                        fontFamily: `"${p.defaults.font || 'Be Vietnam Pro'}"`,
                        fontWeight: p.defaults.bold ? 700 : 400,
                        color: p.defaults.color,
                        fontSize: 20,
                        ...p.style(fake),
                        ...(p.id === 'vien' || p.id === 'phude2' ? { WebkitTextStroke: `3px ${p.defaults.stroke}` } : {}),
                      }}
                    >
                      {p.id === 'khonglo' ? 'WOW' : 'Chữ'}
                    </span>
                    <span className="cap">{p.label}</span>
                  </button>
                );
              })}
            </div>
          </>
        ) : null}
        {tab === 'hieuung' ? (
          <>
            <h3>Hiệu ứng hình</h3>
            <p className="hint">Hiệu ứng tác động lên hình nền trong khoảng thời gian của khối. Kéo mép khối để chỉnh độ dài.</p>
            <div className="list">
              {EFFECTS.map((f) => (
                <div key={f.id} className="row fx" {...drag({ k: 'fx', fx: f.id })} title={f.hint}>
                  <span className="emo">{f.icon}</span>
                  <span className="grow">
                    {f.label}
                    <small className="block">{f.hint}</small>
                  </span>
                  <button className="add" onClick={() => dropFromLibrary({ k: 'fx', fx: f.id })} title="Thêm vào đầu phát">
                    ＋
                  </button>
                </div>
              ))}
            </div>
          </>
        ) : null}
        {tab === 'canh' ? (
          <>
            <h3>Cảnh nền màu</h3>
            <p className="hint">Dùng làm cảnh mở đầu, cảnh chuyển, hoặc nền cho chữ. Ảnh chèn thì nhập ở mục Nguồn.</p>
            <div className="grid">
              {SCENES.map((s) => (
                <button key={s.id} className="card scene" onClick={() => dropFromLibrary({ k: 'scene', id: s.id })} {...drag({ k: 'scene', id: s.id })}>
                  <span className="swatch" style={{ background: s.fill }} />
                  <span className="cap">{s.label}</span>
                </button>
              ))}
            </div>
          </>
        ) : null}
      </div>
    </aside>
  );
};
