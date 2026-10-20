import { createApp } from './http/app.js';
import { readConfig } from './config.js';

export async function start() {
  const config = readConfig();
  const app = await createApp(config);
  const shutdown = () => {
    void app.close().catch((error: unknown) => {
      app.log.error(error, 'Shutdown failed');
      process.exitCode = 1;
    });
  };
  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);
  app.addHook('onClose', async () => {
    process.removeListener('SIGTERM', shutdown);
    process.removeListener('SIGINT', shutdown);
  });
  await app.listen({ port: config.port, host: config.host });
  return app;
}
