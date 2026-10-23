import { access, cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const releaseDir = path.join(root, "release-wallpaper");
const installerDir = path.join(root, "desktop", "installers");
const macApp = path.join(releaseDir, "mac-arm64", "CoralReefWallpaper.app");
const windowsApp = path.join(releaseDir, "win-unpacked");
const tempRoot = await mkdtemp(path.join(tmpdir(), "coral-reef-install-"));

async function exists(target) {
  try {
    await readFile(path.join(target, "Contents", "Info.plist"));
    return true;
  } catch {
    return false;
  }
}

async function copyText(name, destination, outputName = name) {
  const body = await readFile(path.join(installerDir, name));
  await writeFile(path.join(destination, outputName), body);
}

async function zipFolder(folder, output) {
  await rm(output, { force: true });
  execFileSync("/usr/bin/ditto", ["-c", "-k", "--sequesterRsrc", "--keepParent", folder, output]);
}

try {
  if (!(await exists(macApp))) throw new Error(`Mac 앱을 찾지 못했습니다: ${macApp}`);

  const makeMacBundle = async (name, includeAiGuide) => {
    const bundle = path.join(tempRoot, name);
    await mkdir(bundle, { recursive: true });
    await cp(macApp, path.join(bundle, "CoralReefWallpaper.app"), { recursive: true, preserveTimestamps: true });
    await copyText("install-mac.command", bundle, "설치.command");
    await copyText("설치안내.txt", bundle);
    if (includeAiGuide) await copyText("AI-INSTALL.md", bundle);
    execFileSync("chmod", ["+x", path.join(bundle, "설치.command")]);
    return bundle;
  };

  const macDirectBundle = await makeMacBundle("나의 산호초 바탕화면 - Mac 직접 설치", false);
  const macAiBundle = await makeMacBundle("나의 산호초 바탕화면 - Mac AI 설치", true);
  const macDirectOutput = path.join(releaseDir, "coral-reef-wallpaper-0.2.0-mac-direct.zip");
  const macAiOutput = path.join(releaseDir, "coral-reef-wallpaper-0.2.0-mac-ai.zip");
  await zipFolder(macDirectBundle, macDirectOutput);
  await zipFolder(macAiBundle, macAiOutput);

  const windowsExe = path.join(windowsApp, "CoralReefWallpaper.exe");
  try {
    await access(windowsExe);
  } catch {
    throw new Error(`Windows 앱을 찾지 못했습니다: ${windowsExe}`);
  }

  const makeWindowsBundle = async (name, includeAiGuide) => {
    const bundle = path.join(tempRoot, name);
    await mkdir(bundle, { recursive: true });
    await cp(windowsApp, path.join(bundle, "CoralReefWallpaper"), { recursive: true, preserveTimestamps: true });
    await copyText("install-windows.ps1", bundle);
    await copyText("install-windows.bat", bundle, "설치.bat");
    await copyText("설치안내.txt", bundle);
    if (includeAiGuide) await copyText("AI-INSTALL.md", bundle);
    return bundle;
  };

  const windowsDirectBundle = await makeWindowsBundle("나의 산호초 바탕화면 - Windows 직접 설치", false);
  const windowsAiBundle = await makeWindowsBundle("나의 산호초 바탕화면 - Windows AI 설치", true);
  const windowsDirectOutput = path.join(releaseDir, "coral-reef-wallpaper-0.2.0-win-x64-direct.zip");
  const windowsAiOutput = path.join(releaseDir, "coral-reef-wallpaper-0.2.0-win-x64-ai.zip");
  await zipFolder(windowsDirectBundle, windowsDirectOutput);
  await zipFolder(windowsAiBundle, windowsAiOutput);

  console.log(`Mac 직접 설치: ${macDirectOutput}`);
  console.log(`Mac AI 설치: ${macAiOutput}`);
  console.log(`Windows 직접 설치: ${windowsDirectOutput}`);
  console.log(`Windows AI 설치: ${windowsAiOutput}`);
} finally {
  await rm(tempRoot, { recursive: true, force: true });
}
