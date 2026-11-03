import { cp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

// Keep the distributable ESM build intact. Only the hosting copy is compressed.
const target = new URL('../.cloudflare/assets/', import.meta.url);
await rm(target, { recursive: true, force: true });
await cp(new URL('../dist/', import.meta.url), target, { recursive: true });

async function prepare(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      await prepare(path);
      continue;
    }
    // ONNX's asyncify runtime exceeds Workers' 25 MiB per-asset limit.
    // The Worker serves these bytes with Content-Encoding: gzip at the original URL.
    if (entry.name.endsWith('.wasm')) {
      await writeFile(`${path}.gz`, gzipSync(await readFile(path), { level: 9 }));
      await rm(path);
    }
    const uploadedPath = entry.name.endsWith('.wasm') ? `${path}.gz` : path;
    if ((await stat(uploadedPath)).size > 25 * 1024 * 1024) {
      throw new Error(`Cloudflare asset exceeds 25 MiB: ${uploadedPath}`);
    }
  }
}

await prepare(target.pathname);
console.log('Cloudflare assets prepared in .cloudflare/assets');
