import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { viteSingleFile } from "vite-plugin-singlefile";

// The app ships as one self-contained index.html for GitHub Pages: no server,
// no separate asset requests. `viteSingleFile` inlines the JS and CSS bundle
// into the HTML; `base: "./"` keeps references relative so it works from a
// project-pages subpath. The app now serves its own API in-process
// (src/local/backend.ts), so there is no backend to proxy to.
// The build is one classic (iife) script. Make it a plain <script> and move it
// to the end of <body> so it runs after #root exists and also works from a
// file:// open, not only from a served origin.
const inlineScriptToBodyEnd = {
  name: "inline-script-to-body-end",
  enforce: "post" as const,
  generateBundle(_options: unknown, bundle: Record<string, { type: string; source?: string | Uint8Array }>) {
    for (const file of Object.values(bundle)) {
      if (file.type !== "asset" || typeof file.source !== "string" || !file.source.includes("</body>")) continue;
      let html = file.source.replace(/ type="module"/g, "").replace(/ crossorigin(?==|>| )/g, "");
      const scripts: string[] = [];
      html = html.replace(/<script>[\s\S]*?<\/script>/g, (m) => {
        scripts.push(m);
        return "";
      });
      file.source = html.replace("</body>", `${scripts.join("\n")}\n</body>`);
    }
    // GitHub Pages runs Jekyll by default, which would ignore nothing here but
    // costs a build step; opt out so the file is served verbatim.
    this.emitFile({ type: "asset", fileName: ".nojekyll", source: "" });
  },
};

export default defineConfig({
  base: "./",
  plugins: [react(), viteSingleFile(), inlineScriptToBodyEnd],
  build: {
    // GitHub Pages ("Deploy from branch" → /docs). Not emptied: docs/ also holds
    // the hand-written content-authoring-guide.md.
    outDir: "../docs",
    emptyOutDir: false,
    assetsInlineLimit: 100_000_000,
    cssCodeSplit: false,
    // A classic (non-module) inline script also runs from a file:// open, not
    // just from a served origin.
    rollupOptions: { output: { format: "iife", inlineDynamicImports: true } },
  },
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8000",
        changeOrigin: true,
      },
    },
  },
});
