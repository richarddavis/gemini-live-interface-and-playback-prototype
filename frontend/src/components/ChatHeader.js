import React, { useEffect, useRef } from 'react';

function ChatHeader({ 
  apiKey, 
  onApiKeyChange, 
  provider, 
  onProviderChange, 
  activeChatSessionId,
  isLiveMode,
  onToggleLiveMode
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
    const newApiKey = e.target.value;
    sessionStorage.setItem('chatApiKey', newApiKey);
    onApiKeyChange(e);
  };
  
  // Save provider to sessionStorage when it changes
  const handleProviderChange = (e) => {
    const newProvider = e.target.value;
    sessionStorage.setItem('chatProvider', newProvider);
    onProviderChange(e);
  };

  // Disable the live button if not in live mode AND (provider is not gemini OR no API key)
  const isLiveButtonDisabled = !isLiveMode && (provider !== 'gemini' || !apiKey);

  return (
    <header className="App-header">
      <h1>Chat App</h1>
      <div className="api-controls">
        <input
          type="password"
          className="api-key-input"
          placeholder="Enter OpenAI or Gemini API Key"
          value={apiKey}
          onChange={handleApiKeyChange}
          autoComplete="off"
        />
        <select
          className="provider-select"
          value={provider}
          onChange={handleProviderChange}
        >
          <option value="openai">OpenAI (GPT-4o)</option>
          <option value="gemini">Gemini</option>
        </select>
        <button onClick={onToggleLiveMode} disabled={isLiveButtonDisabled}>
          {isLiveMode ? 'Switch to Chat' : 'Switch to Live'}
        </button>
        <div className="api-key-info">
          <small>Your API key is stored in your browser and sent directly to the AI provider.</small>
        </div>
      </div>
      {activeChatSessionId && <p>Session ID: {activeChatSessionId}</p>}
    </header>
  );
}

export default ChatHeader; 