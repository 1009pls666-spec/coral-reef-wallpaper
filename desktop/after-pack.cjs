const { execFileSync } = require("node:child_process");
const path = require("node:path");

function hasDeveloperIdIdentity() {
  if (process.env.CSC_LINK) return true;
  try {
    const identities = execFileSync("/usr/bin/security", ["find-identity", "-v", "-p", "codesigning"], { encoding: "utf8" });
    return identities.includes("Developer ID Application:");
  } catch {
    return false;
  }
}

module.exports = async function signUnnotarizedMacApp(context) {
  if (context.electronPlatformName !== "darwin" || hasDeveloperIdIdentity()) return;
  const appPath = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`);
  console.warn("[mac-release] Developer ID가 없어 임시 서명으로 빌드합니다. 최초 실행 시 macOS의 수동 열기가 필요합니다.");
  execFileSync("/usr/bin/codesign", ["--deep", "--force", "--sign", "-", appPath], { stdio: "inherit" });
};
