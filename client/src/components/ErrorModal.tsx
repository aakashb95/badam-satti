import React from 'react';

interface ErrorModalProps {
  message: string;
  onClose: () => void;
  primaryLabel?: string;
  secondaryLabel?: string;
  onSecondary?: () => void;
}

const ErrorModal: React.FC<ErrorModalProps> = ({
  message,
  onClose,
  primaryLabel = 'Try again',
  secondaryLabel,
  onSecondary,
}) => {
  return (
    <div className="modal" role="presentation">
      <div className="modal-content" role="alertdialog" aria-modal="true" aria-labelledby="error-title">
        <span className="modal-icon">!</span>
        <span className="eyebrow">Something went wrong</span>
        <h3 id="error-title">We hit a snag</h3>
        <p>{message}</p>
        <div className="modal-actions">
          <button className="primary-button full-button" onClick={onClose}>{primaryLabel}</button>
          {secondaryLabel && onSecondary && (
            <button className="secondary-button full-button" onClick={onSecondary}>{secondaryLabel}</button>
          )}
        </div>
      </div>
    </div>
  );
};

export default ErrorModal;
