import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  server: {
    // The dashboard .jsx files this imports live one level up (the repo
    // root, not this scaffold) — Vite's dev server otherwise refuses to
    // serve files outside its project root.
    fs: { allow: [".."] },
  },
  resolve: {
    alias: {
      // The imported .jsx files live outside this scaffold's root, so
      // Node's normal upward node_modules resolution never finds these
      // packages from their location — force it explicitly instead of
      // duplicating node_modules a second time in the repo root.
      react: path.resolve(__dirname, "node_modules/react"),
      "react-dom": path.resolve(__dirname, "node_modules/react-dom"),
      "lucide-react": path.resolve(__dirname, "node_modules/lucide-react"),
    },
  },
});
