import React, { useState, useRef, useEffect, useCallback } from 'react';

const MessageInput = React.forwardRef(({ onSendMessage, isDisabled, isLoading, provider }, ref) => {
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
      
      <form onSubmit={handleSubmit} className="message-input-form">
        <input
          ref={ref}
          type="text"
          value={currentMessage}
          onChange={(e) => setCurrentMessage(e.target.value)}
          placeholder={isDisabled ? "Enter API key to chat..." : "Type your message..."}
          disabled={isDisabled || isLoading}
          className="message-text-input"
        />
        
        {!isCapturing && (
          <div className="media-buttons">
            <button 
              type="button"
              className="upload-button"
              disabled={isDisabled || isLoading}
              onClick={() => fileInputRef.current.click()}
              title="Upload media"
            >
              📁
            </button>
            
            <button 
              type="button"
              className="camera-button"
              disabled={isDisabled || isLoading}
              onClick={() => handleCameraCapture('image')}
              title="Take photo"
            >
              📷
            </button>
            
            <button 
              type="button"
              className="video-button"
              disabled={isDisabled || isLoading || (provider !== 'gemini' && !isLoading)}
              onClick={() => handleCameraCapture('video')}
              title={provider !== 'gemini' ? "Video capture only supported with Gemini provider" : "Record video"}
            >
              🎥
            </button>
          </div>
        )}
        
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileSelect}
          accept="image/*,video/*"
          style={{ display: 'none' }}
          disabled={isDisabled || isLoading}
        />
        
        <button 
          type="submit" 
          disabled={isDisabled || isLoading || (!currentMessage.trim() && !selectedMedia)}
          className={(!currentMessage.trim() && !selectedMedia) ? "disabled" : ""}
        >
          {isLoading ? "Sending..." : "Send"}
        </button>
      </form>
    </div>
  );
});

export default MessageInput; 