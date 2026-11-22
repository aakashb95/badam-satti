import { audioContext } from './sounds';

// Background music: four light tracks by Kevin MacLeod (incompetech.com),
// CC BY 4.0, played in a loop on every screen at a gentle volume. It is on
// unless the player turned it off, and starts on the first tap because
// browsers only allow sound after one. It pauses while the tab is hidden.
const MUSIC_KEY = 'kitchen-clash-music';
const VOLUME = 0.28;
const TRACKS = ['carefree.mp3', 'life-of-riley.mp3', 'monkeys-spinning-monkeys.mp3', 'fluffing-a-duck.mp3'];

let player: HTMLAudioElement | null = null;
let trackIndex = Math.floor(Math.random() * TRACKS.length);

export const isMusicOn = () => window.localStorage.getItem(MUSIC_KEY) !== 'off';

function getPlayer(): HTMLAudioElement {
  if (player) return player;
  player = new Audio();
  player.preload = 'none';
  player.addEventListener('ended', () => {
    trackIndex = (trackIndex + 1) % TRACKS.length;
    play();
  });
  // A track that fails to load is skipped instead of stopping the music.
  player.addEventListener('error', () => {
    trackIndex = (trackIndex + 1) % TRACKS.length;
    window.setTimeout(play, 1_000);
  });
  // iPhones ignore an audio element's volume, so route it through the shared
  // audio context and set the level there.
  const ctx = audioContext();
  if (ctx) {
    const gain = ctx.createGain();
    gain.gain.value = VOLUME;
    ctx.createMediaElementSource(player).connect(gain).connect(ctx.destination);
  } else {
    player.volume = VOLUME;
  }
  return player;
}

function play() {
  if (!isMusicOn() || document.hidden) return;
  const audio = getPlayer();
  const source = `${import.meta.env.BASE_URL}music/${TRACKS[trackIndex]}`;
  if (!audio.src.endsWith(source)) audio.src = source;
  void audio.play().catch(() => undefined);
}

export function setMusicOn(on: boolean) {
  window.localStorage.setItem(MUSIC_KEY, on ? 'on' : 'off');
  if (on) play();
  else player?.pause();
}

// Called on every tap: starts the music the first time it is allowed.
export function resumeMusicIfOn() {
  if (player && !player.paused) return;
  play();
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden) player?.pause();
  else if (player) play();
});
