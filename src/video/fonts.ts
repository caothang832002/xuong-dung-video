// Phông có đủ dấu tiếng Việt, đóng gói sẵn (không cần mạng khi dựng).
import '@fontsource/be-vietnam-pro/400.css';
import '@fontsource/be-vietnam-pro/400-italic.css';
import '@fontsource/be-vietnam-pro/700.css';
import '@fontsource/be-vietnam-pro/700-italic.css';
import '@fontsource/lexend/400.css';
import '@fontsource/lexend/700.css';
import '@fontsource/baloo-2/400.css';
import '@fontsource/baloo-2/700.css';
import '@fontsource/roboto-slab/400.css';
import '@fontsource/roboto-slab/700.css';
import '@fontsource/anton/400.css';
import '@fontsource/bungee/400.css';
import '@fontsource/pacifico/400.css';
import '@fontsource/dancing-script/400.css';
import '@fontsource/dancing-script/700.css';
import { continueRender, delayRender } from 'remotion';
import { useEffect, useState } from 'react';
import type { Project } from '../model';

// Chờ phông tải xong rồi mới chụp khung, tránh chữ bị nhảy phông khi xuất.
export const useFontsReady = (project: Project) => {
  const key = project.items
    .filter((i) => i.type === 'text')
    .map((i) => `${i.italic ? 'italic ' : ''}${i.bold ? 700 : 400} 40px "${i.font || 'Be Vietnam Pro'}"`)
    .filter((v, i, a) => a.indexOf(v) === i)
    .sort()
    .join('|');
  const [handle] = useState(() => delayRender('Tải phông chữ'));
  useEffect(() => {
    let done = false;
    const finish = () => {
      if (!done) {
        done = true;
        continueRender(handle);
      }
    };
    const specs = key ? key.split('|') : [];
    Promise.all(specs.map((s) => document.fonts.load(s, 'Tiếng Việt ắẫộữ').catch(() => null))).then(finish, finish);
    const t = setTimeout(finish, 8000);
    return () => clearTimeout(t);
  }, [key, handle]);
};
