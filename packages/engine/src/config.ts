import { engineError, ok, type EngineError, type Result } from './result';
import type { TurnOrder } from './seats';

/** Mirrors the config summary in docs/omi-rules.md section 11. */
export interface RulesConfig {
  readonly turnOrder: TurnOrder;
  readonly tokenTarget: number;
  readonly tokensCallingTeamWin: number;
  readonly tokensDefendingTeamWin: number;
  readonly tokensKapothi: number;
  readonly tieCarryOver: number;
  readonly tieCarryOverStacks: boolean;
  readonly blindTrumpAllowed: boolean;
  readonly playAllEightTricks: boolean;
  readonly dealerRotation: 'next-in-turn-order';
  readonly turnTimerSeconds: number;
  readonly reconnectHoldSeconds: number;
}

export const DEFAULT_RULES: RulesConfig = {
  turnOrder: 'counter-clockwise',
  tokenTarget: 10,
  tokensCallingTeamWin: 1,
  tokensDefendingTeamWin: 2,
  tokensKapothi: 3,
  tieCarryOver: 1,
  tieCarryOverStacks: false,
  blindTrumpAllowed: false,
  playAllEightTricks: true,
  dealerRotation: 'next-in-turn-order',
  turnTimerSeconds: 15,
  reconnectHoldSeconds: 60,
};

const TURN_ORDERS: readonly unknown[] = ['counter-clockwise', 'clockwise'];

const POSITIVE_INTEGER_KEYS = ['tokenTarget', 'turnTimerSeconds', 'reconnectHoldSeconds'] as const;

const NON_NEGATIVE_INTEGER_KEYS = [
  'tokensCallingTeamWin',
  'tokensDefendingTeamWin',
  'tokensKapothi',
  'tieCarryOver',
] as const;

const isIntegerAtLeast = (value: unknown, minimum: number): boolean =>
  typeof value === 'number' && Number.isInteger(value) && value >= minimum;

const findConfigProblem = (config: RulesConfig): string | null => {
  if (!TURN_ORDERS.includes(config.turnOrder)) return 'turnOrder is not a known turn order';

  const badPositive = POSITIVE_INTEGER_KEYS.find((key) => !isIntegerAtLeast(config[key], 1));
  if (badPositive) return `${badPositive} must be a positive integer`;

  const badAward = NON_NEGATIVE_INTEGER_KEYS.find((key) => !isIntegerAtLeast(config[key], 0));
  if (badAward) return `${badAward} must be a non-negative integer`;

  // Variants the rules file lists as alternatives but the engine does not implement.
  if (config.tieCarryOverStacks !== false) return 'stacking tie carry-overs are not supported';
  if (config.blindTrumpAllowed !== false) return 'blind trump is not supported';
  if (config.playAllEightTricks !== true) return 'ending a round early is not supported';
  if (config.dealerRotation !== 'next-in-turn-order') return 'dealerRotation is not supported';

  return null;
};

/** A fresh object with only the known settings, so nothing else rides along to clients. */
const copyConfig = (config: RulesConfig): RulesConfig => ({
  turnOrder: config.turnOrder,
  tokenTarget: config.tokenTarget,
  tokensCallingTeamWin: config.tokensCallingTeamWin,
  tokensDefendingTeamWin: config.tokensDefendingTeamWin,
  tokensKapothi: config.tokensKapothi,
  tieCarryOver: config.tieCarryOver,
  tieCarryOverStacks: config.tieCarryOverStacks,
  blindTrumpAllowed: config.blindTrumpAllowed,
  playAllEightTricks: config.playAllEightTricks,
  dealerRotation: config.dealerRotation,
  turnTimerSeconds: config.turnTimerSeconds,
  reconnectHoldSeconds: config.reconnectHoldSeconds,
});

export const validateConfig = (config: RulesConfig): Result<RulesConfig, EngineError> => {
  const problem = findConfigProblem(config);
  return problem === null ? ok(copyConfig(config)) : engineError('invalid-config', problem);
};
