const SOUND_STORAGE_KEY = 'kings-corner-sound';
const SAMPLE_GAIN = 0.32;
const SAMPLE_FILES = {
  deal: `${import.meta.env.BASE_URL}sounds/card-deal.mp3`,
  play: `${import.meta.env.BASE_URL}sounds/card-play0.mp3`,
} as const;

type SampleName = keyof typeof SAMPLE_FILES;
let enabled = readEnabled();
let context: AudioContext | null = null;
let master: GainNode | null = null;
const samples = new Map<SampleName, AudioBuffer>();
const loading = new Map<SampleName, Promise<void>>();

function readEnabled() {
  try { return window.localStorage.getItem(SOUND_STORAGE_KEY) !== 'off'; } catch { return true; }
}

function getContext() {
  if (context) return context;
  const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextClass) return null;
  try {
    context = new AudioContextClass();
    master = context.createGain();
    master.gain.value = 0.9;
    master.connect(context.destination);
  } catch {
    context = null;
    master = null;
  }
  return context;
}

function loadSample(name: SampleName, audioContext: BaseAudioContext) {
  if (samples.has(name)) return Promise.resolve();
  const active = loading.get(name);
  if (active) return active;
  const request = fetch(SAMPLE_FILES[name])
    .then((response) => {
      if (!response.ok) throw new Error('Sound unavailable');
      return response.arrayBuffer();
    })
    .then((encoded) => audioContext.decodeAudioData(encoded))
    .then((buffer) => { samples.set(name, buffer); })
    .catch(() => undefined)
    .finally(() => { loading.delete(name); });
  loading.set(name, request);
  return request;
}

function playSample(name: SampleName) {
  if (!enabled || document.hidden) return;
  const audioContext = getContext();
  if (!audioContext || !master || audioContext.state === 'closed') return;
  if (audioContext.state === 'suspended') void audioContext.resume();
  const buffer = samples.get(name);
  if (!buffer) {
    void loadSample(name, audioContext);
    return;
  }
  const source = audioContext.createBufferSource();
  const gain = audioContext.createGain();
  source.buffer = buffer;
  gain.gain.value = SAMPLE_GAIN;
  source.connect(gain).connect(master);
  source.start(audioContext.currentTime + 0.02);
  if (name === 'deal' && buffer.duration > 2) source.stop(audioContext.currentTime + 2);
}

function playChime(frequencies: number[]) {
  if (!enabled || document.hidden) return;
  const audioContext = getContext();
  if (!audioContext || !master || audioContext.state === 'closed') return;
  frequencies.forEach((frequency, index) => {
    const at = audioContext.currentTime + 0.02 + index * 0.12;
    const tone = audioContext.createOscillator();
    const gain = audioContext.createGain();
    tone.frequency.setValueAtTime(frequency, at);
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(0.1, at + 0.018);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.7);
    tone.connect(gain).connect(master!);
    tone.start(at);
    tone.stop(at + 0.72);
  });
}

export function isSoundEnabled() { return enabled; }
export function playDealSound() { playSample('deal'); }
export function playCardSound() { playSample('play'); }
export function playWinSound() { playChime([523.25, 659.25, 783.99, 1046.5]); }

export function setSoundEnabled(value: boolean) {
  enabled = value;
  try { window.localStorage.setItem(SOUND_STORAGE_KEY, value ? 'on' : 'off'); } catch { /* Keep the session value. */ }
  if (value) unlockAudio();
}

export function unlockAudio() {
  const audioContext = getContext();
  if (!audioContext) return;
  if (audioContext.state === 'suspended') void audioContext.resume();
  void loadSample('deal', audioContext);
  void loadSample('play', audioContext);
}
