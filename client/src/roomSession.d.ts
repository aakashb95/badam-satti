export interface RoomSession {
  roomCode: string;
  username: string;
  sessionToken: string;
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export function loadTabRoomSession(sessionStorage?: StorageLike): RoomSession | null;
export function loadMostRecentSavedRoomSession(localStorage?: StorageLike): RoomSession | null;
export function findSavedRoomSession(
  roomCode: string,
  username: string,
  sessionStorage?: StorageLike,
  localStorage?: StorageLike,
): RoomSession | null;
export function findSavedRoomSessionForRoom(
  roomCode: string,
  sessionStorage?: StorageLike,
  localStorage?: StorageLike,
): RoomSession | null;
export function saveRoomSession(
  value: RoomSession,
  sessionStorage?: StorageLike,
  localStorage?: StorageLike,
  now?: number,
): void;
export function clearRoomSession(
  value?: RoomSession | null,
  sessionStorage?: StorageLike,
  localStorage?: StorageLike,
): void;
export const roomSessionStorageKeys: {
  legacy: string;
  tab: string;
  saved: string;
};
