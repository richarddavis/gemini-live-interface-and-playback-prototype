import React, { useState, useRef } from 'react';

const MessageInput = React.forwardRef(({ onSendMessage, isDisabled, isLoading }, ref) => {
  const [currentMessage, setCurrentMessage] = useState('');
  const [selectedImage, setSelectedImage] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const fileInputRef = useRef(null);

  const handleSubmit = (e) => {
    e.preventDefault();
    if ((currentMessage.trim() || selectedImage) && !isDisabled) {
      onSendMessage({
        text: currentMessage,
        image: selectedImage
      });
      setCurrentMessage('');
      setSelectedImage(null);
      setPreviewUrl(null);
    }
  };

  const handleFileSelect = (e) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      
      if (file.type.startsWith('image/')) {
        setSelectedImage(file);
        const fileReader = new FileReader();
        fileReader.onload = () => {
          setPreviewUrl(fileReader.result);
        };
        fileReader.readAsDataURL(file);
      } else {
        alert('Please select an image file (PNG, JPG, GIF)');
      }
    }
  };

  const handleRemoveImage = () => {
    setSelectedImage(null);
    setPreviewUrl(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className="message-input-container">
      {previewUrl && (
        <div className="image-preview">
          <img src={previewUrl} alt="Preview" />
          <button 
            type="button" 
            className="remove-image-button" 
            onClick={handleRemoveImage}
            title="Remove image"
          >
            ×
          </button>
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
        
        <button 
          type="button"
          className="upload-button"
          disabled={isDisabled || isLoading}
          onClick={() => fileInputRef.current.click()}
          title="Upload image"
        >
          📷
        </button>
        
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileSelect}
          accept="image/*"
          style={{ display: 'none' }}
          disabled={isDisabled || isLoading}
        />
        
        <button 
          type="submit" 
          disabled={isDisabled || isLoading || (!currentMessage.trim() && !selectedImage)}
          className={(!currentMessage.trim() && !selectedImage) ? "disabled" : ""}
        >
          {isLoading ? "Sending..." : "Send"}
        </button>
      </form>
    </div>
  );
});

export default MessageInput; 