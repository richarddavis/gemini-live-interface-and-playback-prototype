import React, { useState, useEffect, useRef } from 'react';
import './App.css';
import ChatSidebar from './ChatSidebar'; // Import the sidebar

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5001/api';

function App() {
  const [currentMessage, setCurrentMessage] = useState('');
  const [messages, setMessages] = useState([]);
  const [chatSessions, setChatSessions] = useState([]);
  const [activeChatSessionId, setActiveChatSessionId] = useState(null);
  const [apiKey, setApiKey] = useState('');
  const [provider, setProvider] = useState('openai');
  const [isLoading, setIsLoading] = useState(false);
  const messageListRef = useRef(null);

  // Fetch chat sessions on component mount
  useEffect(() => {
    const fetchChatSessions = async () => {
      try {
        const response = await fetch(`${API_URL}/chat_sessions`);
        if (!response.ok) throw new Error('Failed to fetch chat sessions');
        const data = await response.json();
        setChatSessions(data);
        if (data.length > 0) {
          // Activate the most recent session (or first in the list if not sorted by date)
          setActiveChatSessionId(data[0].id); 
        } else {
          // If no sessions, create one automatically or prompt user
          handleCreateNewChat(false); // Create a new chat but don't switch to it if one becomes active
        }
      } catch (error) {
        console.error("Error fetching chat sessions:", error);
      }
    };
    fetchChatSessions();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Empty dependency array means this runs once on mount

  // Fetch messages for the active chat session
  useEffect(() => {
    const fetchMessagesForSession = async () => {
      if (!activeChatSessionId) {
        setMessages([]);
        return;
      }
      try {
        const response = await fetch(`${API_URL}/chat_sessions/${activeChatSessionId}/messages`);
        if (!response.ok) throw new Error('Failed to fetch messages for session');
        const data = await response.json();
        setMessages(data);
      } catch (error) {
        console.error(`Error fetching messages for session ${activeChatSessionId}:`, error);
        setMessages([]); // Clear messages on error
      }
    };
    fetchMessagesForSession();
  }, [activeChatSessionId]);

  // Scroll to bottom when messages change
  useEffect(() => {
    if (messageListRef.current) {
      messageListRef.current.scrollTop = messageListRef.current.scrollHeight;
    }
  }, [messages]);

  const handleInputChange = (e) => {
    setCurrentMessage(e.target.value);
  };

  const handleApiKeyChange = (e) => {
    setApiKey(e.target.value);
  };

  const handleProviderChange = (e) => {
    setProvider(e.target.value);
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!currentMessage.trim() || !activeChatSessionId || !apiKey) return;
    setIsLoading(true);
    const userMessageText = currentMessage;
    setCurrentMessage('');
    try {
      // Send to backend, which will save user message, call LLM, save bot message, and return bot message
      const response = await fetch(`${API_URL}/chat_sessions/${activeChatSessionId}/respond_llm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: userMessageText,
          api_key: apiKey,
          provider: provider,
        }),
      });
      if (!response.ok) {
        const err = await response.json();
        alert(err.error || 'Failed to get response from LLM provider.');
        setIsLoading(false);
        return;
      }
      // The backend saves the user message, so we need to refetch all messages for this session
      // Or, optimistically add the user message and then the bot message
      const botMessage = await response.json();
      setMessages(prevMessages => [
        ...prevMessages,
        {
          id: Date.now(),
          text: userMessageText,
          sender: 'user',
          timestamp: new Date().toISOString(),
          chat_session_id: activeChatSessionId,
        },
        botMessage,
      ]);
    } catch (error) {
      alert('Error sending message to LLM provider.');
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateNewChat = async (switchToNew = true) => {
    try {
      const response = await fetch(`${API_URL}/chat_sessions`, { method: 'POST' });
      if (!response.ok) throw new Error('Failed to create new chat session');
      const newSession = await response.json();
      setChatSessions(prevSessions => [newSession, ...prevSessions]); // Add to top of list
      if (switchToNew || !activeChatSessionId) {
         setActiveChatSessionId(newSession.id);
      }
      return newSession;
    } catch (error) {
      console.error("Error creating new chat session:", error);
      return null;
    }
  };

  const handleSelectSession = (sessionId) => {
    setActiveChatSessionId(sessionId);
  };

  return (
    <div className="App-container"> {/* Renamed .App to .App-container for clarity with sidebar */} 
      <ChatSidebar 
        chatSessions={chatSessions}
        activeChatSessionId={activeChatSessionId}
        onSelectSession={handleSelectSession}
        onCreateNewChat={() => handleCreateNewChat(true)}
      />
      <div className="App-main-content"> {/* New wrapper for header and chat */} 
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
              <option value="gemini">Gemini (stub)</option>
            </select>
          </div>
          {activeChatSessionId && <p>Session ID: {activeChatSessionId}</p>}
        </header>
        
        {activeChatSessionId ? (
          <main className="chat-container">
            <div className="message-list" ref={messageListRef}>
              {messages.map(msg => (
                <div key={msg.id} className={`message-item ${msg.sender}`}>
                  <div className="message-content">
                    <p><strong>{msg.sender === 'user' ? 'You' : 'Bot'}:</strong> {msg.text}</p>
                  </div>
                  <span className="message-timestamp">{new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
              ))}
              {isLoading && (
                <div className="message-item bot">
                  <div className="message-content">
                    <p><strong>Bot:</strong> <em>Thinking...</em></p>
                  </div>
                </div>
              )}
            </div>
            
            <form onSubmit={handleSendMessage} className="message-input-form">
              <input
                type="text"
                value={currentMessage}
                onChange={handleInputChange}
                placeholder="Type your message..."
                disabled={!activeChatSessionId || !apiKey || isLoading}
              />
              <button type="submit" disabled={!activeChatSessionId || !apiKey || isLoading}>Send</button>
            </form>
          </main>
        ) : (
          <div className="no-active-chat">
            <h2>Welcome to Chat App!</h2>
            <p>Select a chat from the sidebar or create a new one to start messaging.</p>
            <button onClick={() => handleCreateNewChat(true)}>Start New Chat</button>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
