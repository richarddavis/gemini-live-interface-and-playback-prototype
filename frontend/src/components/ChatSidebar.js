import React from 'react';

function ChatSidebar({ 
  chatSessions, 
  activeChatSessionId, 
  onSelectSession, 
  onCreateNewChat, 
  onDeleteSession,
  isMobileSidebarOpen,
  onOverlayClick
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
      
      <aside className={`chat-sidebar ${isMobileSidebarOpen ? 'mobile-open' : ''}`}>
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
      </aside>
    </>
  );
}

export default ChatSidebar; 