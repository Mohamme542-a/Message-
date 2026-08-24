import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const generatedGradleFiles = [
  path.join(repositoryRoot, 'android', 'app', 'capacitor.build.gradle'),
  path.join(repositoryRoot, 'android', 'capacitor-cordova-android-plugins', 'build.gradle'),
  path.join(repositoryRoot, 'node_modules', '@capacitor', 'android', 'capacitor', 'build.gradle'),
];

let replacements = 0;
for (const file of generatedGradleFiles) {
  const contents = await readFile(file, 'utf8');
  const normalized = contents.replaceAll('JavaVersion.VERSION_21', 'JavaVersion.VERSION_17');
  if (normalized !== contents) {
    await writeFile(file, normalized, 'utf8');
    replacements += 1;
  }
}

if (replacements === 0) throw new Error('Capacitor did not expose an expected Java 21 setting to align for JDK 17.');
