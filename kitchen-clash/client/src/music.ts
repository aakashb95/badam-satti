// Optional background music, generated in the browser so it is royalty free
// and needs no download: a light marimba-style tune over a soft bass, looping
// an 8-bar I–vi–IV–V progression at a gentle volume. Off until a player turns
// it on; pauses while the tab is hidden.
import { audioContext } from './sounds';

const MUSIC_KEY = 'kitchen-clash-music';
const VOLUME = 0.15;
const BPM = 112;
const EIGHTH = 60 / BPM / 2;
const LOOKAHEAD_S = 0.2;

// Bars of C, Am, F, G (twice), as MIDI note numbers.
const CHORDS = [[60, 64, 67], [57, 60, 64], [53, 57, 60], [55, 59, 62]];
// One bar of eighths per chord; null is a rest. Indices pick a chord tone
// (0–2) or the tone an octave up (3–5).
const MELODY: Array<Array<number | null>> = [
  [3, null, 4, 5, 4, null, 3, null],
  [5, 4, null, 3, null, 4, 3, null],
  [3, null, 3, 4, 5, null, 4, 3],
  [4, null, 5, null, 4, 3, null, null],
  [3, 4, 5, null, 5, 4, 3, null],
  [5, null, 4, null, 3, 4, null, 3],
  [3, null, 4, 5, null, 4, 3, null],
  [4, 5, null, 4, 3, null, 2, null],
];

let context: AudioContext | null = null;
let master: GainNode | null = null;
let timer: number | null = null;
let nextTime = 0;
let step = 0;

export const isMusicOn = () => window.localStorage.getItem(MUSIC_KEY) === 'on';

const hz = (midi: number) => 440 * 2 ** ((midi - 69) / 12);

function pluck(frequency: number, at: number, length: number, level: number) {
  if (!context || !master) return;
  const gain = context.createGain();
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(level, at + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + length);
  gain.connect(master);
  // A sine plus a quieter fourth harmonic sounds like a soft wooden bar.
  for (const [multiple, share] of [[1, 1], [4, 0.12]]) {
    const oscillator = context.createOscillator();
    const partial = context.createGain();
    oscillator.frequency.value = frequency * multiple;
    partial.gain.value = share;
    oscillator.connect(partial).connect(gain);
    oscillator.start(at);
    oscillator.stop(at + length + 0.05);
  }
}

function schedule() {
  if (!context) return;
  while (nextTime < context.currentTime + LOOKAHEAD_S) {
    const bar = Math.floor(step / 8) % MELODY.length;
    const beat = step % 8;
    const chord = CHORDS[bar % CHORDS.length];
    const note = MELODY[bar][beat];
    if (note !== null) pluck(hz(chord[note % 3] + (note >= 3 ? 12 : 0)), nextTime, 0.45, 0.5);
    if (beat === 0 || beat === 4) pluck(hz(chord[0] - 24), nextTime, 0.7, 0.55);
    if (beat === 2 || beat === 6) pluck(hz(chord[1] - 12), nextTime, 0.25, 0.18);
    nextTime += EIGHTH;
    step += 1;
  }
}

function play() {
  if (timer !== null || document.hidden) return;
  context = audioContext();
  if (!context) return;
  if (!master) {
    master = context.createGain();
    master.gain.value = VOLUME;
    master.connect(context.destination);
  }
  void context.resume();
  nextTime = context.currentTime + 0.1;
  timer = window.setInterval(schedule, 50);
}

function pause() {
  if (timer !== null) window.clearInterval(timer);
  timer = null;
  // Sounds share the audio context, so silence only the music.
  master?.disconnect();
  master = null;
}

export function setMusicOn(on: boolean) {
  window.localStorage.setItem(MUSIC_KEY, on ? 'on' : 'off');
  if (on) play();
  else pause();
}

// Browsers only allow sound after a tap, so a saved "on" setting starts on
// the first tap of the visit.
export function resumeMusicIfOn() {
  if (isMusicOn()) play();
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden) pause();
  else resumeMusicIfOn();
});
