import { cp, mkdir, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join, relative } from "node:path";

const root = new URL("../", import.meta.url);
const client = new URL("dist/client/", root);
if (relative(fileURLToPath(root), fileURLToPath(client)) !== join("dist", "client")) throw new Error("Unexpected build output directory");
await rm(client, { recursive: true, force: true });
await mkdir(client, { recursive: true });
for (const path of ["index.html", "src", "public/posters", "public/icons"]) {
  await cp(new URL(path, root), new URL(path.replace(/^public\//, ""), client), { recursive: true });
}
