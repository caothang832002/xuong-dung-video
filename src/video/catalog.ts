// Danh mục phông chữ, kiểu chữ, hiệu ứng, chuyển động. Dùng chung cho khung dựng lẫn giao diện.
import type { CSSProperties } from 'react';
import type { Item } from '../model';

export const FONTS = [
  { id: 'Be Vietnam Pro', label: 'Be Vietnam Pro' },
  { id: 'Lexend', label: 'Lexend' },
  { id: 'Baloo 2', label: 'Baloo 2 (tròn)' },
  { id: 'Roboto Slab', label: 'Roboto Slab (chân)' },
  { id: 'Anton', label: 'Anton (đậm cao)' },
  { id: 'Bungee', label: 'Bungee (khối)' },
  { id: 'Pacifico', label: 'Pacifico (viết tay)' },
  { id: 'Dancing Script', label: 'Dancing Script (thư pháp)' },
];

export type TextPreset = {
  id: string;
  label: string;
  defaults: Partial<Item>;
  style: (it: Item) => CSSProperties;
};

const shadow = '0 4px 18px rgba(0,0,0,.45)';

export const TEXT_PRESETS: TextPreset[] = [
  {
    id: 'tron',
    label: 'Chữ trơn',
    defaults: { size: 72, color: '#ffffff', bold: true },
    style: () => ({ textShadow: shadow }),
  },
  {
    id: 'vien',
    label: 'Chữ viền',
    defaults: { size: 84, color: '#ffffff', stroke: '#111111', bold: true },
    style: (it) => ({
      WebkitTextStroke: `${Math.max(4, (it.size || 72) * 0.14)}px ${it.stroke || '#111'}`,
      paintOrder: 'stroke fill',
      textShadow: '0 6px 0 rgba(0,0,0,.25)',
    }),
  },
  {
    id: 'phude',
    label: 'Phụ đề',
    defaults: { size: 54, color: '#ffffff', bg: 'rgba(0,0,0,0.62)', bold: true, y: 560, font: 'Be Vietnam Pro' },
    style: (it) => ({ background: it.bg || 'rgba(0,0,0,.62)', padding: '0.28em 0.6em', borderRadius: '0.3em' }),
  },
  {
    id: 'phude2',
    label: 'Phụ đề hai tầng',
    defaults: { size: 60, color: '#ffe45c', stroke: '#111111', bold: true, y: 520, text: 'Dòng nhấn mạnh\nDòng giải thích nhỏ hơn' },
    style: (it) => ({
      WebkitTextStroke: `${Math.max(4, (it.size || 60) * 0.12)}px ${it.stroke || '#111'}`,
      paintOrder: 'stroke fill',
    }),
  },
  {
    id: 'vienthuoc',
    label: 'Nhãn viên thuốc',
    defaults: { size: 46, color: '#ffffff', bg: '#0f8b7c', bold: true, y: -620 },
    style: (it) => ({ background: it.bg || '#0f8b7c', padding: '0.35em 0.95em', borderRadius: '999px', boxShadow: '0 8px 24px rgba(0,0,0,.25)' }),
  },
  {
    id: 'hop',
    label: 'Hộp tiêu đề',
    defaults: { size: 64, color: '#1f2a2e', bg: '#ffffff', bold: true },
    style: (it) => ({ background: it.bg || '#fff', padding: '0.4em 0.7em', borderRadius: '0.28em', boxShadow: '0 10px 30px rgba(0,0,0,.28)' }),
  },
  {
    id: 'khonglo',
    label: 'Chữ khổng lồ',
    defaults: { size: 260, color: '#ffffff', font: 'Anton', opacity: 0.92, text: 'WOW' },
    style: () => ({ textTransform: 'uppercase', letterSpacing: '-0.01em', lineHeight: 0.95 }),
  },
  {
    id: 'neon',
    label: 'Chữ phát sáng',
    defaults: { size: 88, color: '#ffffff', stroke: '#22d3ee', bold: true },
    style: (it) => {
      const c = it.stroke || '#22d3ee';
      return { textShadow: `0 0 12px ${c}, 0 0 32px ${c}, 0 0 70px ${c}` };
    },
  },
  {
    id: 'butda',
    label: 'Bút dạ quang',
    defaults: { size: 66, color: '#1f2a2e', bg: '#ffe45c', bold: true },
    style: (it) => ({
      backgroundImage: `linear-gradient(transparent 38%, ${it.bg || '#ffe45c'} 38%, ${it.bg || '#ffe45c'} 92%, transparent 92%)`,
      padding: '0 0.25em',
    }),
  },
  {
    id: 'viettay',
    label: 'Viết tay',
    defaults: { size: 96, color: '#ffffff', font: 'Pacifico' },
    style: () => ({ textShadow: shadow }),
  },
];

export const presetOf = (id?: string) => TEXT_PRESETS.find((p) => p.id === id) || TEXT_PRESETS[0];

export const ANIM_IN = [
  { id: 'none', label: 'Không' },
  { id: 'fade', label: 'Hiện dần' },
  { id: 'pop', label: 'Bật nảy' },
  { id: 'up', label: 'Trượt lên' },
  { id: 'down', label: 'Trượt xuống' },
  { id: 'left', label: 'Trượt từ trái' },
  { id: 'zoom', label: 'Thu vào' },
  { id: 'type', label: 'Gõ từng chữ' },
];

export const ANIM_OUT = [
  { id: 'none', label: 'Không' },
  { id: 'fade', label: 'Mờ dần' },
  { id: 'down', label: 'Trượt xuống' },
  { id: 'shrink', label: 'Thu nhỏ' },
];

export const EFFECTS = [
  { id: 'zoomIn', label: 'Phóng to dần', icon: '🔍', hint: 'Hình lớn dần trong suốt đoạn' },
  { id: 'zoomOut', label: 'Thu nhỏ dần', icon: '🔭', hint: 'Bắt đầu to rồi lùi ra' },
  { id: 'punch', label: 'Phóng giật', icon: '💥', hint: 'Phóng nhanh vào rồi giữ' },
  { id: 'shake', label: 'Rung', icon: '📳', hint: 'Rung lắc khung hình' },
  { id: 'panL', label: 'Lia sang trái', icon: '⬅️', hint: 'Trượt hình chậm sang trái' },
  { id: 'panR', label: 'Lia sang phải', icon: '➡️', hint: 'Trượt hình chậm sang phải' },
  { id: 'flash', label: 'Chớp sáng', icon: '⚡', hint: 'Loé trắng rồi tắt, hợp chỗ cắt cảnh' },
  { id: 'fadeIn', label: 'Mở từ đen', icon: '🌅', hint: 'Hình hiện dần từ nền đen' },
  { id: 'fadeOut', label: 'Tối dần', icon: '🌙', hint: 'Hình tối dần về đen' },
  { id: 'blur', label: 'Làm mờ', icon: '🌫️', hint: 'Mờ hình nền để chữ nổi lên' },
  { id: 'bw', label: 'Đen trắng', icon: '🎞️', hint: 'Bỏ màu' },
  { id: 'sepia', label: 'Hoài cổ', icon: '📜', hint: 'Tông nâu ấm' },
  { id: 'vivid', label: 'Rực màu', icon: '🌈', hint: 'Tăng độ đậm và tương phản' },
  { id: 'vignette', label: 'Tối bốn góc', icon: '🔦', hint: 'Dồn mắt vào giữa hình' },
  { id: 'glitch', label: 'Nhiễu màu', icon: '📺', hint: 'Giật và lệch màu kiểu tín hiệu lỗi' },
];

export const effectOf = (id?: string) => EFFECTS.find((e) => e.id === id) || EFFECTS[0];

export const SCENES = [
  { id: 'den', label: 'Nền đen', fill: '#000000' },
  { id: 'trang', label: 'Nền trắng', fill: '#ffffff' },
  { id: 'kem', label: 'Nền kem', fill: '#f6f0e1' },
  { id: 'xanh', label: 'Xanh ngọc', fill: 'linear-gradient(160deg,#0f8b7c,#063f4a)' },
  { id: 'cam', label: 'Hoàng hôn', fill: 'linear-gradient(160deg,#ffb347,#e2543d)' },
  { id: 'tim', label: 'Tím đêm', fill: 'linear-gradient(160deg,#5b3fd6,#1b1440)' },
  { id: 'bang', label: 'Bảng xanh', fill: 'linear-gradient(180deg,#1f5c43,#143d2d)' },
  { id: 'troi', label: 'Trời sáng', fill: 'linear-gradient(180deg,#8fd3ff,#e8f7ff)' },
];

export const SFX = [
  { id: 'pop', label: 'Bụp nhẹ' },
  { id: 'ting', label: 'Ting' },
  { id: 'click', label: 'Tách' },
  { id: 'whoosh', label: 'Vút qua' },
  { id: 'vut_len', label: 'Vút lên' },
  { id: 'dung', label: 'Đúng rồi' },
  { id: 'sai', label: 'Sai rồi' },
  { id: 'tada', label: 'Ta-đa' },
  { id: 'lap_lanh', label: 'Lấp lánh' },
  { id: 'go_phim', label: 'Gõ phím' },
  { id: 'tang_dan', label: 'Dồn lên' },
  { id: 'bum', label: 'Bùm trầm' },
];
