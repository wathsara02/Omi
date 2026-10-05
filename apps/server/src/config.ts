import { z } from 'zod';

const DEFAULT_PORT = 3001;
const MAX_PORT = 65535;
/** The Vite dev server. */
const DEFAULT_CORS_ORIGIN = 'http://localhost:5173';

const LOG_LEVELS = ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'] as const;

const splitOrigins = (value: string): string[] =>
  value
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin !== '');

const envSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(MAX_PORT).default(DEFAULT_PORT),
  // Explicit origins only: a wildcard would let any site open a socket as the player.
  CORS_ORIGINS: z
    .string()
    .default(DEFAULT_CORS_ORIGIN)
    .transform(splitOrigins)
    .pipe(z.array(z.url()).min(1)),
  LOG_LEVEL: z.enum(LOG_LEVELS).default('info'),
});

export interface ServerConfig {
  readonly port: number;
  readonly corsOrigins: readonly string[];
  readonly logLevel: (typeof LOG_LEVELS)[number];
}

/** Reads and validates the environment; throws at startup if it is wrong. */
export const loadConfig = (env: Readonly<Record<string, string | undefined>>): ServerConfig => {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    throw new Error(`Invalid server configuration: ${z.prettifyError(parsed.error)}`);
  }
  return {
    port: parsed.data.PORT,
    corsOrigins: parsed.data.CORS_ORIGINS,
    logLevel: parsed.data.LOG_LEVEL,
  };
};
