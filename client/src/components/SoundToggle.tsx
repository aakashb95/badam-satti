import React from 'react';

interface SoundToggleProps {
  soundOn: boolean;
  onSoundChange: (value: boolean) => void;
  // 'icon' suits the game toolbar, 'text' the roomier waiting room header.
  variant?: 'icon' | 'text';
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

const SoundToggle: React.FC<SoundToggleProps> = ({ soundOn, onSoundChange, variant = 'icon' }) => (
  <button
    className={`sound-toggle ${variant === 'icon' ? 'round-icon-button' : 'quiet-button'} ${soundOn ? '' : 'is-muted'}`}
    onClick={() => onSoundChange(!soundOn)}
    aria-pressed={soundOn}
    aria-label={soundOn ? 'Turn table sounds off' : 'Turn table sounds on'}
  >
    <SoundIcon on={soundOn} />
    {variant === 'text' && <span>{soundOn ? 'Sound on' : 'Sound off'}</span>}
  </button>
);

export default SoundToggle;
