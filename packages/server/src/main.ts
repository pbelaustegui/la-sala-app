import { serve } from '@hono/node-server';
import { compose } from './compose';
import { loadConfig } from './config';

function start(): void {
  let config;
  try {
    config = loadConfig(process.env);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }

  const { app, close } = compose(config);
  const server = serve({ fetch: app.fetch, port: config.port }, (info) => {
    console.log(`la-sala server listening on port ${info.port} (db: ${config.dbPath})`);
  });

  const shutdown = () => {
    server.close(() => {
      close();
      process.exit(0);
    });
    // SSE streams keep connections open; do not wait for them forever.
    setTimeout(() => {
      close();
      process.exit(0);
    }, 2000).unref();
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

start();
