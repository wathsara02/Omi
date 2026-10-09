import react from '@vitejs/plugin-react';
import { loadEnv, type Plugin } from 'vite';
import { defineConfig } from 'vitest/config';

const DEFAULT_SERVER_URL = 'http://localhost:3001';
const COVERAGE_THRESHOLD = 80;

/**
 * Adds a Content-Security-Policy to the built page. The session token lives in
 * localStorage, so the page must never run a script it did not ship itself.
 * Left out of the dev server, whose hot reloading needs inline scripts.
 */
const contentSecurityPolicy = (serverUrl: string): Plugin => {
  const socketUrl = serverUrl.replace(/^http/, 'ws');
  const policy = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self'",
    "img-src 'self' data:",
    "font-src 'self'",
    `connect-src 'self' ${serverUrl} ${socketUrl}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ');
  return {
    name: 'omi-content-security-policy',
    apply: 'build',
    transformIndexHtml: (html) =>
      html.replace(
        '<!-- csp -->',
        `<meta http-equiv="Content-Security-Policy" content="${policy}" />`,
      ),
  };
};

/**
 * Headers the page cannot give itself: `frame-ancestors` is ignored in a <meta>
 * policy. The preview server sends them, and the end-to-end tests check that.
 * A real host must be configured to send the same set.
 */
const SECURITY_HEADERS: Readonly<Record<string, string>> = {
  'Content-Security-Policy': "frame-ancestors 'none'",
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
};

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  return {
    plugins: [react(), contentSecurityPolicy(env.VITE_SERVER_URL ?? DEFAULT_SERVER_URL)],
    // Fonts inlined as data: URLs would be blocked by font-src 'self'.
    build: { assetsInlineLimit: 0 },
    preview: { headers: { ...SECURITY_HEADERS } },
    test: {
      environment: 'jsdom',
      include: ['test/**/*.test.{ts,tsx}'],
      setupFiles: ['test/setup.ts'],
      css: false,
      coverage: {
        provider: 'v8',
        include: ['src/**/*.{ts,tsx}'],
        // The entry point only mounts the app.
        exclude: ['src/main.tsx'],
        thresholds: {
          lines: COVERAGE_THRESHOLD,
          functions: COVERAGE_THRESHOLD,
          branches: COVERAGE_THRESHOLD,
          statements: COVERAGE_THRESHOLD,
        },
      },
    },
  };
});
