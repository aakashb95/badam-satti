const crypto = require("crypto");

class GameRoom {
  constructor(roomCode) {
    this.roomCode = roomCode;
    this.players = [];
    this.board = {
      hearts: { up: [], down: [] },
      diamonds: { up: [], down: [] },
      clubs: { up: [], down: [] },
      spades: { up: [], down: [] },
    };
    this.currentPlayerIndex = 0;
    this.started = false;
    this.deck = [];
    this.round = 1;
    this.roundsPlayed = 0;
    this.maxRounds = 7;
    this.gameFinished = false;
    this.playerScores = {};
    this.heartsSevenPlayerIndex = -1; // Track who played 7 of hearts
    this.gameStartMessage = null; // Message about who started the game
  }

  addPlayer(id, name) {
    if (this.players.length >= 11) return false;
    if (this.players.find((p) => p.id === id)) return false;

    this.players.push({
      id,
      name,
      cards: [],
      connected: true,
      totalScore: 0,
    });

    // Initialize score tracking
    this.playerScores[id] = 0;
    return true;
  }

  removePlayer(id, redistribute = false) {
    const playerIndex = this.players.findIndex((p) => p.id === id);
    if (playerIndex !== -1) {
      const [removed] = this.players.splice(playerIndex, 1);
      delete this.playerScores[id];

      // When requested, distribute the removed player's remaining cards
      if (
        redistribute &&
        removed.cards &&
        removed.cards.length &&
        this.players.length
      ) {
        let idx = 0;
        const suitOrder = { hearts: 0, diamonds: 1, clubs: 2, spades: 3 };
        removed.cards.forEach((card) => {
          this.players[idx % this.players.length].cards.push(card);
          idx++;
        });

        // Resort the hands for all players
        this.players.forEach((player) => {
          player.cards.sort((a, b) => {
            if (a.suit !== b.suit) {
              return suitOrder[a.suit] - suitOrder[b.suit];
            }
            return a.rank - b.rank;
          });
        });
      }

      // Adjust current player index in case it now exceeds player count
      if (this.currentPlayerIndex >= this.players.length) {
        this.currentPlayerIndex = 0;
      }
    }
  }

  setPlayerDisconnected(id) {
    const player = this.players.find((p) => p.id === id);
    if (player) {
      player.connected = false;
    }
  }

  reconnectPlayer(oldId, newId, newSocketId) {
    const player = this.players.find((p) => p.id === oldId);
    if (player) {
      player.id = newId;
      player.connected = true;
      // Update score tracking
      this.playerScores[newId] = this.playerScores[oldId] || 0;
      delete this.playerScores[oldId];
      return true;
    }
    return false;
  }

  startGame() {
    if (this.players.length <= 1) return false;
    if (this.started) return false;

    this.started = true;
    this.resetBoard();
    this.deck = this.createDeck();
    this.shuffleDeck();
    this.dealCards();

    // Find who has 7 of hearts
    this.heartsSevenPlayerIndex = this.players.findIndex((p) =>
      p.cards.some((c) => c.suit === "hearts" && c.rank === 7)
    );

    // Set current player to the one with 7♥
    this.currentPlayerIndex = this.heartsSevenPlayerIndex;

    // Set game start message
    this.gameStartMessage = `${
      this.players[this.heartsSevenPlayerIndex].name
    } started the game`;

    // Auto-play 7 of hearts
    const heartsSevenCard = { suit: "hearts", rank: 7 };
    this.playCard(
      this.players[this.heartsSevenPlayerIndex].id,
      heartsSevenCard,
      true
    );

    return true;
  }

  resetBoard() {
    this.board = {
      hearts: { up: [], down: [] },
      diamonds: { up: [], down: [] },
      clubs: { up: [], down: [] },
      spades: { up: [], down: [] },
    };
  }

  createDeck() {
    const suits = ["hearts", "diamonds", "clubs", "spades"];
    const deck = [];
    for (let suit of suits) {
      for (let rank = 1; rank <= 13; rank++) {
        deck.push({ suit, rank });
      }
    }
    return deck;
  }

  shuffleDeck() {
    // Perform multiple shuffle passes for better randomness
    for (let pass = 0; pass < 5; pass++) {
      // Fisher-Yates shuffle
      for (let i = this.deck.length - 1; i > 0; i--) {
        const j = crypto.randomInt(i + 1);
        [this.deck[i], this.deck[j]] = [this.deck[j], this.deck[i]];
      }
    }

    // Additional riffle shuffle simulation
    const riffleShuffles = 3;
    for (let r = 0; r < riffleShuffles; r++) {
      const splitPoint =
        Math.floor(this.deck.length / 2) + Math.floor(Math.random() * 6) - 3;
      const leftHalf = this.deck.slice(0, splitPoint);
      const rightHalf = this.deck.slice(splitPoint);

      this.deck = [];
      let leftIndex = 0;
      let rightIndex = 0;

      while (leftIndex < leftHalf.length && rightIndex < rightHalf.length) {
        // Randomly choose which half to take from with slight bias
        const takeFromLeft = Math.random() < 0.5 + (Math.random() - 0.5) * 0.2;

        if (takeFromLeft && leftIndex < leftHalf.length) {
          this.deck.push(leftHalf[leftIndex++]);
        } else if (rightIndex < rightHalf.length) {
          this.deck.push(rightHalf[rightIndex++]);
        }
      }

      // Add remaining cards
      while (leftIndex < leftHalf.length) {
        this.deck.push(leftHalf[leftIndex++]);
      }
      while (rightIndex < rightHalf.length) {
        this.deck.push(rightHalf[rightIndex++]);
      }
    }

    // Final Fisher-Yates shuffle
    for (let i = this.deck.length - 1; i > 0; i--) {
      const j = crypto.randomInt(i + 1);
      [this.deck[i], this.deck[j]] = [this.deck[j], this.deck[i]];
    }
  }

  dealCards() {
    // Clear all player cards
    this.players.forEach((p) => (p.cards = []));

    const totalCards = 52;
    const cardsPerPlayer = Math.floor(totalCards / this.players.length);
    let cardIndex = 0;

    // Deal equal number of cards to each player
    for (let i = 0; i < cardsPerPlayer; i++) {
      for (let player of this.players) {
        if (cardIndex < this.deck.length) {
          player.cards.push(this.deck[cardIndex++]);
        }
      }
    }

    // Deal remaining cards one by one
    let playerIndex = 0;
    while (cardIndex < this.deck.length) {
      this.players[playerIndex].cards.push(this.deck[cardIndex++]);
      playerIndex = (playerIndex + 1) % this.players.length;
    }

    // Removed per-player sorting to preserve random card order in hands
  }

  isValidMove(playerId, card) {
    const player = this.players.find((p) => p.id === playerId);
    if (!player || this.players[this.currentPlayerIndex].id !== playerId)
      return false;

    // Check if player has the card
    if (!player.cards.some((c) => c.suit === card.suit && c.rank === card.rank))
      return false;

    const suitBoard = this.board[card.suit];

    // If suit not started, must be 7
    if (suitBoard.up.length === 0 && suitBoard.down.length === 0) {
      return card.rank === 7;
    }

    // Check if we can play above the highest card
    if (suitBoard.up.length > 0) {
      const highestCard = suitBoard.up[suitBoard.up.length - 1];
      if (card.rank === highestCard + 1 && card.rank <= 13) {
        return true;
      }
    }

    // Check if we can play below the lowest card
    if (suitBoard.down.length > 0) {
      const lowestCard = suitBoard.down[suitBoard.down.length - 1];
      if (card.rank === lowestCard - 1 && card.rank >= 1) {
        return true;
      }
    }

    // If 7 has been played but no lower cards yet, allow 6
    if (suitBoard.down.length === 0 && suitBoard.up.includes(7)) {
      return card.rank === 6;
    }

    return false;
  }

  playCard(playerId, card, isHeartsSevenAutoPlay = false) {
    if (!this.isValidMove(playerId, card)) return false;
    if (this.gameFinished) return false; // Don't allow moves after game ends

    const player = this.players.find((p) => p.id === playerId);
    // Remove the card from player's hand
    player.cards = player.cards.filter(
      (c) => !(c.suit === card.suit && c.rank === card.rank)
    );

    const suitBoard = this.board[card.suit];

    // Place the card on the board
    if (suitBoard.up.length === 0 && suitBoard.down.length === 0) {
      // First card of the suit (should be 7)
      suitBoard.up.push(card.rank);
    } else if (
      suitBoard.up.length > 0 &&
      card.rank > suitBoard.up[suitBoard.up.length - 1]
    ) {
      // Card goes above current highest
      suitBoard.up.push(card.rank);
    } else {
      // Card goes below current lowest
      suitBoard.down.push(card.rank);
    }

    // Check if player won (first to empty hand)
    if (player.cards.length === 0) {
      this.finishGame(); // Call finishGame immediately when someone wins
    } else {
      // Advance turn normally - if it's 7♥ auto-play, this skips the starter's next turn
      this.nextTurn();
    }

    return true;
  }

  finishGame() {
    // Game is finished when one player empties their hand
    // Calculate final scores for all remaining cards
    this.players.forEach((player) => {
      const finalScore = this.calculatePlayerScore(player.cards);
      player.totalScore += finalScore; // Accumulate across rounds
      this.playerScores[player.id] = player.totalScore;
    });

    this.gameFinished = true;
  }

  calculatePlayerScore(cards) {
    return cards.reduce((sum, card) => {
      if (card.rank === 1) {
        return sum + 1; // Ace = 1 point
      } else if (card.rank === 11) {
        return sum + 11; // Jack = 11 points
      } else if (card.rank === 12) {
        return sum + 12; // Queen = 12 points
      } else if (card.rank === 13) {
        return sum + 13; // King = 13 points
      }
      return sum + card.rank; // Number cards = face value
    }, 0);
  }

  canPlayerPlay(playerId) {
    const player = this.players.find((p) => p.id === playerId);
    if (!player || this.players[this.currentPlayerIndex].id !== playerId)
      return false;

    return player.cards.some((card) => this.isValidMove(playerId, card));
  }

  passTurn(playerId) {
    if (this.players[this.currentPlayerIndex].id !== playerId) return false;
    if (this.gameFinished) return false; // Don't allow passes after game ends

    // Check if player really can't play
    if (this.canPlayerPlay(playerId)) {
      return false; // Player has valid moves, can't pass
    }

    this.nextTurn();
    return true;
  }

  nextTurn() {
    this.currentPlayerIndex =
      (this.currentPlayerIndex + 1) % this.players.length;

    // Skip disconnected players
    let attempts = 0;
    while (
      !this.players[this.currentPlayerIndex].connected &&
      attempts < this.players.length
    ) {
      this.currentPlayerIndex =
        (this.currentPlayerIndex + 1) % this.players.length;
      attempts++;
    }
  }

  checkWinner() {
    return this.players.some((p) => p.cards.length === 0) || this.gameFinished;
  }

  getWinner() {
    const winner = this.players.find((p) => p.cards.length === 0);

    // Calculate final scores for all players
    const finalScores = this.players
      .map((p) => ({
        name: p.name,
        score: this.calculatePlayerScore(p.cards),
        isWinner: p.cards.length === 0,
        remainingCards: p.cards.length > 0 ? p.cards : [],
      }))
      .sort((a, b) => a.score - b.score); // Sort by score (lowest first)

    return {
      type: "game_complete",
      winner: winner.name,
      finalScores: finalScores,
    };
  }

  getPlayerCards(playerId) {
    const player = this.players.find((p) => p.id === playerId);
    return player ? player.cards : [];
  }

  getValidMoves(playerId) {
    const player = this.players.find((p) => p.id === playerId);
    if (!player || this.players[this.currentPlayerIndex].id !== playerId)
      return [];

    return player.cards.filter((card) => this.isValidMove(playerId, card));
  }

  isCardPlayableOnBoard(card) {
    const suitBoard = this.board[card.suit];

    // If suit not started, must be 7
    if (suitBoard.up.length === 0 && suitBoard.down.length === 0) {
      return card.rank === 7;
    }

    // Check if we can play above the highest card
    if (suitBoard.up.length > 0) {
      const highestCard = suitBoard.up[suitBoard.up.length - 1];
      if (card.rank === highestCard + 1 && card.rank <= 13) {
        return true;
      }
    }

    // Check if we can play below the lowest card
    if (suitBoard.down.length > 0) {
      const lowestCard = suitBoard.down[suitBoard.down.length - 1];
      if (card.rank === lowestCard - 1 && card.rank >= 1) {
        return true;
      }
    }

    // If 7 has been played but no lower cards yet, allow 6
    if (suitBoard.down.length === 0 && suitBoard.up.includes(7)) {
      return card.rank === 6;
    }

    return false;
  }

  getPlayableCardsOnBoard(cards) {
    return cards.filter(card => this.isCardPlayableOnBoard(card));
  }

  analyzePlayerPosition(player) {
    const cardCount = player.cards.length;
    
    if (cardCount === 0) return 'none';
    if (cardCount > 3) return 'none';

    // Check if ALL cards are immediately playable on current board (turn-agnostic)
    const playableCards = this.getPlayableCardsOnBoard(player.cards);
    const allCardsPlayable = cardCount > 0 && playableCards.length === cardCount;
    
    if (allCardsPlayable) {
      return 'critical'; // All cards can be played on current board
    }
    
    if (cardCount <= 3) {
      return 'warning'; // Few cards but not all playable
    }
    
    return 'none';
  }

  getState() {
    return {
      roomCode: this.roomCode,
      players: this.players.map((p) => ({
        name: p.name,
        cardCount: p.cards.length,
        connected: p.connected,
        isCurrentPlayer: this.players[this.currentPlayerIndex]?.id === p.id,
        totalScore: p.totalScore,
        indicator: this.started && !this.gameFinished ? this.analyzePlayerPosition(p) : 'none',
      })),
      board: this.board,
      started: this.started,
      round: this.round,
      roundsPlayed: this.roundsPlayed,
      maxRounds: this.maxRounds,
      gameFinished: this.gameFinished,
      currentPlayerName: this.players[this.currentPlayerIndex]?.name,
      gameStartMessage: this.gameStartMessage,
    };
  }

  getPlayerState(playerId) {
    const state = this.getState();
    state.myCards = this.getPlayerCards(playerId);
    state.validMoves = this.getValidMoves(playerId);
    state.canPass = !this.canPlayerPlay(playerId);
    return state;
  }

  setPlayerDisconnected(playerId) {
    const player = this.players.find((p) => p.id === playerId);
    if (player) {
      player.connected = false;
    }
  }

  setPlayerConnected(playerId) {
    const player = this.players.find((p) => p.id === playerId);
    if (player) {
      player.connected = true;
    }
  }

  getConnectedPlayersCount() {
    return this.players.filter((p) => p.connected).length;
  }

  isRoomEmpty() {
    return this.getConnectedPlayersCount() === 0;
  }

  // Check if room is truly empty (no connected players and no reconnectable players)
  isRoomEmptyForCleanup() {
    return this.getConnectedPlayersCount() === 0;
  }

  continueRound() {
    if (!this.gameFinished) return false;

    // Advance round counters
    this.round++;
    this.roundsPlayed++;
    this.gameFinished = false;

    // Reset board and redeal
    this.resetBoard();
    this.deck = this.createDeck();
    this.shuffleDeck();
    this.dealCards();

    // Determine the player who has 7♥ and make them start
    this.heartsSevenPlayerIndex = this.players.findIndex((p) =>
      p.cards.some((c) => c.suit === "hearts" && c.rank === 7)
    );

    // Set current player to the one with 7♥
    this.currentPlayerIndex = this.heartsSevenPlayerIndex;

    // Set game start message
    this.gameStartMessage = `${
      this.players[this.heartsSevenPlayerIndex].name
    } started the game`;

    const heartsSevenCard = { suit: "hearts", rank: 7 };
    this.playCard(
      this.players[this.heartsSevenPlayerIndex].id,
      heartsSevenCard,
      true
    );

    return true;
  }
}

module.exports = { GameRoom };
