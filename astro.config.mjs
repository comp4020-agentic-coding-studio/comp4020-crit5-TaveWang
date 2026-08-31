import react from "@astrojs/react";
import { defineConfig } from "astro/config";

// The deployed site lives under a subpath
// (comp4020-agentic-coding-studio.github.io/comp4020-crit5-TaveWang/), but CI
// also runs `linkinator ./dist`, which serves dist/ at the *root*. Absolute
// URLs can't satisfy both, so every URL this build emits is relative:
//
//   build.format: "file"    -> dist/index.html, dist/whatever.html (all flat,
//                              so "./x.html" resolves the same from any page)
//   build.assetsPrefix: "." -> <link href="./_astro/x.css"> instead of
//                              "/_astro/x.css"
//
// Flat output also keeps dist/index.html where spec/invariants.test.ts expects
// to find the home page.
export default defineConfig({
  integrations: [react()],
  outDir: "./dist",
  build: {
    format: "file",
    assetsPrefix: ".",
  },
});
