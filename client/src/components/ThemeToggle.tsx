import React from 'react';

export type ThemeMode = 'dark' | 'light';

interface ThemeToggleProps {
  theme: ThemeMode;
  onToggle: () => void;
  compact?: boolean;
}

const ThemeToggle: React.FC<ThemeToggleProps> = ({ theme, onToggle, compact = false }) => {
  const isLight = theme === 'light';
  const icon = isLight ? (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M21 12.8A8.5 8.5 0 1 1 11.2 3a6.6 6.6 0 0 0 9.8 9.8Z" />
    </svg>
  ) : (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="4.4" />
      <path d="M12 2.8v2.1M12 19.1v2.1M4.4 4.4l1.5 1.5M18.1 18.1l1.5 1.5M2.8 12h2.1M19.1 12h2.1M4.4 19.6l1.5-1.5M18.1 5.9l1.5-1.5" />
    </svg>
  );

  return (
    <button
      className={`theme-toggle ${compact ? 'is-compact' : ''}`}
      type="button"
      onClick={onToggle}
      aria-label={`Switch to ${isLight ? 'dark' : 'light'} mode`}
      aria-pressed={isLight}
    >
      <span className="theme-toggle-icon">{icon}</span>
      {!compact && <span className="theme-toggle-label">{isLight ? 'Dark' : 'Light'}</span>}
    </button>
  );
};

export default ThemeToggle;
