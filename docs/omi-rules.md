# Omi Rules (source of truth)

This file defines the exact Omi variant the game implements. Where house rules
commonly differ, the line is marked **[EDIT]** with the usual alternatives.
The engine must follow this file, not general knowledge of the game.

## 1. Players and teams

- 4 players in 2 teams of 2.
- Partners sit opposite each other: seats 0 and 2 are Team A, seats 1 and 3 are Team B.
- Turn order is counter-clockwise (seat 0 → 1 → 2 → 3 → 0). **[EDIT]** some groups play clockwise.

## 2. Cards

- 32 cards: 7, 8, 9, 10, J, Q, K, A in each of the four suits.
- Rank within a suit, high to low: A, K, Q, J, 10, 9, 8, 7.
- Suits have no ranking among themselves. Only the trump suit is special.

## 3. Match structure

- A match is a series of rounds.
- Each round, teams win tokens (see section 7).
- The first team to reach **10 tokens** wins the match. **[EDIT]** target can be changed.

## 4. Dealing

1. The first dealer is chosen at random. **[EDIT]**
2. The deck is shuffled.
3. The dealer deals 4 cards to each player, starting with the player to the
   dealer's right and continuing in turn order.
4. The trump caller (section 5) names trump.
5. The dealer deals the remaining 4 cards to each player. Everyone now has 8 cards.

## 5. Calling trump

- The trump caller is the player to the dealer's right (the first player dealt to).
- The caller looks only at their first 4 cards and names one suit as trump.
- The caller must name a suit; passing is not allowed. **[EDIT]** optional
  variant: the caller may choose "blind", and the suit of the first card of
  their second batch becomes trump.
- No other player may see their second 4 cards before trump is named.
- There is no "no trump" option. **[EDIT]**

## 6. Playing tricks

- A round has 8 tricks.
- The trump caller leads the first trick.
- Play continues in turn order, one card per player.
- **Follow suit:** a player who has a card of the led suit must play one.
- A player with no card of the led suit may play any card, including a trump.
  They are not forced to trump.
- **Trick winner:**
  - If any trumps were played, the highest trump wins.
  - Otherwise, the highest card of the led suit wins.
  - Cards of other non-trump suits never win.
- The winner of a trick leads the next trick.
- Tricks are counted per team, not per player.

## 7. Scoring a round

"Calling team" means the trump caller's team. "Defending team" is the dealer's team.

| Result                                   | Tokens |
|------------------------------------------|--------|
| Calling team wins 5, 6 or 7 tricks       | 1 to calling team |
| Defending team wins 5, 6 or 7 tricks     | 2 to defending team |
| Either team wins all 8 tricks (kapothi)  | 3 to that team **[EDIT]** some play 2 or 4 |
| 4–4 tie                                  | 0 to both; see below |

- **Tie carry-over:** after a 4–4 tie, the winner of the next round gets 1 extra
  token. This does not stack: after consecutive ties the carry-over stays at 1
  until a round is won. **[EDIT]** alternatives: no carry-over, or carry-overs
  stack on consecutive ties.
- **Kapothi with a carry-over:** the carry-over is added on top, so a kapothi
  after a tie is worth 3 + 1 = 4 tokens.
- A round is always played to all 8 tricks, even after one team reaches 5.
  **[EDIT]** alternative: end early once the result cannot change.

## 8. Next round

- The deal passes to the next player in turn order (the previous trump caller
  becomes the dealer). **[EDIT]** alternative: the losing team deals.
- After a tie, the deal still passes on as normal. **[EDIT]**

## 9. End of match

- The match ends as soon as a team reaches the token target after a round is scored.
- If both the normal award and a carry-over take a team past the target, they still simply win.

## 10. Online-specific rules

These are not part of traditional Omi; they cover situations a web game must handle. **[EDIT]** all values.

- **Host:** the player who creates the room is the host. If the host leaves
  before the match starts, the player who has waited longest becomes host.
- **Kick:** before the match starts, the host can remove any other player from
  the room. The seat opens for someone else. A removed player is not banned.
- **Starting:** a match starts only when all 4 seats are filled and the host
  starts it.
- **Player names:** 1 to 20 characters after trimming; duplicates are allowed.
  Control characters and invisible formatting characters are rejected.
- **Team selection:** random.
- **Turn timer:** 15 seconds per action (calling trump or playing a card).
- **Timeout on trump call:** trump is the suit the caller holds most of in their
  first 4 cards; ties broken at random.
- **Timeout on a card play:** the server plays the lowest legal card. "Lowest"
  means lowest rank; among cards of equal rank a non-trump is preferred, and any
  remaining tie is broken by the fixed suit order clubs, diamonds, hearts, spades.
- **Disconnect:** the seat is held for 60 seconds. The player can rejoin the
  same seat. While they are away, timeouts apply as above.
- **Abandon:** if a player does not return within the hold time, a bot takes
  over the seat and the match continues. The bot plays as a timeout does
  (most-held suit as trump, lowest legal card), 1 second after its turn begins.
  The player can take the seat back at any time; the bot stops at its next action.
- **Between rounds:** the next round is dealt 5 seconds after a round is scored.
- **Room expiry:** a room is removed the moment no human player is connected to
  it. This overrides the disconnect hold: if all four players drop at once, the
  match is gone.
- **Idle rooms:** a room is also removed after 10 minutes of sitting idle: a
  lobby that has not started, counted from the last time someone joined, left or
  was removed, or a finished match, counted from its end. A match in progress
  is never removed for being idle.
- **Rematch:** after a match ends, each player can mark themselves ready for
  another match; a ready mark cannot be withdrawn. The new match starts as soon
  as every connected player is ready. It keeps the same seats and teams, starts
  at 0 tokens each, and its first dealer is chosen at random. A seat whose
  player is not connected is played by a bot, and the player can take it back as
  in **Abandon**. Ready marks do not extend the idle time of a finished room.
- **Table talk:** no signalling of cards between partners. In-game chat, if any,
  is visible to all four players.
- **Hidden information:** a player sees only their own hand, the cards played to
  the current and previous tricks, trump, trick counts, and token totals.

## 11. Config summary

```json
{
  "turnOrder": "counter-clockwise",
  "tokenTarget": 10,
  "tokensCallingTeamWin": 1,
  "tokensDefendingTeamWin": 2,
  "tokensKapothi": 3,
  "tieCarryOver": 1,
  "tieCarryOverStacks": false,
  "blindTrumpAllowed": false,
  "playAllEightTricks": true,
  "dealerRotation": "next-in-turn-order",
  "turnTimerSeconds": 15,
  "reconnectHoldSeconds": 60
}
```