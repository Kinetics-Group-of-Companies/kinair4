import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig(() => ({
  // Web builds use root-relative assets so BrowserRouter deep links work.
  // The desktop packaging script overrides this with --base=./ for file://.
  base: "/",
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [react()],
  worker: { format: "es" },
  resolve: {
    alias: {
      // Route all fan datasheet imports through the runtime-safe wrapper.
      // The wrapper preserves the existing generator and fixes multi-fan PDF generation.
      "@/lib/pdfDatasheetGenerator": path.resolve(__dirname, "./src/lib/pdfDatasheetGeneratorSafe.ts"),
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
