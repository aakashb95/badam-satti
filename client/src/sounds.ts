// Table sounds.
//
//  - deal : client/public/sounds/card-deal.mp3, faded out after 2s so dealing
//           finishes before the first turn
//  - play : client/public/sounds/card-play0.mp3
//  - pass : a knuckle knock on the table, the way a poker player checks.
//           Synthesised with the Web Audio API — no recording needed for it.
//
// Everything runs through one master gain. Sample gain is trimmed well below
// the recordings' near-full-scale peaks so the knock sits at the same level.

export type SoundName = 'deal' | 'play' | 'pass';
type SampleName = 'deal' | 'play';

const SOUND_STORAGE_KEY = 'badam-satti-sound';
const MASTER_VOLUME = 0.9;
const SAMPLE_GAIN = 0.35;
const NOISE_SECONDS = 0.4;

// The deal recording runs 4.6s; the table is in play well before that.
const DEAL_MAX_SECONDS = 2;
const DEAL_FADE_SECONDS = 0.3;

const SAMPLE_FILES: Record<SampleName, string> = {
  deal: `${import.meta.env.BASE_URL}sounds/card-deal.mp3`,
  play: `${import.meta.env.BASE_URL}sounds/card-play0.mp3`,
};

interface NoiseOptions {
  at: number;
  gain: number;
  duration: number;
  from: number;
  to?: number;
  q?: number;
  attack?: number;
}

let context: AudioContext | null = null;
let master: GainNode | null = null;
let enabled = readStoredPreference();
const samples = new Map<SampleName, AudioBuffer>();
const loading = new Map<SampleName, Promise<void>>();
const noiseBuffers = new Map<number, AudioBuffer>();

function readStoredPreference(): boolean {
  try {
    return window.localStorage.getItem(SOUND_STORAGE_KEY) !== 'off';
  } catch {
    return true;
  }
}

export function isSoundEnabled(): boolean {
  return enabled;
}

export function setSoundEnabled(value: boolean) {
  enabled = value;
  try {
    window.localStorage.setItem(SOUND_STORAGE_KEY, value ? 'on' : 'off');
  } catch {
    // The choice still applies for this session when storage is unavailable.
  }
  if (value) unlockAudio();
}

function getContext(): AudioContext | null {
  if (context) return context;

  const AudioContextClass =
    window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextClass) return null;

  try {
    context = new AudioContextClass();
    master = context.createGain();
    master.gain.value = MASTER_VOLUME;
    master.connect(context.destination);
  } catch {
    context = null;
    master = null;
  }
  return context;
}

// Browsers only start an audio context inside a user gesture, so the first tap
// in the app opens it — and warms the samples while the player is still in the
// menu, so the first deal is not late.
export function unlockAudio() {
  const ctx = getContext();
  if (!ctx) return;
  if (ctx.state === 'suspended') void ctx.resume();
  void loadSample('deal', ctx);
  void loadSample('play', ctx);
}

function loadSample(name: SampleName, ctx: BaseAudioContext): Promise<void> {
  if (samples.has(name)) return Promise.resolve();

  const pending = loading.get(name);
  if (pending) return pending;

  const request = fetch(SAMPLE_FILES[name])
    .then((response) => {
      if (!response.ok) throw new Error(`${name} sound unavailable`);
      return response.arrayBuffer();
    })
    .then((encoded) => ctx.decodeAudioData(encoded))
    .then((buffer) => {
      samples.set(name, buffer);
    })
    .catch(() => {
      // Losing a sound should never break play; drop the entry so a later
      // attempt can retry.
    })
    .finally(() => {
      loading.delete(name);
    });

  loading.set(name, request);
  return request;
}

function playSample(name: SampleName, ctx: AudioContext, target: AudioNode, at: number) {
  const buffer = samples.get(name);
  if (!buffer) {
    void loadSample(name, ctx);
    return;
  }

  const source = ctx.createBufferSource();
  source.buffer = buffer;

  const amp = ctx.createGain();
  amp.gain.setValueAtTime(SAMPLE_GAIN, at);

  source.connect(amp).connect(target);
  source.start(at);

  if (name === 'deal' && buffer.duration > DEAL_MAX_SECONDS) {
    amp.gain.setValueAtTime(SAMPLE_GAIN, at + DEAL_MAX_SECONDS - DEAL_FADE_SECONDS);
    amp.gain.linearRampToValueAtTime(0, at + DEAL_MAX_SECONDS);
    source.stop(at + DEAL_MAX_SECONDS);
  }
}

function getNoiseBuffer(ctx: BaseAudioContext): AudioBuffer {
  const cached = noiseBuffers.get(ctx.sampleRate);
  if (cached) return cached;

  const frameCount = Math.floor(ctx.sampleRate * NOISE_SECONDS);
  const buffer = ctx.createBuffer(1, frameCount, ctx.sampleRate);
  const values = buffer.getChannelData(0);
  for (let index = 0; index < frameCount; index += 1) values[index] = Math.random() * 2 - 1;

  noiseBuffers.set(ctx.sampleRate, buffer);
  return buffer;
}

function noise(ctx: BaseAudioContext, target: AudioNode, { at, gain, duration, from, to, q = 0.7, attack = 0.004 }: NoiseOptions) {
  const source = ctx.createBufferSource();
  source.buffer = getNoiseBuffer(ctx);

  const shaper = ctx.createBiquadFilter();
  shaper.type = 'bandpass';
  shaper.Q.value = q;
  shaper.frequency.setValueAtTime(from, at);
  if (to) shaper.frequency.exponentialRampToValueAtTime(to, at + duration);

  const amp = ctx.createGain();
  amp.gain.setValueAtTime(0, at);
  amp.gain.linearRampToValueAtTime(gain, at + Math.min(attack, duration * 0.6));
  amp.gain.exponentialRampToValueAtTime(0.0001, at + duration);

  source.connect(shaper).connect(amp).connect(target);
  source.start(at, Math.random() * (NOISE_SECONDS - duration - 0.05), duration + 0.02);
  source.stop(at + duration + 0.02);
}

// Two knuckle knocks on the table. A knock is a short woody resonance around
// 300Hz: keeping it clear of the sub-bass is what stops it sounding like a hit.
function scheduleKnock(ctx: BaseAudioContext, target: AudioNode, at: number) {
  const knock = (time: number, strength: number) => {
    noise(ctx, target, { at: time, gain: 0.68 * strength, duration: 0.055, from: 520, to: 330, q: 2.6 });
    noise(ctx, target, { at: time, gain: 0.26 * strength, duration: 0.02, from: 2400, q: 1, attack: 0.002 });

    const body = ctx.createOscillator();
    body.type = 'triangle';
    body.frequency.setValueAtTime(300, time);
    body.frequency.exponentialRampToValueAtTime(190, time + 0.07);

    const amp = ctx.createGain();
    amp.gain.setValueAtTime(0, time);
    amp.gain.linearRampToValueAtTime(0.32 * strength, time + 0.008);
    amp.gain.exponentialRampToValueAtTime(0.0001, time + 0.07);

    body.connect(amp).connect(target);
    body.start(time);
    body.stop(time + 0.09);
  };

  knock(at, 1);
  knock(at + 0.145, 0.78);
}

// Returns the live context and a start time, or null when we should stay quiet.
function liveStart(): { ctx: AudioContext; target: AudioNode; at: number } | null {
  if (!enabled) return null;
  if (typeof document !== 'undefined' && document.hidden) return null;

  const ctx = getContext();
  if (!ctx || !master) return null;
  if (ctx.state === 'suspended') void ctx.resume();
  if (ctx.state === 'closed') return null;

  return { ctx, target: master, at: ctx.currentTime + 0.02 };
}

export function playDealSound() {
  const start = liveStart();
  if (start) playSample('deal', start.ctx, start.target, start.at);
}

export function playCardSound() {
  const start = liveStart();
  if (start) playSample('play', start.ctx, start.target, start.at);
}

export function playKnockSound() {
  const start = liveStart();
  if (start) scheduleKnock(start.ctx, start.target, start.at);
}

// Bounces the knock offline so it can be auditioned on its own — used by
// client/scripts/render-sound-previews.mjs, not by the game itself.
export function renderKnock(sampleRate = 44100): Promise<AudioBuffer> {
  const OfflineContextClass =
    window.OfflineAudioContext ||
    (window as unknown as { webkitOfflineAudioContext?: typeof OfflineAudioContext }).webkitOfflineAudioContext;

  const ctx = new OfflineContextClass(1, Math.ceil(sampleRate * 0.5), sampleRate);
  const gain = ctx.createGain();
  gain.gain.value = MASTER_VOLUME;
  gain.connect(ctx.destination);
  scheduleKnock(ctx, gain, 0);
  return ctx.startRendering();
}
