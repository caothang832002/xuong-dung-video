// Đổi tên tệp trong dự án ("media/a.mp4", "sfx/pop.wav") thành địa chỉ phát được.
// Bản chạy trên máy: máy chủ phục vụ thẳng. Bản web: tệp nằm trong trình duyệt, đăng ký địa chỉ blob ở đây.
const registry = new Map<string, string>();

export const IS_WEB = (import.meta as any).env?.VITE_WEB === '1';

export const registerAsset = (file: string, url: string) => {
  registry.set(file, url);
};

export const assetUrl = (src: string, base?: string) => {
  if (/^(https?:|data:|blob:)/.test(src)) return src;
  const hit = registry.get(src);
  if (hit) return hit;
  return `${base || ''}/${src.split('/').map(encodeURIComponent).join('/')}`;
};
