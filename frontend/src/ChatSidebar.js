import React from 'react';

function ChatSidebar({ chatSessions, activeChatSessionId, onSelectSession, onCreateNewChat }) {
  return (
    <div className="chat-sidebar">
      <button onClick={onCreateNewChat} className="new-chat-button">
        + New Chat
      </button>
      <ul className="chat-session-list">
        {chatSessions.map(session => (
          <li 
            key={session.id} 
            className={`chat-session-item ${session.id === activeChatSessionId ? 'active' : ''}`}
            onClick={() => onSelectSession(session.id)}
          >
            {session.name || `Chat ${session.id}`}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default ChatSidebar; 