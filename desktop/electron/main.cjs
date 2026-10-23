const { app, BrowserWindow, Menu, Tray, globalShortcut, ipcMain, nativeImage, screen, session } = require("electron");
const { createServer } = require("node:http");
const { readFile, stat } = require("node:fs/promises");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const APP_NAME = "나의 산호초 바탕화면";
const EDIT_SHORTCUT = "CommandOrControl+Shift+E";
const PAUSE_SHORTCUT = "CommandOrControl+Shift+Space";
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".bin": "application/octet-stream",
  ".woff2": "font/woff2",
};

let server;
let origin = "";
let mode = "wallpaper";
let paused = false;
let tray;
let windows = [];
let quitting = false;
let lastDisplaySignature = "";

console.log(`[reef-desktop] boot ${app.isPackaged ? "packaged" : "development"}`);

function rendererRoot() {
  return app.isPackaged
    ? path.join(app.getAppPath(), "dist-wallpaper")
    : path.resolve(__dirname, "..", "..", "dist-wallpaper");
}

function bundledPath(...segments) {
  return app.isPackaged
    ? path.join(app.getAppPath(), ...segments)
    : path.resolve(__dirname, "..", "..", ...segments);
}

async function startRendererServer() {
  const root = rendererRoot();
  server = createServer(async (request, response) => {
    try {
      const requestUrl = new URL(request.url || "/", "http://127.0.0.1");
      const decoded = decodeURIComponent(requestUrl.pathname);
      const relative = decoded === "/" ? "index.html" : decoded.replace(/^\/+/, "");
      let target = path.resolve(root, relative);
      if (target !== root && !target.startsWith(`${root}${path.sep}`)) throw new Error("invalid path");
      const details = await stat(target);
      if (details.isDirectory()) target = path.join(target, "index.html");
      const body = await readFile(target);
      const extension = path.extname(target).toLowerCase();
      response.writeHead(200, {
        "Content-Type": MIME[extension] || "application/octet-stream",
        "Cache-Control": extension === ".html" ? "no-cache" : "public, max-age=31536000, immutable",
        "X-Content-Type-Options": "nosniff",
      });
      response.end(body);
    } catch {
      response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Not found");
    }
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  origin = `http://127.0.0.1:${address.port}`;
  console.log(`[reef-desktop] renderer ${origin}`);
}

function nativeHandle(window) {
  const buffer = window.getNativeWindowHandle();
  return buffer.length >= 8 ? Number(buffer.readBigUInt64LE()) : buffer.readUInt32LE();
}

function attachToWindowsDesktop(window, bounds) {
  const hwnd = nativeHandle(window);
  const script = String.raw`
using System;
using System.Runtime.InteropServices;
public class ReefWallpaperNative {
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }
  public delegate bool EnumWindowsProc(IntPtr hwnd, IntPtr lParam);
  [DllImport("user32.dll", CharSet=CharSet.Auto)] public static extern IntPtr FindWindow(string cls, string title);
  [DllImport("user32.dll", CharSet=CharSet.Auto)] public static extern IntPtr FindWindowEx(IntPtr parent, IntPtr after, string cls, string title);
  [DllImport("user32.dll")] public static extern IntPtr SendMessageTimeout(IntPtr hwnd, uint msg, IntPtr w, IntPtr l, uint flags, uint timeout, out IntPtr result);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowsProc callback, IntPtr lParam);
  [DllImport("user32.dll")] public static extern IntPtr SetParent(IntPtr child, IntPtr parent);
  [DllImport("user32.dll")] public static extern IntPtr GetParent(IntPtr child);
  [DllImport("user32.dll")] public static extern bool IsWindow(IntPtr hwnd);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hwnd, out RECT rect);
  [DllImport("user32.dll", EntryPoint="GetWindowLongW")] public static extern int GetWindowLong(IntPtr hwnd, int index);
  [DllImport("user32.dll", EntryPoint="SetWindowLongW")] public static extern int SetWindowLong(IntPtr hwnd, int index, int value);
  [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr hwnd, IntPtr after, int x, int y, int cx, int cy, uint flags);
}
`;
  const command = `${script}
$ErrorActionPreference = "Stop"
$child = [IntPtr]${hwnd}
$progman = [ReefWallpaperNative]::FindWindow("Progman", $null)
if ($progman -eq [IntPtr]::Zero) { exit 11 }
$unused = [IntPtr]::Zero
[void][ReefWallpaperNative]::SendMessageTimeout($progman, 0x052C, [IntPtr]::Zero, [IntPtr]::Zero, 0, 1000, [ref]$unused)
$worker = [IntPtr]::Zero
$desktopHost = [IntPtr]::Zero
$callback = [ReefWallpaperNative+EnumWindowsProc]{ param($top, $param)
  $view = [ReefWallpaperNative]::FindWindowEx($top, [IntPtr]::Zero, "SHELLDLL_DefView", $null)
  if ($view -ne [IntPtr]::Zero) {
    $script:desktopHost = $top
    $script:worker = [ReefWallpaperNative]::FindWindowEx([IntPtr]::Zero, $top, "WorkerW", $null)
  }
  return $true
}
[void][ReefWallpaperNative]::EnumWindows($callback, [IntPtr]::Zero)
if ($worker -eq [IntPtr]::Zero) {
  if ($desktopHost -ne [IntPtr]::Zero) { $worker = $desktopHost } else { $worker = $progman }
}
if (-not [ReefWallpaperNative]::IsWindow($worker)) { exit 12 }
$style = [ReefWallpaperNative]::GetWindowLong($child, -16)
$style = ($style -band (-bnot [int]0x80000000)) -bor 0x40000000
[void][ReefWallpaperNative]::SetWindowLong($child, -16, $style)
[void][ReefWallpaperNative]::SetParent($child, $worker)
if ([ReefWallpaperNative]::GetParent($child) -ne $worker) { exit 13 }
$parentRect = New-Object ReefWallpaperNative+RECT
if (-not [ReefWallpaperNative]::GetWindowRect($worker, [ref]$parentRect)) { exit 14 }
$childX = ${bounds.x} - $parentRect.Left
$childY = ${bounds.y} - $parentRect.Top
$positioned = [ReefWallpaperNative]::SetWindowPos($child, [IntPtr]1, $childX, $childY, ${bounds.width}, ${bounds.height}, 0x0010 -bor 0x0040)
if (-not $positioned) { exit 15 }
exit 0
`;
  const result = spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", command], {
    windowsHide: true,
    encoding: "utf8",
  });
  if (result.status !== 0) {
    console.error(`[reef-desktop] WorkerW attach failed (${result.status}): ${result.stderr || result.stdout || "unknown error"}`);
  }
  return result.status === 0;
}

function attachWindowsWallpaperWithRetry(window, bounds, attempt = 0) {
  if (window.isDestroyed() || mode !== "wallpaper") return;
  window.setBounds(bounds, false);
  if (attachToWindowsDesktop(window, bounds)) {
    window.setOpacity(1);
    console.log(`[reef-desktop] Windows desktop attached on attempt ${attempt + 1}`);
    return;
  }
  const delays = [320, 760, 1500];
  if (attempt < delays.length) {
    setTimeout(() => attachWindowsWallpaperWithRetry(window, bounds, attempt + 1), delays[attempt]);
    return;
  }
  window.hide();
  console.error("[reef-desktop] Windows desktop attachment failed; hidden to protect desktop icons and taskbar.");
  if (tray && typeof tray.displayBalloon === "function") {
    tray.displayBalloon({
      title: APP_NAME,
      content: "바탕화면 뒤쪽에 연결하지 못해 화면을 숨겼어요. 트레이 아이콘에서 편집기를 열어 다시 시도해 주세요.",
    });
  }
}

function closeWindows() {
  for (const window of windows) {
    window.removeAllListeners("close");
    if (!window.isDestroyed()) window.destroy();
  }
  windows = [];
}

function commonWindowOptions(bounds, wallpaper) {
  return {
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    frame: false,
    transparent: false,
    show: false,
    skipTaskbar: true,
    focusable: !wallpaper,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    backgroundColor: "#006d96",
    title: APP_NAME,
    ...(wallpaper && process.platform === "darwin" ? { type: "desktop" } : {}),
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      devTools: !app.isPackaged,
    },
  };
}

function secureWindow(window) {
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("will-navigate", (event, url) => {
    if (!url.startsWith(origin)) event.preventDefault();
  });
  window.webContents.on("did-fail-load", (_event, code, description, url) => {
    console.error(`[reef-desktop] load failed ${code} ${description} ${url}`);
  });
  window.webContents.on("render-process-gone", (_event, details) => {
    console.error(`[reef-desktop] renderer stopped: ${details.reason}`);
  });
  if (!app.isPackaged) {
    window.webContents.on("console-message", (...args) => {
      const details = args.find((value) => value && typeof value === "object" && "message" in value);
      const message = details?.message || (typeof args[2] === "string" ? args[2] : "");
      if (message) console.log(`[reef-renderer] ${message}`);
    });
    window.webContents.once("did-finish-load", async () => {
      const probe = await window.webContents.executeJavaScript(`({
        title: document.title,
        reef: Boolean(document.querySelector('.coral-reef')),
        text: document.body.innerText.slice(0, 80)
      })`);
      console.log(`[reef-desktop] loaded ${JSON.stringify(probe)}`);
    });
  }
}

function createWallpaperWindow(display) {
  const bounds = display.bounds;
  const window = new BrowserWindow(commonWindowOptions(bounds, true));
  secureWindow(window);
  window.setIgnoreMouseEvents(true, { forward: false });
  if (process.platform === "win32") window.setOpacity(0);
  if (process.platform === "darwin") {
    window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: false, skipTransformProcessType: true });
    window.setHiddenInMissionControl(true);
  }
  window.loadURL(`${origin}/?desktop=1&mode=wallpaper&display=${display.id}`);
  window.once("ready-to-show", () => {
    window.showInactive();
    window.setBounds(bounds, false);
    if (process.platform === "win32") attachWindowsWallpaperWithRetry(window, bounds);
    window.webContents.send("reef-desktop:set-paused", paused);
  });
  window.on("close", (event) => {
    if (!quitting) event.preventDefault();
  });
  return window;
}

function createEditorWindow() {
  const bounds = screen.getPrimaryDisplay().bounds;
  const window = new BrowserWindow(commonWindowOptions(bounds, false));
  secureWindow(window);
  window.setSkipTaskbar(false);
  window.loadURL(`${origin}/?desktop=1&mode=editor`);
  window.once("ready-to-show", () => {
    // Wallpaper windows live behind Explorer on Windows. When the user opens
    // the editor, briefly lift the new top-level window above that layer.
    if (process.platform === "win32") window.setAlwaysOnTop(true, "screen-saver");
    window.show();
    window.moveTop();
    window.focus();
    if (process.platform === "win32") {
      setTimeout(() => {
        if (!window.isDestroyed()) {
          window.setAlwaysOnTop(false);
          window.moveTop();
          window.focus();
        }
      }, 700);
    }
    window.webContents.send("reef-desktop:set-paused", paused);
  });
  window.on("close", (event) => {
    if (quitting) return;
    event.preventDefault();
    setMode("wallpaper");
  });
  return window;
}

function setMode(nextMode) {
  if (!origin || !["wallpaper", "editor"].includes(nextMode)) return;
  mode = nextMode;
  closeWindows();
  if (mode === "editor") {
    windows = [createEditorWindow()];
  } else {
    lastDisplaySignature = displaySignature();
    windows = screen.getAllDisplays().map(createWallpaperWindow);
  }
  console.log(`[reef-desktop] mode ${mode}, windows ${windows.length}`);
  rebuildTray();
}

function setPaused(nextPaused) {
  paused = Boolean(nextPaused);
  for (const window of windows) {
    if (!window.isDestroyed()) window.webContents.send("reef-desktop:set-paused", paused);
  }
  rebuildTray();
}

function toggleMode() {
  setMode(mode === "wallpaper" ? "editor" : "wallpaper");
}

function stopUsingWallpaper() {
  app.setLoginItemSettings({ openAtLogin: false });
  quitting = true;
  closeWindows();
  app.quit();
}

function displaySignature() {
  return screen.getAllDisplays()
    .map(({ id, bounds, scaleFactor }) => `${id}:${bounds.x},${bounds.y},${bounds.width},${bounds.height}@${scaleFactor}`)
    .sort()
    .join("|");
}

function refreshWallpaperForDisplays() {
  if (mode !== "wallpaper") return;
  const nextSignature = displaySignature();
  if (nextSignature === lastDisplaySignature) return;
  lastDisplaySignature = nextSignature;
  setMode("wallpaper");
}

function trayIcon() {
  const source = bundledPath("desktop", "build", "tray.png");
  const icon = nativeImage.createFromPath(source);
  if (process.platform === "darwin") icon.setTemplateImage(true);
  return icon.resize({ width: 18, height: 18 });
}

function rebuildTray() {
  if (!tray) return;
  const login = app.getLoginItemSettings().openAtLogin;
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: mode === "editor" ? "편집 중" : "바다 편집하기", enabled: mode !== "editor", click: () => setMode("editor") },
    { label: "바탕화면으로 돌아가기", enabled: mode !== "wallpaper", click: () => setMode("wallpaper") },
    { type: "separator" },
    { label: paused ? "움직임 재생" : "움직임 일시정지", click: () => setPaused(!paused) },
    {
      label: "로그인할 때 자동 실행",
      type: "checkbox",
      checked: login,
      click: (item) => app.setLoginItemSettings({
        openAtLogin: item.checked,
        args: process.platform === "win32" ? ["--wallpaper"] : [],
      }),
    },
    { type: "separator" },
    { label: "바탕화면으로 사용하지 않기", click: stopUsingWallpaper },
    { label: "종료", click: () => { quitting = true; app.quit(); } },
  ]));
}

function createTray() {
  tray = new Tray(trayIcon());
  tray.setToolTip(`${APP_NAME} · ${EDIT_SHORTCUT}`);
  tray.on("click", () => {
    if (process.platform === "win32" && mode === "wallpaper") setMode("editor");
  });
  tray.on("double-click", toggleMode);
  rebuildTray();
}

app.whenReady().then(async () => {
  console.log("[reef-desktop] ready");
  if (process.platform === "darwin") app.dock?.hide();
  if (process.argv.includes("--install-wallpaper")) {
    app.setLoginItemSettings({
      openAtLogin: true,
      args: process.platform === "win32" ? ["--wallpaper"] : [],
    });
  }
  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
  await startRendererServer();
  createTray();
  globalShortcut.register(EDIT_SHORTCUT, toggleMode);
  globalShortcut.register(PAUSE_SHORTCUT, () => setPaused(!paused));
  ipcMain.on("reef-desktop:set-mode", (_event, nextMode) => setMode(nextMode));
  ipcMain.on("reef-desktop:stop-wallpaper", stopUsingWallpaper);
  ipcMain.on("reef-desktop:quit", () => { quitting = true; app.quit(); });
  // A normal Windows launch opens the visible editor. Login startup receives
  // --wallpaper and stays quietly behind the desktop icons.
  const requestedEditor = process.argv.includes("--editor");
  const requestedWallpaper = process.argv.includes("--wallpaper");
  const requestedInstall = process.argv.includes("--install-wallpaper");
  setMode(requestedEditor || (process.platform === "win32" && !requestedWallpaper && !requestedInstall) ? "editor" : "wallpaper");

  screen.on("display-added", refreshWallpaperForDisplays);
  screen.on("display-removed", refreshWallpaperForDisplays);
  screen.on("display-metrics-changed", refreshWallpaperForDisplays);
});

app.on("window-all-closed", () => {});

app.on("will-quit", () => {
  quitting = true;
  globalShortcut.unregisterAll();
  server?.close();
});
