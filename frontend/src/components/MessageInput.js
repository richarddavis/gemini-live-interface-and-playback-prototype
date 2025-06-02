import React, { useState, useRef, useEffect, useCallback } from 'react';

const MessageInput = React.forwardRef(({ 
  onSendMessage, 
  isDisabled, 
  isLoading, 
  provider,
  onToggleLiveMode,
  isLiveMode,
  apiKey
}, ref) => {
  const [currentMessage, setCurrentMessage] = useState('');
  const [selectedMedia, setSelectedMedia] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [mediaType, setMediaType] = useState(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const [captureMode, setCaptureMode] = useState('image'); // 'image', 'video', or 'audio'
  const [videoStream, setVideoStream] = useState(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTimeLeft, setRecordingTimeLeft] = useState(0);
  const [isRecordingAudio, setIsRecordingAudio] = useState(false);
  
  const fileInputRef = useRef(null);
  const videoRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const timerRef = useRef(null);
  const videoStreamRef = useRef(null);
  const isRecordingRef = useRef(false);
  const isRecordingAudioRef = useRef(false);

  // Update refs when state changes
  useEffect(() => {
    videoStreamRef.current = videoStream;
  }, [videoStream]);

  useEffect(() => {
    isRecordingRef.current = isRecording;
  }, [isRecording]);

  useEffect(() => {
    isRecordingAudioRef.current = isRecordingAudio;
  }, [isRecordingAudio]);

  // Cleanup function to properly stop media streams
  const stopCameraStream = useCallback(() => {
    console.log('stopCameraStream called');
    
    if (videoStreamRef.current) {
      console.log('Stopping video stream tracks...');
      videoStreamRef.current.getTracks().forEach(track => {
        track.stop();
        console.log('Stopped track:', track.kind, track.label);
      });
      setVideoStream(null);
      videoStreamRef.current = null;
    }
    
    if (mediaRecorderRef.current && (isRecordingRef.current || isRecordingAudioRef.current)) {
      console.log('Stopping media recorder...');
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      setIsRecordingAudio(false);
      isRecordingRef.current = false;
      isRecordingAudioRef.current = false;
    }
    
    if (timerRef.current) {
      console.log('Clearing timer...');
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    
    // Clear video element source
    if (videoRef.current) {
      console.log('Clearing video element...');
      videoRef.current.srcObject = null;
      videoRef.current.src = '';
      videoRef.current.onloadedmetadata = null;
      videoRef.current.onerror = null;
    }
    
    console.log('Setting isCapturing to false');
    setIsCapturing(false);
    setRecordingTimeLeft(0);
  }, []); // No dependencies - use refs for current values

  // Clean up camera stream when component unmounts ONLY
  useEffect(() => {
    return () => {
      console.log('Component unmounting, cleaning up...');
      // Only clean up on actual unmount, not on every videoStream change
      if (videoStreamRef.current) {
        videoStreamRef.current.getTracks().forEach(track => track.stop());
      }
      if (mediaRecorderRef.current && (isRecordingRef.current || isRecordingAudioRef.current)) {
        mediaRecorderRef.current.stop();
      }
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, []); // Empty dependency array - only run on mount/unmount

  // Handle camera/microphone capture for different modes
  const handleCameraCapture = async (mode) => {
    try {
      // Only close existing stream if we're already capturing
      if (isCapturing) {
        console.log('Closing existing capture session...');
        stopCameraStream();
        // Add a small delay to let the previous stream fully close
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      
      setCaptureMode(mode);
      setIsCapturing(true);
      
      console.log(`Starting ${mode} capture...`);
      
      let streamConstraints;
      if (mode === 'audio') {
        streamConstraints = { 
          audio: true, 
          video: false 
        };
      } else {
        streamConstraints = { 
          video: true, 
          audio: mode === 'video'
        };
      }
      
      // Request media access
      console.log('Requesting media access with constraints:', streamConstraints);
      const stream = await navigator.mediaDevices.getUserMedia(streamConstraints);
      console.log('Media access granted, stream received:', stream);
      
      setVideoStream(stream);
      
      // For video/image modes, set up video element with proper timing
      if (mode !== 'audio' && videoRef.current) {
        console.log('Setting up video element...');
        
        // Add a small delay to ensure DOM is ready and capture interface is rendered
        setTimeout(() => {
          if (videoRef.current && stream) {
            videoRef.current.srcObject = stream;
            
            // Set up event handlers
            videoRef.current.onloadedmetadata = () => {
              console.log('Video metadata loaded, attempting to play...');
              if (videoRef.current) {
                videoRef.current.play().then(() => {
                  console.log('Video playing successfully');
                }).catch(err => {
                  console.error('Error playing video:', err);
                  // Don't close capture interface on play error
                });
              }
            };
            
            videoRef.current.onerror = (error) => {
              console.error('Video element error:', error);
              // Don't close capture interface on video error
            };
            
            // Fallback: try to play immediately in case metadata is already loaded
            if (videoRef.current.readyState >= 1) {
              videoRef.current.play().catch(err => {
                console.error('Fallback video play error:', err);
              });
            }
          }
        }, 100); // Small delay to ensure DOM is ready
      }
      
      // For audio mode, start recording immediately
      if (mode === 'audio') {
        console.log('Starting audio recording...');
        startAudioRecording(stream);
      }
      
      console.log(`${mode} capture setup completed successfully`);
      
    } catch (err) {
      console.error('Error accessing camera/microphone:', err);
      let errorMessage = 'Error accessing media: ';
      if (err.name === 'NotAllowedError') {
        errorMessage += 'Permission denied. Please allow camera/microphone access.';
      } else if (err.name === 'NotFoundError') {
        errorMessage += 'No camera/microphone found.';
      } else if (err.name === 'NotReadableError') {
        errorMessage += 'Camera/microphone is already in use by another application.';
      } else if (err.name === 'OverconstrainedError') {
        errorMessage += 'Camera/microphone constraints cannot be satisfied.';
      } else {
        errorMessage += err.message;
      }
      alert(errorMessage);
      setIsCapturing(false);
    }
  };

  const takePicture = () => {
    if (!videoRef.current || !videoStream) {
      console.error('Cannot take picture: video element or stream not available');
      return;
    }
    
    console.log('Taking picture...');
    
    try {
      const canvas = document.createElement('canvas');
      canvas.width = videoRef.current.videoWidth;
      canvas.height = videoRef.current.videoHeight;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(videoRef.current, 0, 0);
      
      // Convert to blob
      canvas.toBlob((blob) => {
        if (blob) {
          const file = new File([blob], `capture-${Date.now()}.png`, { type: 'image/png' });
          setSelectedMedia(file);
          setMediaType('image');
          setPreviewUrl(URL.createObjectURL(blob));
          stopCameraStream();
          console.log('Picture taken successfully');
        } else {
          console.error('Failed to create image blob');
          alert('Failed to capture image. Please try again.');
        }
      }, 'image/png');
    } catch (error) {
      console.error('Error taking picture:', error);
      alert('Error taking picture: ' + error.message);
    }
  };

  const startAudioRecording = (stream) => {
    if (!stream) {
      console.error('No stream provided to startAudioRecording');
      return;
    }
    
    console.log('Setting up audio recording...');
    chunksRef.current = [];
    
    try {
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      
      mediaRecorder.ondataavailable = (e) => {
        console.log('Audio data available, size:', e.data.size);
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };
      
      mediaRecorder.onstop = () => {
        console.log('Audio recording stopped, creating file...');
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        const file = new File([blob], `audio-${Date.now()}.webm`, { type: 'audio/webm' });
        setSelectedMedia(file);
        setMediaType('audio');
        setPreviewUrl(URL.createObjectURL(blob));
        
        // Close capture interface after successful recording
        stopCameraStream();
        
        if (timerRef.current) {
          clearInterval(timerRef.current);
          timerRef.current = null;
        }
        
        setRecordingTimeLeft(0);
        console.log('Audio file created successfully');
      };
      
      mediaRecorder.onerror = (error) => {
        console.error('MediaRecorder error:', error);
        // Don't close interface on error, let user try again
      };
      
      // Maximum 60 seconds of audio recording
      const maxRecordingTime = 60;
      setRecordingTimeLeft(maxRecordingTime);
      
      // Start countdown timer
      timerRef.current = setInterval(() => {
        setRecordingTimeLeft(prev => {
          if (prev <= 1) {
            console.log('Audio recording time limit reached');
            mediaRecorder.stop();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      
      mediaRecorder.start();
      setIsRecordingAudio(true);
      console.log('Audio recording started');
      
    } catch (error) {
      console.error('Error setting up audio recording:', error);
      alert('Error setting up audio recording: ' + error.message);
    }
  };

  const startRecordingVideo = () => {
    if (!videoRef.current || !videoStream) {
      console.error('Cannot start video recording: video element or stream not available');
      return;
    }
    
    console.log('Starting video recording...');
    chunksRef.current = [];
    
    try {
      const mediaRecorder = new MediaRecorder(videoStream);
      mediaRecorderRef.current = mediaRecorder;
      
      mediaRecorder.ondataavailable = (e) => {
        console.log('Video data available, size:', e.data.size);
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };
      
      mediaRecorder.onstop = () => {
        console.log('Video recording stopped, creating file...');
        const blob = new Blob(chunksRef.current, { type: 'video/webm' });
        const file = new File([blob], `video-${Date.now()}.webm`, { type: 'video/webm' });
        setSelectedMedia(file);
        setMediaType('video');
        setPreviewUrl(URL.createObjectURL(blob));
        
        // Close capture interface after successful recording
        stopCameraStream();
        
        if (timerRef.current) {
          clearInterval(timerRef.current);
          timerRef.current = null;
        }
        
        setRecordingTimeLeft(0);
        console.log('Video file created successfully');
      };
      
      mediaRecorder.onerror = (error) => {
        console.error('Video MediaRecorder error:', error);
        // Don't close interface on error, let user try again
      };
      
      // Maximum 60 seconds of video recording
      const maxRecordingTime = 60;
      setRecordingTimeLeft(maxRecordingTime);
      
      // Start countdown timer
      timerRef.current = setInterval(() => {
        setRecordingTimeLeft(prev => {
          if (prev <= 1) {
            console.log('Video recording time limit reached');
            mediaRecorder.stop();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      
      mediaRecorder.start();
      setIsRecording(true);
      console.log('Video recording started');
      
    } catch (error) {
      console.error('Error setting up video recording:', error);
      alert('Error setting up video recording: ' + error.message);
    }
  };

  const stopRecordingVideo = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const stopRecordingAudio = () => {
    if (mediaRecorderRef.current && isRecordingAudio) {
      mediaRecorderRef.current.stop();
      setIsRecordingAudio(false);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if ((currentMessage.trim() || selectedMedia) && !isDisabled) {
      onSendMessage({
        text: currentMessage,
        image: selectedMedia
      });
      setCurrentMessage('');
      setSelectedMedia(null);
      setPreviewUrl(null);
      setMediaType(null);
    }
  };

  const handleFileSelect = (e) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      
      if (file.type.startsWith('image/') || file.type.startsWith('video/') || file.type.startsWith('audio/')) {
        setSelectedMedia(file);
        
        if (file.type.startsWith('image/')) {
          setMediaType('image');
        } else if (file.type.startsWith('video/')) {
          setMediaType('video');
        } else if (file.type.startsWith('audio/')) {
          setMediaType('audio');
        }
        
        const fileReader = new FileReader();
        fileReader.onload = () => {
          setPreviewUrl(fileReader.result);
        };
        fileReader.readAsDataURL(file);
      } else {
        alert('Please select an image, video, or audio file (PNG, JPG, GIF, MP4, WEBM, MOV, WAV, MP3, etc.)');
      }
    }
  };

  const handleRemoveMedia = () => {
    setSelectedMedia(null);
    setPreviewUrl(null);
    setMediaType(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Handle microphone button click for audio recording
  const handleMicrophoneClick = () => {
    if (currentMessage.trim() || selectedMedia) {
      // If there's text or media, send the message
      handleSubmit(new Event('submit'));
    } else {
      // If no text, start audio recording
      handleCameraCapture('audio');
    }
  };

  // Manual close function for user-initiated closure
  const handleManualClose = () => {
    console.log('User manually closed capture interface');
    stopCameraStream();
  };

  return (
    <div className="message-input-container">
      {previewUrl && (
        <div className="media-preview">
          {mediaType === 'image' ? (
            <img src={previewUrl} alt="Preview" />
          ) : mediaType === 'video' ? (
            <video src={previewUrl} controls />
          ) : mediaType === 'audio' ? (
            <audio src={previewUrl} controls />
          ) : null}
          <button 
            type="button" 
            className="remove-media-button" 
            onClick={handleRemoveMedia}
            title="Remove media"
          >
            ×
          </button>
        </div>
      )}
      
      {isCapturing && (
        <div className="camera-capture-container">
          {captureMode !== 'audio' && (
            <video 
              ref={videoRef} 
              autoPlay 
              muted 
              className="camera-preview"
            />
          )}
          
          {captureMode === 'audio' && (
            <div className="audio-recording-indicator">
              <div className="audio-wave">🎤</div>
              <p>Recording audio...</p>
            </div>
          )}
          
          <div className="camera-controls">
            {captureMode === 'image' ? (
              <button 
                type="button" 
                className="capture-button" 
                onClick={takePicture}
              >
                Take Photo
              </button>
            ) : captureMode === 'video' ? (
              <>
                {!isRecording ? (
                  <button 
                    type="button" 
                    className="capture-button" 
                    onClick={startRecordingVideo}
                  >
                    Start Recording
                  </button>
                ) : (
                  <button 
                    type="button" 
                    className="capture-button recording" 
                    onClick={stopRecordingVideo}
                  >
                    Stop ({recordingTimeLeft}s)
                  </button>
                )}
              </>
            ) : captureMode === 'audio' ? (
              <>
                {!isRecordingAudio ? (
                  <button 
                    type="button" 
                    className="capture-button" 
                    onClick={() => startAudioRecording(videoStream)}
                  >
                    Start Recording
                  </button>
                ) : (
                  <button 
                    type="button" 
                    className="capture-button recording" 
                    onClick={stopRecordingAudio}
                  >
                    Stop ({recordingTimeLeft}s)
                  </button>
                )}
              </>
            ) : null}
            
            <button 
              type="button" 
              className="cancel-button" 
              onClick={handleManualClose}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
      
      <div className="gemini-input-wrapper">
        <form onSubmit={handleSubmit} className="gemini-input-form">
          {/* Mobile: Text input section with add button, text input, and mic button */}
          <div className="mobile-text-section">
            {/* Left side - Add button */}
            <div className="input-left-controls">
              <button 
                type="button"
                className="add-button"
                disabled={isDisabled || isLoading}
                onClick={() => fileInputRef.current.click()}
                title="Add content"
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M12 5V19M5 12H19" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
            </div>

            {/* Center - Text input */}
        <input
          ref={ref}
          type="text"
          value={currentMessage}
          onChange={(e) => setCurrentMessage(e.target.value)}
              placeholder={isDisabled ? "Enter API key to chat..." : `Ask ${provider === 'openai' ? 'ChatGPT' : provider === 'gemini' ? 'Gemini' : provider === 'anthropic' ? 'Claude' : 'AI'}`}
          disabled={isDisabled || isLoading}
              className="gemini-text-input"
        />
        
            {/* Microphone/Send button */}
            <button 
              type="button"
              disabled={isDisabled || isLoading}
              className={`mic-send-button ${(currentMessage.trim() || selectedMedia) ? 'send-mode' : 'mic-mode'}`}
              title={(currentMessage.trim() || selectedMedia) ? 'Send message' : 'Voice input'}
              onClick={handleMicrophoneClick}
            >
              {(currentMessage.trim() || selectedMedia) ? (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M22 2L11 13M22 2L15 22L11 13M22 2L2 9L11 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              ) : (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M12 1A3 3 0 0 0 9 4V12A3 3 0 0 0 12 15A3 3 0 0 0 15 12V4A3 3 0 0 0 12 1Z" stroke="currentColor" strokeWidth="2"/>
                  <path d="M19 10V12A7 7 0 0 1 5 12V10" stroke="currentColor" strokeWidth="2"/>
                  <line x1="12" y1="19" x2="12" y2="23" stroke="currentColor" strokeWidth="2"/>
                  <line x1="8" y1="23" x2="16" y2="23" stroke="currentColor" strokeWidth="2"/>
                </svg>
              )}
            </button>
          </div>
            
          {/* Action buttons - Desktop horizontal, Mobile below */}
          <div className="input-right-controls">
            {!isCapturing && (
              <>
            <button 
              type="button"
                  className="action-button"
              disabled={isDisabled || isLoading}
              onClick={() => handleCameraCapture('image')}
              title="Take photo"
            >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M23 19A2 2 0 0 1 21 21H3A2 2 0 0 1 1 19V8A2 2 0 0 1 3 6H7L9 4H15L17 6H21A2 2 0 0 1 23 8V19Z" stroke="currentColor" strokeWidth="2"/>
                    <circle cx="12" cy="13" r="4" stroke="currentColor" strokeWidth="2"/>
                  </svg>
                  <span>Camera</span>
            </button>
            
            <button 
              type="button"
                  className="action-button"
                  disabled={isDisabled || isLoading || (provider !== 'gemini')}
              onClick={() => handleCameraCapture('video')}
                  title="Record video"
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M23 7L16 12L23 17V7Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    <rect x="1" y="5" width="15" height="14" rx="2" ry="2" stroke="currentColor" strokeWidth="2"/>
                  </svg>
                  <span>Video</span>
                </button>
                
                {provider === 'gemini' && (
                  <button 
                    type="button"
                    className={`action-button live-button ${isLiveMode ? 'active' : ''}`}
                    disabled={!apiKey}
                    onClick={onToggleLiveMode}
                    title={isLiveMode ? 'Stop Live Mode' : 'Start Live Mode'}
                  >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2"/>
                      <path d="M19.4 15A1.65 1.65 0 0 0 21 13.35A1.65 1.65 0 0 0 19.4 11.65M19.4 15L21 16.35A1.65 1.65 0 0 1 19.4 15ZM2 13.35A1.65 1.65 0 0 1 3.6 15A1.65 1.65 0 0 1 2 13.35ZM2 13.35A1.65 1.65 0 0 0 3.6 11.65A1.65 1.65 0 0 0 2 13.35ZM3.6 15L2 16.35A1.65 1.65 0 0 0 3.6 15Z" stroke="currentColor" strokeWidth="2"/>
                      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2"/>
                    </svg>
                    <span>{isLiveMode ? 'Stop Live' : 'Start Live'}</span>
            </button>
                )}
              </>
            )}
          </div>
        
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileSelect}
          accept="image/*,video/*,audio/*"
          style={{ display: 'none' }}
          disabled={isDisabled || isLoading}
        />
      </form>
      </div>
    </div>
  );
});

export default MessageInput; 