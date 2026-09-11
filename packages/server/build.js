import { build } from "esbuild";
import { createRequire } from "node:module";

const pkg = createRequire(import.meta.url)("./package.json");

/*
 * The server ships as a single bundled file.
 *
 * Runtime dependencies stay external and are installed from package.json on
 * the host, the way a Node service normally works. @buzzroom/shared is the
 * deliberate exception: it is a workspace package of TypeScript source with
 * no build of its own, so it has to be compiled into the bundle. Its own
 * dependency (zod) comes along with it, which is why zod doesn't need to be
 * installed on the host either.
 *
 * This mirrors how the client already consumes shared -- Vite inlines it at
 * build time too -- so neither half needs shared to be built first.
 */
const external = Object.keys(pkg.dependencies).filter(
  (name) => name !== "@buzzroom/shared",
);

await build({
  entryPoints: ["src/index.ts"],
  outfile: "dist/index.js",
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  sourcemap: true,
  external,
  logLevel: "info",
});
