import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";
import path from "node:path";

const projectDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: path.resolve(projectDir, "github-pages"),
  base: "/coral-reef-wallpaper/",
  publicDir: path.resolve(projectDir, "public"),
  plugins: [react()],
  build: {
    outDir: path.resolve(projectDir, "dist-pages"),
    emptyOutDir: true,
    target: "es2022",
  },
});
