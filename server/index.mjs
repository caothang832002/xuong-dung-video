// Máy chủ của xưởng dựng: giao diện (Vite) + lưu dự án + nhập tệp + xuất video.
// Chạy: npm start            → mở http://localhost:3711
//       npm run render -- <tên dự án>   → xuất thẳng ra MP4, không mở giao diện
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ensureSfx, sfxDuration } from './sfx.mjs';
import { renderProject } from './render.mjs';
import { demoProject } from './demo.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIR = {
  projects: path.join(ROOT, 'du_an'),
  media: path.join(ROOT, 'public', 'media'),
  sfx: path.join(ROOT, 'public', 'sfx'),
  out: path.join(ROOT, 'xuat'),
};
for (const d of Object.values(DIR)) fs.mkdirSync(d, { recursive: true });
ensureSfx(DIR.sfx);

const safeName = (s) =>
  String(s || '')
    .normalize('NFC')
    .replace(/[^\p{L}\p{N}_\-. ]/gu, '')
    .replace(/\.+/g, '.')
    .replace(/^\.+/, '')
    .trim()
    .slice(0, 80);

const projectFile = (name) => path.join(DIR.projects, `${safeName(name)}.json`);

const listProjects = () =>
  fs
    .readdirSync(DIR.projects)
    .filter((f) => f.endsWith('.json'))
    .map((f) => ({ name: f.slice(0, -5), mtime: fs.statSync(path.join(DIR.projects, f)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);

if (listProjects().length === 0) {
  fs.writeFileSync(projectFile('vi_du'), JSON.stringify(demoProject('vi_du'), null, 2));
}

export const createApp = () => {
  const app = express();
  app.use('/media', express.static(DIR.media, { acceptRanges: true }));
  app.use('/sfx', express.static(DIR.sfx));
  app.use('/xuat', express.static(DIR.out));

  app.get('/api/projects', (_req, res) => res.json(listProjects()));

  app.get('/api/project/:name', (req, res) => {
    const file = projectFile(req.params.name);
    if (!fs.existsSync(file)) return res.status(404).json({ error: 'Không tìm thấy dự án' });
    try {
      const project = JSON.parse(fs.readFileSync(file, 'utf8'));
      res.json({ project, mtime: fs.statSync(file).mtimeMs });
    } catch (e) {
      res.status(422).json({ error: `Tệp dự án hỏng: ${e.message}` });
    }
  });

  app.get('/api/project/:name/mtime', (req, res) => {
    const file = projectFile(req.params.name);
    res.json({ mtime: fs.existsSync(file) ? fs.statSync(file).mtimeMs : 0 });
  });

  app.put('/api/project/:name', express.json({ limit: '20mb' }), (req, res) => {
    const name = safeName(req.params.name);
    if (!name) return res.status(400).json({ error: 'Tên dự án không hợp lệ' });
    const project = { ...req.body.project, name };
    const file = projectFile(name);
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(project, null, 2));
    fs.renameSync(tmp, file);
    res.json({ ok: true, mtime: fs.statSync(file).mtimeMs });
  });

  app.delete('/api/project/:name', (req, res) => {
    const file = projectFile(req.params.name);
    if (fs.existsSync(file)) fs.renameSync(file, `${file}.da_xoa`);
    res.json({ ok: true });
  });

  app.get('/api/media', (_req, res) => {
    const files = fs
      .readdirSync(DIR.media)
      .filter((f) => !f.startsWith('.'))
      .map((f) => ({ file: `media/${f}`, name: f, size: fs.statSync(path.join(DIR.media, f)).size, mtime: fs.statSync(path.join(DIR.media, f)).mtimeMs }))
      .sort((a, b) => b.mtime - a.mtime);
    res.json(files);
  });

  app.get('/api/sfx', (_req, res) => {
    res.json(
      fs
        .readdirSync(DIR.sfx)
        .filter((f) => f.endsWith('.wav'))
        .map((f) => ({ id: f.slice(0, -4), file: `sfx/${f}`, dur: Math.round(sfxDuration(path.join(DIR.sfx, f)) * 1000) / 1000 })),
    );
  });

  // Nhập tệp: thân yêu cầu là dữ liệu thô, tên tệp nằm ở tham số.
  app.post('/api/upload', (req, res) => {
    const raw = safeName(path.basename(String(req.query.name || '')));
    if (!raw || !/\.(mp4|webm|mov|m4v|mkv|png|jpe?g|webp|gif|svg|avif|mp3|wav|m4a|aac|ogg|flac)$/i.test(raw)) {
      return res.status(400).json({ error: 'Chỉ nhận tệp video, ảnh hoặc âm thanh' });
    }
    let name = raw;
    const ext = path.extname(raw);
    const stem = raw.slice(0, -ext.length);
    for (let i = 2; fs.existsSync(path.join(DIR.media, name)); i++) name = `${stem}_${i}${ext}`;
    const dest = path.join(DIR.media, name);
    const ws = fs.createWriteStream(dest);
    req.pipe(ws);
    ws.on('finish', () => res.json({ file: `media/${name}`, name }));
    ws.on('error', (e) => res.status(500).json({ error: e.message }));
    req.on('aborted', () => {
      ws.destroy();
      fs.rm(dest, { force: true }, () => {});
    });
  });

  // Xuất video: một việc tại một thời điểm.
  const job = { running: false, progress: 0, message: '', file: null, error: null, name: null };
  app.post('/api/export/:name', express.json(), async (req, res) => {
    if (job.running) return res.status(409).json({ error: 'Đang xuất một video khác, chờ xong đã nhé' });
    const name = safeName(req.params.name);
    const file = projectFile(name);
    if (!fs.existsSync(file)) return res.status(404).json({ error: 'Không tìm thấy dự án' });
    const project = JSON.parse(fs.readFileSync(file, 'utf8'));
    Object.assign(job, { running: true, progress: 0, message: 'Bắt đầu…', file: null, error: null, name });
    res.json({ ok: true });
    const outName = `${name}.mp4`;
    try {
      await renderProject({
        project,
        assetBase: `http://localhost:${app.get('port')}`,
        outFile: path.join(DIR.out, outName),
        scale: Number(req.body?.scale) || 1,
        onProgress: (p, m) => Object.assign(job, { progress: p, message: m }),
      });
      Object.assign(job, { running: false, progress: 1, message: 'Xong', file: `xuat/${outName}` });
    } catch (e) {
      console.error(e);
      Object.assign(job, { running: false, error: String(e?.message || e).slice(0, 600) });
    }
  });
  app.get('/api/export', (_req, res) => res.json(job));

  return app;
};

const listen = (app, port) =>
  new Promise((resolve, reject) => {
    const server = app.listen(port, () => {
      app.set('port', server.address().port);
      resolve(server);
    });
    server.on('error', reject);
  });

const main = async () => {
  const args = process.argv.slice(2);
  if (args[0] === '--render') {
    const name = safeName(args[1]);
    const file = projectFile(name);
    if (!name || !fs.existsSync(file)) {
      console.error(`Không thấy dự án "${args[1] || ''}". Có: ${listProjects().map((p) => p.name).join(', ')}`);
      process.exit(1);
    }
    const app = createApp();
    const server = await listen(app, 0);
    let last = '';
    const out = path.join(DIR.out, `${name}.mp4`);
    await renderProject({
      project: JSON.parse(fs.readFileSync(file, 'utf8')),
      assetBase: `http://localhost:${app.get('port')}`,
      outFile: out,
      onProgress: (p, m) => {
        const line = `${Math.round(p * 100)}% ${m}`;
        if (line !== last) console.log((last = line));
      },
    });
    console.log(`Đã xuất: ${out}`);
    server.close();
    process.exit(0);
  }

  const app = createApp();
  const { createServer } = await import('vite');
  const vite = await createServer({ root: ROOT, server: { middlewareMode: true }, appType: 'spa' });
  app.use(vite.middlewares);
  const port = Number(process.env.PORT) || 3711;
  await listen(app, port);
  console.log(`\n  Xưởng dựng video đang chạy: http://localhost:${port}\n  Dự án lưu ở: ${DIR.projects}\n`);
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
