import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { initBackendUrl, isTauri } from "@/lib/config";

// The Tauri webview silently ignores target="_blank" links, so hand external
// URLs to the system browser instead.
if (isTauri()) {
  document.addEventListener("click", (event) => {
    const anchor = (event.target as Element | null)?.closest?.("a[href]");
    const href = anchor?.getAttribute("href");
    if (!href || !/^https?:\/\//.test(href)) return;
    event.preventDefault();
    import("@tauri-apps/plugin-opener").then(({ openUrl }) => openUrl(href)).catch((error) => console.error("Failed to open external link", error));
  });
}

initBackendUrl().finally(() => {
  document.getElementById("splash")?.remove();
  createRoot(document.getElementById("root")!).render(<App />);
});
