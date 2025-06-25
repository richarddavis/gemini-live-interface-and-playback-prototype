import React, { useState, useEffect, useRef } from 'react';
import './App.css';
import MessageList from './components/MessageList';
import MessageInput from './components/MessageInput';
import ChatSidebar from './components/ChatSidebar';
import Modal from './components/Modal';
import AppHeader from './components/AppHeader';
import { useChatApi } from './hooks/useChatApi';
import { useAuth } from './contexts/AuthContext';
import GeminiLiveDirect from './components/GeminiLiveDirect';
import InteractionReplay from './components/InteractionReplay';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8080/api';

function App() {
  // Authentication
  const { isAuthenticated, isLoading: isAuthLoading } = useAuth();
  
  // State
  const [messages, setMessages] = useState([]);
  const [chatSessions, setChatSessions] = useState([]);
  const [activeChatSessionId, setActiveChatSessionId] = useState(null);
  const [apiKey, setApiKey] = useState('');
  const [provider, setProvider] = useState('openai');
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [isUploadingMedia, setIsUploadingMedia] = useState(false);
  const [currentBotResponse, setCurrentBotResponse] = useState(null);
  const [isReplayMode, setIsReplayMode] = useState(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [isDesktopSidebarHidden, setIsDesktopSidebarHidden] = useState(false);
  
  // New modal states
  const [isLiveModalOpen, setIsLiveModalOpen] = useState(false);
  const [isPlaybackModalOpen, setIsPlaybackModalOpen] = useState(false);
  const [playbackSessionData, setPlaybackSessionData] = useState(null);
  const [liveSessionStatus, setLiveSessionStatus] = useState('disconnected');
  
  const messageInputRef = useRef(null);
  const liveSessionRef = useRef(null);
  
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

  // -------------------------------
  // Type-writer support for streaming
  // -------------------------------
  const charQueueRef = useRef([]);            // pending characters to render
  const typingIntervalRef = useRef(null);     // setInterval id

  // Helper: start / continue the type-writer loop
  const startTypingLoop = () => {
    if (typingIntervalRef.current) return; // already running
    typingIntervalRef.current = setInterval(() => {
      if (charQueueRef.current.length === 0) {
        clearInterval(typingIntervalRef.current);
        typingIntervalRef.current = null;
        return;
      }
      const nextChar = charQueueRef.current.shift();
      setCurrentBotResponse(prev => prev ? { ...prev, text: prev.text + nextChar, status: 'streaming' } : null);
    }, 20); // 50 fps ≈ 60 wpm type speed
  };

  // Clean-up on unmount
  useEffect(() => () => {
    if (typingIntervalRef.current) clearInterval(typingIntervalRef.current);
  }, []);

  // 🔑 UNIFIED API KEY LOGIC
  /**
   * Resolves the effective API key to use based on user input
   * @returns {string} The API key to use for all operations
   */
  const getEffectiveApiKey = () => {
    // If user inputs "DFRP", use the environment API key
    if (apiKey.trim() === "DFRP") {
      return process.env.REACT_APP_GEMINI_API_KEY || '';
    }
    
    // Otherwise, use the user's input directly
    return apiKey;
  };

  /**
   * Check if we have a valid API key (either user input or environment)
   * @returns {boolean} True if we have a usable API key
   */
  const hasValidApiKey = () => {
    if (provider === 'gemini') return true; // Ephemeral-token path
    const effectiveKey = getEffectiveApiKey();
    return effectiveKey && effectiveKey.trim().length > 0;
  };

  // Fetch chat sessions on component mount - but only when authenticated
  useEffect(() => {
    // Don't load data if still checking auth or not authenticated
    if (isAuthLoading || !isAuthenticated) {
      return;
    }

    async function loadInitialData() {
      try {
        const sessions = await fetchChatSessions();
        setChatSessions(sessions);
        
        if (sessions.length > 0) {
          setActiveChatSessionId(sessions[0].id);
        } else {
          handleCreateNewChat(false);
        }
      } catch (error) {
        console.error('Error loading initial data:', error);
        // If there's an auth error, don't try to create a new chat
        if (error.message.includes('Authentication required')) {
          console.log('Authentication required - not loading data');
        }
      }
    }
    
    loadInitialData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, isAuthLoading]);

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
  
  // Update provider when active chat changes
  useEffect(() => {
    if (activeChatSessionId && chatSessions.length > 0) {
      const activeSession = chatSessions.find(s => s.id === activeChatSessionId);
      if (activeSession && activeSession.provider) {
        setProvider(activeSession.provider);
      }
    }
  }, [activeChatSessionId, chatSessions]);

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
    const newProvider = e.target.value;
    setProvider(newProvider);
    
    // When provider changes, save it to the current chat session
    if (activeChatSessionId) {
      // Update local state
      setChatSessions(prevSessions => 
        prevSessions.map(session => 
          session.id === activeChatSessionId 
            ? {...session, provider: newProvider} 
            : session
        )
      );
      
      // Update in database (this doesn't need to be awaited)
      fetch(`${API_URL}/chat_sessions/${activeChatSessionId}/update_provider`, {
        method: 'POST',
        credentials: 'include', // Include session cookies
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ provider: newProvider })
      }).catch(err => console.error("Error updating provider:", err));
    }
  };

  const handleSendMessage = async (messageData) => {
    const { text, image } = messageData;
    
    const effectiveApiKey = getEffectiveApiKey();
    
    if ((!text?.trim() && !image) || !activeChatSessionId || !hasValidApiKey()) return;
    
    // Check if this is a video and using a provider that doesn't support it (e.g., OpenAI)
    if (image && image.type.startsWith('video/') && provider !== 'gemini') {
      alert(`${provider.toUpperCase()} does not support video content. Please use text or image only, or switch to a provider that supports video (e.g., Gemini).`);
      return;
    }
    
    // Create a temporary ID for the user message
    const tempUserMessageId = `temp-user-${Date.now()}`;
    let mediaUrl = null;
    let mediaType = null;
    
    // If there's an image or video, upload it first
    if (image) {
      setIsUploadingMedia(true);
      try {
        const uploadResult = await uploadFile(image);
        if (uploadResult) {
          mediaUrl = uploadResult.url;
          mediaType = uploadResult.media_type;
        }
      } catch (error) {
        console.error("Error uploading media:", error);
        alert(`Failed to upload media: ${error.message}`);
        setIsUploadingMedia(false);
        return;
      }
      setIsUploadingMedia(false);
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

    // Generate a stable id for this bot response
    const botMessageId = `bot-${Date.now()}`;

    // Create a temporary message for the bot (in-flight)
    setCurrentBotResponse({ 
      id: botMessageId, 
      text: '', 
      sender: 'bot', 
      timestamp: new Date().toISOString(),
      chat_session_id: activeChatSessionId,
      status: 'thinking'
    });

    // Ref flag to prevent duplicate completion handling
    const streamFinalizedRef = { current: false };

    // Begin streaming the bot response
    streamMessageToLLM(
      activeChatSessionId,
      { 
        text: text || '', 
        media_url: mediaUrl, 
        media_type: mediaType 
      },
      effectiveApiKey,
      provider,
      {
        onChunk: (chunk) => {
          if (!chunk) return;
          // Push characters into queue for smooth typing effect
          charQueueRef.current.push(...chunk.split(''));
          startTypingLoop();
        },
        onComplete: async () => {
          if (streamFinalizedRef.current) return;
          streamFinalizedRef.current = true;

          // Flush any remaining queued chars instantly so the final
          // message is complete before we mark status="complete".
          if (typingIntervalRef.current) {
            clearInterval(typingIntervalRef.current);
            typingIntervalRef.current = null;
          }
          if (charQueueRef.current.length) {
            setCurrentBotResponse(prev => prev ? { ...prev, text: prev.text + charQueueRef.current.join('') } : null);
            charQueueRef.current = [];
          }

          // Move / update the final bot message into the messages list
          setCurrentBotResponse(prevBot => {
            if (prevBot) {
              const finalBotMessage = {
                ...prevBot,
                status: 'complete'
              };
              setMessages(prevMsgs => {
                // Remove any existing entry with the same id first (safety)
                const withoutDuplicate = prevMsgs.filter(msg => msg.id !== finalBotMessage.id);
                return [...withoutDuplicate, finalBotMessage];
              });
            }
            return null;
          });

          // Refocus input
          setTimeout(() => {
            messageInputRef.current?.focus();
          }, 200);
        },
        onError: (error) => {
          if (streamFinalizedRef.current) return;
          streamFinalizedRef.current = true;
          setCurrentBotResponse(null);
          console.error("Streaming error:", error);
          setMessages(prevMessages => prevMessages.filter(msg => msg.id !== tempUserMessageId));
          alert(`Error streaming response: ${error.message}`);
        }
      }
    );
  };

  const handleCreateNewChat = async (switchToNew = true) => {
    setCurrentBotResponse(null);
    // Use the currently selected provider for the new chat
    const newSession = await createChatSession(provider);
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
          credentials: 'include', // Include session cookies
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
          if (response.status === 401) {
            alert("Authentication required to delete chat session");
          } else {
            console.error("Failed to delete chat session");
            alert("Failed to delete chat session");
          }
        }
      } catch (error) {
        console.error("Error deleting chat session:", error);
        alert(`Error deleting chat session: ${error.message}`);
      }
    }
  };

  // Handle status changes from live session component
  const handleLiveSessionStatusChange = (status) => {
    setLiveSessionStatus(status);
  };

  // Create subtitle for modal header
  const getLiveSessionSubtitle = () => {
    const statusMap = {
      'connecting': 'Connecting...',
      'connected': '🔴 Live',
      'disconnected': 'Disconnected'
    };
    
    return (
      <span className={`modal-subtitle ${liveSessionStatus}`}>
        {statusMap[liveSessionStatus] || 'Disconnected'}
      </span>
    );
  };

  const handleToggleLiveMode = () => {
    // Use modal for both desktop and mobile (consistent with playback interface)
    console.log('Opening live modal for both desktop and mobile');
    setIsLiveModalOpen(true);
  };

  const handleToggleReplayMode = () => {
    // For mobile, keep the old behavior (separate page)  
    if (window.innerWidth <= 768) {
      console.log('Mobile: Toggling replay mode. Current:', isReplayMode);
      setIsReplayMode(prevMode => !prevMode);
      console.log('Mobile: Replay mode will be:', !isReplayMode);
    } else {
      // For desktop, open the modal with no specific session (browse mode)
      console.log('Desktop: Opening replay modal');
      setIsPlaybackModalOpen(true);
      setPlaybackSessionData(null);
    }
  };

  const handleCloseLiveModal = async () => {
    // If there's an active live session, trigger proper disconnect to collect session data
    if (liveSessionRef.current && liveSessionRef.current.triggerDisconnect) {
      console.log('🎭 Modal closed via X/ESC - triggering session completion...');
      try {
        await liveSessionRef.current.triggerDisconnect();
      } catch (error) {
        console.warn('⚠️ Error during modal close session completion:', error);
        // Still close the modal even if session completion fails
        setIsLiveModalOpen(false);
      }
    } else {
      // No active session or component not ready, just close modal
      console.log('🎭 Modal closed - no active session to complete');
      setIsLiveModalOpen(false);
    }
  };

  const handleClosePlaybackModal = () => {
    setIsPlaybackModalOpen(false);
    setPlaybackSessionData(null);
  };

  const handleLiveSessionComplete = async (sessionData) => {
    // Close modal for both desktop and mobile (now using consistent modal approach)
    setIsLiveModalOpen(false);
    
    // If no sessionData, this was a casual exit - no need to save anything
    if (!sessionData) {
      console.log('🚪 Casual exit - no session data to save');
      return;
    }
    
    // Only save session data if we have an active chat session
    if (sessionData && activeChatSessionId) {
      try {
        // Save the live session placeholder to the database
        const response = await fetch(`${API_URL}/chat_sessions/${activeChatSessionId}/live_session_placeholder`, {
          method: 'POST',
          credentials: 'include', // Include session cookies
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            sessionData: sessionData
          })
        });

        if (!response.ok) {
          throw new Error(`Failed to save live session placeholder: ${response.statusText}`);
        }

        const placeholderMessage = await response.json();
        console.log('✅ Live session placeholder saved to database:', placeholderMessage);

        // Refresh messages to include the new placeholder
        try {
          const updatedMessages = await fetchSessionMessages(activeChatSessionId);
          setMessages(updatedMessages);
        } catch (error) {
          console.error('Error refreshing messages after live session:', error);
          // Fallback: add placeholder to local state if database refresh fails
          const fallbackPlaceholder = {
            id: placeholderMessage.id || `live-session-${Date.now()}`,
            type: 'live_session_placeholder',
            sessionData: sessionData,
            timestamp: new Date().toISOString(),
            chat_session_id: activeChatSessionId,
            sender: 'system'
          };
          setMessages(prevMessages => [...prevMessages, fallbackPlaceholder]);
        }

      } catch (error) {
        console.error('❌ Error saving live session placeholder:', error);
        // Fallback: show error to user but still add placeholder locally for UX
        alert(`Warning: Live session completed but couldn't save to history: ${error.message}`);
        
        const fallbackPlaceholder = {
          id: `live-session-${Date.now()}`,
          type: 'live_session_placeholder', 
          sessionData: sessionData,
          timestamp: new Date().toISOString(),
          chat_session_id: activeChatSessionId,
          sender: 'system'
        };
        setMessages(prevMessages => [...prevMessages, fallbackPlaceholder]);
      }
    }
  };

  const handlePlaybackFromPlaceholder = (sessionData) => {
    console.log('🎭 handlePlaybackFromPlaceholder called with:', sessionData);
    setPlaybackSessionData(sessionData);
    setIsPlaybackModalOpen(true);
  };

  const isChatDisabled = !activeChatSessionId || !hasValidApiKey() || isApiLoading || isUploadingMedia;

  // Handle mobile sidebar toggle
  const handleMobileSidebarToggle = () => {
    if (window.innerWidth <= 768) {
      // Mobile behavior: toggle overlay
      setIsMobileSidebarOpen(!isMobileSidebarOpen);
    } else {
      // Desktop behavior: toggle visibility
      setIsDesktopSidebarHidden(!isDesktopSidebarHidden);
    }
  };

  // Close mobile sidebar when clicking overlay
  const handleOverlayClick = () => {
    setIsMobileSidebarOpen(false);
  };

  // Close mobile sidebar when selecting a session (mobile UX)
  const handleSelectSessionMobile = (sessionId) => {
    setCurrentBotResponse(null);
    setActiveChatSessionId(sessionId);
    setIsMobileSidebarOpen(false); // Close sidebar on mobile after selection
  };

  // Close mobile sidebar when window resizes to desktop
  useEffect(() => {
    const handleResize = () => {
      // Remove the auto-close behavior for desktop since we now use 
      // the hamburger menu for all screen sizes
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return (
    <div className="App-container">
      {console.log('Rendering App - live sessions now use modals')}
      
      {/* Fixed Header */}
      <AppHeader 
        onToggleMobileMenu={handleMobileSidebarToggle}
        isMobileSidebarOpen={isMobileSidebarOpen}
        isAuthenticated={isAuthenticated}
        isAuthLoading={isAuthLoading}
      />
      
      {/* Main content container below header */}
      <div className="app-body">
        {/* Show loading spinner while checking authentication */}
        {isAuthLoading ? (
          <div className="auth-loading-container">
            <div className="auth-loading-content">
              <div className="loading-spinner"></div>
              <p>Checking authentication...</p>
            </div>
          </div>
        ) : !isAuthenticated ? (
          /* Show welcome message when not authenticated */
          <div className="auth-required-container">
            <div className="auth-required-content">
              <h2>Welcome to Chat App!</h2>
              <p>Please sign in to start chatting with AI assistants.</p>
              <p>Use the "Log in" button in the top-right corner to get started.</p>
            </div>
          </div>
        ) : (
          /* Main app content - only show when authenticated */
          <>
            <ChatSidebar
              chatSessions={chatSessions}
              activeChatSessionId={activeChatSessionId}
              onSelectSession={handleSelectSession}
              onCreateNewChat={() => handleCreateNewChat(true)}
              onDeleteSession={handleDeleteSession}
              isMobileSidebarOpen={isMobileSidebarOpen}
              isDesktopSidebarHidden={isDesktopSidebarHidden}
              onMobileSidebarToggle={handleMobileSidebarToggle}
              onOverlayClick={handleOverlayClick}
              onSelectSessionMobile={handleSelectSessionMobile}
              apiKey={apiKey}
              onApiKeyChange={handleApiKeyChange}
              provider={provider}
              onProviderChange={handleProviderChange}
              isOpen={isMobileSidebarOpen}
              onClose={handleOverlayClick}
            />
            
            <div className="App-main-content">
              {isReplayMode ? (
                <div className="replay-mode-container">
                  <InteractionReplay onExitReplayMode={handleToggleReplayMode} />
                </div>
              ) : (
                <>
                  {activeChatSessionId ? (
                    <main className="chat-container">
                      <MessageList 
                        messages={messages} 
                        isLoadingMessages={isLoadingMessages}
                        isUploadingMedia={isUploadingMedia}
                        currentBotResponse={currentBotResponse}
                        onPlaybackFromPlaceholder={handlePlaybackFromPlaceholder}
                      />
                      
                      <MessageInput 
                        ref={messageInputRef}
                        onSendMessage={handleSendMessage} 
                        isDisabled={isChatDisabled}
                        isLoading={isApiLoading || isUploadingMedia}
                        provider={provider}
                        onToggleLiveMode={handleToggleLiveMode}
                        apiKey={getEffectiveApiKey()}
                      />
                    </main>
                  ) : (
                    <div className="no-active-chat">
                      <h2>Welcome to Chat App!</h2>
                      <p>Select a chat from the sidebar or create a new one to start messaging.</p>
                      <button onClick={() => handleCreateNewChat(true)}>Start New Chat</button>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Live Session Modal */}
            <Modal
              isOpen={isLiveModalOpen}
              onClose={handleCloseLiveModal}
              title="Live Session"
              subtitle={getLiveSessionSubtitle()}
              size="live-session"
            >
              <GeminiLiveDirect 
                onExitLiveMode={handleLiveSessionComplete}
                onStatusChange={handleLiveSessionStatusChange}
                isModal={true}
                chatSessionId={activeChatSessionId}
                ref={liveSessionRef}
                apiKey={getEffectiveApiKey()}
              />
            </Modal>

            {/* Playback Modal */}
            <Modal
              isOpen={isPlaybackModalOpen}
              onClose={handleClosePlaybackModal}
              title="Session Playback"
              size="session-playback"
            >
              <InteractionReplay 
                onExitReplayMode={handleClosePlaybackModal}
                sessionData={playbackSessionData}
                isModal={true}
              />
            </Modal>
          </>
        )}
      </div>
    </div>
  );
}

export default App;
