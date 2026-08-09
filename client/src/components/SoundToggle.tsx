import React, { useEffect, useId, useRef, useState } from 'react';

interface SoundToggleProps {
  backgroundMusicOn: boolean;
  backgroundMusicVolume: number;
  gameSoundsOn: boolean;
  onBackgroundMusicChange: (value: boolean) => void;
  onBackgroundMusicVolumeChange: (value: number) => void;
  onGameSoundsChange: (value: boolean) => void;
}

const SoundIcon: React.FC<{ on: boolean }> = ({ on }) => (
  <svg className="sound-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <path d="M4 9.5h3.2L12 5.4v13.2L7.2 14.5H4Z" />
    {on ? (
      <>
        <path className="sound-wave" d="M15.4 9.1a4 4 0 0 1 0 5.8" />
        <path className="sound-wave" d="M17.9 6.6a7.5 7.5 0 0 1 0 10.8" />
      </>
    ) : (
      <path className="sound-wave" d="M16 9.5l5 5m0-5-5 5" />
    )}
  </svg>
);

const SoundToggle: React.FC<SoundToggleProps> = ({
  backgroundMusicOn,
  backgroundMusicVolume,
  gameSoundsOn,
  onBackgroundMusicChange,
  onBackgroundMusicVolumeChange,
  onGameSoundsChange,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const controlRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const anySoundOn = backgroundMusicOn || gameSoundsOn;

  useEffect(() => {
    if (!isOpen) return;

    const closeOnOutsidePress = (event: PointerEvent) => {
      if (!controlRef.current?.contains(event.target as Node)) setIsOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsOpen(false);
    };

    document.addEventListener('pointerdown', closeOnOutsidePress);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsidePress);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [isOpen]);

  return (
    <div className="sound-control" ref={controlRef}>
      <button
        className={`sound-toggle round-icon-button ${anySoundOn ? '' : 'is-muted'}`}
        onClick={() => setIsOpen((open) => !open)}
        aria-expanded={isOpen}
        aria-controls={menuId}
        aria-label="Sound settings"
      >
        <SoundIcon on={anySoundOn} />
      </button>
      {isOpen && (
        <div className="sound-menu" id={menuId} role="group" aria-label="Sound settings">
          <button
            className="sound-menu-option"
            role="checkbox"
            aria-checked={backgroundMusicOn}
            onClick={() => onBackgroundMusicChange(!backgroundMusicOn)}
          >
            <span className={`sound-menu-check ${backgroundMusicOn ? 'is-checked' : ''}`} aria-hidden="true">
              {backgroundMusicOn ? '✓' : ''}
            </span>
            <span>Background music</span>
          </button>
          <label className={`sound-volume ${backgroundMusicOn ? '' : 'is-disabled'}`}>
            <span>
              Music volume
              <output>{Math.round(backgroundMusicVolume * 100)}%</output>
            </span>
            <input
              type="range"
              min="0"
              max="100"
              step="5"
              value={Math.round(backgroundMusicVolume * 100)}
              disabled={!backgroundMusicOn}
              aria-label="Background music volume"
              onChange={(event) => onBackgroundMusicVolumeChange(Number(event.target.value) / 100)}
            />
          </label>
          <button
            className="sound-menu-option"
            role="checkbox"
            aria-checked={gameSoundsOn}
            onClick={() => onGameSoundsChange(!gameSoundsOn)}
          >
            <span className={`sound-menu-check ${gameSoundsOn ? 'is-checked' : ''}`} aria-hidden="true">
              {gameSoundsOn ? '✓' : ''}
            </span>
            <span>Game sounds</span>
          </button>
        </div>
      )}
    </div>
  );
};

export default SoundToggle;
