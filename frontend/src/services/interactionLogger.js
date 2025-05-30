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
    this.baseUrl = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';
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
      metadata: {
        ...metadata,
        timestamp_client: Date.now()
      }
    };

    // Handle media data based on storage preference
    if (data) {
      const storageType = options.storageType || 'hash_only';
      interactionData.media_data = {
        storage_type: storageType,
        is_anonymized: options.isAnonymized || false,
        retention_days: options.retentionDays || 7
      };

      if (storageType === 'inline' && data.length <= 1024 * 1024) {
        // Only for small data
        interactionData.media_data.data = data;
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
      const response = await fetch(`${this.baseUrl}/interaction-logs`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(logData)
      });

      if (!response.ok) {
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
      frame_rate: 2, // Your current frame rate
      video_format: 'base64_jpeg',
      compression_quality: 0.7,
      data_size_bytes: frameData ? frameData.length : 0,
      ...metadata
    };

    this.logInteraction('video_frame', frameData, videoMetadata, {
      storageType: this.replayMode ? 'inline' : 'hash_only',
      isAnonymized: !this.replayMode,
      retentionDays: this.replayMode ? 1 : 7 // Shorter retention for full data
    });
  }

  logAudioChunk(audioData, metadata = {}) {
    const audioMetadata = {
      audio_sample_rate: 16000, // Your current audio sample rate
      audio_format: 'pcm_16bit',
      data_size_bytes: audioData ? audioData.length : 0,
      ...metadata
    };

    this.logInteraction('audio_chunk', audioData, audioMetadata, {
      storageType: this.replayMode ? 'inline' : 'hash_only',
      isAnonymized: !this.replayMode,
      retentionDays: this.replayMode ? 1 : 7
    });
  }

  logTextInput(text, metadata = {}) {
    const textMetadata = {
      data_size_bytes: text ? text.length : 0,
      ...metadata
    };

    this.logInteraction('text_input', text, textMetadata, {
      storageType: 'hash_only',
      isAnonymized: true
    });
  }

  logApiResponse(responseData, metadata = {}) {
    const apiMetadata = {
      api_endpoint: 'gemini_live_api',
      api_response_time_ms: metadata.responseTime,
      api_status_code: metadata.statusCode || 200,
      data_size_bytes: responseData ? JSON.stringify(responseData).length : 0,
      ...metadata
    };

    this.logInteraction('api_response', JSON.stringify(responseData), apiMetadata, {
      storageType: 'hash_only'
    });
  }

  logUserAction(action, details = {}, metadata = {}) {
    const actionMetadata = {
      action_type: action,
      action_details: details,
      ...metadata
    };

    this.logInteraction('user_action', JSON.stringify(details), actionMetadata, {
      storageType: 'hash_only'
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
    this.replayMode = enabled;
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
    try {
      const response = await fetch(`${this.baseUrl}/interaction-logs/sessions`);
      if (response.ok) {
        return await response.json();
      }
    } catch (error) {
      console.warn('Error fetching replay sessions:', error);
    }
    return null;
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