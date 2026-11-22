import type { SoloMode } from './solo';
import type { GameMode } from './types';

// How to play each game, in the words players read in the lobby, on the solo
// intro screen and in the menu's How to play.
export interface HowTo { name: string; emoji: string; tagline: string; steps: [string, string, string][] }

const tapYours: [string, string, string] = ['👆', 'Find the picture that is on both cards', ' and tap it on your own card.'];

export const HOW_TO: Record<GameMode | SoloMode, HowTo> = {
  race: {
    name: 'Race', emoji: '🏁', tagline: 'Get rid of your cards first.',
    steps: [
      ['👀', 'Look at both cards.', ' Exactly one picture is on your card and on the middle card.'],
      ['👆', 'Tap that picture on your card.', ' Be first and your card goes to the middle.'],
      ['⏳', 'Wrong picture?', ' You wait 1.5 seconds before you can tap again.'],
      ['🏆', 'Run out of cards first to win.', ' Everyone else plays on for the next places.'],
    ],
  },
  tower: {
    name: 'Tower', emoji: '🥞', tagline: 'Win cards. The tallest tower wins.',
    steps: [
      ['🃏', 'Everyone starts with one card.', ' The rest of the deck feeds the middle.'],
      tapYours,
      ['🥞', 'Fastest wins the middle card.', ' It goes on your tower and becomes your new card.'],
      ['🏆', 'When the deck runs out,', ' the tallest tower wins.'],
    ],
  },
  'hot-potato': {
    name: 'Hot Potato', emoji: '🥔', tagline: 'Pass your cards on. Don’t get stuck. 2 to 4 players.',
    steps: [
      ['👀', 'Everyone holds one card,', ' and you can see everyone’s card.'],
      ['👆', 'Find a picture your card shares with another player’s card,', ' and tap it on your own card.'],
      ['🥔', 'Your cards go onto theirs,', ' and you are safe until the next deal.'],
      ['😬', 'The one left holding all the cards', ' loses that deal.'],
      ['🏆', 'After 5 deals,', ' the fewest losses wins.'],
    ],
  },
  classic: {
    name: 'Solo · 30 cards', emoji: '⏱', tagline: '30 seconds for each card.',
    steps: [
      tapYours,
      ['⏱', 'Each card has 30 seconds.', ' If the time runs out, that card counts as missed.'],
      ['⏳', 'Wrong picture?', ' You wait 1.5 seconds, and the clock keeps going.'],
      ['🏆', 'Match as many of the 30 cards as you can.', ' Beat your best.'],
    ],
  },
  'time-attack': {
    name: 'Time Attack', emoji: '⚡', tagline: '60 seconds. Match as many as you can.',
    steps: [
      ['⚡', 'You have 60 seconds', ' for the whole game.'],
      tapYours,
      ['➖', 'Each wrong tap', ' takes 3 seconds off the clock.'],
      ['🏆', 'Match as many cards as you can.', ' Beat your best.'],
    ],
  },
  daily: {
    name: 'Daily Kitchen', emoji: '🗓️', tagline: 'Today’s 20 cards, the same for everyone.',
    steps: [
      ['🗓️', 'Everyone gets the same 20 cards today.', ' New cards tomorrow.'],
      tapYours,
      ['⏳', 'Wrong picture?', ' You wait 1.5 seconds, and the stopwatch keeps going.'],
      ['📤', 'One try a day.', ' Share your time with friends.'],
    ],
  },
};

export function HowToSteps({ mode }: { mode: GameMode | SoloMode }) {
  return (
    <ol className="how-to">
      {HOW_TO[mode].steps.map(([emoji, strong, rest]) => (
        <li key={strong}><span aria-hidden="true">{emoji}</span><div><strong>{strong}</strong>{rest}</div></li>
      ))}
    </ol>
  );
}
