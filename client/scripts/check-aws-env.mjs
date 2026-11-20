import { readFile } from "node:fs/promises";
import { join } from "node:path";

const path = join(import.meta.dirname, "..", ".env.production");
let lines;
try {
  lines = await readFile(path, "utf8");
} catch {
  throw new Error("Create client/.env.production from aws-build.env.example before building for AWS.");
}

const values = new Map();
for (const line of lines.split(/\r?\n/)) {
  const match = line.match(/^\s*(VITE_[A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
  if (match) values.set(match[1], match[2].replace(/^['"]|['"]$/g, ""));
}
for (const key of [
  "VITE_API_URL",
  "VITE_COGNITO_REGION",
  "VITE_COGNITO_USER_POOL_ID",
  "VITE_COGNITO_CLIENT_ID",
]) {
  const value = process.env[key] ?? values.get(key);
  if (!value || /example\.com|XXXXXXXXX|your-|localhost|127\.0\.0\.1/i.test(value)) {
    throw new Error(`Set a real ${key} in client/.env.production before building for AWS.`);
  }
}
if (!(process.env.VITE_API_URL ?? values.get("VITE_API_URL")).startsWith("https://")) {
  throw new Error("VITE_API_URL must use HTTPS in AWS production.");
}
if ((process.env.VITE_LOCAL_DEV ?? values.get("VITE_LOCAL_DEV")) !== "false") {
  throw new Error("VITE_LOCAL_DEV must be disabled for AWS production.");
}
for (const key of ["VITE_COGNITO_IDENTITY_POOL_ID", "VITE_S3_BUCKET", "VITE_S3_REGION"]) {
  if (!values.has(key) || values.get(key) || process.env[key]) {
    throw new Error(`Clear ${key} in client/.env.production; the API signs media URLs.`);
  }
}
