class InteractionLogger {
  constructor() {
    this.sessionId = this.generateSessionId();
    this.chatSessionId = null;
    this.isEnabled = true;
    this.replayMode = false; // Set to true to capture full media for replay
    this.batchSize = 10;
    this.batchTimeout = 5000; // 5 seconds
    this.logQueue = [];
    this.batchTimer = null;
    this.baseUrl = process.env.REACT_APP_API_URL || 'http://localhost:8080/api';
  }

  generateSessionId() {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  setChatSessionId(chatSessionId) {
    this.chatSessionId = chatSessionId;
  }

  async startSession(chatSessionId = null) {
    if (chatSessionId) {
      this.setChatSessionId(chatSessionId);
    }

    try {
      const response = await fetch(`${this.baseUrl}/interaction-logs/session/${this.sessionId}/start`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          chat_session_id: this.chatSessionId
        })
      });

      if (!response.ok) {
        console.warn('Failed to start interaction session:', response.statusText);
      } else {
        const data = await response.json();
        console.log('Interaction session started:', data);
      }
    } catch (error) {
      console.warn('Error starting interaction session:', error);
    }
  }

  async endSession() {
    // Flush any remaining logs
    await this.flushLogs();

    try {
      const response = await fetch(`${this.baseUrl}/interaction-logs/session/${this.sessionId}/end`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        }
      });

      if (!response.ok) {
        console.warn('Failed to end interaction session:', response.statusText);
      } else {
        const data = await response.json();
        console.log('Interaction session ended:', data);
      }
    } catch (error) {
      console.warn('Error ending interaction session:', error);
    }
  }

  logInteraction(type, data = null, metadata = {}, options = {}) {
    if (!this.isEnabled) return;

    const interactionData = {
      session_id: this.sessionId,
      chat_session_id: this.chatSessionId,
      interaction_type: type,
      timestamp: new Date().toISOString(),
      user_agent: navigator.userAgent,
      ip_address: null, // Will be determined by backend
      metadata: metadata
    };

    // Handle media data based on storage preference
    if (data) {
      // Use cloud_storage for replay mode (uploads to GCS), hash_only for privacy mode
      const storageType = this.replayMode ? 'cloud_storage' : 'hash_only';
      console.log(`🎬 Logging ${type} with storageType: ${storageType}, replayMode: ${this.replayMode}`);
      
      interactionData.media_data = {
        storage_type: storageType,
        is_anonymized: options.isAnonymized || false,
        retention_days: options.retentionDays || 7
      };

      // Check data size for inline storage (10MB limit to match backend)
      const maxInlineSize = 10 * 1024 * 1024; // 10MB
      
      if (storageType === 'inline' || storageType === 'cloud_storage') {
        // Both inline and cloud_storage need the data sent to backend
        // Backend will decide whether to store inline or upload to GCS
        if (data.length <= maxInlineSize) {
          interactionData.media_data.data = data;
          
          // Log size info for debugging
          const dataSizeMB = (data.length / 1024 / 1024).toFixed(2);
          console.log(`📦 ${storageType} storage for ${type}: ${dataSizeMB}MB`);
        } else {
          const dataSizeMB = (data.length / 1024 / 1024).toFixed(2);
          console.warn(`⚠️ Data too large for ${storageType} storage: ${dataSizeMB}MB (max: ${maxInlineSize/1024/1024}MB). Falling back to hash_only.`);
          
          // Fallback to hash_only for oversized data
          interactionData.media_data.storage_type = 'hash_only';
          interactionData.media_data.data = data;
        }
      } else if (storageType === 'hash_only') {
        // Store hash only for privacy
        interactionData.media_data.data = data;
      } else if (storageType === 'file_path' && options.filePath) {
        interactionData.media_data.file_path = options.filePath;
        interactionData.media_data.data = data; // For hash generation
      }
    }

    // Add to queue for batch processing
    this.logQueue.push(interactionData);

    // Process immediately for critical interactions or when queue is full
    if (options.immediate || this.logQueue.length >= this.batchSize) {
      this.flushLogs();
    } else {
      this.scheduleBatchFlush();
    }
  }

  scheduleBatchFlush() {
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
    }

    this.batchTimer = setTimeout(() => {
      this.flushLogs();
    }, this.batchTimeout);
  }

  async flushLogs() {
    if (this.logQueue.length === 0) return;

    const logsToSend = [...this.logQueue];
    this.logQueue = [];

    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
      this.batchTimer = null;
    }

    try {
      // Send logs individually for now (could be optimized to batch endpoint)
      const promises = logsToSend.map(log => this.sendLog(log));
      await Promise.allSettled(promises);
    } catch (error) {
      console.warn('Error flushing logs:', error);
      // Re-queue failed logs (optional)
    }
  }

  async sendLog(logData) {
    try {
      // Debug: Log the data being sent
      console.log('🔍 Sending log data:', {
        interaction_type: logData.interaction_type,
        storage_type: logData.media_data?.storage_type,
        data_size: logData.media_data?.data?.length || 0,
        data_preview: logData.media_data?.data ? logData.media_data.data.substring(0, 100) + '...' : 'no data'
      });

      const response = await fetch(`${this.baseUrl}/interaction-logs`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(logData)
      });

      if (!response.ok) {
        // Enhanced error logging
        const errorText = await response.text();
        console.error('❌ Backend error response:', {
          status: response.status,
          statusText: response.statusText,
          errorBody: errorText,
          sentData: {
            interaction_type: logData.interaction_type,
            storage_type: logData.media_data?.storage_type,
            data_size: logData.media_data?.data?.length || 0
          }
        });
        console.warn('Failed to send interaction log:', response.statusText);
        return false;
      }

      return true;
    } catch (error) {
      console.warn('Error sending interaction log:', error);
      return false;
    }
  }

  // Convenience methods for specific interaction types
  logVideoFrame(frameData, metadata = {}) {
    const videoMetadata = {
      video_resolution: metadata.video_resolution || { width: 640, height: 480 },
      video_format: 'base64_jpeg',
      compression_quality: 0.7,
      data_size_bytes: frameData ? frameData.length : 0,
      ...metadata
    };

    this.logInteraction('video_frame', frameData, videoMetadata, {
      storageType: this.replayMode ? 'cloud_storage' : 'hash_only',
      isAnonymized: !this.replayMode,
      retentionDays: this.replayMode ? 1 : 7
    });
  }

  logAudioChunk(audioData, metadata = {}) {
    const audioMetadata = {
      audio_sample_rate: 16000, // Your current audio sample rate
      audio_format: 'pcm_16bit',
      data_size_bytes: audioData ? audioData.length : 0,
      ...metadata
    };

    // Check data size for replay mode
    if (this.replayMode && audioData) {
      const dataSizeKB = (audioData.length / 1024).toFixed(2);
      console.log(`🎬 Logging audio chunk in replay mode: ${dataSizeKB}KB`);
      
      // Warn if approaching size limits (8MB warning for 10MB limit)
      if (audioData.length > 8 * 1024 * 1024) {
        console.warn(`⚠️ Large audio chunk detected: ${dataSizeKB}KB - may approach backend limit`);
      }
    }

    this.logInteraction('audio_chunk', audioData, audioMetadata, {
      storageType: this.replayMode ? 'cloud_storage' : 'hash_only',
      isAnonymized: !this.replayMode,
      retentionDays: this.replayMode ? 1 : 7
    });
  }

  logTextInput(textData, metadata = {}) {
    const textMetadata = {
      text_length: textData ? textData.length : 0,
      ...metadata
    };

    this.logInteraction('text_input', textData, textMetadata, {
      storageType: this.replayMode ? 'cloud_storage' : 'hash_only',
      isAnonymized: !this.replayMode,
      retentionDays: this.replayMode ? 1 : 7
    });
  }

  logApiResponse(responseData, metadata = {}) {
    // responseData is already an object (e.g., {mimeType: "audio/pcm;rate=24000", data: "base64string"})
    // Don't double-stringify it
    const responseString = typeof responseData === 'string' ? responseData : JSON.stringify(responseData);
    const apiMetadata = {
      api_endpoint: 'gemini_live_api',
      api_response_time_ms: metadata.responseTime,
      api_status_code: metadata.statusCode || 200,
      data_size_bytes: responseString ? responseString.length : 0,
      ...metadata
    };

    // Check size for replay mode logging
    if (this.replayMode && responseString) {
      const dataSizeMB = (responseString.length / 1024 / 1024).toFixed(2);
      console.log(`🎬 Logging API response in replay mode: ${dataSizeMB}MB`);
      
      // Warn if approaching size limits
      if (responseString.length > 8 * 1024 * 1024) {
        console.warn(`⚠️ Large API response detected: ${dataSizeMB}MB - may approach backend limit`);
      }
    }

    this.logInteraction('api_response', responseString, apiMetadata, {
      storageType: this.replayMode ? 'cloud_storage' : 'hash_only',
      isAnonymized: !this.replayMode,
      retentionDays: this.replayMode ? 1 : 7
    });
  }

  logUserAction(actionType, metadata = {}) {
    const actionMetadata = {
      action_type: actionType,
      ...metadata
    };

    this.logInteraction('user_action', actionType, actionMetadata, {
      storageType: this.replayMode ? 'cloud_storage' : 'hash_only',
      isAnonymized: !this.replayMode,
      retentionDays: this.replayMode ? 1 : 7
    });
  }

  logError(error, context = {}, metadata = {}) {
    const errorMetadata = {
      error_message: error.message,
      error_stack: error.stack,
      context: context,
      ...metadata
    };

    this.logInteraction('error', error.message, errorMetadata, {
      immediate: true, // Send errors immediately
      storageType: 'hash_only'
    });
  }

  // Analytics methods
  async getSessionAnalytics() {
    try {
      const response = await fetch(`${this.baseUrl}/interaction-logs/analytics/${this.sessionId}`);
      if (response.ok) {
        return await response.json();
      }
    } catch (error) {
      console.warn('Error fetching session analytics:', error);
    }
    return null;
  }

  async getSessionLogs(filters = {}) {
    try {
      const params = new URLSearchParams();
      if (filters.interactionType) params.append('interaction_type', filters.interactionType);
      if (filters.limit) params.append('limit', filters.limit);
      if (filters.offset) params.append('offset', filters.offset);
      if (filters.includeMedia) params.append('include_media', 'true');

      const response = await fetch(`${this.baseUrl}/interaction-logs/${this.sessionId}?${params}`);
      if (response.ok) {
        return await response.json();
      }
    } catch (error) {
      console.warn('Error fetching session logs:', error);
    }
    return null;
  }

  // Configuration methods
  setEnabled(enabled) {
    this.isEnabled = enabled;
  }

  setReplayMode(enabled) {
    console.log(`🎬 setReplayMode called with: ${enabled}`);
    console.log(`🎬 Previous replayMode was: ${this.replayMode}`);
    this.replayMode = enabled;
    console.log(`🎬 New replayMode is: ${this.replayMode}`);
    console.log(`Replay mode ${enabled ? 'enabled' : 'disabled'} - ${enabled ? 'capturing full media data' : 'hash-only mode'}`);
  }

  setBatchSize(size) {
    this.batchSize = Math.max(1, size);
  }

  setBatchTimeout(timeout) {
    this.batchTimeout = Math.max(1000, timeout);
  }

  // Replay-specific methods
  async getReplayData(sessionId = null) {
    const targetSessionId = sessionId || this.sessionId;
    try {
      const response = await fetch(`${this.baseUrl}/interaction-logs/${targetSessionId}?include_media=true&limit=1000`);
      if (response.ok) {
        const data = await response.json();
        // Sort by timestamp for chronological replay
        data.logs.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
        return data;
      }
    } catch (error) {
      console.warn('Error fetching replay data:', error);
    }
    return null;
  }

  async getAllReplaySessions() {
    const url = `${this.baseUrl}/interaction-logs/sessions`;
    console.log('🔍 InteractionLogger URL Test:', {
      baseUrl: this.baseUrl,
      fullUrl: url,
      env: process.env.REACT_APP_API_URL
    });
    
    try {
      const response = await fetch(url);
      if (response.ok) {
        return await response.json();
      }
      console.error('❌ getAllReplaySessions failed:', response.status, response.statusText);
      return { sessions: [], total_count: 0 };
    } catch (error) {
      console.error('❌ getAllReplaySessions error:', error);
      return { sessions: [], total_count: 0 };
    }
  }

  // Cleanup method
  destroy() {
    this.flushLogs();
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
    }
  }
}

// Export singleton instance
export const interactionLogger = new InteractionLogger();
export default InteractionLogger; 