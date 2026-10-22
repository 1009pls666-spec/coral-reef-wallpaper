import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import process from "node:process";

const root = path.resolve(import.meta.dirname, "..");
const releaseDir = path.join(root, "release-wallpaper");
const env = { ...process.env };
const require = createRequire(import.meta.url);

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    env,
    stdio: "inherit",
    ...options,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function output(command, args) {
  return execFileSync(command, args, { cwd: root, env, encoding: "utf8" }).trim();
}

function hasEvery(names) {
  return names.every((name) => Boolean(env[name]));
}

function findNewest(start, predicate) {
  if (!existsSync(start)) return undefined;
  const matches = [];
  const visit = (directory) => {
    for (const name of readdirSync(directory)) {
      const file = path.join(directory, name);
      const details = statSync(file);
      if (details.isDirectory() && !name.endsWith(".app")) visit(file);
      if (predicate(file, details)) matches.push({ file, modified: details.mtimeMs });
    }
  };
  visit(start);
  return matches.sort((a, b) => b.modified - a.modified)[0]?.file;
}

if (process.platform !== "darwin") {
  console.error("공증된 macOS 빌드는 Mac에서만 만들 수 있습니다.");
  process.exit(1);
}

try {
  output("xcrun", ["--find", "notarytool"]);
  output("xcrun", ["--find", "stapler"]);
} catch {
  console.error("Apple notarytool을 찾지 못했습니다. Xcode Command Line Tools 또는 Xcode를 설치해 주세요.");
  process.exit(1);
}

const identities = output("security", ["find-identity", "-v", "-p", "codesigning"]);
const hasInstalledDeveloperId = identities.includes("Developer ID Application:");
const hasCertificateFile = hasEvery(["CSC_LINK", "CSC_KEY_PASSWORD"]);
if (!hasInstalledDeveloperId && !hasCertificateFile) {
  console.error([
    "Developer ID Application 인증서를 찾지 못했습니다.",
    "Apple Developer Program에서 인증서를 발급해 이 Mac의 키체인에 설치하거나,",
    "CSC_LINK와 CSC_KEY_PASSWORD로 .p12 인증서를 제공해 주세요.",
  ].join("\n"));
  process.exit(1);
}

const apiKeyAuth = hasEvery(["APPLE_API_KEY", "APPLE_API_KEY_ID", "APPLE_API_ISSUER"]);
const appleIdAuth = hasEvery(["APPLE_ID", "APPLE_APP_SPECIFIC_PASSWORD", "APPLE_TEAM_ID"]);
const keychainProfileAuth = Boolean(env.APPLE_KEYCHAIN_PROFILE);

if (keychainProfileAuth && !env.APPLE_KEYCHAIN) {
  try {
    env.APPLE_KEYCHAIN = output("security", ["default-keychain", "-d", "user"]).replace(/^"|"$/g, "");
  } catch {
    console.error("기본 사용자 키체인을 찾지 못했습니다. APPLE_KEYCHAIN 경로를 지정해 주세요.");
    process.exit(1);
  }
}

if (!apiKeyAuth && !appleIdAuth && !keychainProfileAuth) {
  console.error([
    "Apple 공증 인증 정보가 없습니다.",
    "권장: APPLE_KEYCHAIN_PROFILE을 설정하거나,",
    "APPLE_API_KEY/APPLE_API_KEY_ID/APPLE_API_ISSUER 또는",
    "APPLE_ID/APPLE_APP_SPECIFIC_PASSWORD/APPLE_TEAM_ID를 설정해 주세요.",
  ].join("\n"));
  process.exit(1);
}

console.log("[mac-release] Developer ID 서명 및 Apple 공증 빌드를 시작합니다.");
run("npm", ["run", "desktop:build"]);

let builder;
try {
  builder = require.resolve("electron-builder/cli.js");
} catch {
  console.error("electron-builder가 설치되어 있지 않습니다. 먼저 npm ci를 실행해 주세요.");
  process.exit(1);
}
run(process.execPath, [builder, "--config", "desktop/electron-builder.json", "--mac"]);

const appBundle = findNewest(releaseDir, (file, details) => details.isDirectory() && file.endsWith(".app"));
const diskImage = findNewest(releaseDir, (file, details) => details.isFile() && file.endsWith(".dmg"));
if (!appBundle || !diskImage) {
  console.error("검증할 .app 또는 .dmg 결과물을 찾지 못했습니다.");
  process.exit(1);
}

console.log(`[mac-release] 서명 검증: ${appBundle}`);
run("codesign", ["--verify", "--deep", "--strict", "--verbose=2", appBundle]);
run("spctl", ["--assess", "--type", "execute", "--verbose=4", appBundle]);
console.log(`[mac-release] 공증 티켓 검증: ${diskImage}`);
run("xcrun", ["stapler", "validate", diskImage]);
console.log(`[mac-release] 완료: ${diskImage}`);
