import React from 'react';

interface NotificationProps {
  message: string;
}

const Notification: React.FC<NotificationProps> = ({ message }) => {
  return (
    <div className="notification">
      <span>{message}</span>
    </div>
  );
};

export default Notification;