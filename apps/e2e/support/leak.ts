import { cardKey, isCard, type Card } from '@omi/engine';
import type { GameSnapshot } from '@omi/protocol';
import type { Page } from '@playwright/test';

// Checks what the server actually put on the wire for one player against what
// the other three were holding at the same moment. The other players' own
// frames are the truth, so the check does not trust anything the subject was told.

/** Everything one browser received from the game server, as raw frame text. */
export interface Recording {
  readonly frames: string[];
  /** Requests that used long polling, which this recorder cannot see inside. */
  readonly pollingRequests: string[];
}

/** Must be called before the page first loads, so no frame is missed. */
export const record = (page: Page): Recording => {
  const recording: Recording = { frames: [], pollingRequests: [] };
  page.on('websocket', (socket) => {
    socket.on('framereceived', ({ payload }) => {
      recording.frames.push(typeof payload === 'string' ? payload : payload.toString('utf8'));
    });
  });
  page.on('request', (request) => {
    if (request.url().includes('transport=polling')) recording.pollingRequests.push(request.url());
  });
  return recording;
};

interface Packet {
  readonly event: string | null;
  readonly body: unknown;
}

// Engine.IO message (4) holding a Socket.IO event (2) or acknowledgement (3),
// an optional acknowledgement id, then a JSON array.
const PACKET = /^4[23]\d*(\[[\s\S]*)$/;
const FORBIDDEN_KEYS = ['hands', 'stock', 'deck', 'rng', 'seed'] as const;
const FIRST_BATCH = 4;

// Engine.IO's own frames (open, ping, pong) and the Socket.IO connect reply.
const TRANSPORT_FRAME = /^(0|2|3|40)/;

const parsePacket = (frame: string): Packet | null => {
  const json = PACKET.exec(frame)?.[1];
  if (json === undefined) {
    // A frame this cannot read might carry anything, so it is an error, not a pass.
    if (!TRANSPORT_FRAME.test(frame)) throw new Error(`Unreadable frame: ${frame.slice(0, 40)}`);
    return null;
  }
  const parsed: unknown = JSON.parse(json);
  if (!Array.isArray(parsed)) return null;
  const isEvent = frame.startsWith('42') && typeof parsed[0] === 'string';
  return isEvent ? { event: parsed[0] as string, body: parsed[1] } : { event: null, body: parsed };
};

const childrenOf = (value: unknown): readonly unknown[] => {
  if (Array.isArray(value)) return value;
  return typeof value === 'object' && value !== null ? Object.values(value) : [];
};

const cardsIn = (value: unknown): Card[] =>
  isCard(value) ? [value] : childrenOf(value).flatMap(cardsIn);

const keysIn = (value: unknown): string[] => {
  const own =
    typeof value === 'object' && value !== null && !Array.isArray(value) ? Object.keys(value) : [];
  return [...own, ...childrenOf(value).flatMap(keysIn)];
};

export const gameStatesIn = (frames: readonly string[]): GameSnapshot[] =>
  frames
    .map(parsePacket)
    .filter((packet) => packet?.event === 'game:state')
    .map((packet) => packet?.body as GameSnapshot);

interface Truth {
  /** Cards held by any other player when this state was sent. */
  readonly held: Set<string>;
  readonly reports: number;
}

const truthBySeq = (others: readonly (readonly string[])[]): Map<number, Truth> => {
  const truth = new Map<number, Truth>();
  for (const frames of others) {
    for (const { seq, view } of gameStatesIn(frames)) {
      const known = truth.get(seq) ?? { held: new Set<string>(), reports: 0 };
      for (const card of view.hand) known.held.add(cardKey(card));
      truth.set(seq, { held: known.held, reports: known.reports + 1 });
    }
  }
  return truth;
};

/**
 * Every way the subject's frames told them something they should not know.
 * An empty list means nothing leaked. `others` are the frames of the other
 * three players over the same stretch of play.
 */
export const findLeaks = (
  subject: readonly string[],
  others: readonly (readonly string[])[],
): string[] => {
  const truth = truthBySeq(others);
  const problems: string[] = [];
  // Cards seen so far in this round while trump is uncalled, and the hand held then.
  let beforeTrump: { seen: Set<string>; hand: Set<string> } | null = null;

  for (const frame of subject) {
    const packet = parsePacket(frame);
    if (packet === null) continue;
    const cards = cardsIn(packet.body).map(cardKey);
    const label = packet.event ?? 'an acknowledgement';

    for (const key of keysIn(packet.body)) {
      if (FORBIDDEN_KEYS.some((forbidden) => forbidden === key)) {
        problems.push(`${label} has a "${key}" field`);
      }
    }
    if (packet.event !== 'game:state') {
      if (cards.length > 0) problems.push(`${label} carries cards: ${cards.join(' ')}`);
      continue;
    }

    const snapshot = packet.body as GameSnapshot;
    const { seq, view } = snapshot;
    // Cards may be in the hand or on the table. Anywhere else (an event, say)
    // they must be cards that are on the table, which everyone can see.
    const onTable = new Set(cardsIn([view.currentTrick, view.previousTrick]).map(cardKey));
    const elsewhere = cardsIn({
      ...snapshot,
      view: { ...view, hand: [], legalMoves: [], currentTrick: null, previousTrick: null },
    }).map(cardKey);
    for (const card of elsewhere.filter((each) => !onTable.has(each))) {
      problems.push(`state ${seq}: ${card} appears outside the hand and the tricks`);
    }
    for (const card of cardsIn(view.legalMoves).map(cardKey)) {
      if (!view.hand.some((held) => cardKey(held) === card)) {
        problems.push(`state ${seq}: ${card} is a legal move but not in hand`);
      }
    }
    const known = truth.get(seq);
    if (known === undefined || known.reports !== others.length) {
      problems.push(`state ${seq}: cannot be checked, not every other player received it`);
    } else {
      for (const card of cards.filter((each) => known.held.has(each))) {
        problems.push(`state ${seq}: shows ${card}, which another player still holds`);
      }
    }

    const hand = view.hand.map(cardKey);
    if (view.trump === null && view.phase === 'calling-trump') {
      if (hand.length !== FIRST_BATCH) {
        problems.push(`state ${seq}: ${hand.length} cards in hand before trump is called`);
      }
      beforeTrump ??= { seen: new Set(), hand: new Set(hand) };
      for (const card of cards) beforeTrump.seen.add(card);
    } else if (beforeTrump !== null) {
      // Trump has just been called: the cards new to the hand are the second batch.
      const { seen, hand: firstBatch } = beforeTrump;
      for (const card of hand.filter((each) => !firstBatch.has(each) && seen.has(each))) {
        problems.push(`state ${seq}: ${card} of the second batch was sent before trump was called`);
      }
      beforeTrump = null;
    }
  }
  return problems;
};
