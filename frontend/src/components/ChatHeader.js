import React from 'react';

function ChatHeader({ 
  isReplayMode,
  onToggleReplayMode,
  onMobileSidebarToggle,
  onHeaderCollapseToggle,
  isHeaderCollapsed
}) {
  return (
    <div className={`chat-header ${isHeaderCollapsed ? 'collapsed' : ''}`}>
      <div className="header-top-row">
        <button 
          className="mobile-menu-button"
          onClick={onMobileSidebarToggle}
          aria-label="Open sidebar"
        >
          ☰
        </button>
        
        <div className="mode-indicators">
          {isReplayMode && <span className="replay-indicator">Replay</span>}
        </div>
        
        <button 
          className="header-collapse-toggle"
          onClick={onHeaderCollapseToggle}
          aria-label={isHeaderCollapsed ? "Expand header" : "Collapse header"}
        >
          {isHeaderCollapsed ? '▼' : '▲'}
        </button>
      </div>
      
      {!isHeaderCollapsed && (
        <div className="header-secondary-controls">
          <div className="header-controls-center">
            <button 
              onClick={onToggleReplayMode}
              className={`replay-button ${isReplayMode ? 'active' : ''}`}
            >
              {isReplayMode ? 'Stop Replay' : 'Start Replay'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default ChatHeader; 