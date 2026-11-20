import { copyFile, readFile, stat } from "node:fs/promises";
import { join } from "node:path";

const publicDir = join(import.meta.dirname, "..", ".output", "public");
const shellPath = join(publicDir, "_shell.html");
const indexPath = join(publicDir, "index.html");

const shell = await readFile(shellPath, "utf8");
if (!shell.includes("<html") || !shell.includes("/assets/")) {
  throw new Error("The TanStack SPA shell is missing or incomplete.");
}
await stat(join(publicDir, "assets"));
await copyFile(shellPath, indexPath);
console.log("Prepared .output/public/index.html for S3 and CloudFront.");
