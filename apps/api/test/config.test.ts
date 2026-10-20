import { describe, expect, it, vi } from 'vitest';
import { resolve } from 'node:path';
import { readConfig } from '../src/config.js';

describe('runtime configuration', () => {
  it('has cloud-compatible defaults', () => {
    expect(readConfig({})).toEqual({ port: 8080, host: '0.0.0.0', logger: true });
  });

  it('accepts explicit host, port, static root and test logging', () => {
    expect(
      readConfig({
        PORT: '3000',
        HOST: '127.0.0.1',
        STATIC_DIR: 'apps/web/dist',
        NODE_ENV: 'test',
      }),
    ).toEqual({
      port: 3000,
      host: '127.0.0.1',
      staticDir: resolve('apps/web/dist'),
      logger: false,
    });
  });

  it('reads environment defaults', () => {
    vi.stubEnv('PORT', '8081');
    expect(readConfig().port).toBe(8081);
    vi.unstubAllEnvs();
  });

  it.each(['0', '-1', '65536', '3.5', 'invalid', ''])('rejects invalid port %s', (PORT) => {
    expect(() => readConfig({ PORT })).toThrow('PORT must be an integer');
  });
});
