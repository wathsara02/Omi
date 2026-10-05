import { describe, expect, test } from 'vitest';
import { loadConfig } from '../src/config';

describe('loadConfig', () => {
  test('uses local development defaults when nothing is set', () => {
    expect(loadConfig({})).toEqual({
      port: 3001,
      corsOrigins: ['http://localhost:5173'],
      logLevel: 'info',
      trustProxy: false,
    });
  });

  test('reads the port, origins and log level from the environment', () => {
    const config = loadConfig({
      PORT: '8080',
      CORS_ORIGINS: 'https://omi.example.com, https://staging.example.com',
      LOG_LEVEL: 'warn',
      TRUST_PROXY: 'true',
    });

    expect(config).toEqual({
      port: 8080,
      corsOrigins: ['https://omi.example.com', 'https://staging.example.com'],
      logLevel: 'warn',
      trustProxy: true,
    });
  });

  test.each([
    ['a non-numeric port', { PORT: 'abc' }],
    ['port 0', { PORT: '0' }],
    ['a port past 65535', { PORT: '70000' }],
    ['a wildcard origin', { CORS_ORIGINS: '*' }],
    ['an origin that is not a URL', { CORS_ORIGINS: 'omi.example.com' }],
    ['an empty origin list', { CORS_ORIGINS: ' , ' }],
    ['an unknown log level', { LOG_LEVEL: 'chatty' }],
    ['a trust-proxy value that is not true or false', { TRUST_PROXY: 'yes' }],
  ])('fails fast on %s', (_label, env) => {
    expect(() => loadConfig(env)).toThrow(/Invalid server configuration/);
  });
});
