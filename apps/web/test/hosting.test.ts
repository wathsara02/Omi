import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';
import { SECURITY_HEADERS } from '../securityHeaders';

const publicFile = (name: string): string =>
  readFileSync(resolve(import.meta.dirname, '../public', name), 'utf8');

/** The rules of a _headers file: a path line, then its indented "Name: value" lines. */
const headerRules = (text: string): Map<string, Record<string, string>> => {
  const rules = new Map<string, Record<string, string>>();
  let current: Record<string, string> | null = null;
  for (const line of text.split(/\r?\n/)) {
    if (line.trim() === '' || line.trim().startsWith('#')) continue;
    if (!/^\s/.test(line)) {
      current = {};
      rules.set(line.trim(), current);
      continue;
    }
    const separator = line.indexOf(':');
    if (current !== null && separator > 0) {
      current[line.slice(0, separator).trim()] = line.slice(separator + 1).trim();
    }
  }
  return rules;
};

describe('the files the web host reads', () => {
  test('send exactly the security headers the preview server sends, on every path', () => {
    const rules = headerRules(publicFile('_headers'));

    expect([...rules.keys()]).toEqual(['/*']);
    expect(rules.get('/*')).toEqual(SECURITY_HEADERS);
  });

  test('serve the app for a room link, which is not a file', () => {
    const redirects = publicFile('_redirects')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line !== '' && !line.startsWith('#'));

    expect(redirects).toEqual(['/* /index.html 200']);
  });
});
