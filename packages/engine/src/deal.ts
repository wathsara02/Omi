import { createDeck, type Card } from './cards';
import { validateConfig, type RulesConfig } from './config';
import { engineError, ok, type EngineError, type Result } from './result';
import { isSeed, randomInt, seedRng, shuffle, type RngState, type Seed } from './rng';
import {
  SEATS,
  mapSeats,
  nextSeat,
  seatOrderFrom,
  type PerSeat,
  type Seat,
  type TurnOrder,
} from './seats';
import { EMPTY_TALLY, type GameState, type Hand, type TeamTally } from './state';

const CARDS_PER_BATCH = 4;

const EMPTY_HANDS: PerSeat<Hand> = mapSeats(() => []);

export interface DealResult {
  readonly hands: PerSeat<Hand>;
  readonly stock: readonly Card[];
}

/** Deals 4 cards from the top of the stock to each seat, in turn order from `firstSeat`. */
export const dealBatch = (
  hands: PerSeat<Hand>,
  stock: readonly Card[],
  firstSeat: Seat,
  turnOrder: TurnOrder,
): DealResult => {
  const order = seatOrderFrom(firstSeat, turnOrder);
  const batchFor = (seat: Seat): Hand => {
    const start = order.indexOf(seat) * CARDS_PER_BATCH;
    return stock.slice(start, start + CARDS_PER_BATCH);
  };
  return {
    hands: mapSeats((seat) => [...hands[seat], ...batchFor(seat)]),
    stock: stock.slice(SEATS.length * CARDS_PER_BATCH),
  };
};

export interface RoundSetup {
  readonly config: RulesConfig;
  readonly rng: RngState;
  readonly dealer: Seat;
  readonly tokens: TeamTally;
  readonly carryOver: number;
  readonly roundNumber: number;
}

/** Shuffles, deals the first 4 cards each and waits for the caller to name trump. */
export const startRound = (setup: RoundSetup): GameState => {
  const { config, dealer } = setup;
  const shuffled = shuffle(createDeck(), setup.rng);
  const caller = nextSeat(dealer, config.turnOrder);
  const dealt = dealBatch(EMPTY_HANDS, shuffled.items, caller, config.turnOrder);
  return {
    config,
    rng: shuffled.state,
    phase: 'calling-trump',
    roundNumber: setup.roundNumber,
    dealer,
    caller,
    trump: null,
    hands: dealt.hands,
    stock: dealt.stock,
    turn: caller,
    currentTrick: null,
    previousTrick: null,
    tricksWon: EMPTY_TALLY,
    tokens: setup.tokens,
    carryOver: setup.carryOver,
    lastRound: null,
    winner: null,
  };
};

/** `seed` must be 128 fresh bits from a cryptographic source; see rng.ts. */
export const createMatch = (config: RulesConfig, seed: Seed): Result<GameState, EngineError> => {
  const validated = validateConfig(config);
  if (!validated.ok) return validated;
  if (!isSeed(seed)) {
    return engineError('invalid-seed', 'A seed must be four unsigned 32-bit integers');
  }

  const dealerPick = randomInt(seedRng(seed), SEATS.length);
  return ok(
    startRound({
      config: validated.value,
      rng: dealerPick.state,
      dealer: dealerPick.value as Seat,
      tokens: EMPTY_TALLY,
      carryOver: 0,
      roundNumber: 1,
    }),
  );
};
