const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("reefDesktop", {
  platform: process.platform,
  enterWallpaper: () => ipcRenderer.send("reef-desktop:set-mode", "wallpaper"),
  stopWallpaper: () => ipcRenderer.send("reef-desktop:stop-wallpaper"),
  quit: () => ipcRenderer.send("reef-desktop:quit"),
});

ipcRenderer.on("reef-desktop:set-paused", (_event, paused) => {
  window.dispatchEvent(new CustomEvent("reef:desktop-pause", { detail: Boolean(paused) }));
});
