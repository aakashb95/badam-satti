const crypto = require('crypto');
const { performance } = require('perf_hooks');
const { createDeck, shuffle } = require('./deck');

const MIN_PLAYERS = 2;
const MAX_PLAYERS = 6;
// Game modes the host picks in the lobby.
//  - race: everyone gets a pile; win the round and your card goes to the
//    middle; empty your pile first.
//  - tower: everyone starts with one card; win the round and you take the
//    middle card onto your tower; when the deck runs out the tallest wins.
//  - hot-potato: no middle card. Each deal everyone holds one card. Match
//    your top card with another player's top card and your whole stack goes
//    onto theirs. The one left holding every card loses the deal. After
//    HOT_POTATO_DEALS deals, the fewest losses wins.
const MODES = {
  race: { maxPlayers: MAX_PLAYERS },
  tower: { maxPlayers: MAX_PLAYERS },
  'hot-potato': { maxPlayers: 4 },
};
const HOT_POTATO_DEALS = 5;
// Pause between Hot Potato deals, so everyone sees who got stuck.
const DEAL_BREAK_MS = 4_000;
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
    // The standings of the last finished game, kept as they ended.
    this.result = null;
    this.nextRank = 1;
    this.spares = [];
    this.played = [];
    this.refreshedRoundId = null;
    this.mode = 'race';
    this.drawPile = [];
    this.deal = 0;
    this.lastDeal = null;
    this.roundIdleMs = options.roundIdleMs ?? ROUND_IDLE_MS;
    this.makeDeck = options.makeDeck || (() => shuffle(createDeck()));
  }

  player(id) {
    return this.players.find((item) => item.id === id) || null;
  }

  host() {
    return this.players.find((item) => item.sessionToken === this.hostToken) || null;
  }

  maxPlayers() {
    return MODES[this.mode].maxPlayers;
  }

  // Players who can still claim: seated, holding cards, not yet ranked. In
  // the Tower everyone always holds their tower; in Hot Potato a player with
  // no cards is safe for the rest of the deal.
  racers() {
    return this.players.filter((item) => !item.left && !item.waiting && item.rank === null && item.pile.length > 0);
  }

  // Seated and in this game: not gone, and not waiting for the next one.
  inGame() {
    return this.players.filter((item) => !item.left && !item.waiting);
  }

  setMode(requesterId, mode) {
    const requester = this.player(requesterId);
    if (!requester || requester.sessionToken !== this.hostToken) return { error: 'Only the host can pick the game.' };
    if (this.phase !== 'lobby' && this.phase !== 'finished') return { error: 'Pick the game before it starts.' };
    if (!MODES[mode]) return { error: 'That game does not exist.' };
    const seated = this.players.filter((item) => !item.left).length;
    if (seated > MODES[mode].maxPlayers) return { error: `That game is for up to ${MODES[mode].maxPlayers} players. ${seated} are here.` };
    this.mode = mode;
    return { mode };
  }

  // Someone who joins after the first start waits for the next game: they
  // are seated now and dealt in when the host starts again.
  addPlayer(id, name, sessionToken = crypto.randomUUID()) {
    const seated = this.players.filter((item) => !item.left);
    if (seated.length >= this.maxPlayers()) return { error: `This kitchen is full. Up to ${this.maxPlayers()} players can play this game.` };
    if (seated.some((item) => item.name.toLowerCase() === name.toLowerCase())) return { error: 'Someone in this room already has that name.' };
    const player = {
      id, name, sessionToken, connected: true, left: false, removeAt: null, waiting: this.phase !== 'lobby',
      pile: [], rank: null, wins: 0, misses: 0, spotTotalMs: 0, spotCount: 0, losses: 0,
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
  removePlayer(sessionToken, now = performance.now()) {
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
    if (this.phase === 'countdown' || this.phase === 'playing') this.finishIfDecided(now, true);
    return player;
  }

  isEmpty() {
    return this.players.every((item) => item.left);
  }

  canStart() {
    const seated = this.players.filter((item) => !item.left);
    return seated.length >= MIN_PLAYERS && seated.length <= this.maxPlayers() && seated.every((item) => item.connected);
  }

  start(requesterId, now) {
    const requester = this.player(requesterId);
    if (!requester || requester.sessionToken !== this.hostToken) return { error: 'Only the host can start the game.' };
    if (this.phase !== 'lobby' && this.phase !== 'finished') return { error: 'The game is already running.' };
    if (this.phase === 'finished') this.players = this.players.filter((item) => !item.left);
    if (!this.canStart()) return { error: `You need ${MIN_PLAYERS} to ${this.maxPlayers()} players, all connected, to start.` };

    const deck = this.makeDeck();
    this.played = [];
    this.refreshedRoundId = null;
    this.deal = 0;
    this.lastDeal = null;
    this.players.forEach((player) => {
      Object.assign(player, { waiting: false, pile: [], rank: null, wins: 0, misses: 0, losses: 0, spotTotalMs: 0, spotCount: 0, lockedUntil: 0, sentRoundId: null });
    });
    if (this.mode === 'race') {
      this.centre = deck[0];
      const perPlayer = Math.floor((deck.length - 1) / this.players.length);
      this.spares = deck.slice(1 + perPlayer * this.players.length);
      this.players.forEach((player, index) => { player.pile = deck.slice(1 + index * perPlayer, 1 + (index + 1) * perPlayer); });
    } else if (this.mode === 'tower') {
      this.centre = deck[0];
      this.players.forEach((player, index) => { player.pile = [deck[1 + index]]; });
      this.drawPile = deck.slice(1 + this.players.length);
    } else {
      // Hot Potato deals one card each when each deal begins.
      this.centre = null;
      this.drawPile = deck;
    }
    this.phase = 'countdown';
    this.countdownEndsAt = now + COUNTDOWN_MS;
    this.roundId = 0;
    this.claims = [];
    this.settleDeadline = null;
    this.lastWin = null;
    this.result = null;
    this.nextRank = 1;
    return { countdownMs: COUNTDOWN_MS };
  }

  beginPlay(now) {
    if (this.phase !== 'countdown') return false;
    this.phase = 'playing';
    this.countdownEndsAt = null;
    if (this.mode === 'hot-potato') this.startDeal();
    this.openRound(now);
    return true;
  }

  drawCard() {
    if (this.drawPile.length === 0) this.drawPile = shuffle(this.played.splice(0));
    return this.drawPile.shift();
  }

  startDeal() {
    this.deal += 1;
    this.players.forEach((player) => {
      if (player.pile.length) this.played.push(...player.pile);
      player.pile = player.left || player.waiting ? [] : [this.drawCard()];
      player.lockedUntil = 0;
    });
  }

  // Hot Potato: the other player this tap passes to. Your top card shares
  // exactly one picture with each other player's top card; when the tapped
  // picture is on several of their cards, it goes to the next one round the
  // table after you.
  potatoTarget(player, itemId) {
    if (!player.pile[0].items.includes(itemId)) return null;
    const start = this.players.indexOf(player);
    for (let step = 1; step < this.players.length; step += 1) {
      const other = this.players[(start + step) % this.players.length];
      // A player who is away cannot be passed to, so nobody loses a deal while offline.
      if (!other.left && other.connected && other.pile.length && other.pile[0].items.includes(itemId)) return other;
    }
    return null;
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
    const target = this.mode === 'hot-potato' ? this.potatoTarget(player, itemId) : null;
    const correct = this.mode === 'hot-potato' ? Boolean(target) : topCard.items.includes(itemId) && this.centre.items.includes(itemId);
    if (!correct) {
      player.misses += 1;
      player.lockedUntil = now + LOCKOUT_MS;
      return { result: 'wrong', lockoutMs: LOCKOUT_MS };
    }
    const checkedMs = this.checkedReaction(player, Number(reactionMs), now);
    this.claims.push({ playerId: id, reactionMs: checkedMs, arrivedAt: now, itemId, targetId: target?.id });
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
    if (this.mode === 'tower') return this.settleTower(winner, winningClaim, now);
    if (this.mode === 'hot-potato') return this.settleHotPotato(winner, winningClaim, now);
    const card = winner.pile.shift();
    const itemId = card.items.find((item) => this.centre.items.includes(item));
    this.played.push(this.centre);
    this.centre = card;
    winner.wins += 1;
    if (winner.pile.length === 0) winner.rank = this.nextRank++;
    this.lastWin = { name: winner.name, itemId, roundId: this.roundId, reactionMs: Math.round(winningClaim.reactionMs) };
    if (!this.finishIfDecided(now)) this.openRound(now);
    return { winnerId: winner.id };
  }

  // The Tower: the winner takes the middle card onto their tower, where it
  // becomes their card to play, and the next card comes off the deck.
  settleTower(winner, claim, now) {
    const won = this.centre;
    winner.pile.unshift(won);
    winner.wins += 1;
    this.lastWin = { name: winner.name, itemId: claim.itemId, roundId: this.roundId, reactionMs: Math.round(claim.reactionMs) };
    if (this.drawPile.length === 0) this.finishByScore();
    else {
      this.centre = this.drawPile.shift();
      this.openRound(now);
    }
    return { winnerId: winner.id };
  }

  // Hot Potato: the winner's whole stack goes on top of the target's, so the
  // target now plays the winner's card and the winner is safe for this deal.
  settleHotPotato(winner, claim, now) {
    const target = this.player(claim.targetId);
    target.pile = [...winner.pile, ...target.pile];
    winner.pile = [];
    winner.wins += 1;
    this.lastWin = { name: winner.name, to: target.name, itemId: claim.itemId, roundId: this.roundId, reactionMs: Math.round(claim.reactionMs) };
    this.endDealIfDecided(now);
    if (this.phase === 'playing') this.openRound(now);
    return { winnerId: winner.id };
  }

  // A Hot Potato deal ends when one player holds every card: they lose it.
  // When a departure leaves fewer than two holders, the deal ends with no
  // loser. Returns true when the deal ended.
  endDealIfDecided(now, byDeparture = false) {
    if (this.mode !== 'hot-potato' || this.phase !== 'playing') return false;
    const holders = this.players.filter((item) => !item.left && item.pile.length > 0);
    if (holders.length > 1) return false;
    const loser = byDeparture ? null : holders[0];
    if (loser) loser.losses += 1;
    this.lastDeal = { deal: this.deal, loser: loser ? loser.name : null, cards: loser ? loser.pile.length : 0 };
    this.claims = [];
    this.settleDeadline = null;
    if (this.deal >= HOT_POTATO_DEALS || this.inGame().length < 2) {
      this.finishByScore();
      return true;
    }
    this.phase = 'countdown';
    this.countdownEndsAt = now + DEAL_BREAK_MS;
    return true;
  }

  // Tower and Hot Potato rank everyone still seated together at the end:
  // tallest tower first, or fewest lost deals first. Equal scores share a place.
  finishByScore() {
    const seated = this.inGame();
    const score = (player) => (this.mode === 'tower' ? -player.pile.length : player.losses);
    seated.forEach((player) => { player.rank = 1 + seated.filter((other) => score(other) < score(player)).length; });
    this.keepResult();
    this.phase = 'finished';
    this.claims = [];
    this.settleDeadline = null;
    this.countdownEndsAt = null;
  }

  // Nobody found a match in time. Every pair of cards shares an item, so any
  // other card works as the new middle card: an undealt spare, else an
  // earlier middle card. With neither (only possible on the first card),
  // everyone's top card goes to the bottom of their pile instead. Nobody
  // gains or loses cards either way.
  refreshRound(now) {
    if (this.phase !== 'playing' || this.claims.length > 0) return false;
    if (this.mode === 'tower') {
      // The stuck card goes under the deck. With no deck left, the game ends.
      if (this.drawPile.length === 0) {
        this.finishByScore();
        return true;
      }
      this.drawPile.push(this.centre);
      this.centre = this.drawPile.shift();
      this.refreshedRoundId = this.roundId;
      this.openRound(now);
      return true;
    }
    if (this.mode === 'hot-potato') {
      // Every holder gets a fresh top card in place of the stuck one.
      this.racers().forEach((player) => {
        this.played.push(player.pile[0]);
        player.pile[0] = this.drawCard();
      });
      this.refreshedRoundId = this.roundId;
      this.openRound(now);
      return true;
    }
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

  finishIfDecided(now = 0, byDeparture = false) {
    if (this.mode !== 'race') {
      if (this.inGame().length < 2) {
        this.finishByScore();
        return true;
      }
      return this.endDealIfDecided(now, byDeparture);
    }
    const racers = this.racers();
    if (racers.length > 1) return false;
    racers.forEach((player) => { player.rank = this.nextRank++; });
    this.keepResult();
    this.phase = 'finished';
    this.claims = [];
    this.settleDeadline = null;
    this.countdownEndsAt = null;
    return true;
  }

  // Keeps the standings as the game ended, so the results screen does not
  // change when someone leaves or the host picks the next game.
  keepResult() {
    this.result = {
      mode: this.mode,
      players: this.players.filter((item) => !item.waiting).map((item) => ({
        name: item.name,
        rank: item.rank,
        left: item.left,
        wins: item.wins,
        misses: item.misses,
        losses: item.losses,
        averageSpotMs: item.spotCount ? Math.round(item.spotTotalMs / item.spotCount) : null,
        tower: item.pile.length,
      })),
    };
  }

  // What an invite link shows before joining.
  summary() {
    const host = this.host();
    return { roomCode: this.roomCode, hostName: host ? host.name : null, mode: this.mode, phase: this.phase, seats: this.players.filter((item) => !item.left).length, maxPlayers: this.maxPlayers() };
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
      mode: this.mode,
      deal: this.deal,
      totalDeals: HOT_POTATO_DEALS,
      lastDeal: this.lastDeal,
      deckLeft: this.mode === 'tower' ? this.drawPile.length : null,
      roundId: this.roundId,
      countdownMs: this.countdownEndsAt ? Math.max(0, Math.ceil(this.countdownEndsAt - now)) : null,
      roundEndsInMs: this.phase === 'playing' ? Math.max(0, Math.ceil(this.roundEndsAt - now)) : null,
      refreshedRoundId: this.refreshedRoundId,
      minPlayers: MIN_PLAYERS,
      maxPlayers: this.maxPlayers(),
      isHost: Boolean(me && host && me.sessionToken === host.sessionToken),
      hostName: host ? host.name : null,
      canStart: this.canStart(),
      centre: this.phase === 'lobby' ? null : this.centre,
      lastWin: this.lastWin,
      result: this.phase === 'finished' ? this.result : null,
      you: me ? {
        name: me.name,
        cardsLeft: me.pile.length,
        topCard: this.phase === 'playing' || this.phase === 'countdown' ? me.pile[0] || null : null,
        rank: me.rank,
        waiting: me.waiting,
        lockoutMs: Math.max(0, Math.ceil(me.lockedUntil - now)),
      } : null,
      players: seated.map((item) => ({
        name: item.name,
        cardsLeft: item.pile.length,
        connected: item.connected,
        left: item.left,
        rank: item.rank,
        waiting: item.waiting,
        isYou: item === me,
        isHost: Boolean(host && item.sessionToken === host.sessionToken),
        reconnectMs: !item.connected && item.removeAt ? Math.max(0, Math.ceil(item.removeAt - now)) : null,
        wins: item.wins,
        misses: item.misses,
        averageSpotMs: item.spotCount ? Math.round(item.spotTotalMs / item.spotCount) : null,
        losses: item.losses,
        // Hot Potato shows everyone's top card, because you match against theirs.
        topCard: this.mode === 'hot-potato' && this.phase === 'playing' ? item.pile[0] || null : null,
      })),
    };
  }
}

module.exports = { KitchenClashGame, MODES, HOT_POTATO_DEALS, DEAL_BREAK_MS, MIN_PLAYERS, MAX_PLAYERS, LOCKOUT_MS, MIN_REACTION_MS, COUNTDOWN_MS, ROUND_IDLE_MS };
