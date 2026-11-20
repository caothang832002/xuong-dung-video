// Bảng thuộc tính bên phải: sửa mọi thông số của khối đang chọn.
import React from 'react';
import { round3 } from '../model';
import type { Item } from '../model';
import { duplicate, getTime, layerShift, patchItems, patchProject, player, removeItems, snapshot, splitAt, useStore } from '../store';
import { ANIM_IN, ANIM_OUT, EFFECTS, FONTS, TEXT_PRESETS, presetOf } from '../video/catalog';

const TYPE_LABEL: Record<string, string> = { video: '🎬 Video', image: '🖼️ Ảnh', solid: '🎨 Cảnh nền', text: '🔤 Chữ', effect: '✨ Hiệu ứng', audio: '🎵 Âm thanh' };

const stop = (e: React.KeyboardEvent) => e.stopPropagation();

const Num: React.FC<{ label: string; value: number; onChange: (v: number) => void; step?: number; min?: number; max?: number; unit?: string }> = ({ label, value, onChange, step = 1, min, max, unit }) => (
  <label className="field">
    <span>{label}</span>
    <span className="num">
      <input
        type="number"
        value={Number.isFinite(value) ? value : 0}
        step={step}
        min={min}
        max={max}
        onKeyDown={stop}
        onChange={(e) => {
          const v = Number(e.target.value);
          if (Number.isFinite(v)) onChange(v);
        }}
      />
      {unit ? <i>{unit}</i> : null}
    </span>
  </label>
);

// Thanh trượt: chỉ ghi một bước hoàn tác cho cả lần kéo.
const Slide: React.FC<{ label: string; value: number; min: number; max: number; step?: number; show?: string; onChange: (v: number, history: boolean) => void }> = ({ label, value, min, max, step = 1, show, onChange }) => (
  <label className="field slide">
    <span>
      {label} <b>{show ?? value}</b>
    </span>
    <input type="range" min={min} max={max} step={step} value={value} onPointerDown={() => snapshot()} onKeyDown={stop} onChange={(e) => onChange(Number(e.target.value), false)} />
  </label>
);

const Color: React.FC<{ label: string; value?: string; onChange: (v: string) => void; swatches?: string[] }> = ({ label, value, onChange, swatches = ['#ffffff', '#111111', '#ffe45c', '#f08a24', '#e2543d', '#0f8b7c', '#22d3ee', '#5b3fd6'] }) => {
  const hex = /^#[0-9a-f]{6}$/i.test(value || '') ? value! : '#000000';
  return (
    <div className="field">
      <span>{label}</span>
      <div className="colors">
        <input type="color" value={hex} onPointerDown={() => snapshot()} onChange={(e) => onChange(e.target.value)} />
        {swatches.map((c) => (
          <button key={c} className={`sw${value === c ? ' on' : ''}`} style={{ background: c }} onClick={() => (snapshot(), onChange(c))} title={c} />
        ))}
      </div>
    </div>
  );
};

const ProjectPanel: React.FC = () => {
  const project = useStore((s) => s.project);
  const shape = `${project.width}x${project.height}`;
  return (
    <div className="insp-empty">
      <div className="big">🎛️</div>
      <p>Bấm vào một dòng chữ hay hình trên video, hoặc một khối trên thanh thời gian để sửa.</p>
      <div className="group">
        <h4>Khung video</h4>
        <label className="field">
          <span>Tỉ lệ</span>
          <select
            value={shape}
            onChange={(e) => {
              const [w, h] = e.target.value.split('x').map(Number);
              patchProject({ width: w, height: h });
            }}
          >
            <option value="1080x1920">Dọc 9:16 (TikTok, Reels, Shorts)</option>
            <option value="1920x1080">Ngang 16:9 (YouTube, bài giảng)</option>
            <option value="1080x1080">Vuông 1:1</option>
            <option value="1080x1350">Dọc 4:5</option>
            {['1080x1920', '1920x1080', '1080x1080', '1080x1350'].includes(shape) ? null : <option value={shape}>{shape}</option>}
          </select>
        </label>
        <label className="field">
          <span>Khung hình mỗi giây</span>
          <select value={project.fps} onChange={(e) => patchProject({ fps: Number(e.target.value) })}>
            <option value={24}>24</option>
            <option value={25}>25</option>
            <option value={30}>30</option>
            <option value={60}>60</option>
          </select>
        </label>
      </div>
      <div className="keys">
        <div>
          <kbd>Phím cách</kbd> phát / dừng
        </div>
        <div>
          <kbd>←</kbd> <kbd>→</kbd> từng khung (giữ Shift: 1 giây)
        </div>
        <div>
          <kbd>Ctrl</kbd>+<kbd>B</kbd> tách · <kbd>Ctrl</kbd>+<kbd>D</kbd> nhân đôi
        </div>
        <div>
          <kbd>Ctrl</kbd>+<kbd>Z</kbd> hoàn tác · <kbd>Delete</kbd> xoá
        </div>
        <div>
          <kbd>Ctrl</kbd>+<kbd>C</kbd> / <kbd>V</kbd> chép, dán · <kbd>Esc</kbd> xong sửa chữ
        </div>
      </div>
    </div>
  );
};

export const Inspector: React.FC = () => {
  const sel = useStore((s) => s.sel);
  const items = useStore((s) => s.project.items);
  const chosen = items.filter((i) => sel.includes(i.id));
  if (!chosen.length)
    return (
      <aside className="inspector panel">
        <ProjectPanel />
      </aside>
    );
  const it = chosen[0];
  const ids = chosen.map((i) => i.id);
  const set = (patch: Partial<Item>, history = true) => patchItems(ids, patch, history);
  const visual = it.type === 'video' || it.type === 'image' || it.type === 'solid' || it.type === 'text';
  const media = it.type === 'video' || it.type === 'audio';
  const preset = presetOf(it.preset);
  const usesBg = ['phude', 'vienthuoc', 'hop', 'butda'].includes(preset.id);
  const usesStroke = ['vien', 'phude2', 'neon'].includes(preset.id);

  return (
    <aside className="inspector panel">
      <div className="insp-head">
        <span className="chip">{TYPE_LABEL[it.type]}</span>
        {chosen.length > 1 ? <span className="chip soft">đang chọn {chosen.length} khối</span> : null}
      </div>
      <input className="name" value={it.name} onKeyDown={stop} onFocus={() => snapshot()} onChange={(e) => patchItems([it.id], { name: e.target.value }, false)} title="Tên khối (để bạn và Claude dễ gọi)" />
      <div className="quick">
        <button className="btn" onClick={() => player.seek(it.start + 0.01)}>
          🎯 Xem
        </button>
        <button className="btn" onClick={() => splitAt(getTime())}>
          ✂️ Tách
        </button>
        <button className="btn" onClick={() => duplicate(ids)}>
          👯
        </button>
        <button className="btn" onClick={() => layerShift(it.id, -1)} title="Đưa lên lớp trên">
          ⬆ Lớp
        </button>
        <button className="btn" onClick={() => layerShift(it.id, 1)} title="Đưa xuống lớp dưới">
          ⬇ Lớp
        </button>
        <button className="btn danger" onClick={() => removeItems(ids)}>
          🗑️
        </button>
      </div>

      {it.type === 'text' ? (
        <div className="group">
          <h4>Nội dung</h4>
          <textarea className="text" rows={3} value={it.text ?? ''} onKeyDown={stop} onFocus={() => snapshot()} onChange={(e) => patchItems([it.id], { text: e.target.value }, false)} />
          <label className="field">
            <span>Kiểu chữ</span>
            <select
              value={preset.id}
              onChange={(e) => {
                const p = TEXT_PRESETS.find((x) => x.id === e.target.value)!;
                const { text: _t, y: _y, ...d } = p.defaults as any;
                set({ preset: p.id, ...d });
              }}
            >
              {TEXT_PRESETS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Phông chữ</span>
            <select value={it.font || 'Be Vietnam Pro'} onChange={(e) => set({ font: e.target.value })} style={{ fontFamily: `"${it.font || 'Be Vietnam Pro'}"` }}>
              {FONTS.map((f) => (
                <option key={f.id} value={f.id} style={{ fontFamily: `"${f.id}"` }}>
                  {f.label}
                </option>
              ))}
            </select>
          </label>
          <Slide label="Cỡ chữ" value={it.size || 72} min={16} max={400} onChange={(v, h) => set({ size: v }, h)} />
          <div className="field">
            <span>Dáng chữ</span>
            <div className="seg">
              <button className={it.bold ? 'on' : ''} onClick={() => set({ bold: !it.bold })} style={{ fontWeight: 700 }}>
                Đậm
              </button>
              <button className={it.italic ? 'on' : ''} onClick={() => set({ italic: !it.italic })} style={{ fontStyle: 'italic' }}>
                Nghiêng
              </button>
              {(['left', 'center', 'right'] as const).map((a) => (
                <button key={a} className={(it.align || 'center') === a ? 'on' : ''} onClick={() => set({ align: a })} title={a === 'left' ? 'Căn trái' : a === 'center' ? 'Căn giữa' : 'Căn phải'}>
                  {a === 'left' ? '⇤' : a === 'center' ? '↔' : '⇥'}
                </button>
              ))}
            </div>
          </div>
          <Color label="Màu chữ" value={it.color} onChange={(v) => set({ color: v }, false)} />
          {usesBg ? <Color label="Màu nền" value={it.bg} onChange={(v) => set({ bg: v }, false)} /> : null}
          {usesStroke ? <Color label={preset.id === 'neon' ? 'Màu phát sáng' : 'Màu viền'} value={it.stroke} onChange={(v) => set({ stroke: v }, false)} /> : null}
          <label className="field">
            <span>Chuyển động vào</span>
            <select value={it.animIn || 'none'} onChange={(e) => set({ animIn: e.target.value })}>
              {ANIM_IN.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Chuyển động ra</span>
            <select value={it.animOut || 'none'} onChange={(e) => set({ animOut: e.target.value })}>
              {ANIM_OUT.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      ) : null}

      {it.type === 'effect' ? (
        <div className="group">
          <h4>Hiệu ứng</h4>
          <label className="field">
            <span>Loại</span>
            <select value={it.fx} onChange={(e) => set({ fx: e.target.value, name: EFFECTS.find((x) => x.id === e.target.value)!.label })}>
              {EFFECTS.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.icon} {f.label}
                </option>
              ))}
            </select>
          </label>
          <Slide label="Độ mạnh" value={it.amount ?? 50} min={0} max={100} show={`${it.amount ?? 50}%`} onChange={(v, h) => set({ amount: v }, h)} />
        </div>
      ) : null}

      {it.type === 'solid' ? (
        <div className="group">
          <h4>Màu nền</h4>
          <Color label="Màu" value={it.fill} onChange={(v) => set({ fill: v }, false)} swatches={['#000000', '#ffffff', '#f6f0e1', '#0f8b7c', '#e2543d', '#5b3fd6', '#1f5c43', '#8fd3ff']} />
        </div>
      ) : null}

      <div className="group">
        <h4>Thời gian</h4>
        <div className="two">
          <Num label="Bắt đầu" value={it.start} step={0.1} min={0} unit="s" onChange={(v) => patchItems([it.id], { start: round3(Math.max(0, v)) })} />
          <Num label="Độ dài" value={it.dur} step={0.1} min={0.1} unit="s" onChange={(v) => patchItems([it.id], { dur: round3(Math.max(0.1, v)) })} />
        </div>
        {media ? (
          <>
            <div className="two">
              <Num label="Bỏ đầu tệp" value={it.trim || 0} step={0.1} min={0} unit="s" onChange={(v) => set({ trim: round3(Math.max(0, v)) })} />
              <Num label="Tốc độ" value={it.speed || 1} step={0.25} min={0.25} max={4} unit="×" onChange={(v) => set({ speed: Math.max(0.25, Math.min(4, v)) })} />
            </div>
            <Slide label="Âm lượng" value={Math.round((it.volume ?? 1) * 100)} min={0} max={200} show={`${Math.round((it.volume ?? 1) * 100)}%`} onChange={(v, h) => set({ volume: v / 100 }, h)} />
          </>
        ) : null}
        {it.type !== 'effect' && it.type !== 'text' ? (
          <div className="two">
            <Num label="Vào dần" value={it.fadeIn || 0} step={0.1} min={0} unit="s" onChange={(v) => set({ fadeIn: Math.max(0, v) })} />
            <Num label="Ra dần" value={it.fadeOut || 0} step={0.1} min={0} unit="s" onChange={(v) => set({ fadeOut: Math.max(0, v) })} />
          </div>
        ) : null}
      </div>

      {visual ? (
        <div className="group">
          <h4>Vị trí & kích thước</h4>
          <div className="two">
            <Num label="Ngang X" value={it.x || 0} step={10} onChange={(v) => set({ x: v })} />
            <Num label="Dọc Y" value={it.y || 0} step={10} onChange={(v) => set({ y: v })} />
          </div>
          <Slide label="Phóng to" value={Math.round((it.scale ?? 1) * 100)} min={10} max={400} show={`${Math.round((it.scale ?? 1) * 100)}%`} onChange={(v, h) => set({ scale: v / 100 }, h)} />
          <Slide label="Xoay" value={it.rot || 0} min={-180} max={180} show={`${it.rot || 0}°`} onChange={(v, h) => set({ rot: v }, h)} />
          <Slide label="Độ đậm" value={Math.round((it.opacity ?? 1) * 100)} min={0} max={100} show={`${Math.round((it.opacity ?? 1) * 100)}%`} onChange={(v, h) => set({ opacity: v / 100 }, h)} />
          {it.type === 'video' || it.type === 'image' ? (
            <div className="field">
              <span>Cách đặt hình</span>
              <div className="seg">
                <button className={(it.fit || 'cover') === 'cover' ? 'on' : ''} onClick={() => set({ fit: 'cover' })}>
                  Phủ kín
                </button>
                <button className={it.fit === 'contain' ? 'on' : ''} onClick={() => set({ fit: 'contain' })}>
                  Vừa khung
                </button>
              </div>
            </div>
          ) : null}
          <button className="btn wide ghost" onClick={() => set({ x: 0, y: 0, scale: 1, rot: 0 })}>
            ↺ Đưa về giữa, cỡ gốc
          </button>
        </div>
      ) : null}
    </aside>
  );
};
