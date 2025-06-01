import React, { useEffect, useRef } from 'react';

function ChatHeader({ 
  apiKey, 
  onApiKeyChange, 
  provider, 
  onProviderChange, 
  activeChatSessionId,
  isLiveMode,
  onToggleLiveMode,
  isReplayMode,
  onToggleReplayMode,
  onMobileSidebarToggle,
  onHeaderCollapseToggle,
  isHeaderCollapsed
}) {
  const initialLoadDone = useRef(false);

  // Load API key and provider from sessionStorage ONLY on initial mount
  useEffect(() => {
    if (initialLoadDone.current) return; // Skip after initial load
    
    const savedApiKey = sessionStorage.getItem('chatApiKey');
    if (savedApiKey && onApiKeyChange) {
      onApiKeyChange({ target: { value: savedApiKey } });
    }
    
    const savedProvider = sessionStorage.getItem('chatProvider');
    if (savedProvider && onProviderChange && !activeChatSessionId) {
      // Only set from storage if no active chat (which would have its own provider)
      onProviderChange({ target: { value: savedProvider } });
    }
    
    initialLoadDone.current = true;
  }, [onApiKeyChange, onProviderChange, activeChatSessionId]);

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

  // Disable the live button if not in live mode AND (provider is not gemini OR no API key)
  const isLiveButtonDisabled = !isLiveMode && (provider !== 'gemini' || !apiKey);

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
        
        <h1 className="header-title">
          {activeChatSessionId ? `Chat ${activeChatSessionId}` : 'Gemini Live Chat'}
        </h1>
        
        <div className="mode-indicators">
          {isLiveMode && <span className="live-indicator">Live</span>}
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
          <div className="api-controls">
            <label htmlFor="provider-select">Provider:</label>
            <select 
              id="provider-select"
              value={provider} 
              onChange={handleProviderChange}
              className="provider-select"
            >
              <option value="openai">OpenAI</option>
              <option value="anthropic">Anthropic</option>
              <option value="gemini">Gemini</option>
            </select>

            <label htmlFor="api-key-input">API Key:</label>
            <input
              id="api-key-input"
              type="password"
              placeholder="Enter API key"
              value={apiKey}
              onChange={handleApiKeyChange}
              className="api-key-input"
            />

            <button 
              onClick={onToggleLiveMode}
              className={isLiveMode ? 'active' : ''}
              disabled={!apiKey}
            >
              {isLiveMode ? 'Stop Live' : 'Start Live'}
            </button>

            <button 
              onClick={onToggleReplayMode}
              className={isReplayMode ? 'active' : ''}
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