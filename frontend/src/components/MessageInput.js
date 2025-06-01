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
  const [captureMode, setCaptureMode] = useState('image'); // 'image' or 'video'
  const [videoStream, setVideoStream] = useState(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTimeLeft, setRecordingTimeLeft] = useState(0);
  
  const fileInputRef = useRef(null);
  const videoRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const timerRef = useRef(null);

  // Moved stopCameraStream definition before useEffect that uses it
  const stopCameraStream = useCallback(() => {
    if (videoStream) {
      videoStream.getTracks().forEach(track => track.stop());
      setVideoStream(null);
    }
    
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
    
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    
    setIsCapturing(false);
  }, [videoStream, isRecording, mediaRecorderRef, timerRef, setVideoStream, setIsRecording, setIsCapturing]);

  // Clean up camera stream when component unmounts
  useEffect(() => {
    return () => {
      stopCameraStream();
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [stopCameraStream]);

  // Handle camera stream for both video preview and taking photo
  const handleCameraCapture = async (mode) => {
    try {
      // Close any existing stream first
      stopCameraStream();
      
      setCaptureMode(mode);
      setIsCapturing(true);
      
      // Request camera access
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: true, 
        audio: mode === 'video' 
      });
      
      setVideoStream(stream);
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
    } catch (err) {
      console.error('Error accessing camera:', err);
      alert('Error accessing camera: ' + err.message);
      setIsCapturing(false);
    }
  };

  const takePicture = () => {
    if (!videoRef.current || !videoStream) return;
    
    const canvas = document.createElement('canvas');
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(videoRef.current, 0, 0);
    
    // Convert to blob
    canvas.toBlob((blob) => {
      const file = new File([blob], `capture-${Date.now()}.png`, { type: 'image/png' });
      setSelectedMedia(file);
      setMediaType('image');
      setPreviewUrl(URL.createObjectURL(blob));
      stopCameraStream();
    }, 'image/png');
  };

  const startRecordingVideo = () => {
    if (!videoRef.current || !videoStream) return;
    
    chunksRef.current = [];
    
    const mediaRecorder = new MediaRecorder(videoStream);
    mediaRecorderRef.current = mediaRecorder;
    
    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) {
        chunksRef.current.push(e.data);
      }
    };
    
    mediaRecorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: 'video/mp4' });
      const file = new File([blob], `video-${Date.now()}.mp4`, { type: 'video/mp4' });
      setSelectedMedia(file);
      setMediaType('video');
      setPreviewUrl(URL.createObjectURL(blob));
      stopCameraStream();
      
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      
      setRecordingTimeLeft(0);
    };
    
    // Maximum 60 seconds of video recording
    const maxRecordingTime = 60;
    setRecordingTimeLeft(maxRecordingTime);
    
    // Start countdown timer
    timerRef.current = setInterval(() => {
      setRecordingTimeLeft(prev => {
        if (prev <= 1) {
          mediaRecorder.stop();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    
    mediaRecorder.start();
    setIsRecording(true);
  };

  const stopRecordingVideo = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
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
      
      if (file.type.startsWith('image/') || file.type.startsWith('video/')) {
        setSelectedMedia(file);
        setMediaType(file.type.startsWith('image/') ? 'image' : 'video');
        
        const fileReader = new FileReader();
        fileReader.onload = () => {
          setPreviewUrl(fileReader.result);
        };
        fileReader.readAsDataURL(file);
      } else {
        alert('Please select an image or video file (PNG, JPG, GIF, MP4, WEBM, MOV etc.)');
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

  return (
    <div className="message-input-container">
      {previewUrl && (
        <div className="media-preview">
          {mediaType === 'image' ? (
            <img src={previewUrl} alt="Preview" />
          ) : (
            <video src={previewUrl} controls />
          )}
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
          <video 
            ref={videoRef} 
            autoPlay 
            muted 
            className="camera-preview"
          />
          
          <div className="camera-controls">
            {captureMode === 'image' ? (
              <button 
                type="button" 
                className="capture-button" 
                onClick={takePicture}
              >
                Take Photo
              </button>
            ) : (
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
            )}
            <button 
              type="button" 
              className="cancel-button" 
              onClick={stopCameraStream}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
      
      <div className="gemini-input-wrapper">
        <form onSubmit={handleSubmit} className="gemini-input-form">
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
            placeholder={isDisabled ? "Enter API key to chat..." : "Ask Gemini"}
            disabled={isDisabled || isLoading}
            className="gemini-text-input"
          />

          {/* Right side - Action buttons */}
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
            
            {/* Microphone/Send button */}
            <button 
              type="submit" 
              disabled={isDisabled || isLoading}
              className={`mic-send-button ${(currentMessage.trim() || selectedMedia) ? 'send-mode' : 'mic-mode'}`}
              title={(currentMessage.trim() || selectedMedia) ? 'Send message' : 'Voice input'}
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

          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileSelect}
            accept="image/*,video/*"
            style={{ display: 'none' }}
            disabled={isDisabled || isLoading}
          />
        </form>
      </div>
    </div>
  );
});

export default MessageInput; 