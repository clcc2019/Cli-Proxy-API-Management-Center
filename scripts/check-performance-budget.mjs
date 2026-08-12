import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';

const projectRoot = process.cwd();
const distRoot = path.join(projectRoot, 'dist');
const manifestPath = path.join(distRoot, '.vite', 'manifest.json');

const limits = {
  entryJavaScript: 36 * 1024,
  initialStaticJavaScript: 400 * 1024,
  initialStaticCss: 50 * 1024,
  authFilesJavaScript: 98 * 1024,
  authFilesDirectCss: 140 * 1024,
};

const formatKiB = (bytes) => `${(bytes / 1024).toFixed(2)} KiB`;

const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
const manifestEntries = Object.entries(manifest);

const findChunk = (source, predicate) => {
  const match = manifestEntries.find(
    ([key, chunk]) =>
      (predicate?.(chunk) ?? false) ||
      key === source ||
      chunk.src === source ||
      key.endsWith(source)
  );
  if (!match) {
    throw new Error(`Performance budget could not find manifest chunk: ${source}`);
  }
  return match;
};

const [entryKey, entryChunk] = findChunk('application entry', (chunk) => chunk.isEntry === true);
const [, authFilesChunk] = findChunk('src/pages/AuthFilesPage.tsx');

const assetSize = async (file) => (await stat(path.join(distRoot, file))).size;
const sumAssetSizes = async (files = []) => {
  const sizes = await Promise.all(files.map(assetSize));
  return sizes.reduce((sum, size) => sum + size, 0);
};

const collectStaticImports = (key, collected = new Set()) => {
  if (collected.has(key)) return collected;
  collected.add(key);
  const chunk = manifest[key];
  for (const importedKey of chunk?.imports ?? []) {
    collectStaticImports(importedKey, collected);
  }
  return collected;
};

const entryStaticKeys = collectStaticImports(entryKey);
const entryStaticCss = new Set([...entryStaticKeys].flatMap((key) => manifest[key]?.css ?? []));
const authFilesDirectCss = new Set(authFilesChunk.css ?? []);
for (const importedKey of authFilesChunk.imports ?? []) {
  if (entryStaticKeys.has(importedKey)) continue;
  for (const cssFile of manifest[importedKey]?.css ?? []) {
    authFilesDirectCss.add(cssFile);
  }
}

const measurements = [
  {
    label: 'Entry JavaScript',
    size: await assetSize(entryChunk.file),
    limit: limits.entryJavaScript,
  },
  {
    label: 'Initial static JavaScript',
    size: await sumAssetSizes(
      [...entryStaticKeys]
        .map((key) => manifest[key]?.file)
        .filter((file) => typeof file === 'string' && file.endsWith('.js'))
    ),
    limit: limits.initialStaticJavaScript,
  },
  {
    label: 'Initial static CSS',
    size: await sumAssetSizes([...entryStaticCss]),
    limit: limits.initialStaticCss,
  },
  {
    label: 'Auth files route JavaScript',
    size: await assetSize(authFilesChunk.file),
    limit: limits.authFilesJavaScript,
  },
  {
    label: 'Auth files direct CSS',
    size: await sumAssetSizes([...authFilesDirectCss]),
    limit: limits.authFilesDirectCss,
  },
];

const entryStaticGraph = [...entryStaticKeys].map((key) => {
  const chunk = manifest[key];
  return [key, chunk?.src, chunk?.name, chunk?.file].filter(Boolean).join(' ');
});

const forbiddenEntryChunks = entryStaticGraph.filter((description) =>
  /charts?|editor|codemirror|(?:^|[\/_-])(?:vendor|usage|stores|error|http)(?:[\/_\-.]|$)/i.test(
    description
  )
);

const failures = measurements.filter(({ size, limit }) => size > limit);
if (forbiddenEntryChunks.length > 0) {
  failures.push({
    label: 'Entry static dependency isolation',
    size: forbiddenEntryChunks.length,
    limit: 0,
  });
}

console.log('Performance budget');
for (const { label, size, limit } of measurements) {
  const state = size <= limit ? 'PASS' : 'FAIL';
  console.log(`  ${state}  ${label}: ${formatKiB(size)} / ${formatKiB(limit)}`);
}

if (forbiddenEntryChunks.length === 0) {
  console.log(
    '  PASS  Deferred feature and transport chunks are absent from the entry static dependency graph'
  );
} else {
  console.error('  FAIL  Entry statically depends on deferred chunks:');
  for (const chunk of forbiddenEntryChunks) {
    console.error(`        ${chunk}`);
  }
}

if (failures.length > 0) {
  process.exit(1);
}
