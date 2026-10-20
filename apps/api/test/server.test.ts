import { afterEach, describe, expect, it, vi } from 'vitest';

const boot = vi.hoisted(() => ({ start: vi.fn() }));
vi.mock('../src/start.js', () => ({ start: boot.start }));

afterEach(() => {
  process.exitCode = 0;
  vi.restoreAllMocks();
});

describe('process entry point', () => {
  it.each([new Error('port unavailable'), 'unexpected failure'])(
    'reports boot failures',
    async (error) => {
      vi.resetModules();
      boot.start.mockRejectedValue(error);
      const write = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
      await import('../src/server.js');
      await Promise.resolve();
      expect(process.exitCode).toBe(1);
      expect(write).toHaveBeenCalledWith(
        error instanceof Error ? 'port unavailable\n' : 'Server startup failed.\n',
      );
    },
  );
});
