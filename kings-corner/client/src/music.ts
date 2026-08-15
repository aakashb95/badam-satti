const MUSIC_STORAGE_KEY = 'kings-corner-background-music';
const MUSIC_VOLUME_STORAGE_KEY = 'kings-corner-background-music-volume';
const DEFAULT_VOLUME = 0.2;
const TRACKS = ['shanghai.mp3', 'slow-melt.mp3', 'zephyr.mp3', 'chamomile.mp3', 'while-coffee-brews.mp3', 'morning-routine.mp3'];

let enabled = readEnabled();
let volume = readVolume();
let player: HTMLAudioElement | null = null;
let trackIndex = 0;
let failedTrackCount = 0;
let listeningForVisibility = false;

function readEnabled() {
  try { return window.localStorage.getItem(MUSIC_STORAGE_KEY) === 'on'; } catch { return false; }
}

function readVolume() {
  try {
    const stored = window.localStorage.getItem(MUSIC_VOLUME_STORAGE_KEY);
    const value = stored === null ? DEFAULT_VOLUME : Number(stored);
    return Number.isFinite(value) && value >= 0 && value <= 1 ? value : DEFAULT_VOLUME;
  } catch { return DEFAULT_VOLUME; }
}

function trackUrl(index: number) {
  return `${import.meta.env.BASE_URL}music/${TRACKS[index]}`;
}

function playCurrentTrack() {
  if (!enabled || typeof document === 'undefined' || document.hidden) return;
  const audio = getPlayer();
  const source = trackUrl(trackIndex);
  if (!audio.src.endsWith(source)) {
    audio.src = source;
    audio.load();
  }
  void audio.play().catch(() => undefined);
}

function nextTrack() {
  trackIndex = (trackIndex + 1) % TRACKS.length;
  if (!player) return;
  player.src = trackUrl(trackIndex);
  player.load();
  playCurrentTrack();
}

function getPlayer() {
  if (player) return player;
  player = new Audio();
  player.volume = volume;
  player.preload = 'auto';
  player.addEventListener('playing', () => { failedTrackCount = 0; });
  player.addEventListener('ended', nextTrack);
  player.addEventListener('error', () => {
    if (!enabled || failedTrackCount >= TRACKS.length - 1) return;
    failedTrackCount += 1;
    nextTrack();
  });
  if (!listeningForVisibility && typeof document !== 'undefined') {
    listeningForVisibility = true;
    document.addEventListener('visibilitychange', () => {
      if (!player) return;
      if (document.hidden) player.pause();
      else playCurrentTrack();
    });
  }
  return player;
}

export function isBackgroundMusicEnabled() { return enabled; }
export function getBackgroundMusicVolume() { return volume; }
export function resumeBackgroundMusic() { playCurrentTrack(); }

export function setBackgroundMusicEnabled(value: boolean) {
  enabled = value;
  try { window.localStorage.setItem(MUSIC_STORAGE_KEY, value ? 'on' : 'off'); } catch { /* Keep the session value. */ }
  if (value) playCurrentTrack();
  else player?.pause();
}

export function setBackgroundMusicVolume(value: number) {
  volume = Math.min(1, Math.max(0, value));
  if (player) player.volume = volume;
  try { window.localStorage.setItem(MUSIC_VOLUME_STORAGE_KEY, String(volume)); } catch { /* Keep the session value. */ }
}
