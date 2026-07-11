const crypto = require('crypto');

const SUITS = ['hearts', 'diamonds', 'clubs', 'spades'];
const CARDINALS = ['north', 'east', 'south', 'west'];
const CORNERS = ['northWest', 'northEast', 'southEast', 'southWest'];
const PILE_IDS = [...CARDINALS, ...CORNERS];

const colorOf = (card) => (card.suit === 'hearts' || card.suit === 'diamonds' ? 'red' : 'black');
const cardKey = (card) => `${card.rank}:${card.suit}`;
const cloneCard = (card) => ({ suit: card.suit, rank: card.rank });

function createDeck() {
  return SUITS.flatMap((suit) => Array.from({ length: 13 }, (_, index) => ({ suit, rank: index + 1 })));
}

function shuffle(cards, randomInt = crypto.randomInt) {
  const deck = cards.map(cloneCard);
  for (let index = deck.length - 1; index > 0; index -= 1) {
    const swapIndex = randomInt(index + 1);
    [deck[index], deck[swapIndex]] = [deck[swapIndex], deck[index]];
  }
  return deck;
}

function canStack(movingCard, targetCard) {
  return movingCard.rank === targetCard.rank - 1 && colorOf(movingCard) !== colorOf(targetCard);
}

class KingsCornerGame {
  constructor(roomCode, options = {}) {
    this.roomCode = roomCode;
    this.players = [];
    this.started = false;
    this.finished = false;
    this.winnerId = null;
    this.dealerIndex = 0;
    this.currentPlayerIndex = 0;
    this.stock = [];
    this.piles = Object.fromEntries(PILE_IDS.map((id) => [id, []]));
    this.turnNumber = 0;
    this.lastAction = null;
    this.turnBoardSignatures = new Set();
    this.makeDeck = options.makeDeck || (() => shuffle(createDeck()));
  }

  addPlayer(id, name, sessionToken = crypto.randomUUID()) {
    if (this.started || this.players.length >= 4 || this.players.some((player) => player.name.toLowerCase() === name.toLowerCase())) return null;
    const player = { id, name, sessionToken, connected: true, hand: [] };
    this.players.push(player);
    return player;
  }

  reconnectPlayer(sessionToken, id) {
    const player = this.players.find((item) => item.sessionToken === sessionToken);
    if (!player) return null;
    player.id = id;
    player.connected = true;
    return player;
  }

  disconnectPlayer(id) {
    const player = this.players.find((item) => item.id === id);
    if (player) player.connected = false;
  }

  start(playerId) {
    if (this.started || this.players.length < 2 || this.players[0].id !== playerId) return false;
    this.started = true;
    this.stock = this.makeDeck();
    for (let round = 0; round < 7; round += 1) {
      for (let offset = 1; offset <= this.players.length; offset += 1) {
        this.players[(this.dealerIndex + offset) % this.players.length].hand.push(this.stock.pop());
      }
    }
    CARDINALS.forEach((pileId) => this.dealStartingPile(pileId));
    this.currentPlayerIndex = (this.dealerIndex + 1) % this.players.length;
    this.beginTurn();
    return true;
  }

  dealStartingPile(pileId) {
    while (this.stock.length > 0) {
      const card = this.stock.pop();
      if (card.rank === 13) {
        const corner = CORNERS.find((id) => this.piles[id].length === 0);
        if (corner) this.piles[corner].push(card);
        else this.piles[pileId].push(card);
        if (!corner) return;
      } else {
        this.piles[pileId].push(card);
        return;
      }
    }
  }

  beginTurn() {
    this.turnNumber += 1;
    this.turnBoardSignatures = new Set([this.boardSignature()]);
    const player = this.currentPlayer();
    if (this.stock.length > 0) {
      const card = this.stock.pop();
      player.hand.push(card);
      this.lastAction = { type: 'draw', playerName: player.name };
    } else {
      this.lastAction = { type: 'turn_started', playerName: player.name };
    }
  }

  currentPlayer() {
    return this.players[this.currentPlayerIndex];
  }

  boardSignature(piles = this.piles) {
    return PILE_IDS.map((id) => `${id}:${piles[id].map(cardKey).join(',')}`).join('|');
  }

  canPlayCard(card, targetPileId) {
    if (!PILE_IDS.includes(targetPileId)) return false;
    const pile = this.piles[targetPileId];
    if (pile.length === 0) {
      if (card.rank === 13) return CORNERS.includes(targetPileId);
      return CARDINALS.includes(targetPileId);
    }
    return canStack(card, pile[pile.length - 1]);
  }

  handActions(playerId = this.currentPlayer()?.id) {
    const player = this.players.find((item) => item.id === playerId);
    if (!player || player.id !== this.currentPlayer()?.id || this.finished) return [];
    return player.hand.flatMap((card) => PILE_IDS.filter((targetPileId) => this.canPlayCard(card, targetPileId)).map((targetPileId) => ({
      type: 'play_card', card: cloneCard(card), targetPileId,
    })));
  }

  pileActions({ unseenOnly = false, progressiveOnly = false } = {}) {
    if (!this.started || this.finished) return [];
    const actions = [];
    for (const sourcePileId of PILE_IDS) {
      const source = this.piles[sourcePileId];
      if (source.length === 0) continue;
      const baseCard = source[0];
      const kingAnchoredInCorner = baseCard.rank === 13 && CORNERS.includes(sourcePileId);
      if (kingAnchoredInCorner) continue;
      for (const targetPileId of PILE_IDS) {
        if (sourcePileId === targetPileId) continue;
        const target = this.piles[targetPileId];
        const fillsEmptyCardinal = target.length === 0 && CARDINALS.includes(targetPileId);
        const movesKingToCorner = baseCard.rank === 13 && target.length === 0 && CORNERS.includes(targetPileId);
        if (baseCard.rank === 13 && !movesKingToCorner) continue;
        if (baseCard.rank !== 13 && target.length === 0 && !fillsEmptyCardinal) continue;
        if (progressiveOnly && fillsEmptyCardinal && !movesKingToCorner) continue;
        if (target.length > 0 && !canStack(baseCard, target[target.length - 1])) continue;
        const nextPiles = { ...this.piles, [sourcePileId]: [], [targetPileId]: [...target, ...source] };
        if (unseenOnly && this.turnBoardSignatures.has(this.boardSignature(nextPiles))) continue;
        actions.push({ type: 'move_pile', sourcePileId, targetPileId });
      }
    }
    return actions;
  }

  suggestedActions() {
    const handActions = this.handActions();
    const pileActions = this.pileActions({ unseenOnly: true, progressiveOnly: true });
    return [...handActions, ...pileActions];
  }

  playCard(playerId, card, targetPileId, automatic = false) {
    const player = this.players.find((item) => item.id === playerId);
    if (!player || player.id !== this.currentPlayer()?.id || this.finished) return false;
    const handIndex = player.hand.findIndex((item) => item.suit === card.suit && item.rank === card.rank);
    if (handIndex < 0 || !this.canPlayCard(player.hand[handIndex], targetPileId)) return false;
    const [played] = player.hand.splice(handIndex, 1);
    this.piles[targetPileId].push(played);
    this.turnBoardSignatures.add(this.boardSignature());
    this.lastAction = { type: automatic ? 'auto_play_card' : 'play_card', playerName: player.name, card: cloneCard(played), targetPileId };
    if (player.hand.length === 0) {
      this.finished = true;
      this.winnerId = player.id;
    }
    return true;
  }

  movePile(playerId, sourcePileId, targetPileId, automatic = false) {
    if (playerId !== this.currentPlayer()?.id || this.finished) return false;
    const legal = this.pileActions().some((action) => action.sourcePileId === sourcePileId && action.targetPileId === targetPileId);
    if (!legal) return false;
    this.piles[targetPileId].push(...this.piles[sourcePileId]);
    this.piles[sourcePileId] = [];
    this.turnBoardSignatures.add(this.boardSignature());
    this.lastAction = { type: automatic ? 'auto_move_pile' : 'move_pile', playerName: this.currentPlayer().name, sourcePileId, targetPileId };
    return true;
  }

  endTurn(playerId, automatic = false) {
    if (playerId !== this.currentPlayer()?.id || this.finished) return false;
    const previousPlayer = this.currentPlayer();
    this.currentPlayerIndex = (this.currentPlayerIndex + 1) % this.players.length;
    this.beginTurn();
    this.lastAction = { type: automatic ? 'auto_end_turn' : 'end_turn', playerName: previousPlayer.name };
    return true;
  }

  performAutoAction() {
    if (!this.started || this.finished) return null;
    const player = this.currentPlayer();
    const handAction = this.handActions()[0];
    if (handAction) {
      this.playCard(player.id, handAction.card, handAction.targetPileId, true);
      return handAction;
    }
    const pileAction = this.pileActions({ unseenOnly: true, progressiveOnly: true })[0];
    if (pileAction) {
      this.movePile(player.id, pileAction.sourcePileId, pileAction.targetPileId, true);
      return pileAction;
    }
    this.endTurn(player.id, true);
    return { type: 'end_turn' };
  }

  publicState(playerId) {
    const player = this.players.find((item) => item.id === playerId);
    const current = this.currentPlayer();
    return {
      roomCode: this.roomCode,
      started: this.started,
      finished: this.finished,
      winnerName: this.players.find((item) => item.id === this.winnerId)?.name || null,
      dealerName: this.players[this.dealerIndex]?.name || null,
      currentPlayerName: current?.name || null,
      isMyTurn: Boolean(player && current?.id === player.id),
      turnNumber: this.turnNumber,
      actionDeadline: this.actionDeadline || null,
      stockCount: this.stock.length,
      piles: Object.fromEntries(PILE_IDS.map((id) => [id, this.piles[id].map(cloneCard)])),
      players: this.players.map((item, index) => ({ name: item.name, connected: item.connected, cardCount: item.hand.length, isDealer: index === this.dealerIndex })),
      myHand: player?.hand.map(cloneCard) || [],
      handActions: player ? this.handActions(player.id) : [],
      pileActions: player && current?.id === player.id ? this.pileActions() : [],
      suggestedActions: player && current?.id === player.id ? this.suggestedActions() : [],
      lastAction: this.lastAction,
    };
  }
}

module.exports = { KingsCornerGame, CARDINALS, CORNERS, PILE_IDS, canStack, colorOf, createDeck, shuffle };
