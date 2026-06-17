import { defineConfig } from "vite";
import { fileURLToPath } from "url";
import path from "path";
import tailwindcss from "@tailwindcss/vite";
import { viteExternalsPlugin } from "vite-plugin-externals";
import react from "@vitejs/plugin-react";
import http from "http";

// 创建 HTTP Agent 实例
const httpAgent = new http.Agent({ keepAlive: true });

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    viteExternalsPlugin({
      GFN: "GFN",
    }),
  ],
  base: "./", // 关键配置，避免资源路径错误
  server: {
    // 本地化：sim_frontend 占用 5174，aiFactory 改 5175，两个前端各跑各的。
    port: 5175,
    host: true, // 允许外部访问
    proxy: {
      // 业务接口 → aifactory_backend（独立 FastAPI :8129）
      "/api": {
        target: "http://127.0.0.1:8129",
        changeOrigin: true,
        rewrite: (path) => path,
        agent: httpAgent,
        proxyTimeout: 10 * 60 * 1000,
      },
      // 本地文件存储（缩略图/资产）→ aifactory_backend 的 /static 挂载（替代旧 /minio）
      "/static": {
        target: "http://127.0.0.1:8129",
        changeOrigin: true,
        rewrite: (path) => path,
        agent: httpAgent,
      },
      // Omniverse 操作 → 本机 Kit aifactory.service.setup 扩展（uvicorn :8011）
      "/ov": {
        target: "http://127.0.0.1:8011",
        changeOrigin: true,
        rewrite: (path) => path,
        agent: httpAgent,
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    outDir: "../../dist/aiFactory",
  },
  assetsInclude: ["**/*.svg", "**/*.csv"],
});
