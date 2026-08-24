import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const requiredFiles = ['index.html', 'styles.css', 'app.js'];
const contents = [];

for (const name of requiredFiles) {
  const file = path.join(root, 'web', name);
  await access(file);
  contents.push(await readFile(file, 'utf8'));
}

const visibleBundle = contents.join('\n').replace(/https:\/\/[^"']+/g, '').toLowerCase();
if (visibleBundle.includes('watermark') || visibleBundle.includes('manus')) {
  throw new Error('The locally bundled AB interface must not include platform branding or a watermark.');
}
