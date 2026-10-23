import { createRoot } from "react-dom/client";
import { CoralReef } from "../app/components/coral-reef";
import "../app/reef.css";
import "./wallpaper.css";

declare global {
  interface Window {
    reefDesktop?: {
      platform: string;
      enterWallpaper: () => void;
      stopWallpaper: () => void;
      quit: () => void;
    };
  }
}

const params = new URLSearchParams(window.location.search);
const isEditor = params.get("mode") === "editor";
document.documentElement.dataset.desktop = isEditor ? "editor" : "wallpaper";
document.documentElement.dataset.platform = window.reefDesktop?.platform ?? "web";
const shortcutModifier = window.reefDesktop?.platform === "darwin" ? "⌘" : "Ctrl";

function ShortcutRows() {
  return <div className="desktop-shortcut-rows">
    <span><kbd>{shortcutModifier}</kbd><b>+</b><kbd>Shift</kbd><b>+</b><kbd>E</kbd><em>편집 · 바탕화면</em></span>
    <span><kbd>{shortcutModifier}</kbd><b>+</b><kbd>Shift</kbd><b>+</b><kbd>Space</kbd><em>멈춤 · 재생</em></span>
  </div>;
}

function DesktopShell() {
  return (
    <>
      <CoralReef />
      {isEditor && window.reefDesktop && (
        <aside className="desktop-wallpaper-controls" aria-label="바탕화면 앱 제어">
          <div className="desktop-wallpaper-actions">
            <button type="button" onClick={() => window.reefDesktop?.enterWallpaper()}>
              바탕화면으로 돌아가기
            </button>
            <button
              type="button"
              className="stop-wallpaper"
              onClick={() => {
                if (window.confirm("이 바탕화면을 중지할까요? 로그인할 때 자동 실행도 꺼집니다.")) {
                  window.reefDesktop?.stopWallpaper();
                }
              }}
            >
              바탕화면으로 사용하지 않기
            </button>
          </div>
          <ShortcutRows />
        </aside>
      )}
      {!isEditor && window.reefDesktop && (
        <aside className="desktop-shortcut-toast" aria-label="바탕화면 단축키 안내">
          <strong>산호초 바탕화면 실행 중</strong>
          <ShortcutRows />
        </aside>
      )}
    </>
  );
}

createRoot(document.getElementById("reef-root")!).render(<DesktopShell />);
