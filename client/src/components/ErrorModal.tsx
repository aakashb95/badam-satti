import React from 'react';

interface ErrorModalProps {
  message: string;
  onClose: () => void;
}

const ErrorModal: React.FC<ErrorModalProps> = ({ message, onClose }) => {
  return (
    <div className="modal" role="presentation">
      <div className="modal-content" role="alertdialog" aria-modal="true" aria-labelledby="error-title">
        <span className="modal-icon">!</span>
        <span className="eyebrow">Something went wrong</span>
        <h3 id="error-title">We hit a snag</h3>
        <p>{message}</p>
        <button className="primary-button full-button" onClick={onClose}>Try again</button>
      </div>
    </div>
  );
};

export default ErrorModal;
