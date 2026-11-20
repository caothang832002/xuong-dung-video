// Xuất dự án ra MP4 bằng bộ dựng của Remotion.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

let bundlePromise = null;

const getBundle = async (onLog) => {
  if (!bundlePromise) {
    bundlePromise = (async () => {
      const { bundle } = await import('@remotion/bundler');
      onLog?.('Đang đóng gói khung dựng (chỉ lần đầu)…');
      const emptyPublic = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-public-'));
      return bundle({ entryPoint: path.join(ROOT, 'src/video/index.tsx'), publicDir: emptyPublic });
    })();
    bundlePromise.catch(() => {
      bundlePromise = null;
    });
  }
  return bundlePromise;
};

const findBrowser = () => {
  if (process.env.STUDIO_CHROME) return process.env.STUDIO_CHROME;
  return undefined; // để Remotion tự tải trình duyệt dựng hình của nó
};

/**
 * @param {{project: any, assetBase: string, outFile: string, onProgress?: (p:number, msg:string)=>void, scale?: number}} o
 */
export const renderProject = async ({ project, assetBase, outFile, onProgress, scale }) => {
  const { renderMedia, selectComposition } = await import('@remotion/renderer');
  const serveUrl = await getBundle((m) => onProgress?.(0, m));
  const inputProps = { project, assetBase };
  const browserExecutable = findBrowser();
  const chromiumOptions = { enableMultiProcessOnLinux: true };
  onProgress?.(0.02, 'Đang mở trình dựng hình…');
  const composition = await selectComposition({ serveUrl, id: 'Video', inputProps, browserExecutable, chromiumOptions });
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  await renderMedia({
    composition,
    serveUrl,
    codec: 'h264',
    outputLocation: outFile,
    inputProps,
    browserExecutable,
    chromiumOptions,
    scale: scale || 1,
    pixelFormat: 'yuv420p',
    onProgress: ({ progress, renderedFrames, encodedFrames }) => {
      onProgress?.(0.05 + progress * 0.95, `Đã dựng ${renderedFrames}/${composition.durationInFrames} khung, đã nén ${encodedFrames}`);
    },
  });
  return { outFile, frames: composition.durationInFrames, fps: composition.fps };
};
