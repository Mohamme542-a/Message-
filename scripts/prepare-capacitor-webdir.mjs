import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const webDir = path.join(repositoryRoot, 'dist', 'public');

await mkdir(webDir, { recursive: true });
await writeFile(
  path.join(webDir, 'index.html'),
  '<!doctype html><html><head><meta charset="utf-8"><title>AB</title></head><body></body></html>\n',
  'utf8',
);
