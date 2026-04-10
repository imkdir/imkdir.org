import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const devApiProxyTarget =
    env.VITE_DEV_API_PROXY_TARGET || "http://127.0.0.1:3011";

  return {
    plugins: [react(), tailwindcss()],
    server: {
      proxy: {
        "/api": {
          target: devApiProxyTarget,
          changeOrigin: true,
        },
      },
    },
  };
});
