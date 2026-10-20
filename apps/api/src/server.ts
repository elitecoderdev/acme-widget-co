import { start } from './start.js';

void start().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : 'Server startup failed.'}\n`);
  process.exitCode = 1;
});
