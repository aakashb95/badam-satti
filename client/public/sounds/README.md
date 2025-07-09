# Game Sound Effects

This directory contains sound effects for the Badam Satti card game.

## Current Status
The game uses generated fallback sounds via Web Audio API until actual sound files are added.

## Required Sound Files

Place the following MP3 files in this directory:

1. **game-start.mp3** - Played when a new game/round begins
2. **game-end.mp3** - Played when a game/round ends
3. **card-played.mp3** - Played when any player plays a card
4. **pass-turn.mp3** - Played when a player passes their turn
5. **warning.mp3** - Played when a player reaches warning state (3 or fewer cards)
6. **sure.mp3** - Played when a player reaches critical state (all cards playable)

## Recommended Sound Sources

### Free/Royalty-Free Sources:
- **Pixabay** - https://pixabay.com/sound-effects/
  - No attribution required
  - High-quality sound effects
  - MP3 format available

- **Freesound.org** - https://freesound.org/
  - Creative Commons licensed
  - Large community database
  - Various formats available

- **Mixkit** - https://mixkit.co/free-sound-effects/
  - Royalty-free sound effects
  - Game-focused sounds available

### Specific Recommendations:
- **Card sounds**: Search for "card shuffle", "card flip", "paper rustle"
- **Success sounds**: Search for "success", "achievement", "level up"
- **Warning sounds**: Search for "warning", "alert", "notification"
- **Game sounds**: Search for "game start", "game over", "victory"

## File Format
- Format: MP3
- Duration: 0.5-3 seconds (short and sweet)
- Quality: 44.1kHz, 16-bit recommended
- File size: Keep under 100KB each for fast loading

## Implementation
The AudioManager will automatically use these files if they exist, otherwise it falls back to generated Web Audio API sounds.

To disable fallback sounds and use only files:
```javascript
audioManager.setUseFallbackSounds(false);
```