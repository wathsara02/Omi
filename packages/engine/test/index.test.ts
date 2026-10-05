import { expect, test } from 'vitest';
import * as engine from '../src/index';

test('the package exposes the functions the server and client need', () => {
  const functions = ['createMatch', 'applyAction', 'applyAutoAction', 'viewFor', 'legalMoves'];

  for (const name of functions) {
    expect(typeof engine[name as keyof typeof engine]).toBe('function');
  }
  expect(engine.DEFAULT_RULES.tokenTarget).toBe(10);
});
