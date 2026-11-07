/* global process */
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig(({ command }) => {
  // Permite sobreescribir el nombre del repositorio fácilmente con una variable de entorno
  // Ejemplo: $env:VITE_REPO_NAME="sigae-pwa-test"
  const repoName = process.env.VITE_REPO_NAME || "sigae-pwa-test";

  return {
    plugins: [react(), tailwindcss()],
    base: command === "build" ? `/${repoName}/` : "/",
    server: {
      proxy: {
        "/api": {
          target: "http://localhost:3000",
          changeOrigin: true,
        },
        // CU20: fotografías de perfil servidas como archivos estáticos por el backend
        "/uploads": {
          target: "http://localhost:3000",
          changeOrigin: true,
        },
      },
    },
  };
});
