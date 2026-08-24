import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const generatedGradleFile = path.join(repositoryRoot, 'android', 'app', 'capacitor.build.gradle');
const contents = await readFile(generatedGradleFile, 'utf8');
const normalized = contents.replaceAll('JavaVersion.VERSION_21', 'JavaVersion.VERSION_17');

if (normalized === contents) {
  throw new Error('The generated Capacitor Gradle file did not contain the expected Java 21 setting.');
}

await writeFile(generatedGradleFile, normalized, 'utf8');
