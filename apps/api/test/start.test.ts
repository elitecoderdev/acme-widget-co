import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const runtime = vi.hoisted(() => ({
  listen: vi.fn(),
  close: vi.fn(),
  addHook: vi.fn(),
  log: { error: vi.fn() },
}));

vi.mock('../src/http/app.js', () => ({ createApp: vi.fn(async () => runtime) }));
vi.mock('../src/config.js', () => ({ readConfig: () => ({ host: '0.0.0.0', port: 8080 }) }));

import { start } from '../src/start.js';

beforeEach(() => {
  vi.clearAllMocks();
  runtime.close.mockResolvedValue(undefined);
  runtime.listen.mockResolvedValue(undefined);
});

afterEach(() => {
  process.exitCode = 0;
  vi.restoreAllMocks();
});

describe('server lifecycle', () => {
  it('listens on the configured interface and releases signal handlers on close', async () => {
    const once = vi.spyOn(process, 'once').mockReturnValue(process);
    const remove = vi.spyOn(process, 'removeListener').mockReturnValue(process);
    await start();
    expect(runtime.listen).toHaveBeenCalledWith({ host: '0.0.0.0', port: 8080 });
    expect(once.mock.calls.map(([signal]) => signal)).toEqual(['SIGTERM', 'SIGINT']);
    const shutdown = once.mock.calls[0]![1] as () => void;
    shutdown();
    await Promise.resolve();
    expect(runtime.close).toHaveBeenCalledOnce();
    await runtime.addHook.mock.calls[0]![1]();
    expect(remove).toHaveBeenCalledWith('SIGTERM', shutdown);
    expect(remove).toHaveBeenCalledWith('SIGINT', shutdown);
  });

  it('reports shutdown failure', async () => {
    const once = vi.spyOn(process, 'once').mockReturnValue(process);
    runtime.close.mockRejectedValue(new Error('close failed'));
    await start();
    (once.mock.calls[0]![1] as () => void)();
    await Promise.resolve();
    expect(runtime.log.error).toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });
});
