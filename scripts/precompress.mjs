import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { brotliCompressSync, gzipSync } from 'node:zlib';

async function compress(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) await compress(path);
    else if (/\.(html|js|css|svg)$/.test(entry.name)) {
      const contents = await readFile(path);
      await Promise.all([
        writeFile(`${path}.br`, brotliCompressSync(contents)),
        writeFile(`${path}.gz`, gzipSync(contents, { level: 9 })),
      ]);
    }
  }
}

await compress(fileURLToPath(new URL('../apps/web/dist', import.meta.url)));
