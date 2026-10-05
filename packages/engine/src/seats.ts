export const SEATS = [0, 1, 2, 3] as const;
export type Seat = (typeof SEATS)[number];

export type Team = 'A' | 'B';

export type TurnOrder = 'counter-clockwise' | 'clockwise';

/** One value per seat, indexed by seat number. */
export type PerSeat<T> = readonly [T, T, T, T];

const SEAT_COUNT = SEATS.length;

export const isSeat = (value: unknown): value is Seat =>
  (SEATS as readonly unknown[]).includes(value);

export const teamOf = (seat: Seat): Team => (seat % 2 === 0 ? 'A' : 'B');

export const otherTeam = (team: Team): Team => (team === 'A' ? 'B' : 'A');

export const nextSeat = (seat: Seat, turnOrder: TurnOrder): Seat => {
  const step = turnOrder === 'counter-clockwise' ? 1 : SEAT_COUNT - 1;
  return ((seat + step) % SEAT_COUNT) as Seat;
};

/** All four seats in turn order, starting at `first`. */
export const seatOrderFrom = (first: Seat, turnOrder: TurnOrder): PerSeat<Seat> => {
  const second = nextSeat(first, turnOrder);
  const third = nextSeat(second, turnOrder);
  return [first, second, third, nextSeat(third, turnOrder)];
};

export const mapSeats = <T>(valueFor: (seat: Seat) => T): PerSeat<T> => [
  valueFor(0),
  valueFor(1),
  valueFor(2),
  valueFor(3),
];
