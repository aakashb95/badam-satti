const crypto = require('crypto');
const { createDeck, shuffle } = require('./deck');

const MIN_PLAYERS = 2;
const MAX_PLAYERS = 6;
const COUNTDOWN_MS = 3_000;
const LOCKOUT_MS = 1_500;
// No one spots a match on a freshly shown card faster than this.
const MIN_REACTION_MS = 250;
// Allowance for jitter when checking a reported reaction time.
const REACTION_SLACK_MS = 50;
const TIE_MS = 20;
const SETTLE_MIN_MS = 30;
const SETTLE_MAX_MS = 300;
const SETTLE_UNKNOWN_RTT_MS = 150;
const RTT_SAMPLES = 10;
// A round with no match for this long gets a fresh middle card.
const ROUND_IDLE_MS = 60_000;

const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
};

class KitchenClashGame {
  constructor(roomCode, options = {}) {
    this.roomCode = roomCode;
    this.players = [];
    this.hostToken = null;
    this.phase = 'lobby';
    this.countdownEndsAt = null;
    this.centre = null;
    this.roundId = 0;
    this.roundStartedAt = null;
    this.claims = [];
    this.settleDeadline = null;
    this.lastWin = null;
    this.nextRank = 1;
    this.spares = [];
    this.played = [];
    this.refreshedRoundId = null;
    this.roundIdleMs = options.roundIdleMs ?? ROUND_IDLE_MS;
    this.makeDeck = options.makeDeck || (() => shuffle(createDeck()));
  }

  player(id) {
    return this.players.find((item) => item.id === id) || null;
  }

  host() {
    return this.players.find((item) => item.sessionToken === this.hostToken) || null;
  }

  // Players still racing: seated, holding cards, not yet ranked.
  racers() {
    return this.players.filter((item) => !item.left && item.rank === null && item.pile.length > 0);
  }

  addPlayer(id, name, sessionToken = crypto.randomUUID()) {
    if (this.phase !== 'lobby') return { error: 'This game has already started.' };
    const seated = this.players.filter((item) => !item.left);
    if (seated.length >= MAX_PLAYERS) return { error: `This kitchen is full. Up to ${MAX_PLAYERS} players can play.` };
    if (seated.some((item) => item.name.toLowerCase() === name.toLowerCase())) return { error: 'Someone in this room already has that name.' };
    const player = {
      id, name, sessionToken, connected: true, left: false, removeAt: null,
      pile: [], rank: null, wins: 0, misses: 0, spotTotalMs: 0, spotCount: 0,
      lockedUntil: 0, rttSamples: [], roundSentAt: null, sentRoundId: null,
    };
    this.players.push(player);
    if (!this.host()) this.hostToken = sessionToken;
    return { player };
  }

  reconnectPlayer(sessionToken, id) {
    const player = this.players.find((item) => item.sessionToken === sessionToken && !item.left);
    if (!player) return null;
    player.id = id;
    player.connected = true;
    player.removeAt = null;
    player.rttSamples = [];
    // The reconnecting phone shows the current centre afresh, so its
    // reaction clock starts from the next state it is sent.
    player.sentRoundId = null;
    return player;
  }

  disconnectPlayer(id, now, graceMs) {
    const player = this.player(id);
    if (!player || player.left) return null;
    player.connected = false;
    player.removeAt = now + graceMs;
    return player;
  }

  // Permanent departure: an explicit Leave, or the return window ran out.
  removePlayer(sessionToken) {
    const index = this.players.findIndex((item) => item.sessionToken === sessionToken && !item.left);
    if (index < 0) return null;
    const player = this.players[index];
    if (this.phase === 'lobby') this.players.splice(index, 1);
    else {
      player.left = true;
      player.connected = false;
      player.pile = [];
      this.claims = this.claims.filter((claim) => claim.playerId !== player.id);
    }
    if (this.hostToken === sessionToken) {
      const next = this.players.find((item) => !item.left && item.connected) || this.players.find((item) => !item.left);
      this.hostToken = next ? next.sessionToken : null;
    }
    if (this.phase === 'countdown' || this.phase === 'playing') this.finishIfDecided();
    return player;
  }

  isEmpty() {
    return this.players.every((item) => item.left);
  }

  canStart() {
    const seated = this.players.filter((item) => !item.left);
    return seated.length >= MIN_PLAYERS && seated.every((item) => item.connected);
  }

  start(requesterId, now) {
    const requester = this.player(requesterId);
    if (!requester || requester.sessionToken !== this.hostToken) return { error: 'Only the host can start the game.' };
    if (this.phase !== 'lobby' && this.phase !== 'finished') return { error: 'The game is already running.' };
    if (this.phase === 'finished') this.players = this.players.filter((item) => !item.left);
    if (!this.canStart()) return { error: `You need ${MIN_PLAYERS} to ${MAX_PLAYERS} players, all connected, to start.` };

    const deck = this.makeDeck();
    this.centre = deck[0];
    const perPlayer = Math.floor((deck.length - 1) / this.players.length);
    this.spares = deck.slice(1 + perPlayer * this.players.length);
    this.played = [];
    this.refreshedRoundId = null;
    this.players.forEach((player, index) => {
      Object.assign(player, {
        pile: deck.slice(1 + index * perPlayer, 1 + (index + 1) * perPlayer),
        rank: null, wins: 0, misses: 0, spotTotalMs: 0, spotCount: 0, lockedUntil: 0, sentRoundId: null,
      });
    });
    this.phase = 'countdown';
    this.countdownEndsAt = now + COUNTDOWN_MS;
    this.roundId = 0;
    this.claims = [];
    this.settleDeadline = null;
    this.lastWin = null;
    this.nextRank = 1;
    return { countdownMs: COUNTDOWN_MS };
  }

  beginPlay(now) {
    if (this.phase !== 'countdown') return false;
    this.phase = 'playing';
    this.countdownEndsAt = null;
    this.openRound(now);
    return true;
  }

  openRound(now) {
    this.roundId += 1;
    this.roundStartedAt = now;
    this.roundEndsAt = now + this.roundIdleMs;
    this.claims = [];
    this.settleDeadline = null;
  }

  recordRtt(id, rttMs) {
    const player = this.player(id);
    if (!player || !Number.isFinite(rttMs) || rttMs < 0) return;
    player.rttSamples.push(rttMs);
    if (player.rttSamples.length > RTT_SAMPLES) player.rttSamples.shift();
  }

  // The reaction time this claim is judged on. The phone measures from when
  // the centre was painted on its screen to the tap, so its network lag in
  // both directions is left out. The server checks it against its own clock:
  // the time since it sent the round, minus the slowest recent round trip it
  // measured to that phone, minus a little slack. A phone cannot claim to be
  // faster than that, so a modified client gains at most its own jitter.
  // Without round-trip samples this falls back to server arrival order.
  checkedReaction(player, reportedMs, now) {
    const elapsed = now - (player.roundSentAt ?? this.roundStartedAt);
    const maxRtt = player.rttSamples.length ? Math.max(...player.rttSamples) : 0;
    const fastestBelievable = Math.max(MIN_REACTION_MS, elapsed - maxRtt - REACTION_SLACK_MS);
    const reported = Number.isFinite(reportedMs) ? reportedMs : elapsed;
    return Math.min(elapsed, Math.max(fastestBelievable, reported));
  }

  settleWindowMs() {
    const rtts = this.racers().filter((item) => item.connected).map((item) => (item.rttSamples.length ? median(item.rttSamples) : SETTLE_UNKNOWN_RTT_MS));
    const slowest = rtts.length ? Math.max(...rtts) : SETTLE_UNKNOWN_RTT_MS;
    return Math.min(SETTLE_MAX_MS, Math.max(SETTLE_MIN_MS, slowest));
  }

  claim(id, { roundId, itemId, reactionMs } = {}, now) {
    const player = this.player(id);
    if (this.phase !== 'playing' || !player || !this.racers().includes(player)) return { result: 'not_playing' };
    if (roundId !== this.roundId) return { result: 'stale' };
    if (player.lockedUntil > now) return { result: 'locked', lockoutMs: Math.ceil(player.lockedUntil - now) };
    if (this.claims.some((claim) => claim.playerId === id)) return { result: 'pending' };
    const topCard = player.pile[0];
    if (!topCard.items.includes(itemId) || !this.centre.items.includes(itemId)) {
      player.misses += 1;
      player.lockedUntil = now + LOCKOUT_MS;
      return { result: 'wrong', lockoutMs: LOCKOUT_MS };
    }
    const checkedMs = this.checkedReaction(player, Number(reactionMs), now);
    this.claims.push({ playerId: id, reactionMs: checkedMs, arrivedAt: now });
    player.spotTotalMs += checkedMs;
    player.spotCount += 1;
    if (this.claims.length === 1) {
      const settleMs = this.settleWindowMs();
      this.settleDeadline = now + settleMs;
      return { result: 'accepted', settleMs };
    }
    return { result: 'accepted' };
  }

  // Awards the round to the lowest checked reaction time. Reactions within
  // TIE_MS of the fastest count as a tie, which the earliest arrival wins.
  settle(now) {
    if (this.phase !== 'playing' || this.claims.length === 0) return null;
    const fastest = Math.min(...this.claims.map((claim) => claim.reactionMs));
    const [winningClaim] = this.claims
      .filter((claim) => claim.reactionMs - fastest < TIE_MS)
      .sort((a, b) => a.arrivedAt - b.arrivedAt);
    const winner = this.player(winningClaim.playerId);
    const card = winner.pile.shift();
    const itemId = card.items.find((item) => this.centre.items.includes(item));
    this.played.push(this.centre);
    this.centre = card;
    winner.wins += 1;
    if (winner.pile.length === 0) winner.rank = this.nextRank++;
    this.lastWin = { name: winner.name, itemId, roundId: this.roundId, reactionMs: Math.round(winningClaim.reactionMs) };
    if (!this.finishIfDecided()) this.openRound(now);
    return { winnerId: winner.id };
  }

  // Nobody found a match in time. Every pair of cards shares an item, so any
  // other card works as the new middle card: an undealt spare, else an
  // earlier middle card. With neither (only possible on the first card),
  // everyone's top card goes to the bottom of their pile instead. Nobody
  // gains or loses cards either way.
  refreshRound(now) {
    if (this.phase !== 'playing' || this.claims.length > 0) return false;
    const pool = this.spares.length ? this.spares : this.played;
    if (pool.length) {
      const [next] = pool.splice(Math.floor(Math.random() * pool.length), 1);
      this.played.push(this.centre);
      this.centre = next;
    } else {
      this.racers().forEach((player) => player.pile.push(player.pile.shift()));
    }
    this.refreshedRoundId = this.roundId;
    this.openRound(now);
    return true;
  }

  finishIfDecided() {
    const racers = this.racers();
    if (racers.length > 1) return false;
    racers.forEach((player) => { player.rank = this.nextRank++; });
    this.phase = 'finished';
    this.claims = [];
    this.settleDeadline = null;
    this.countdownEndsAt = null;
    return true;
  }

  // State for one player. Sending a new round to a player also starts the
  // server's clock for checking that player's reaction time.
  stateFor(id, now) {
    const me = this.player(id);
    if (me && this.phase === 'playing' && me.sentRoundId !== this.roundId) {
      me.sentRoundId = this.roundId;
      me.roundSentAt = now;
    }
    const host = this.host();
    const seated = this.players.filter((item) => !item.left || this.phase === 'finished');
    return {
      roomCode: this.roomCode,
      phase: this.phase,
      roundId: this.roundId,
      countdownMs: this.countdownEndsAt ? Math.max(0, Math.ceil(this.countdownEndsAt - now)) : null,
      roundEndsInMs: this.phase === 'playing' ? Math.max(0, Math.ceil(this.roundEndsAt - now)) : null,
      refreshedRoundId: this.refreshedRoundId,
      minPlayers: MIN_PLAYERS,
      maxPlayers: MAX_PLAYERS,
      isHost: Boolean(me && host && me.sessionToken === host.sessionToken),
      hostName: host ? host.name : null,
      canStart: this.canStart(),
      centre: this.phase === 'lobby' ? null : this.centre,
      lastWin: this.lastWin,
      you: me ? {
        name: me.name,
        cardsLeft: me.pile.length,
        topCard: this.phase === 'playing' || this.phase === 'countdown' ? me.pile[0] || null : null,
        rank: me.rank,
        lockoutMs: Math.max(0, Math.ceil(me.lockedUntil - now)),
      } : null,
      players: seated.map((item) => ({
        name: item.name,
        cardsLeft: item.pile.length,
        connected: item.connected,
        left: item.left,
        rank: item.rank,
        isYou: item === me,
        isHost: Boolean(host && item.sessionToken === host.sessionToken),
        reconnectMs: !item.connected && item.removeAt ? Math.max(0, Math.ceil(item.removeAt - now)) : null,
        wins: item.wins,
        misses: item.misses,
        averageSpotMs: item.spotCount ? Math.round(item.spotTotalMs / item.spotCount) : null,
      })),
    };
  }
}

module.exports = { KitchenClashGame, MIN_PLAYERS, MAX_PLAYERS, LOCKOUT_MS, MIN_REACTION_MS, COUNTDOWN_MS, ROUND_IDLE_MS };
