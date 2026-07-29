#!/usr/bin/env node
// Renders the synthesised pass knock from src/sounds.ts to a WAV you can listen
// to without starting a game, and writes a page that plays it alongside the two
// recorded card sounds. The module itself is transpiled and imported, so the
// preview always matches what the app plays.
//
//   node client/scripts/render-sound-previews.mjs [--out DIR] [--rate 44100]

import { chromium } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const clientDir = resolve(scriptDir, '..');

// The card sounds are recordings served from public/sounds; only the knock is
// synthesised, so only it needs rendering.
const ENTRIES = [
  { src: '../public/sounds/card-deal.mp3', label: 'Dealing', note: 'Recording, faded out after 2s. Plays when a round starts.' },
  { src: '../public/sounds/card-play0.mp3', label: 'Playing a card', note: 'Recording. Plays on every move.' },
  { src: 'pass.wav', label: 'Pass', note: 'Synthesised: two knuckle knocks on the table, like checking in poker.' },
];

function parseArgs(argv) {
  const options = { out: resolve(clientDir, 'sound-previews'), rate: 44100 };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--out' && argv[index + 1]) options.out = resolve(process.cwd(), argv[index += 1]);
    if (argv[index] === '--rate' && argv[index + 1]) options.rate = Number(argv[index += 1]);
  }
  return options;
}

function toWav(samples, sampleRate) {
  const header = Buffer.alloc(44);
  const bytesPerSample = 2;
  const dataLength = samples.length * bytesPerSample;

  header.write('RIFF', 0);
  header.writeUInt32LE(36 + dataLength, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // mono
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * bytesPerSample, 28);
  header.writeUInt16LE(bytesPerSample, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(dataLength, 40);

  const body = Buffer.alloc(dataLength);
  for (let index = 0; index < samples.length; index += 1) {
    const clamped = Math.max(-1, Math.min(1, samples[index]));
    body.writeInt16LE(Math.round(clamped * 32767), index * bytesPerSample);
  }

  return Buffer.concat([header, body]);
}

function peakLevel(samples) {
  let peak = 0;
  for (const sample of samples) peak = Math.max(peak, Math.abs(sample));
  return peak;
}

const previewPage = (entries) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Badam 7 — table sounds</title>
<style>
  body { margin: 0; padding: 40px 24px; background: #10231c; color: #f1efe6; font: 16px/1.5 system-ui, sans-serif; }
  main { max-width: 560px; margin: 0 auto; }
  h1 { font-size: 1.4rem; margin: 0 0 6px; }
  p.sub { margin: 0 0 28px; color: #9db3a8; font-size: .9rem; }
  section { padding: 18px 0; border-top: 1px solid #24413610; border-top-color: #244136; }
  h2 { margin: 0 0 4px; font-size: 1rem; }
  small { display: block; margin-bottom: 12px; color: #9db3a8; }
  audio { width: 100%; }
</style>
</head>
<body>
<main>
  <h1>Badam 7 — table sounds</h1>
  <p class="sub">The two card sounds are recordings; the pass knock is synthesised in client/src/sounds.ts</p>
  ${entries.map((entry) => `<section>
    <h2>${entry.label}</h2>
    <small>${entry.note}</small>
    <audio controls preload="auto" src="${entry.src}"></audio>
  </section>`).join('\n  ')}
</main>
</body>
</html>
`;

async function main() {
  const { out, rate } = parseArgs(process.argv.slice(2));
  const source = await readFile(resolve(clientDir, 'src/sounds.ts'), 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.ESNext },
  });
  // Vite resolves import.meta.env at build time; the sample paths it feeds are
  // irrelevant here because only the synthesised knock gets rendered.
  const code = outputText.replaceAll('import.meta.env.BASE_URL', "'/badam7/'");

  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.goto('about:blank');

    const rendered = await page.evaluate(async ({ code, sampleRate }) => {
      const moduleUrl = URL.createObjectURL(new Blob([code], { type: 'text/javascript' }));
      const module = await import(moduleUrl);
      const buffer = await module.renderKnock(sampleRate);
      const channel = buffer.getChannelData(0);
      const bytes = new Uint8Array(channel.buffer, channel.byteOffset, channel.byteLength);

      let binary = '';
      for (let index = 0; index < bytes.length; index += 8192) {
        binary += String.fromCharCode(...bytes.subarray(index, index + 8192));
      }
      return btoa(binary);
    }, { code, sampleRate: rate });

    await mkdir(out, { recursive: true });
    const raw = Buffer.from(rendered, 'base64');
    const samples = new Float32Array(raw.buffer, raw.byteOffset, raw.byteLength / 4);
    await writeFile(resolve(out, 'pass.wav'), toWav(samples, rate));
    console.log(`pass.wav — ${(samples.length / rate).toFixed(2)}s, peak ${peakLevel(samples).toFixed(3)}`);

    await writeFile(resolve(out, 'index.html'), previewPage(ENTRIES));
    console.log(`\nOpen ${resolve(out, 'index.html')}`);
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
