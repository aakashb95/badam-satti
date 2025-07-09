const sqlite3 = require('sqlite3').verbose();
const path = require('path');

class Database {
  constructor() {
    this.db = null;
    this.init();
  }

  init() {
    const dbPath = path.join(__dirname, 'badam-satti.db');
    
    this.db = new sqlite3.Database(dbPath, (err) => {
      if (err) {
        console.error('Error opening database:', err);
        process.exit(1);
      }
      console.log('✅ Connected to SQLite database');
    });

    this.createTables();
  }

  createTables() {
    const createGameRoomsTable = `
      CREATE TABLE IF NOT EXISTS game_rooms (
        room_code TEXT PRIMARY KEY,
        game_state TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        is_active BOOLEAN DEFAULT 1
      )
    `;

    const createPlayersTable = `
      CREATE TABLE IF NOT EXISTS players (
        id TEXT PRIMARY KEY,
        username TEXT NOT NULL,
        room_code TEXT NOT NULL,
        socket_id TEXT,
        connected BOOLEAN DEFAULT 1,
        disconnected_at DATETIME,
        can_reconnect BOOLEAN DEFAULT 0,
        reconnect_timeout DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (room_code) REFERENCES game_rooms(room_code) ON DELETE CASCADE
      )
    `;

    const createRateLimitTable = `
      CREATE TABLE IF NOT EXISTS rate_limits (
        ip_address TEXT PRIMARY KEY,
        request_count INTEGER DEFAULT 0,
        window_start DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `;

    this.db.serialize(() => {
      this.db.run(createGameRoomsTable);
      this.db.run(createPlayersTable);
      this.db.run(createRateLimitTable);
      
      // Add migration for existing databases
      this.migratePlayersTable();
    });
  }

  migratePlayersTable() {
    // Check if new columns exist and add them if they don't
    this.db.all("PRAGMA table_info(players)", (err, columns) => {
      if (err) {
        console.error('Error checking table structure:', err);
        return;
      }

      const columnNames = columns.map(col => col.name);
      
      if (!columnNames.includes('disconnected_at')) {
        this.db.run('ALTER TABLE players ADD COLUMN disconnected_at DATETIME', (err) => {
          if (err) console.error('Error adding disconnected_at column:', err);
          else console.log('✅ Added disconnected_at column to players table');
        });
      }
      
      if (!columnNames.includes('can_reconnect')) {
        this.db.run('ALTER TABLE players ADD COLUMN can_reconnect BOOLEAN DEFAULT 0', (err) => {
          if (err) console.error('Error adding can_reconnect column:', err);
          else console.log('✅ Added can_reconnect column to players table');
        });
      }
      
      if (!columnNames.includes('reconnect_timeout')) {
        this.db.run('ALTER TABLE players ADD COLUMN reconnect_timeout DATETIME', (err) => {
          if (err) console.error('Error adding reconnect_timeout column:', err);
          else console.log('✅ Added reconnect_timeout column to players table');
        });
      }
    });
  }

  // Game room operations
  async saveGameRoom(roomCode, gameState) {
    return new Promise((resolve, reject) => {
      const stmt = this.db.prepare(`
        INSERT OR REPLACE INTO game_rooms (room_code, game_state, updated_at)
        VALUES (?, ?, CURRENT_TIMESTAMP)
      `);
      
      stmt.run([roomCode, JSON.stringify(gameState)], (err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
      
      stmt.finalize();
    });
  }

  async getGameRoom(roomCode) {
    return new Promise((resolve, reject) => {
      this.db.get(
        'SELECT * FROM game_rooms WHERE room_code = ? AND is_active = 1',
        [roomCode],
        (err, row) => {
          if (err) {
            reject(err);
          } else if (row) {
            resolve({
              ...row,
              game_state: JSON.parse(row.game_state)
            });
          } else {
            resolve(null);
          }
        }
      );
    });
  }

  async getAllActiveRooms() {
    return new Promise((resolve, reject) => {
      this.db.all(
        'SELECT room_code, created_at, updated_at FROM game_rooms WHERE is_active = 1',
        [],
        (err, rows) => {
          if (err) {
            reject(err);
          } else {
            resolve(rows);
          }
        }
      );
    });
  }

  async deactivateRoom(roomCode) {
    return new Promise((resolve, reject) => {
      this.db.run(
        'UPDATE game_rooms SET is_active = 0, updated_at = CURRENT_TIMESTAMP WHERE room_code = ?',
        [roomCode],
        (err) => {
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        }
      );
    });
  }

  // Player operations
  async savePlayer(playerId, username, roomCode, socketId) {
    return new Promise((resolve, reject) => {
      const stmt = this.db.prepare(`
        INSERT OR REPLACE INTO players (id, username, room_code, socket_id, connected, updated_at)
        VALUES (?, ?, ?, ?, 1, CURRENT_TIMESTAMP)
      `);
      
      stmt.run([playerId, username, roomCode, socketId], (err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
      
      stmt.finalize();
    });
  }

  async getPlayer(playerId) {
    return new Promise((resolve, reject) => {
      this.db.get(
        'SELECT * FROM players WHERE id = ?',
        [playerId],
        (err, row) => {
          if (err) {
            reject(err);
          } else {
            resolve(row);
          }
        }
      );
    });
  }

  async getPlayerByUsername(username, roomCode) {
    return new Promise((resolve, reject) => {
      this.db.get(
        'SELECT * FROM players WHERE username = ? AND room_code = ?',
        [username, roomCode],
        (err, row) => {
          if (err) {
            reject(err);
          } else {
            resolve(row);
          }
        }
      );
    });
  }

  async updatePlayerConnection(playerId, socketId, connected) {
    return new Promise((resolve, reject) => {
      this.db.run(
        'UPDATE players SET socket_id = ?, connected = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [socketId, connected, playerId],
        (err) => {
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        }
      );
    });
  }

  async getPlayersInRoom(roomCode) {
    return new Promise((resolve, reject) => {
      this.db.all(
        'SELECT * FROM players WHERE room_code = ?',
        [roomCode],
        (err, rows) => {
          if (err) {
            reject(err);
          } else {
            resolve(rows);
          }
        }
      );
    });
  }

  async setPlayerDisconnected(playerId, canReconnect = false, reconnectTimeoutMinutes = 10) {
    return new Promise((resolve, reject) => {
      const reconnectTimeout = canReconnect ? 
        new Date(Date.now() + reconnectTimeoutMinutes * 60 * 1000) : null;
      
      this.db.run(
        'UPDATE players SET connected = 0, disconnected_at = CURRENT_TIMESTAMP, can_reconnect = ?, reconnect_timeout = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [canReconnect ? 1 : 0, reconnectTimeout?.toISOString(), playerId],
        (err) => {
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        }
      );
    });
  }

  async attemptPlayerReconnection(username, roomCode, newSocketId) {
    return new Promise((resolve, reject) => {
      // Check if player can reconnect
      this.db.get(
        'SELECT * FROM players WHERE username = ? AND room_code = ? AND can_reconnect = 1 AND reconnect_timeout > CURRENT_TIMESTAMP',
        [username, roomCode],
        (err, row) => {
          if (err) {
            reject(err);
          } else if (row) {
            // Player can reconnect - update their socket ID and connection status
            this.db.run(
              'UPDATE players SET socket_id = ?, connected = 1, can_reconnect = 0, reconnect_timeout = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
              [newSocketId, row.id],
              (err) => {
                if (err) {
                  reject(err);
                } else {
                  resolve({
                    canReconnect: true,
                    playerId: row.id,
                    player: row
                  });
                }
              }
            );
          } else {
            resolve({ canReconnect: false });
          }
        }
      );
    });
  }

  async cleanupExpiredReconnections() {
    return new Promise((resolve, reject) => {
      this.db.run(
        'UPDATE players SET can_reconnect = 0, reconnect_timeout = NULL WHERE reconnect_timeout < CURRENT_TIMESTAMP',
        [],
        function(err) {
          if (err) {
            reject(err);
          } else {
            resolve(this.changes);
          }
        }
      );
    });
  }

  async getReconnectablePlayersInRoom(roomCode) {
    return new Promise((resolve, reject) => {
      this.db.all(
        'SELECT * FROM players WHERE room_code = ? AND can_reconnect = 1 AND reconnect_timeout > CURRENT_TIMESTAMP',
        [roomCode],
        (err, rows) => {
          if (err) {
            reject(err);
          } else {
            resolve(rows);
          }
        }
      );
    });
  }

  // Rate limiting operations
  async checkRateLimit(ipAddress, maxRequests = 10, windowMinutes = 1) {
    return new Promise((resolve, reject) => {
      const windowStart = new Date(Date.now() - windowMinutes * 60 * 1000);
      
      this.db.get(
        'SELECT * FROM rate_limits WHERE ip_address = ?',
        [ipAddress],
        (err, row) => {
          if (err) {
            reject(err);
            return;
          }

          if (!row) {
            // First request from this IP
            this.db.run(
              'INSERT INTO rate_limits (ip_address, request_count) VALUES (?, 1)',
              [ipAddress],
              (err) => {
                if (err) {
                  reject(err);
                } else {
                  resolve({ allowed: true, remaining: maxRequests - 1 });
                }
              }
            );
          } else {
            const lastWindow = new Date(row.window_start);
            
            if (lastWindow < windowStart) {
              // Reset window
              this.db.run(
                'UPDATE rate_limits SET request_count = 1, window_start = CURRENT_TIMESTAMP WHERE ip_address = ?',
                [ipAddress],
                (err) => {
                  if (err) {
                    reject(err);
                  } else {
                    resolve({ allowed: true, remaining: maxRequests - 1 });
                  }
                }
              );
            } else if (row.request_count >= maxRequests) {
              // Rate limit exceeded
              resolve({ allowed: false, remaining: 0 });
            } else {
              // Increment counter
              this.db.run(
                'UPDATE rate_limits SET request_count = request_count + 1 WHERE ip_address = ?',
                [ipAddress],
                (err) => {
                  if (err) {
                    reject(err);
                  } else {
                    resolve({ allowed: true, remaining: maxRequests - row.request_count - 1 });
                  }
                }
              );
            }
          }
        }
      );
    });
  }

  // Cleanup operations
  async cleanupInactiveRooms(hoursOld = 24) {
    return new Promise((resolve, reject) => {
      const cutoffTime = new Date(Date.now() - hoursOld * 60 * 60 * 1000);
      
      this.db.run(
        'UPDATE game_rooms SET is_active = 0 WHERE updated_at < ? AND is_active = 1',
        [cutoffTime.toISOString()],
        function(err) {
          if (err) {
            reject(err);
          } else {
            resolve(this.changes);
          }
        }
      );
    });
  }

  async cleanupRateLimits(hoursOld = 2) {
    return new Promise((resolve, reject) => {
      const cutoffTime = new Date(Date.now() - hoursOld * 60 * 60 * 1000);
      
      this.db.run(
        'DELETE FROM rate_limits WHERE updated_at < ?',
        [cutoffTime.toISOString()],
        function(err) {
          if (err) {
            reject(err);
          } else {
            resolve(this.changes);
          }
        }
      );
    });
  }

  // Health check
  async healthCheck() {
    return new Promise((resolve, reject) => {
      this.db.get('SELECT COUNT(*) as active_rooms FROM game_rooms WHERE is_active = 1', (err, row) => {
        if (err) {
          reject(err);
        } else {
          resolve({
            database: 'healthy',
            active_rooms: row.active_rooms,
            timestamp: new Date().toISOString()
          });
        }
      });
    });
  }

  close() {
    if (this.db) {
      this.db.close((err) => {
        if (err) {
          console.error('Error closing database:', err);
        } else {
          console.log('📦 Database connection closed');
        }
      });
    }
  }
}

module.exports = Database;