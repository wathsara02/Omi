import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import { DEFAULT_RULES, validateConfig, type RulesConfig } from '../src/config';

const RULES_DOC = fileURLToPath(new URL('../../../docs/omi-rules.md', import.meta.url));

const readConfigSummary = (): unknown => {
  const doc = readFileSync(RULES_DOC, 'utf8');
  const match = /## 11\. Config summary\s+```json\s+([\s\S]*?)```/.exec(doc);
  if (!match?.[1]) throw new Error('Config summary block not found in omi-rules.md');
  return JSON.parse(match[1]);
};

describe('DEFAULT_RULES', () => {
  test('matches the config summary in docs/omi-rules.md', () => {
    expect(DEFAULT_RULES).toEqual(readConfigSummary());
  });
});

describe('validateConfig', () => {
  test('accepts the default rules', () => {
    expect(validateConfig(DEFAULT_RULES)).toEqual({ ok: true, value: DEFAULT_RULES });
  });

  test('accepts clockwise play and a different token target', () => {
    const config: RulesConfig = { ...DEFAULT_RULES, turnOrder: 'clockwise', tokenTarget: 5 };

    expect(validateConfig(config).ok).toBe(true);
  });

  test.each<[string, Partial<Record<keyof RulesConfig, unknown>>]>([
    ['blind trump, which is not implemented', { blindTrumpAllowed: true }],
    ['stacking carry-overs, which are not implemented', { tieCarryOverStacks: true }],
    ['ending a round early, which is not implemented', { playAllEightTricks: false }],
    ['an unknown dealer rotation', { dealerRotation: 'losing-team-deals' }],
    ['an unknown turn order', { turnOrder: 'random' }],
    ['a zero token target', { tokenTarget: 0 }],
    ['a fractional token target', { tokenTarget: 2.5 }],
    ['a negative calling-team award', { tokensCallingTeamWin: -1 }],
    ['a non-numeric defending-team award', { tokensDefendingTeamWin: '2' }],
    ['a fractional kapothi award', { tokensKapothi: 3.5 }],
    ['a negative carry-over', { tieCarryOver: -1 }],
    ['a zero turn timer', { turnTimerSeconds: 0 }],
    ['a negative reconnect hold', { reconnectHoldSeconds: -5 }],
  ])('rejects %s', (_label, override) => {
    const config = { ...DEFAULT_RULES, ...override } as RulesConfig;

    const result = validateConfig(config);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('invalid-config');
  });
});

describe('validateConfig with an untrusted config object', () => {
  test('returns a copy holding only the known settings', () => {
    const withExtra = { ...DEFAULT_RULES, note: 'not a rule' } as RulesConfig;

    const result = validateConfig(withExtra);

    expect(result).toEqual({ ok: true, value: DEFAULT_RULES });
    expect(result.ok && Object.keys(result.value)).not.toContain('note');
  });

  test('is not affected when the caller changes the config afterwards', () => {
    const mutable = { ...DEFAULT_RULES };

    const result = validateConfig(mutable);
    mutable.tokenTarget = 1;

    expect(result.ok && result.value.tokenTarget).toBe(10);
  });
});
