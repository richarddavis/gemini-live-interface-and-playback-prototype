class InteractionLogger {
  constructor() {
    this.sessionId = this.generateSessionId();
    this.chatSessionId = null;
    this.isEnabled = true;
    this.replayMode = false; // Set to true to capture full media for replay
    this.baseUrl = process.env.REACT_APP_API_URL || 'http://localhost:8080/api';
    
    // 🚨 NEW: REAL-TIME STREAMING SYSTEM 🚨
    this.debugMode = true;
    this.quietMode = false; // Set to true to reduce console noise
    this.connectionHealth = {
      lastLoggedAt: null,
      consecutiveFailures: 0,
      totalLogged: 0,
      totalFailed: 0,
      sessionStartTime: null,
      expectedInteractions: 0,
      actualInteractions: 0
    };
    
    // Stream processing (no more batching delays)
    this.pendingUploads = new Map(); // Track background uploads
    this.streamQueue = [];
    this.streamProcessor = null;
    
    // Track interaction timing and gaps
    this.interactionTimeline = [];
    this.lastInteractionTime = null;
    this.gapThreshold = 2000; // 2 seconds - alert if gap is longer
    
    console.log('🔍 InteractionLogger: Real-time streaming mode enabled');
    this.startStreamProcessor();
    this.startHealthMonitoring();
  }

  generateSessionId() {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // 🚨 NEW: Start a fresh session with new session ID 🚨
  startNewSession(chatSessionId = null) {
    // Generate a new session ID for this session
    this.sessionId = this.generateSessionId();
    console.log(`🆕 Generated new session ID: ${this.sessionId}`);
    
    // Start the session
    return this.startSession(chatSessionId);
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
    // Process any remaining items in the stream queue
    await this.processStreamQueue();

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

  // 🚨 NEW: REAL-TIME STREAM PROCESSOR 🚨
  startStreamProcessor() {
    // Process stream immediately, no delays
    this.streamProcessor = setInterval(() => {
      this.processStreamQueue();
    }, 50); // Check every 50ms for real-time feel
  }

  async processStreamQueue() {
    if (this.streamQueue.length === 0) return;
    
    // Process up to 5 items per cycle to avoid blocking
    const itemsToProcess = this.streamQueue.splice(0, 5);
    
    // Process in parallel for maximum speed
    const promises = itemsToProcess.map(item => this.sendStreamedLog(item));
    await Promise.allSettled(promises);
  }

  // 🚨 NEW: IMMEDIATE NON-BLOCKING LOG METHOD 🚨
  logInteraction(interactionType, mediaData = null, metadata = {}, options = {}) {
    if (!this.isEnabled) return Promise.resolve();

    const startTime = performance.now();
    const timestamp = new Date().toISOString();
    
    // Update connection health tracking immediately
    this.connectionHealth.expectedInteractions++;
    this.connectionHealth.lastLoggedAt = Date.now();
    
    // Track interaction timing
    const now = Date.now();
    if (this.lastInteractionTime) {
      const gap = now - this.lastInteractionTime;
      if (gap > this.gapThreshold && this.debugMode) {
        console.warn(`🚨 INTERACTION GAP DETECTED: ${gap}ms between ${this.interactionTimeline[this.interactionTimeline.length - 1]?.type} and ${interactionType}`);
      }
    }
    
    this.interactionTimeline.push({
      type: interactionType,
      timestamp: now,
      gap: this.lastInteractionTime ? now - this.lastInteractionTime : 0
    });
    this.lastInteractionTime = now;
    
    // Keep only recent timeline (last 50 interactions)
    if (this.interactionTimeline.length > 50) {
      this.interactionTimeline = this.interactionTimeline.slice(-50);
    }

    if (this.debugMode) {
      console.log(`🚀 STREAMING ${interactionType}:`, {
        timestamp,
        sessionId: this.sessionId,
        replayMode: this.replayMode,
        mediaSize: mediaData ? (typeof mediaData === 'string' ? mediaData.length : mediaData.byteLength || 'unknown') : 0,
        queueSize: this.streamQueue.length
      });
    }

    // Create stream item for immediate processing
    const streamItem = {
      session_id: this.sessionId,
      interaction_type: interactionType,
      timestamp,
      metadata: {
        timestamp: timestamp,
        frontend_logged_at: new Date().toISOString(),
        performance_start: startTime,
        queue_position: this.streamQueue.length,
        ...metadata
      },
      mediaData,
      options,
      startTime
    };

    // Add to stream queue for immediate processing
    this.streamQueue.push(streamItem);
    
    // Return immediately - don't block the UI
    return Promise.resolve();
  }

  // 🚨 NEW: FAST STREAMING UPLOAD 🚨
  async sendStreamedLog(streamItem) {
    const { session_id, interaction_type, timestamp, metadata, mediaData, options, startTime } = streamItem;
    
    try {
      // Prepare minimal payload for immediate backend storage
      const payload = {
        session_id,
        interaction_type,
        metadata: {
          ...metadata,
          stream_processed_at: new Date().toISOString()
        }
      };

      // Handle media data efficiently
      if (mediaData && this.replayMode) {
        const storageType = options.storageType || 'cloud_storage';
        
        let processedData;
        if (typeof mediaData === 'string') {
          processedData = mediaData;
        } else if (mediaData instanceof ArrayBuffer) {
          processedData = btoa(String.fromCharCode(...new Uint8Array(mediaData)));
        } else {
          // Convert other formats
          processedData = JSON.stringify(mediaData);
        }

        payload.media_data = {
          storage_type: storageType,
          data: processedData,
          is_anonymized: options.isAnonymized || false,
          retention_days: options.retentionDays || 1,
          stream_upload: true // Mark as streamed upload
        };
        
        if (this.debugMode && processedData.length > 100000) {
          console.log(`🚀 Large media streaming: ${(processedData.length / 1024).toFixed(1)}KB for ${interaction_type}`);
        }
      }

      // Send immediately with timeout for responsiveness
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
      
      const response = await fetch(`${this.baseUrl}/interaction-logs`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        signal: controller.signal
      });

      clearTimeout(timeoutId);
      const endTime = performance.now();
      const duration = endTime - startTime;

      if (response.ok) {
        const result = await response.json();
        
        // Success - update health metrics
        this.connectionHealth.totalLogged++;
        this.connectionHealth.actualInteractions++;
        this.connectionHealth.consecutiveFailures = 0;
        
        if (this.debugMode) {
          console.log(`✅ STREAMED ${interaction_type}:`, {
            interactionId: result.interaction_id,
            duration: `${duration.toFixed(1)}ms`,
            queueRemaining: this.streamQueue.length,
            successRate: `${((this.connectionHealth.totalLogged / this.connectionHealth.expectedInteractions) * 100).toFixed(1)}%`
          });
        }
        
        return result;
      } else {
        // HTTP error - but don't block other operations
        const errorText = await response.text().catch(() => 'Unknown error');
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }
      
    } catch (error) {
      // Failure - update health metrics but don't block the stream
      this.connectionHealth.totalFailed++;
      this.connectionHealth.consecutiveFailures++;
      
      console.error(`🚨 STREAM FAILED ${interaction_type}:`, {
        error: error.message,
        duration: `${(performance.now() - startTime).toFixed(1)}ms`,
        consecutive: this.connectionHealth.consecutiveFailures
      });
      
      // Quick retry for important data (max 1 retry to avoid delays)
      if (this.replayMode && this.connectionHealth.consecutiveFailures < 3) {
        console.log(`🔄 Quick retry for ${interaction_type}`);
        setTimeout(() => {
          this.streamQueue.unshift(streamItem); // Add back to front of queue
        }, 1000);
      }
      
      throw error;
    }
  }

  // 🚨 SIMPLIFIED: HEALTH MONITORING (non-blocking) 🚨
  startHealthMonitoring() {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }
    
    this.healthCheckInterval = setInterval(() => {
      this.checkConnectionHealth();
    }, 5000);
    
    console.log('🔍 Started connection health monitoring');
  }
  
  checkConnectionHealth() {
    const now = Date.now();
    const timeSinceLastLog = this.connectionHealth.lastLoggedAt 
      ? now - this.connectionHealth.lastLoggedAt 
      : null;
    
    if (this.debugMode && this.sessionId && !this.quietMode) {
      console.log('🔍 STREAM HEALTH:', {
        sessionId: this.sessionId.slice(-8),
        lastLog: timeSinceLastLog ? `${(timeSinceLastLog/1000).toFixed(1)}s` : 'Never',
        logged: this.connectionHealth.totalLogged,
        failed: this.connectionHealth.totalFailed,
        queueSize: this.streamQueue.length,
        uploadsPending: this.pendingUploads.size
      });
    }
      
    // Alert on issues (always show critical alerts)
    if (this.streamQueue.length > 20) {
      console.warn('🚨 STREAM QUEUE BACKLOG: Queue has ' + this.streamQueue.length + ' items');
    }
    
    if (this.connectionHealth.consecutiveFailures > 5) {
      console.error('🚨 STREAM HEALTH CRITICAL: ' + this.connectionHealth.consecutiveFailures + ' consecutive failures');
    }
  }

  // 🚨 FAST: CONVENIENCE METHODS (immediate return) 🚨
  logVideoFrame(frameData, metadata = {}) {
    const videoMetadata = {
      video_resolution: metadata.video_resolution || { width: 640, height: 480 },
      video_format: 'base64_jpeg',
      compression_quality: 0.7,
      data_size_bytes: frameData ? frameData.length : 0,
      ...metadata
    };

    return this.logInteraction('video_frame', frameData, videoMetadata, {
      storageType: this.replayMode ? 'cloud_storage' : 'hash_only',
      isAnonymized: !this.replayMode,
      retentionDays: this.replayMode ? 1 : 7
    });
  }

  logAudioChunk(audioData, metadata = {}) {
    const audioMetadata = {
      audio_sample_rate: 16000,
      audio_format: 'pcm_16bit',
      data_size_bytes: audioData ? audioData.length : 0,
      ...metadata
    };

    return this.logInteraction('audio_chunk', audioData, audioMetadata, {
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

    return this.logInteraction('text_input', textData, textMetadata, {
      storageType: this.replayMode ? 'cloud_storage' : 'hash_only',
      isAnonymized: !this.replayMode,
      retentionDays: this.replayMode ? 1 : 7
    });
  }

  logApiResponse(responseData, metadata = {}) {
    const responseString = typeof responseData === 'string' ? responseData : JSON.stringify(responseData);
    const apiMetadata = {
      api_endpoint: 'gemini_live_api',
      api_response_time_ms: metadata.responseTime,
      api_status_code: metadata.statusCode || 200,
      data_size_bytes: responseString ? responseString.length : 0,
      ...metadata
    };

    return this.logInteraction('api_response', responseString, apiMetadata, {
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

    return this.logInteraction('user_action', actionType, actionMetadata, {
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

    return this.logInteraction('error', error.message, errorMetadata, {
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

  // Replay-specific methods
  async getReplayData(sessionId = null) {
    const targetSessionId = sessionId || this.sessionId;
    console.log(`🎭 getReplayData called with sessionId: ${sessionId}, targetSessionId: ${targetSessionId}`);
    try {
      const response = await fetch(`${this.baseUrl}/interaction-logs/${targetSessionId}?include_media=true&limit=1000`);
      if (response.ok) {
        const data = await response.json();
        console.log(`🎭 getReplayData response for session ${targetSessionId}:`, {
          logsCount: data.logs?.length || 0,
          firstLogSession: data.logs?.[0]?.session_id,
          allSessionIds: [...new Set(data.logs?.map(log => log.session_id) || [])]
        });
        // Sort by timestamp for chronological replay
        data.logs.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
        return data;
      } else {
        console.error(`🎭 getReplayData failed for session ${targetSessionId}:`, response.status, response.statusText);
      }
    } catch (error) {
      console.warn(`🎭 Error fetching replay data for session ${targetSessionId}:`, error);
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
    // Stop stream processor
    if (this.streamProcessor) {
      clearInterval(this.streamProcessor);
      this.streamProcessor = null;
    }
    
    // Stop health monitoring
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
    
    // Process any remaining items in queue
    if (this.streamQueue.length > 0) {
      console.log(`🚀 Flushing ${this.streamQueue.length} remaining items on destroy`);
      this.processStreamQueue();
    }
  }

  // 🚨 NEW: GETTER METHODS FOR COMPATIBILITY 🚨
  getSessionId() {
    return this.sessionId;
  }

  getReplayMode() {
    return this.replayMode;
  }

  getConnectionHealth() {
    return { ...this.connectionHealth };
  }

  getStreamStatus() {
    return {
      queueSize: this.streamQueue.length,
      pendingUploads: this.pendingUploads.size,
      health: this.connectionHealth,
      isProcessing: this.streamProcessor !== null
    };
  }

  // 🚨 NEW: HEALTH MONITORING CONTROLS 🚨
  setQuietMode(enabled) {
    this.quietMode = enabled;
    console.log(`🔇 Health monitoring ${enabled ? 'silenced' : 'enabled'} (critical alerts always show)`);
  }

  enableHealthMonitoring() {
    this.setQuietMode(false);
  }

  disableHealthMonitoring() {
    this.setQuietMode(true);
  }
}

// Export singleton instance
export const interactionLogger = new InteractionLogger();
export default InteractionLogger; 