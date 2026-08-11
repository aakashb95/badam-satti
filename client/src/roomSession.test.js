import assert from 'node:assert/strict';
import test from 'node:test';
import {
  clearRoomSession,
  findSavedRoomSession,
  loadMostRecentSavedRoomSession,
  loadTabRoomSession,
  roomSessionStorageKeys,
  saveRoomSession,
} from './roomSession.js';

class MemoryStorage {
  values = new Map();

  getItem(key) {
    return this.values.get(key) ?? null;
  }

  setItem(key, value) {
    this.values.set(key, value);
  }

  removeItem(key) {
    this.values.delete(key);
  }
}

const firstSession = {
  roomCode: 'ABC123',
  username: 'First',
  sessionToken: '11111111-1111-4111-8111-111111111111',
};
const secondSession = {
  roomCode: 'XYZ789',
  username: 'Second',
  sessionToken: '22222222-2222-4222-8222-222222222222',
};

test('each tab keeps its own active room while recovery records keep both rooms', () => {
  const localStorage = new MemoryStorage();
  const firstTab = new MemoryStorage();
  const secondTab = new MemoryStorage();

  saveRoomSession(firstSession, firstTab, localStorage, 10);
  saveRoomSession(secondSession, secondTab, localStorage, 20);

  assert.deepEqual(loadTabRoomSession(firstTab), firstSession);
  assert.deepEqual(loadTabRoomSession(secondTab), secondSession);
  assert.deepEqual(findSavedRoomSession('ABC123', 'First', secondTab, localStorage), firstSession);
  assert.deepEqual(findSavedRoomSession('XYZ789', 'Second', firstTab, localStorage), secondSession);
});

test('clearing a stale tab does not clear a newer room in another tab', () => {
  const localStorage = new MemoryStorage();
  const staleTab = new MemoryStorage();
  const currentTab = new MemoryStorage();

  saveRoomSession(firstSession, staleTab, localStorage, 10);
  saveRoomSession(secondSession, currentTab, localStorage, 20);
  clearRoomSession(firstSession, staleTab, localStorage);

  assert.equal(loadTabRoomSession(staleTab), null);
  assert.deepEqual(loadTabRoomSession(currentTab), secondSession);
  assert.equal(findSavedRoomSession('ABC123', 'First', staleTab, localStorage), null);
  assert.deepEqual(findSavedRoomSession('XYZ789', 'Second', staleTab, localStorage), secondSession);
});

test('a new tab does not automatically take over a saved room from another tab', () => {
  const localStorage = new MemoryStorage();
  const firstTab = new MemoryStorage();
  const newTab = new MemoryStorage();

  saveRoomSession(firstSession, firstTab, localStorage, 10);

  assert.equal(loadTabRoomSession(newTab), null);
  assert.deepEqual(findSavedRoomSession('ABC123', 'First', newTab, localStorage), firstSession);
});

test('the old shared session is migrated once for existing players', () => {
  const localStorage = new MemoryStorage();
  const tabStorage = new MemoryStorage();
  localStorage.setItem(roomSessionStorageKeys.legacy, JSON.stringify(firstSession));

  assert.deepEqual(loadMostRecentSavedRoomSession(localStorage), firstSession);
  saveRoomSession(firstSession, tabStorage, localStorage, 10);
  assert.deepEqual(loadTabRoomSession(tabStorage), firstSession);
  assert.equal(localStorage.getItem(roomSessionStorageKeys.legacy), null);
});
