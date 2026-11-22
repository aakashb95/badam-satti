// Short synthesised sounds. They play only after the server's verdict, never
// on the tap itself, so sound cannot give the answer away.
const SOUND_KEY = 'kitchen-clash-sound';
let context: AudioContext | null = null;

export const isSoundOn = () => window.localStorage.getItem(SOUND_KEY) !== 'off';
export const setSoundOn = (on: boolean) => window.localStorage.setItem(SOUND_KEY, on ? 'on' : 'off');

// One audio context for sounds and music. Phones only let it start inside a
// real tap, so this runs on every tap until it is running.
export function audioContext(): AudioContext | null {
  if (!context) {
    const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return null;
    // iPhones mute web audio while the ring/silent switch is on silent unless
    // the page asks for playback audio (Safari 17+).
    const session = (navigator as unknown as { audioSession?: { type: string } }).audioSession;
    if (session) session.type = 'playback';
    context = new AudioContextClass();
  }
  return context;
}

export function unlockAudio() {
  const ctx = audioContext();
  if (!ctx || ctx.state === 'running') return;
  void ctx.resume();
  // Older iOS also needs a sound started inside the tap; a silent one does.
  const source = ctx.createBufferSource();
  source.buffer = ctx.createBuffer(1, 1, 22_050);
  source.connect(ctx.destination);
  source.start(0);
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
