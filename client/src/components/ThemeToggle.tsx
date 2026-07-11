import React from 'react';

export type ThemeMode = 'dark' | 'light';

interface ThemeToggleProps {
  theme: ThemeMode;
  onToggle: () => void;
  compact?: boolean;
}

const ThemeToggle: React.FC<ThemeToggleProps> = ({ theme, onToggle, compact = false }) => {
  const isLight = theme === 'light';

  return (
    <button
      className={`theme-toggle ${compact ? 'is-compact' : ''}`}
      type="button"
      onClick={onToggle}
      aria-label={`Switch to ${isLight ? 'dark' : 'light'} mode`}
      aria-pressed={isLight}
    >
      <span aria-hidden="true">{isLight ? '☾' : '☼'}</span>
      {!compact && <span>{isLight ? 'Dark' : 'Light'}</span>}
    </button>
  );
};

export default ThemeToggle;
