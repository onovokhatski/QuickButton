// Bundle the Electron preload script so it can run under sandbox: true.
//
// Sandboxed preload scripts only allow `require()` for a narrow allowlist of
// Electron built-ins, so relative imports from our own source tree fail at
// runtime. esbuild inlines those dependencies into a single file.

const path = require("node:path");
const esbuild = require("esbuild");

const ROOT = path.resolve(__dirname, "..");
const ENTRY = path.join(ROOT, "electron", "preload.source.cjs");
const OUTFILE = path.join(ROOT, "electron", "preload.cjs");

async function main() {
  await esbuild.build({
    entryPoints: [ENTRY],
    bundle: true,
    platform: "node",
    format: "cjs",
    target: ["node20"],
    outfile: OUTFILE,
    external: ["electron"],
    legalComments: "none",
    minify: false,
    sourcemap: false,
    logLevel: "error"
  });
  console.log(`[build-preload] wrote ${path.relative(ROOT, OUTFILE)}`);
}

main().catch((err) => {
  console.error("[build-preload] failed:", err?.message ?? err);
  process.exit(1);
});
