import { RANKS, SUITS } from '@omi/engine';
import { z } from 'zod';

export const PLAYER_NAME_MAX_LENGTH = 20;
export const ROOM_CODE_LENGTH = 6;
/** No 0, O, 1, I or L, which are easy to misread when a code is shared aloud. */
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
/** 32 random bytes in base64url. */
export const SESSION_TOKEN_LENGTH = 43;

const ROOM_CODE_PATTERN = new RegExp(`^[${ROOM_CODE_ALPHABET}]{${ROOM_CODE_LENGTH}}$`);
const SESSION_TOKEN_PATTERN = new RegExp(`^[A-Za-z0-9_-]{${SESSION_TOKEN_LENGTH}}$`);

/** Control and invisible formatting characters, which could disguise one name as another. */
const UNSAFE_NAME_CHARACTERS = /[\p{Cc}\p{Cf}]/u;

export const playerNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(PLAYER_NAME_MAX_LENGTH)
  .refine((name) => !UNSAFE_NAME_CHARACTERS.test(name));

export const roomCodeSchema = z.string().trim().toUpperCase().regex(ROOM_CODE_PATTERN);

const sessionTokenSchema = z.string().regex(SESSION_TOKEN_PATTERN);

/** Echoed back from the last game state, so a late action cannot land on a later turn. */
const sequenceSchema = z.number().int().min(0);

const cardSchema = z.strictObject({ suit: z.enum(SUITS), rank: z.enum(RANKS) });

// Every payload is a strict object: a client never chooses its own seat, team
// or host status, so unknown keys are rejected rather than ignored.
export const createRoomSchema = z.strictObject({ name: playerNameSchema });

export const joinRoomSchema = z.strictObject({ code: roomCodeSchema, name: playerNameSchema });

export const resumeSchema = z.strictObject({ code: roomCodeSchema, token: sessionTokenSchema });

export const callTrumpSchema = z.strictObject({ seq: sequenceSchema, suit: z.enum(SUITS) });

export const playCardSchema = z.strictObject({ seq: sequenceSchema, card: cardSchema });

export type CreateRoomPayload = z.infer<typeof createRoomSchema>;
export type JoinRoomPayload = z.infer<typeof joinRoomSchema>;
export type ResumePayload = z.infer<typeof resumeSchema>;
export type CallTrumpPayload = z.infer<typeof callTrumpSchema>;
export type PlayCardPayload = z.infer<typeof playCardSchema>;
