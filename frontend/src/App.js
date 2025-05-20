import React, { useState, useEffect } from 'react';
import './App.css';
import ChatHeader from './components/ChatHeader';
import MessageList from './components/MessageList';
import MessageInput from './components/MessageInput';
import ChatSidebar from './components/ChatSidebar';
import { useChatApi } from './hooks/useChatApi';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5001/api';

function App() {
  // State
  const [messages, setMessages] = useState([]);
  const [chatSessions, setChatSessions] = useState([]);
  const [activeChatSessionId, setActiveChatSessionId] = useState(null);
  const [apiKey, setApiKey] = useState('');
  const [provider, setProvider] = useState('openai');
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  
  // API hook
  const { 
    isLoading: isApiLoading, 
    error: apiError, 
    fetchChatSessions, 
    createChatSession,
    fetchSessionMessages,
    sendMessageToLLM
  } = useChatApi(API_URL);

  // Fetch chat sessions on component mount
  useEffect(() => {
    async function loadInitialData() {
      const sessions = await fetchChatSessions();
      setChatSessions(sessions);
      
      if (sessions.length > 0) {
        setActiveChatSessionId(sessions[0].id);
      } else {
        handleCreateNewChat(false);
      }
    }
    loadInitialData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fetch messages for the active chat session
  useEffect(() => {
    async function loadMessagesForSession() {
      if (!activeChatSessionId) {
        setMessages([]);
        return;
      }
      
      setIsLoadingMessages(true);
      const sessionMessages = await fetchSessionMessages(activeChatSessionId);
      setMessages(sessionMessages);
      setIsLoadingMessages(false);
    }
    
    loadMessagesForSession();
  }, [activeChatSessionId, fetchSessionMessages]);

  // Display API errors
  useEffect(() => {
    if (apiError) {
      alert(`API Error: ${apiError}`);
    }
  }, [apiError]);

  const handleApiKeyChange = (e) => {
    setApiKey(e.target.value);
  };

  const handleProviderChange = (e) => {
    setProvider(e.target.value);
  };

  const handleSendMessage = async (messageText) => {
    if (!messageText.trim() || !activeChatSessionId || !apiKey) return;
    
    // Get the current bot response (this will also save the user message)
    const botMessage = await sendMessageToLLM(
      activeChatSessionId, 
      messageText, 
      apiKey, 
      provider
    );
    
    if (botMessage) {
      // Optimistically update the UI with both messages
      setMessages(prevMessages => [
        ...prevMessages,
        // User message (the backend actually saves this too)
        {
          id: `temp-${Date.now()}`,
          text: messageText,
          sender: 'user',
          timestamp: new Date().toISOString(),
          chat_session_id: activeChatSessionId,
        },
        // Bot response from API
        botMessage
      ]);
    }
  };

  const handleCreateNewChat = async (switchToNew = true) => {
    const newSession = await createChatSession();
    if (newSession) {
      setChatSessions(prevSessions => [newSession, ...prevSessions]);
      if (switchToNew || !activeChatSessionId) {
        setActiveChatSessionId(newSession.id);
      }
    }
  };

  const handleSelectSession = (sessionId) => {
    setActiveChatSessionId(sessionId);
  };

  // Determine if chat input should be disabled
  const isChatDisabled = !activeChatSessionId || !apiKey;

  return (
    <div className="App-container">
      <ChatSidebar
        chatSessions={chatSessions}
        activeChatSessionId={activeChatSessionId}
        onSelectSession={handleSelectSession}
        onCreateNewChat={() => handleCreateNewChat(true)}
      />
      
      <div className="App-main-content">
        <ChatHeader 
          apiKey={apiKey}
          onApiKeyChange={handleApiKeyChange}
          provider={provider}
          onProviderChange={handleProviderChange}
          activeChatSessionId={activeChatSessionId}
        />
        
        {activeChatSessionId ? (
          <main className="chat-container">
            <MessageList 
              messages={messages} 
              isLoading={isApiLoading} 
              isLoadingMessages={isLoadingMessages} 
            />
            
            <MessageInput 
              onSendMessage={handleSendMessage} 
              isDisabled={isChatDisabled}
              isLoading={isApiLoading} 
            />
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
