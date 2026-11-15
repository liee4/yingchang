import { cp, mkdir } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const client = new URL("dist/client/", root);
await mkdir(client, { recursive: true });
for (const path of ["index.html", "src", "public/posters", "public/icons"]) {
  await cp(new URL(path, root), new URL(path.replace(/^public\//, ""), client), { recursive: true });
}
