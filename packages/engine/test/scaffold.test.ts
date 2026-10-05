import { expect, test } from 'vitest';

test('engine package loads', async () => {
  const engine = await import('../src/index');

  expect(engine).toBeDefined();
});
