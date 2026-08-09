const MUSIC_STORAGE_KEY = 'badam-satti-background-music';
const BACKGROUND_MUSIC_VOLUME = 0.25;

const BACKGROUND_TRACKS = [
  'shanghai.mp3',
  'slow-melt.mp3',
  'zephyr.mp3',
  'chamomile.mp3',
  'while-coffee-brews.mp3',
  'morning-routine.mp3',
];

let enabled = readStoredPreference();
let player: HTMLAudioElement | null = null;
let trackIndex = 0;
let failedTrackCount = 0;
let listeningForVisibility = false;

function readStoredPreference(): boolean {
  try {
    return window.localStorage.getItem(MUSIC_STORAGE_KEY) === 'on';
  } catch {
    return false;
  }
}

function trackUrl(index: number): string {
  return `${import.meta.env.BASE_URL}music/${BACKGROUND_TRACKS[index]}`;
}

function playCurrentTrack() {
  if (!enabled || typeof document === 'undefined' || document.hidden) return;

  const audio = getPlayer();
  const nextSource = trackUrl(trackIndex);
  if (!audio.src.endsWith(nextSource)) {
    audio.src = nextSource;
    audio.load();
  }
  void audio.play().catch(() => undefined);
}

function moveToNextTrack() {
  trackIndex = (trackIndex + 1) % BACKGROUND_TRACKS.length;
  if (!player) return;
  player.src = trackUrl(trackIndex);
  player.load();
  playCurrentTrack();
}

function getPlayer(): HTMLAudioElement {
  if (player) return player;

  player = new Audio();
  player.volume = BACKGROUND_MUSIC_VOLUME;
  player.preload = 'auto';
  player.addEventListener('playing', () => {
    failedTrackCount = 0;
  });
  player.addEventListener('ended', moveToNextTrack);
  player.addEventListener('error', () => {
    if (!enabled || failedTrackCount >= BACKGROUND_TRACKS.length - 1) return;
    failedTrackCount += 1;
    moveToNextTrack();
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

export function isBackgroundMusicEnabled(): boolean {
  return enabled;
}

export function setBackgroundMusicEnabled(value: boolean) {
  enabled = value;
  try {
    window.localStorage.setItem(MUSIC_STORAGE_KEY, value ? 'on' : 'off');
  } catch {
    // The choice still applies for this session when storage is unavailable.
  }

  if (value) playCurrentTrack();
  else player?.pause();
}

export function resumeBackgroundMusic() {
  playCurrentTrack();
}
