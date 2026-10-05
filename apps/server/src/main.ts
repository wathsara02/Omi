import pino from 'pino';
import { loadConfig } from './config';
import { createOmiServer } from './socketServer';

const config = loadConfig(process.env);
const logger = pino({ level: config.logLevel });
const server = createOmiServer({
  corsOrigins: config.corsOrigins,
  trustProxy: config.trustProxy,
  logger,
});

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

// An error nothing caught leaves the process in an unknown state: log it and stop,
// so a supervisor can start a clean one.
const stopOnFatal = (kind: string, error: unknown): void => {
  logger.fatal({ err: error }, kind);
  process.exit(1);
};

process.on('uncaughtException', (error) => stopOnFatal('uncaught exception', error));
process.on('unhandledRejection', (reason) => stopOnFatal('unhandled rejection', reason));
process.on('SIGINT', () => shutDown('SIGINT'));
process.on('SIGTERM', () => shutDown('SIGTERM'));
