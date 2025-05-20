import React, { useState } from 'react';

function MessageInput({ onSendMessage, isDisabled, isLoading }) {
  const [currentMessage, setCurrentMessage] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (currentMessage.trim() && !isDisabled) {
      onSendMessage(currentMessage);
      setCurrentMessage('');
    }
  };

  return (
    <form onSubmit={handleSubmit} className="message-input-form">
      <input
        type="text"
        value={currentMessage}
        onChange={(e) => setCurrentMessage(e.target.value)}
        placeholder={isDisabled ? "Enter API key to chat..." : "Type your message..."}
        disabled={isDisabled || isLoading}
      />
      <button 
        type="submit" 
        disabled={isDisabled || isLoading || !currentMessage.trim()}
        className={!currentMessage.trim() ? "disabled" : ""}
      >
        {isLoading ? "Sending..." : "Send"}
      </button>
    </form>
  );
}

export default MessageInput; 