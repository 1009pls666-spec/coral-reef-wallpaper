import { createRoot } from "react-dom/client";
import { CoralReef } from "../app/components/coral-reef";
import "../app/reef.css";
import "./wallpaper.css";

declare global {
  interface Window {
    reefDesktop?: {
      platform: string;
      enterWallpaper: () => void;
      quit: () => void;
    };
  }
}

const params = new URLSearchParams(window.location.search);
const isEditor = params.get("mode") === "editor";
document.documentElement.dataset.desktop = isEditor ? "editor" : "wallpaper";

function DesktopShell() {
  return (
    <>
      <CoralReef />
      {isEditor && window.reefDesktop && (
        <aside className="desktop-wallpaper-controls" aria-label="바탕화면 앱 제어">
          <button type="button" onClick={() => window.reefDesktop?.enterWallpaper()}>
            바탕화면으로 돌아가기
          </button>
          <span><kbd>Ctrl/⌘</kbd><b>+</b><kbd>Shift</kbd><b>+</b><kbd>E</kbd></span>
        </aside>
      )}
    </>
  );
}

createRoot(document.getElementById("reef-root")!).render(<DesktopShell />);
