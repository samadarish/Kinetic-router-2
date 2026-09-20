import { serve } from '@hono/node-server';
import { createApp } from './app.js';
import { config } from './config.js';
import { logger } from './logger.js';

const { app, store, analytics, playgroundSettings, websiteSettings, conversations, authFlows, supportStore, supportRealtime } = createApp();
const server = serve({ fetch: app.fetch, port: config.port, hostname: config.host }, (info) => {
  logger.info({ host: config.host, port: info.port, upstream: config.sub2apiBaseUrl }, 'kineticRouter portal BFF listening');
});

const shutdown = async (signal: string) => {
  logger.info({ signal }, 'Stopping portal BFF');
  // Close persistent event streams before waiting for HTTP connections to drain.
  await supportRealtime.close();
  server.close(async () => {
    await Promise.all([store.close(), analytics.close(), playgroundSettings.close(), websiteSettings.close(), conversations.close(), authFlows.close(), supportStore.close()]);
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
};

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
