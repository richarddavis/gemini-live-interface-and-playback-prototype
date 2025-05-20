import React, { useEffect } from 'react';

function ChatHeader({ 
  apiKey, 
  onApiKeyChange, 
  provider, 
  onProviderChange, 
  activeChatSessionId 
}) {
  // Load API key from sessionStorage on component mount
  useEffect(() => {
    const savedApiKey = sessionStorage.getItem('chatApiKey');
    if (savedApiKey && onApiKeyChange) {
      onApiKeyChange({ target: { value: savedApiKey } });
    }
  }, [onApiKeyChange]);

  // Save API key to sessionStorage when it changes
  const handleApiKeyChange = (e) => {
    const newApiKey = e.target.value;
    sessionStorage.setItem('chatApiKey', newApiKey);
    onApiKeyChange(e);
  };

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
          onChange={onProviderChange}
        >
          <option value="openai">OpenAI (GPT-4o)</option>
          <option value="gemini">Gemini (stub)</option>
        </select>
        <div className="api-key-info">
          <small>Your API key is stored in your browser and sent directly to the AI provider.</small>
        </div>
      </div>
      {activeChatSessionId && <p>Session ID: {activeChatSessionId}</p>}
    </header>
  );
}

export default ChatHeader; 