import React from 'react';

function ChatSidebar({ 
  chatSessions, 
  activeChatSessionId, 
  onSelectSession, 
  onCreateNewChat, 
  onDeleteSession,
  isMobileSidebarOpen,
  isDesktopSidebarHidden,
  onOverlayClick,
  apiKey, 
  onApiKeyChange, 
  provider, 
  onProviderChange,
  isOpen,
  onClose
}) {
  
  // Handle session selection - use mobile-aware handler if on mobile
  const handleSessionSelect = (sessionId) => {
    onSelectSession(sessionId);
    // On mobile, close the sidebar after selection
    if (window.innerWidth <= 768 && isMobileSidebarOpen) {
      // Small delay to allow the selection to register before closing
      setTimeout(() => {
        if (onOverlayClick) onOverlayClick();
      }, 100);
    }
  };

  // Save API key to sessionStorage when it changes
  const handleApiKeyChange = (e) => {
    const value = e.target.value;
    onApiKeyChange(e);
    sessionStorage.setItem('chatApiKey', value);
  };
  
  // Save provider to sessionStorage when it changes
  const handleProviderChange = (e) => {
    const value = e.target.value;
    onProviderChange(e);
    sessionStorage.setItem('chatProvider', value);
  };

  // Determine CSS classes based on screen size and state
  const getSidebarClasses = () => {
    let classes = 'chat-sidebar';
    
    if (window.innerWidth <= 768) {
      // Mobile: use mobile-open class
      if (isMobileSidebarOpen) {
        classes += ' mobile-open';
      }
    } else {
      // Desktop: use sidebar-hidden class
      if (isDesktopSidebarHidden) {
        classes += ' sidebar-hidden';
      }
    }
    
    return classes;
  };

  return (
    <>
      {/* Mobile overlay */}
      {isMobileSidebarOpen && (
        <div 
          className="sidebar-overlay active" 
          onClick={onOverlayClick}
          aria-label="Close sidebar"
        />
      )}
      
      <aside className={getSidebarClasses()}>
        <button 
          className="new-chat-button" 
          onClick={onCreateNewChat}
        >
        + New Chat
      </button>
      
        <ul className="chat-session-list">
          {chatSessions.map(session => (
            <li 
              key={session.id} 
              className={`chat-session-item ${session.id === activeChatSessionId ? 'active' : ''}`}
              onClick={() => handleSessionSelect(session.id)}
            >
              <span className="chat-session-name">
                {session.title || `Chat ${String(session.id).slice(0, 8)}`}
              </span>
              <button 
                className="delete-chat-button"
                onClick={(e) => {
                  e.stopPropagation();
                  onDeleteSession(session.id);
                }}
                aria-label="Delete chat"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
        
        {chatSessions.length === 0 && (
          <div className="no-chats-message">
            No chats yet. Create your first chat!
          </div>
        )}

        {/* API Controls at bottom of sidebar */}
        <div className="sidebar-api-controls">
          <div className="sidebar-control-group">
            <label htmlFor="sidebar-provider-select">Provider</label>
            <select 
              id="sidebar-provider-select"
              value={provider} 
              onChange={handleProviderChange}
              className="sidebar-select"
            >
              <option value="openai">OpenAI</option>
              <option value="anthropic">Anthropic</option>
              <option value="gemini">Gemini</option>
            </select>
          </div>

          <div className="sidebar-control-group">
            <label htmlFor="sidebar-api-key-input">API Key</label>
            <input
              id="sidebar-api-key-input"
              type="password"
              placeholder="Enter API key"
              value={apiKey}
              onChange={handleApiKeyChange}
              className="sidebar-input"
            />
          </div>
    </div>
      </aside>

      {isOpen && <div className="sidebar-overlay" onClick={onClose}></div>}
    </>
  );
}

export default ChatSidebar; 