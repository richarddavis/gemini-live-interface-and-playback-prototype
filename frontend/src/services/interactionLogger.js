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
    this.gapThreshold = 5000; // 5 seconds
    
    // 🚨 NEW: Sequence tracking for proper ordering
    this.sessionSequence = new Map(); // Map of session_id -> current sequence number
    this.currentSessionSequence = 0; // Current sequence for active session
    
    console.log('🔍 InteractionLogger: Real-time streaming mode enabled');
    this.startStreamProcessor();
    this.startHealthMonitoring();

    // 💾 Off-load uploads to a Web Worker
    try {
      // Dynamically import worker so CRA / webpack bundles it correctly
      // eslint-disable-next-line import/no-webpack-loader-syntax
      // @ts-ignore – worker-loader query for CRA <5; for Webpack 5 the URL ctor works
      this.uploadWorker = new Worker(new URL('../workers/logUploadWorker.js', import.meta.url), { type: 'module' });

      this.workerCallbacks = new Map();
      this.nextWorkerId = 0;

      this.uploadWorker.onmessage = (e) => {
        const { id, ok, result, err } = e.data;
        const cb = this.workerCallbacks.get(id);
        if (!cb) return;
        this.workerCallbacks.delete(id);
        if (ok) cb.resolve(result);
        else cb.reject(new Error(err));
      };

    } catch (err) {
      console.warn('⚠️ Failed to init log-upload worker; falling back to main-thread uploads', err);
      this.uploadWorker = null;
    }
  }

  generateSessionId() {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // 🚨 NEW: Start a fresh session with new session ID 🚨
  startNewSession(chatSessionId = null) {
    // Generate a new session ID for this session
    this.sessionId = this.generateSessionId();
    
    // Initialize sequence counter for this new session
    this.currentSessionSequence = 0;
    this.sessionSequence.set(this.sessionId, 0);
    
    console.log(`🆕 Generated new session ID: ${this.sessionId} with sequence starting at 0`);
    
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
        credentials: 'include', // Include cookies for authentication
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
        },
        credentials: 'include' // Include cookies for authentication
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

    // 🚨 CRITICAL: Increment sequence number for this session
    this.currentSessionSequence++;
    if (this.sessionId) {
      this.sessionSequence.set(this.sessionId, this.currentSessionSequence);
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
        sequence_number: this.currentSessionSequence, // 🎯 KEY FIX: Add sequence tracking
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
    const startTime = performance.now();

    // Prepare payload (reuse existing logic for media handling)
    const { interaction_type, mediaData, options, metadata, session_id } = streamItem;
    const payload = {
      session_id,
      interaction_type,
      metadata: {
        ...metadata,
        stream_processed_at: new Date().toISOString(),
      },
    };

    if (mediaData && this.replayMode) {
      let processedData;
      if (typeof mediaData === 'string') processedData = mediaData;
      else if (mediaData instanceof ArrayBuffer)
        processedData = btoa(String.fromCharCode(...new Uint8Array(mediaData)));
      else processedData = JSON.stringify(mediaData);

      payload.media_data = {
        storage_type: options.storageType || 'cloud_storage',
        data: processedData,
        is_anonymized: options.isAnonymized || false,
        retention_days: options.retentionDays || 1,
        stream_upload: true,
      };
    }

    // If worker available, delegate
    if (this.uploadWorker) {
      return new Promise((resolve, reject) => {
        const id = this.nextWorkerId++;
        this.workerCallbacks.set(id, { resolve, reject });
        this.uploadWorker.postMessage({ id, baseUrl: this.baseUrl, item: payload });
      })
        .then((res) => {
          this.connectionHealth.totalLogged++;
          this.connectionHealth.actualInteractions++;
          this.connectionHealth.consecutiveFailures = 0;
          if (this.debugMode) {
            console.log(`✅ STREAMED ${interaction_type} via worker`);
          }
          return res;
        })
        .catch((err) => {
          this.connectionHealth.totalFailed++;
          this.connectionHealth.consecutiveFailures++;
          console.error(`🚨 STREAM FAILED ${interaction_type} via worker:`, err);
          throw err;
        });
    }

    // Fallback: previous in-thread behaviour (simplified)
    try {
      await fetch(`${this.baseUrl}/interaction-logs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      });
      this.connectionHealth.totalLogged++;
    } catch (err) {
      this.connectionHealth.totalFailed++;
      throw err;
    } finally {
      if (this.debugMode) {
        console.log(`ℹ️ Fallback upload duration ${(performance.now() - startTime).toFixed(0)}ms`);
      }
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
      const response = await fetch(`${this.baseUrl}/interaction-logs/analytics/${this.sessionId}`, {
        credentials: 'include' // Include cookies for authentication
      });
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

      const response = await fetch(`${this.baseUrl}/interaction-logs/${this.sessionId}?${params}`, {
        credentials: 'include' // Include cookies for authentication
      });
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
  async getReplayData(sessionId = null, { batchSize = 1000, onBatch = null } = {}) {
    const targetSessionId = sessionId || this.sessionId;
    console.log(`🎭 getReplayData (paginated) called with sessionId: ${sessionId}, targetSessionId: ${targetSessionId}`);

    const allLogs = [];
    let offset = 0;
    let totalCount = Infinity; // will be updated after first request

    try {
      while (allLogs.length < totalCount) {
        const url = `${this.baseUrl}/interaction-logs/${targetSessionId}?include_media=true&limit=${batchSize}&offset=${offset}`;
        console.log(`🎭 Fetching replay batch: ${url}`);

        const response = await fetch(url, { credentials: 'include' });
        if (!response.ok) {
          console.error(`🎭 getReplayData batch fetch failed (offset=${offset}):`, response.status, response.statusText);
          break;
        }

        const data = await response.json();

        // Update counts based on first successful response
        totalCount = data.total_count ?? data.logs.length;

        // Append new logs and invoke callback if provided
        if (Array.isArray(data.logs) && data.logs.length > 0) {
          allLogs.push(...data.logs);
          if (typeof onBatch === 'function') {
            try {
              // Pass shallow copy to avoid accidental mutation downstream
              onBatch([...data.logs], { accumulated: allLogs.length, total: totalCount });
            } catch (cbErr) {
              console.warn('🎭 onBatch callback error:', cbErr);
            }
          }
        }

        // If fewer logs than the batch size were returned, we've reached the end.
        if (!data.logs || data.logs.length < batchSize) {
          break;
        }

        // Prepare next iteration (use actual batch size to avoid infinite loop if backend returns fewer than requested)
        offset += data.logs?.length || batchSize;
      }

      console.log(`🎭 getReplayData finished. Retrieved ${allLogs.length}/${totalCount} logs for session ${targetSessionId}`);

      // Sort logs chronologically once after all pages fetched
      allLogs.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

      return { logs: allLogs, total_count: totalCount, limit: batchSize };
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
      const response = await fetch(url, {
        credentials: 'include' // Include cookies for authentication
      });
      console.log('🔍 getAllReplaySessions response:', response.status, response.statusText);
      if (response.ok) {
        const data = await response.json();
        console.log('🔍 getAllReplaySessions data:', data);
        return data.sessions || [];
      } else {
        console.error('🔍 getAllReplaySessions failed:', response.status, response.statusText);
      }
    } catch (error) {
      console.warn('Error fetching replay sessions:', error);
    }
    return [];
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