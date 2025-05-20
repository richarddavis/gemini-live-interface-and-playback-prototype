import React, { useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

function MessageList({ messages, isLoading, isLoadingMessages }) {
  const messageListRef = useRef(null);
  
  // Scroll to bottom when messages change or loading status changes
  useEffect(() => {
    if (messageListRef.current) {
      messageListRef.current.scrollTop = messageListRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  return (
    <div className="message-list" ref={messageListRef}>
      {isLoadingMessages ? (
        <div className="loading-messages">
          <div className="loading-spinner"></div>
          <p>Loading messages...</p>
        </div>
      ) : messages.length === 0 ? (
        <div className="empty-chat">
          <p>No messages yet. Start chatting!</p>
        </div>
      ) : (
        messages.map(msg => (
          <div key={msg.id} className={`message-item ${msg.sender}`}>
            <div className="message-content">
              {/* Use ReactMarkdown to render message text */}
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {msg.text}
              </ReactMarkdown>
            </div>
            <span className="message-timestamp">
              {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
        ))
      )}
      
      {/* Loading indicator for bot response */}
      {isLoading && (
        <div className="message-item bot">
          <div className="message-content">
            <p><strong>Bot:</strong> <em>Thinking...</em></p>
          </div>
          <div className="typing-indicator">
            <span></span>
            <span></span>
            <span></span>
          </div>
        </div>
      )}
    </div>
  );
}

export default MessageList; 