import React, { useState, useEffect, useRef } from 'react';
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
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [currentBotResponse, setCurrentBotResponse] = useState(null);
  const messageInputRef = useRef(null);
  
  // API hook
  const { 
    isLoading: isApiLoading, 
    error: apiError, 
    fetchChatSessions, 
    createChatSession,
    fetchSessionMessages,
    uploadFile,
    streamMessageToLLM
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
      setCurrentBotResponse(null);
      const sessionMessages = await fetchSessionMessages(activeChatSessionId);
      setMessages(sessionMessages);
      setIsLoadingMessages(false);
    }
    
    if (activeChatSessionId) {
      loadMessagesForSession();
    }
  }, [activeChatSessionId, fetchSessionMessages]);

  // Display API errors
  useEffect(() => {
    if (apiError) {
      setCurrentBotResponse(null);
      alert(`API Error: ${apiError}`);
    }
  }, [apiError]);

  const handleApiKeyChange = (e) => {
    setApiKey(e.target.value);
  };

  const handleProviderChange = (e) => {
    setProvider(e.target.value);
  };

  const handleSendMessage = async (messageData) => {
    const { text, image } = messageData;
    
    if ((!text?.trim() && !image) || !activeChatSessionId || !apiKey) return;
    
    // Create a temporary ID for the user message
    const tempUserMessageId = `temp-user-${Date.now()}`;
    let mediaUrl = null;
    let mediaType = null;
    
    // If there's an image, upload it first
    if (image) {
      setIsUploadingImage(true);
      try {
        const uploadResult = await uploadFile(image);
        if (uploadResult) {
          mediaUrl = uploadResult.url;
          mediaType = uploadResult.media_type;
        }
      } catch (error) {
        console.error("Error uploading image:", error);
        alert(`Failed to upload image: ${error.message}`);
        setIsUploadingImage(false);
        return;
      }
      setIsUploadingImage(false);
    }
    
    // Create the user message object
    const userMessage = {
      id: tempUserMessageId,
      text: text || '',
      sender: 'user',
      timestamp: new Date().toISOString(),
      chat_session_id: activeChatSessionId,
      media_url: mediaUrl,
      media_type: mediaType
    };
    
    // Add the user message to the UI immediately
    setMessages(prevMessages => [...prevMessages, userMessage]);

    // Create a temporary ID and message for the bot response
    const tempBotId = `temp-bot-${Date.now()}`;
    setCurrentBotResponse({ 
      id: tempBotId, 
      text: '', 
      sender: 'bot', 
      timestamp: new Date().toISOString(),
      chat_session_id: activeChatSessionId,
      status: 'thinking' 
    });

    // Store whether this message had an image
    const hadImage = !!mediaUrl;

    // Begin streaming the bot response
    streamMessageToLLM(
      activeChatSessionId,
      { 
        text: text || '', 
        media_url: mediaUrl, 
        media_type: mediaType 
      },
      apiKey,
      provider,
      {
        onChunk: (chunk) => {
          setCurrentBotResponse(prev => prev ? { 
            ...prev, 
            text: prev.text + chunk, 
            status: 'streaming' 
          } : null );
        },
        onComplete: async () => {
          console.log('Stream completed, refreshing messages');
          
          // Clear current response immediately 
          setCurrentBotResponse(null);
          
          try {
            // Fetch the latest messages from the server
            const updatedMessages = await fetchSessionMessages(activeChatSessionId);
            setMessages(updatedMessages);
            
            // Focus the input field after a short delay
            setTimeout(() => {
              if (messageInputRef.current) {
                messageInputRef.current.focus();
              }
            }, 200);
          } catch (error) {
            console.error("Error refreshing messages:", error);
          }
        },
        onError: (error) => {
          setCurrentBotResponse(null);
          console.error("Streaming error:", error);
          setMessages(prevMessages => 
            prevMessages.filter(msg => msg.id !== tempUserMessageId)
          ); 
          alert(`Error streaming response: ${error.message}`);
        }
      }
    );
  };

  const handleCreateNewChat = async (switchToNew = true) => {
    setCurrentBotResponse(null);
    const newSession = await createChatSession();
    if (newSession) {
      setChatSessions(prevSessions => [newSession, ...prevSessions]);
      if (switchToNew || !activeChatSessionId) {
        setActiveChatSessionId(newSession.id);
      }
    }
  };

  const handleSelectSession = (sessionId) => {
    setCurrentBotResponse(null);
    setActiveChatSessionId(sessionId);
  };

  const handleDeleteSession = async (sessionId) => {
    if (window.confirm("Are you sure you want to delete this chat?")) {
      try {
        const response = await fetch(`${API_URL}/chat_sessions/${sessionId}`, {
          method: 'DELETE',
        });
        
        if (response.ok) {
          // Remove the session from our state
          setChatSessions(prevSessions => prevSessions.filter(s => s.id !== sessionId));
          
          // If the active session was deleted, select another one
          if (sessionId === activeChatSessionId) {
            const remainingSessions = chatSessions.filter(s => s.id !== sessionId);
            if (remainingSessions.length > 0) {
              setActiveChatSessionId(remainingSessions[0].id);
            } else {
              // If no sessions left, create a new one
              handleCreateNewChat(true);
            }
          }
        } else {
          console.error("Failed to delete chat session");
          alert("Failed to delete chat session");
        }
      } catch (error) {
        console.error("Error deleting chat session:", error);
        alert(`Error deleting chat session: ${error.message}`);
      }
    }
  };

  const isChatDisabled = !activeChatSessionId || !apiKey || isApiLoading || isUploadingImage;

  return (
    <div className="App-container">
      <ChatSidebar
        chatSessions={chatSessions}
        activeChatSessionId={activeChatSessionId}
        onSelectSession={handleSelectSession}
        onCreateNewChat={() => handleCreateNewChat(true)}
        onDeleteSession={handleDeleteSession}
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
              isLoadingMessages={isLoadingMessages}
              isUploadingImage={isUploadingImage}
              currentBotResponse={currentBotResponse}
            />
            
            <MessageInput 
              ref={messageInputRef}
              onSendMessage={handleSendMessage} 
              isDisabled={isChatDisabled}
              isLoading={isApiLoading || isUploadingImage}
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
