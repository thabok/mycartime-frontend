import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { initBackendUrl } from "@/lib/config";

initBackendUrl().finally(() => {
  createRoot(document.getElementById("root")!).render(<App />);
});
