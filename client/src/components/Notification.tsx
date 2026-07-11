import React from 'react';

interface NotificationProps {
  message: string;
}

const Notification: React.FC<NotificationProps> = ({ message }) => {
  return (
    <div className="notification" role="status" aria-live="polite">
      <span className="notification-mark">✓</span>
      <span>{message}</span>
    </div>
  );
};

export default Notification;
