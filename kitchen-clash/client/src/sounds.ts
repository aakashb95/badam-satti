// Short synthesised sounds. They play only after the server's verdict, never
// on the tap itself, so sound cannot give the answer away.
const SOUND_KEY = 'kitchen-clash-sound';
let context: AudioContext | null = null;

export const isSoundOn = () => window.localStorage.getItem(SOUND_KEY) !== 'off';
export const setSoundOn = (on: boolean) => window.localStorage.setItem(SOUND_KEY, on ? 'on' : 'off');

export function unlockAudio() {
  const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextClass) return;
  context ||= new AudioContextClass();
  if (context.state === 'suspended') void context.resume();
}

function tones(notes: Array<[frequency: number, startS: number, lengthS: number]>, type: OscillatorType, volume: number) {
  if (!context || !isSoundOn() || document.hidden) return;
  const start = context.currentTime;
  for (const [frequency, offset, length] of notes) {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = type;
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0.0001, start + offset);
    gain.gain.exponentialRampToValueAtTime(volume, start + offset + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + offset + length);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start(start + offset);
    oscillator.stop(start + offset + length + 0.02);
  }
}

export const playWin = () => tones([[660, 0, 0.12], [880, 0.09, 0.18]], 'triangle', 0.18);
export const playWrong = () => tones([[180, 0, 0.22]], 'square', 0.06);
export const playOtherWin = () => tones([[440, 0, 0.08]], 'sine', 0.08);
export const playFinish = () => tones([[523, 0, 0.14], [659, 0.12, 0.14], [784, 0.24, 0.3]], 'triangle', 0.18);
