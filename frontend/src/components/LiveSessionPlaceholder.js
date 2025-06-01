import React from 'react';
import './LiveSessionPlaceholder.css';

function LiveSessionPlaceholder({ 
  sessionData, 
  onPlayback,
  timestamp 
}) {
  const formatDuration = (seconds) => {
    if (!seconds) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const formatTimestamp = (timestamp) => {
    return new Date(timestamp).toLocaleString();
  };

  return (
    <div className="live-session-placeholder">
      <div className="live-session-icon">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="12" cy="12" r="3" fill="currentColor"/>
          <path d="M12 1v6m0 10v6m11-7h-6M7 12H1" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
        </svg>
      </div>
      
      <div className="live-session-content">
        <div className="live-session-header">
          <h4>Live Session</h4>
          <span className="live-session-timestamp">
            {formatTimestamp(timestamp)}
          </span>
        </div>
        
        <div className="live-session-details">
          <div className="session-stat">
            <span className="stat-label">Duration:</span>
            <span className="stat-value">{formatDuration(sessionData?.duration)}</span>
          </div>
          
          {sessionData?.exchanges_count && (
            <div className="session-stat">
              <span className="stat-label">Exchanges:</span>
              <span className="stat-value">{sessionData.exchanges_count}</span>
            </div>
          )}
          
          {sessionData?.has_audio && (
            <div className="session-stat">
              <span className="stat-label">Audio:</span>
              <span className="stat-value">✓</span>
            </div>
          )}
          
          {sessionData?.has_video && (
            <div className="session-stat">
              <span className="stat-label">Video:</span>
              <span className="stat-value">✓</span>
            </div>
          )}
        </div>
        
        <button 
          className="playback-button"
          onClick={() => {
            console.log('🎭 Playback button clicked for session:', sessionData?.session_id);
            console.log('🎭 Full sessionData being passed:', sessionData);
            onPlayback(sessionData);
          }}
          disabled={!sessionData?.session_id}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <polygon points="5,3 19,12 5,21" fill="currentColor"/>
          </svg>
          Play Session
        </button>
      </div>
    </div>
  );
}

export default LiveSessionPlaceholder; 