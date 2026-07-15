import React from 'react';

interface NotificationProps {
  message: string;
  inGame?: boolean;
}

const Notification: React.FC<NotificationProps> = ({ message, inGame = false }) => {
  return (
    <div className={`notification ${inGame ? 'notification-game' : ''}`} role="status" aria-live="polite">
      <span className="notification-mark">✓</span>
      <span>{message}</span>
    </div>
  );
};

export default Notification;
