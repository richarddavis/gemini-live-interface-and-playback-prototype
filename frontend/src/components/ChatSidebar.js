import React from 'react';

function ChatSidebar({ chatSessions, activeChatSessionId, onSelectSession, onCreateNewChat, onDeleteSession }) {
  return (
    <div className="chat-sidebar">
      <button onClick={onCreateNewChat} className="new-chat-button">
        + New Chat
      </button>
      
      {chatSessions.length === 0 ? (
        <div className="no-chats-message">No chats yet</div>
      ) : (
        <ul className="chat-session-list">
          {chatSessions.map(session => (
            <li 
              key={session.id} 
              className={`chat-session-item ${session.id === activeChatSessionId ? 'active' : ''}`}
            >
              <div 
                className="chat-session-name" 
                onClick={() => onSelectSession(session.id)}
              >
                {session.name || `Chat ${session.id}`}
              </div>
              <button 
                className="delete-chat-button"
                onClick={(e) => {
                  e.stopPropagation();
                  onDeleteSession(session.id);
                }}
                title="Delete chat"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default ChatSidebar; 