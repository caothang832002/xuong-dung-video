// Ghi bộ tiếng động ra thư mục public/sfx khi chạy lần đầu.
import fs from 'node:fs';
import path from 'node:path';
import { SFX_NAMES, synthSfx } from '../shared/sfx-synth.mjs';

export const ensureSfx = (dir) => {
  fs.mkdirSync(dir, { recursive: true });
  let made = 0;
  for (const name of SFX_NAMES) {
    const file = path.join(dir, `${name}.wav`);
    if (fs.existsSync(file)) continue;
    fs.writeFileSync(file, synthSfx(name).bytes);
    made++;
  }
  return made;
};

export const sfxDuration = (file) => (fs.statSync(file).size - 44) / 2 / 44100;
