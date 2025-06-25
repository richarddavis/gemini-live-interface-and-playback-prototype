import React, { useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import LiveSessionPlaceholder from './LiveSessionPlaceholder';

// Function to convert LaTeX delimiters to KaTeX compatible format
function convertLatexBracketsToDollars(text) {
  if (!text) return '';
  
  // Replace display math mode: \[ ... \] -> $$ ... $$
  let processedText = text.replace(/\\\[/g, '$$');
  processedText = processedText.replace(/\\\]/g, '$$');
  
  // Replace inline math mode: \( ... \) -> $ ... $
  processedText = processedText.replace(/\\\(/g, '$');
  processedText = processedText.replace(/\\\)/g, '$');
  
  return processedText;
}

function MessageList({ messages, isLoadingMessages, isUploadingMedia, currentBotResponse, onPlaybackFromPlaceholder }) {
  const messageListRef = useRef(null);
  
  // Scroll to bottom when messages change or loading status changes
  useEffect(() => {
    if (messageListRef.current) {
      messageListRef.current.scrollTop = messageListRef.current.scrollHeight;
    }
  }, [messages, currentBotResponse, isUploadingMedia]);

  // Helper function to render message content
  const renderMessageContent = (msg) => {
    // Handle live session placeholder
    if (msg.type === 'live_session_placeholder') {
      return (
        <LiveSessionPlaceholder
          sessionData={msg.sessionData}
          onPlayback={onPlaybackFromPlaceholder}
          timestamp={msg.timestamp}
        />
      );
    }

    // Regular message content
    return (
      <div className="message-content">
        {msg.media_url && msg.media_type?.startsWith('image/') && (
          <div className="message-image-container">
            <img 
              src={msg.media_url} 
              alt="Uploaded content" 
              className="message-image" 
            />
          </div>
        )}
        
        {msg.media_url && msg.media_type?.startsWith('video/') && (
          <div className="message-video-container">
            <video 
              src={msg.media_url} 
              controls
              className="message-video"
            />
          </div>
        )}
        
        {msg.media_url && msg.media_type?.startsWith('audio/') && (
          <div className="message-audio-container">
            <audio 
              src={msg.media_url} 
              controls
              className="message-audio"
            />
          </div>
        )}
        
        {msg.text && (
          <ReactMarkdown 
            remarkPlugins={[remarkGfm, remarkMath]}
            rehypePlugins={[rehypeKatex]}
          >
            {convertLatexBracketsToDollars(msg.text)}
          </ReactMarkdown>
        )}
      </div>
    );
  };

  return (
    <div className="message-list" ref={messageListRef}>
      {isLoadingMessages ? (
        <div className="loading-messages">
          <div className="loading-spinner"></div>
          <p>Loading messages...</p>
        </div>
      ) : messages.length === 0 && !currentBotResponse ? (
        <div className="empty-chat">
          <p>No messages yet. Start chatting!</p>
        </div>
      ) : (
        <>
          {/* Display the messages */}
          {messages.map(msg => (
            <div key={msg.id} className={`message-item ${msg.sender} ${msg.type === 'live_session_placeholder' ? 'placeholder' : ''}`}>
              {renderMessageContent(msg)}
              {msg.type !== 'live_session_placeholder' && (
              <span className="message-timestamp">
                {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
              )}
            </div>
          ))}
          
          {/* Show media upload indicator */}
          {isUploadingMedia && (
            <div className="upload-indicator">
              <div className="loading-spinner"></div>
              <p>Uploading media...</p>
            </div>
          )}
        </>
      )}
      
      {/* Render the current in-flight bot response */}
      {currentBotResponse && (
        <div key={currentBotResponse.id} className={`message-item ${currentBotResponse.sender}`}>
          <div className="message-content">
            {currentBotResponse.status === 'thinking' && (
              <p><strong>Bot:</strong> <em>Thinking</em></p>
            )}

            {currentBotResponse.status === 'streaming' && (
              <p className="streaming-text">
                {currentBotResponse.text.slice(0, -1)}
                <span className="fade-char">{currentBotResponse.text.slice(-1)}</span>
                <span className="typing-caret">▮</span>
              </p>
            )}

            {currentBotResponse.status === 'complete' && (
              <ReactMarkdown 
                remarkPlugins={[remarkGfm, remarkMath]}
                rehypePlugins={[rehypeKatex]}
              >
                {convertLatexBracketsToDollars(currentBotResponse.text)}
              </ReactMarkdown>
            )}
          </div>
          {currentBotResponse.status !== 'thinking' && (
            <span className="message-timestamp">
              {new Date(currentBotResponse.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

export default MessageList; 