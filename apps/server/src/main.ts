import pino from 'pino';
import { loadConfig } from './config';
import { createOmiServer } from './socketServer';

const config = loadConfig(process.env);
const logger = pino({ level: config.logLevel });
const server = createOmiServer({ corsOrigins: config.corsOrigins, logger });

server.httpServer.listen(config.port, () => {
  logger.info({ port: config.port, corsOrigins: config.corsOrigins }, 'omi server listening');
});

const shutDown = (signal: string): void => {
  logger.info({ signal }, 'shutting down');
  server
    .close()
    .catch((error: unknown) => logger.error({ err: error }, 'shutdown failed'))
    .finally(() => process.exit(0));
};

process.on('SIGINT', () => shutDown('SIGINT'));
process.on('SIGTERM', () => shutDown('SIGTERM'));
