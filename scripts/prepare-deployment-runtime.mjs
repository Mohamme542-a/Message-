import { copyFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectDirectory = path.resolve(scriptDirectory, "..");
const outputDirectory = path.join(projectDirectory, "dist");
const source = path.join(projectDirectory, "server", "static-server.mjs");
const destination = path.join(outputDirectory, "index.js");

await mkdir(outputDirectory, { recursive: true });
await copyFile(source, destination);

console.log("Deployment runtime written to dist/index.js");
