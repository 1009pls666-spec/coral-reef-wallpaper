import { cp, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const desktopDir = path.dirname(fileURLToPath(import.meta.url));
const projectDir = path.resolve(desktopDir, "..");
const outputDir = path.join(projectDir, "dist-wallpaper");

await mkdir(outputDir, { recursive: true });
await cp(path.join(projectDir, "public", "reef"), path.join(outputDir, "reef"), { recursive: true });
await cp(path.join(projectDir, "public", "favicon.svg"), path.join(outputDir, "favicon.svg"));
