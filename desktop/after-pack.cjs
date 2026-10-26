const { existsSync, mkdirSync } = require("node:fs");
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

function buildWindowsWallpaperHost(context) {
  const frameworkRoot = path.join(process.env.WINDIR || "C:\\Windows", "Microsoft.NET");
  const compilerCandidates = [
    path.join(frameworkRoot, "Framework64", "v4.0.30319", "csc.exe"),
    path.join(frameworkRoot, "Framework", "v4.0.30319", "csc.exe"),
  ];
  const compiler = compilerCandidates.find(existsSync);
  if (!compiler) throw new Error("Windows .NET Framework C# compiler was not found");
  const source = path.join(context.packager.projectDir, "desktop", "windows", "WallpaperHost.cs");
  const resources = path.join(context.appOutDir, "resources");
  const output = path.join(resources, "reef-wallpaper-host.exe");
  mkdirSync(resources, { recursive: true });
  execFileSync(compiler, ["/nologo", "/target:exe", "/optimize+", `/out:${output}`, source], { stdio: "inherit" });
  console.log(`[windows-release] Built native wallpaper host: ${output}`);
}

module.exports = async function afterPack(context) {
  if (context.electronPlatformName === "win32") {
    buildWindowsWallpaperHost(context);
    return;
  }
  if (context.electronPlatformName === "darwin" && !hasDeveloperIdIdentity()) {
    const appPath = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`);
    console.warn("[mac-release] Developer ID가 없어 임시 서명으로 빌드합니다. 최초 실행 시 macOS의 수동 열기가 필요합니다.");
    execFileSync("/usr/bin/codesign", ["--deep", "--force", "--sign", "-", appPath], { stdio: "inherit" });
  }
};
