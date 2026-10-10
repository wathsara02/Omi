/**
 * Headers the page cannot give itself: `frame-ancestors` is ignored in a <meta>
 * policy, so whatever serves the built files must send them. The preview server
 * does (vite.config.ts), and the host does through public/_headers; a test keeps
 * the two in step.
 */
export const SECURITY_HEADERS: Readonly<Record<string, string>> = {
  'Content-Security-Policy': "frame-ancestors 'none'",
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
};
