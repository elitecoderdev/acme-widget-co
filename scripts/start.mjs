import { fileURLToPath } from 'node:url';

process.env.STATIC_DIR ??= fileURLToPath(new URL('../apps/web/dist', import.meta.url));
await import('../apps/api/dist/server.js');
