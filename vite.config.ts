import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { readFileSync } from "fs";
import { execSync } from "child_process";

const { version } = JSON.parse(
  readFileSync(path.resolve(__dirname, "../src-tauri/tauri.conf.json"), "utf-8"),
);
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
// Release builds run from the checked-out v* tag, so HEAD's commit date is the
// release date; the build date is only a fallback when git is unavailable.
const releaseDate = (() => {
  try {
    return execSync("git log -1 --format=%cs", {
      cwd: path.resolve(__dirname, ".."),
      stdio: ["ignore", "pipe", "ignore"],
    })
      .toString()
      .trim();
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
})();

export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
  },
  define: {
    __APP_VERSION__: JSON.stringify(version),
    __BUILD_DATE__: JSON.stringify(releaseDate),
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
