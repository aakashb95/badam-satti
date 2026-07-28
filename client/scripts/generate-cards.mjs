// Regenerates the 52 card faces in client/public/images/cards.
//
// Design goals (see the small-size distinguishability ticket):
// - Club reads as "three separated dots + stem" down to 12px.
// - Spade reads as "pointed tip, flared tail" — never a rounded blob.
// - Corner index (rank + pip) is what an overlapped fan actually shows,
//   so it gets a bigger, bolder rank and a larger pip.
//
// Keep the club/spade paths in sync with SUIT_ICON_PATHS in
// client/src/cards.tsx, and bump CARD_ASSET_VERSION there when rerunning.
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const cardsDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '../public/images/cards');

const OLD_CLUB_PATH =
  'M0-32C-11-32-19-23-19-13c0 4 1 7 3 10-4-2-8-3-12-3-12 0-21 10-21 22s9 22 21 22c8 0 15-4 20-10 1 14-4 25-15 34h46C12 53 7 42 8 28c5 6 12 10 20 10 12 0 21-10 21-22S40-6 28-6c-4 0-8 1-12 3 2-3 3-6 3-10 0-10-8-19-19-19Z';
const NEW_CLUB_PATH =
  'M-21-26a21 21 0 1 0 42 0 21 21 0 1 0-42 0ZM-48 12a21 21 0 1 0 42 0 21 21 0 1 0-42 0ZM6 12a21 21 0 1 0 42 0 21 21 0 1 0-42 0ZM0 10 10 58H-10Z';

const OLD_SPADE_BODY =
  'M0-38C-8-25-36-11-36 10c0 14 10 24 24 24 6 0 10-2 12-7 2 5 6 7 12 7 14 0 24-10 24-24C36-11 8-25 0-38Z';
const OLD_SPADE_STEM = 'M-5 24c0 15-7 26-20 35h50C12 50 5 39 5 24Z';
const NEW_SPADE_BODY =
  'M0-46C8-30 33-16 33 6 33 20 23 28 14 28 9 28 5 26 3 22L-3 22C-5 26-9 28-14 28-23 28-33 20-33 6-33-16-8-30 0-46Z';
const NEW_SPADE_STEM = 'M-3 22C-3 32-8 40-16 46L16 46C8 40 3 32 3 22Z';

const files = (await readdir(cardsDir)).filter((file) => /^(10|[2-9]|[AJQK])[CDHS]\.svg$/.test(file));
if (files.length !== 52) {
  throw new Error(`Expected 52 card files, found ${files.length}`);
}

let clubFiles = 0;
let spadeFiles = 0;

for (const file of files) {
  const filePath = path.join(cardsDir, file);
  let svg = await readFile(filePath, 'utf8');
  const original = svg;

  // Bigger, bolder corner rank; larger corner pip nudged down to clear it.
  svg = svg.replaceAll('font-size="17" font-weight="600"', 'font-size="20" font-weight="700"');
  svg = svg.replaceAll('translate(15 38) scale(0.18)', 'translate(15 40) scale(0.24)');

  if (file.includes('C')) {
    if (!svg.includes(OLD_CLUB_PATH) && !svg.includes(NEW_CLUB_PATH)) {
      throw new Error(`${file}: club path not recognized`);
    }
    svg = svg.replaceAll(OLD_CLUB_PATH, NEW_CLUB_PATH);
    clubFiles += 1;
  }

  if (file.includes('S')) {
    if (!svg.includes(OLD_SPADE_BODY) && !svg.includes(NEW_SPADE_BODY)) {
      throw new Error(`${file}: spade path not recognized`);
    }
    svg = svg.replaceAll(OLD_SPADE_BODY, NEW_SPADE_BODY);
    svg = svg.replaceAll(OLD_SPADE_STEM, NEW_SPADE_STEM);
    spadeFiles += 1;
  }

  if (svg !== original) {
    await writeFile(filePath, svg);
  }
}

console.log(`Updated ${files.length} cards (${clubFiles} club faces, ${spadeFiles} spade faces).`);
