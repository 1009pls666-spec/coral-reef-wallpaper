import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";
import path from "node:path";

const desktopDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: desktopDir,
  base: "/",
  publicDir: false,
  plugins: [react()],
  build: {
    outDir: path.resolve(desktopDir, "../dist-wallpaper"),
    emptyOutDir: true,
    target: "chrome138",
  },
});
