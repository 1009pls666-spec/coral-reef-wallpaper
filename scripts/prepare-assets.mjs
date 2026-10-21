import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const root = process.cwd();
const manifestPath = path.join(root, "public/reef/assets/manifest.json");
const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
const required = ["id", "name", "file", "mask", "kind", "headDirection", "tailStart", "sizeRange", "depthRange", "speedRange", "behavior"];
const seen = new Set();

function validateRange(value, label, id) {
  if (!Array.isArray(value) || value.length !== 2 || value.some((entry) => typeof entry !== "number") || value[0] > value[1]) {
    throw new Error(`${id}: ${label} must be an ascending number pair`);
  }
}

for (const asset of manifest.assets) {
  for (const key of required) if (!(key in asset)) throw new Error(`${asset.id ?? "unknown"}: missing ${key}`);
  if (seen.has(asset.id)) throw new Error(`duplicate asset id: ${asset.id}`);
  seen.add(asset.id);
  validateRange(asset.sizeRange, "sizeRange", asset.id);
  validateRange(asset.depthRange, "depthRange", asset.id);
  validateRange(asset.speedRange, "speedRange", asset.id);
  if (asset.headDirection !== "right" && asset.headDirection !== "none") throw new Error(`${asset.id}: unsupported head direction`);

  const sourcePath = path.join(root, "public", asset.file.replace(/^\//, ""));
  const maskPath = path.join(root, "public", asset.mask.replace(/^\//, ""));
  const source = sharp(sourcePath).ensureAlpha();
  const { data, info } = await source.raw().toBuffer({ resolveWithObject: true });
  const output = Buffer.from(data);

  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      const i = (y * info.width + x) * 4;
      const a = data[i + 3];
      if (a < 7) {
        output[i] = output[i + 1] = output[i + 2] = output[i + 3] = 0;
        continue;
      }
      if (!asset.preserveFineEdges && a < 246) {
        let minAlpha = a;
        let best = i;
        let bestAlpha = a;
        for (let oy = -1; oy <= 1; oy += 1) for (let ox = -1; ox <= 1; ox += 1) {
          const nx = Math.max(0, Math.min(info.width - 1, x + ox));
          const ny = Math.max(0, Math.min(info.height - 1, y + oy));
          const ni = (ny * info.width + nx) * 4;
          minAlpha = Math.min(minAlpha, data[ni + 3]);
          if (data[ni + 3] > bestAlpha) { bestAlpha = data[ni + 3]; best = ni; }
        }
        output[i] = data[best]; output[i + 1] = data[best + 1]; output[i + 2] = data[best + 2];
        output[i + 3] = Math.max(0, Math.min(a, minAlpha + 46));
      }
    }
  }

  const processed = sharp(output, { raw: info }).trim({ background: { r: 0, g: 0, b: 0, alpha: 0 } });
  await processed.png({ compressionLevel: 9, palette: false }).toFile(`${sourcePath}.prepared`);
  await fs.rename(`${sourcePath}.prepared`, sourcePath);

  const mask = await sharp(sourcePath)
    .ensureAlpha()
    .extractChannel("alpha")
    .resize(64, 64, { fit: "fill", kernel: "lanczos3" })
    .threshold(asset.kind === "animal" ? 32 : 20)
    .raw()
    .toBuffer();
  await fs.writeFile(maskPath, mask);
  const meta = await sharp(sourcePath).metadata();
  console.log(`${asset.id.padEnd(14)} ${meta.width}x${meta.height} -> ${path.relative(root, maskPath)}`);
}

console.log(`validated and prepared ${manifest.assets.length} assets`);
