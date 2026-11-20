import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: './', // để bản web chạy được trong thư mục con (GitHub Pages)
  publicDir: false, // tệp nhập và tiếng động do máy chủ phục vụ trực tiếp
  server: { watch: { ignored: ['**/du_an/**', '**/xuat/**', '**/public/**'] } },
});
