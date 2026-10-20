import { resolve } from 'node:path';

export function readConfig(env: NodeJS.ProcessEnv = process.env) {
  const port = Number(env.PORT ?? '8080');
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error('PORT must be an integer between 1 and 65535.');
  }
  return {
    port,
    host: env.HOST ?? '0.0.0.0',
    logger: env.NODE_ENV !== 'test',
    ...(env.STATIC_DIR ? { staticDir: resolve(env.STATIC_DIR) } : {}),
  };
}
