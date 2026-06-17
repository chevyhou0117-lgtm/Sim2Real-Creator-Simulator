import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

// 容器内：VITE_PROXY_TARGET=http://sim-backend:8000（指向 compose 后端服务名）
//          VITE_USE_POLLING=true（Windows 宿主 bind-mount 进 Linux 收不到 inotify，需轮询才热重载）
// 本地裸跑：两者都不设 → 沿用 localhost:8000 + 原生文件事件
const proxyTarget = process.env.VITE_PROXY_TARGET ?? 'http://localhost:8000'
const usePolling = process.env.VITE_USE_POLLING === 'true'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // @nvidia/omniverse-webrtc-streaming-library 在运行时引用了 Node 的 `global`，
  // 浏览器没有该全局；aifactory 的 Vite 6 链路恰好没踩到，sim 的 Vite 8(rolldown) 会在
  // 运行时抛 "global is not defined" 导致串流起不来。映射到 globalThis 即可。
  define: {
    global: 'globalThis',
  },
  server: {
    host: true,            // 监听 0.0.0.0 → 内网其他机器可访问 http://192.168.40.161:5174
    port: 5174,
    strictPort: true,
    proxy: {
      '/api': {
        // 后端跑在本机 8000；其他机器访问前端时由本机 vite 代理转给后端
        target: proxyTarget,
        changeOrigin: true,
      },
    },
    watch: usePolling ? { usePolling: true, interval: 300 } : undefined,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
