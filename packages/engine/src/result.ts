export type Result<T, E> =
  { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: E };

export const ok = <T>(value: T): Result<T, never> => ({ ok: true, value });

export const err = <E>(error: E): Result<never, E> => ({ ok: false, error });

export type EngineErrorCode =
  | 'invalid-config'
  | 'invalid-seed'
  | 'invalid-action'
  | 'wrong-phase'
  | 'not-trump-caller'
  | 'not-your-turn'
  | 'card-not-in-hand'
  | 'must-follow-suit';

export interface EngineError {
  readonly code: EngineErrorCode;
  readonly message: string;
}

export const engineError = (code: EngineErrorCode, message: string): Result<never, EngineError> =>
  err({ code, message });
