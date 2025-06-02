/**
 * Test script to debug the stop button issue in InteractionReplay
 * This simulates the React component behavior and timeout management
 */

class MockInteractionReplayState {
  constructor() {
    this.state = {
      isPlaying: false,
      currentSegmentIndex: 0,
      conversationSegments: [],
      processedSegments: new Map(),
      playbackSpeed: 1
    };
    
    // Simulate refs
    this.playbackTimeoutRef = { current: null };
    this.segmentTimeoutRef = { current: null };
    this.activeAudioSourcesRef = { current: [] };
    this.videoPlaybackRef = { current: null };
    
    // Track all active timeouts for debugging
    this.allActiveTimeouts = new Set();
    this.timeoutCounter = 0;
    
    // Mock audio sources
    this.mockAudioSources = [];
  }

  updateState(updates) {
    Object.assign(this.state, updates);
    console.log(`📝 State updated:`, updates);
  }

  // Mock audio source
  createMockAudioSource(duration = 2000) {
    const source = {
      id: `audio_${Date.now()}_${Math.random()}`,
      duration,
      stopped: false,
      stop: function() {
        this.stopped = true;
        console.log(`🔇 Audio source ${this.id} stopped`);
      }
    };
    this.mockAudioSources.push(source);
    this.activeAudioSourcesRef.current.push(source);
    return source;
  }

  // Enhanced setTimeout wrapper to track all timeouts
  setTimeout(callback, delay, label = 'unknown') {
    const timeoutId = ++this.timeoutCounter;
    console.log(`⏰ Creating timeout ${timeoutId} (${label}) - delay: ${delay}ms`);
    
    const wrappedCallback = () => {
      this.allActiveTimeouts.delete(timeoutId);
      console.log(`⏰ Executing timeout ${timeoutId} (${label}) - remaining active: ${this.allActiveTimeouts.size}`);
      callback();
    };
    
    const actualTimeoutId = setTimeout(wrappedCallback, delay);
    this.allActiveTimeouts.add(timeoutId);
    
    return {
      id: timeoutId,
      actualId: actualTimeoutId,
      label,
      delay
    };
  }

  clearTimeout(timeoutObj) {
    if (timeoutObj && timeoutObj.actualId) {
      console.log(`❌ Clearing timeout ${timeoutObj.id} (${timeoutObj.label})`);
      clearTimeout(timeoutObj.actualId);
      this.allActiveTimeouts.delete(timeoutObj.id);
    }
  }

  // Simulate the stopReplay function with enhanced logging
  stopReplay() {
    console.log('\n🛑 ===== STOP REPLAY CALLED =====');
    console.log(`🛑 Current state - isPlaying: ${this.state.isPlaying}`);
    console.log(`🛑 Active timeouts before stop: ${this.allActiveTimeouts.size}`);
    console.log(`🛑 Active audio sources: ${this.activeAudioSourcesRef.current.length}`);
    
    this.updateState({ isPlaying: false });
    
    // Clear playback timeout
    if (this.playbackTimeoutRef.current) {
      console.log(`🛑 Clearing playbackTimeoutRef: ${this.playbackTimeoutRef.current.id}`);
      this.clearTimeout(this.playbackTimeoutRef.current);
      this.playbackTimeoutRef.current = null;
    } else {
      console.log(`🛑 playbackTimeoutRef was null`);
    }
    
    // Clear segment timeout
    if (this.segmentTimeoutRef.current) {
      console.log(`🛑 Clearing segmentTimeoutRef: ${this.segmentTimeoutRef.current.id}`);
      this.clearTimeout(this.segmentTimeoutRef.current);
      this.segmentTimeoutRef.current = null;
    } else {
      console.log(`🛑 segmentTimeoutRef was null`);
    }
    
    // Stop audio sources
    console.log(`🛑 Stopping ${this.activeAudioSourcesRef.current.length} audio sources`);
    this.activeAudioSourcesRef.current.forEach((source, index) => {
      console.log(`🛑 Stopping audio source ${index + 1}: ${source.id}`);
      try {
        source.stop();
      } catch (error) {
        console.log(`🛑 Audio source ${source.id} already stopped:`, error.message);
      }
    });
    this.activeAudioSourcesRef.current = [];
    
    console.log(`🛑 Active timeouts after stop: ${this.allActiveTimeouts.size}`);
    if (this.allActiveTimeouts.size > 0) {
      console.log(`🛑 ⚠️  WARNING: ${this.allActiveTimeouts.size} timeouts still active!`);
      console.log(`🛑 Active timeout IDs:`, Array.from(this.allActiveTimeouts));
    }
    console.log('🛑 ===== STOP REPLAY COMPLETE =====\n');
  }

  // Simulate the playNextSegment function with enhanced logging
  async playNextSegment(segmentIndex, isPlaying = null, segments = null) {
    const actualIsPlaying = isPlaying !== null ? isPlaying : this.state.isPlaying;
    const actualSegments = segments || this.state.conversationSegments;
    
    console.log(`\n🎭 ===== PLAY NEXT SEGMENT ${segmentIndex} =====`);
    console.log(`🎭 isPlaying parameter: ${isPlaying}`);
    console.log(`🎭 actualIsPlaying: ${actualIsPlaying}`);
    console.log(`🎭 state.isPlaying: ${this.state.isPlaying}`);
    console.log(`🎭 segments.length: ${actualSegments.length}`);
    console.log(`🎭 Active timeouts: ${this.allActiveTimeouts.size}`);
    
    if (!actualIsPlaying || segmentIndex >= actualSegments.length) {
      console.log(`🎭 ⏹ Segment replay stopping - isPlaying: ${actualIsPlaying}, segmentIndex: ${segmentIndex}/${actualSegments.length}`);
      this.updateState({ isPlaying: false });
      return;
    }

    const segment = actualSegments[segmentIndex] || { type: 'mock', duration: 1000 };
    console.log(`🎭 Playing segment ${segmentIndex + 1}/${actualSegments.length}: ${segment.type} (${segment.duration}ms)`);

    this.updateState({ currentSegmentIndex: segmentIndex });

    try {
      // Simulate segment processing
      await this.playMockSegment(segment);

      // Schedule next segment
      const delay = Math.max(200, Math.min(1000, segment.duration * 0.1 / this.state.playbackSpeed));
      console.log(`🎭 Segment ${segmentIndex} completed, scheduling next in ${delay}ms`);
      
      this.segmentTimeoutRef.current = this.setTimeout(() => {
        console.log(`🎭 ⏰ Timeout callback executing for segment ${segmentIndex + 1}`);
        console.log(`🎭 ⏰ Current isPlaying state: ${this.state.isPlaying}`);
        if (this.state.isPlaying) {
          this.playNextSegment(segmentIndex + 1, actualIsPlaying, actualSegments);
        } else {
          console.log(`🎭 ⏰ Skipping next segment - isPlaying is false`);
        }
      }, delay, `segment_${segmentIndex}_to_${segmentIndex + 1}`);

    } catch (error) {
      console.error(`🎭 ❌ Segment ${segmentIndex} failed:`, error);
      this.segmentTimeoutRef.current = this.setTimeout(() => {
        console.log(`🎭 ⏰ Error recovery timeout executing for segment ${segmentIndex + 1}`);
        this.playNextSegment(segmentIndex + 1, actualIsPlaying, actualSegments);
      }, 500, `error_recovery_${segmentIndex}`);
    }
    
    console.log(`🎭 ===== SEGMENT ${segmentIndex} SCHEDULED =====\n`);
  }

  async playMockSegment(segment) {
    console.log(`🎭 🎵 Playing mock ${segment.type} segment...`);
    
    // Simulate audio playback
    if (segment.type === 'user_speech' || segment.type === 'api_response') {
      const audioSource = this.createMockAudioSource(segment.duration);
      console.log(`🎭 🎵 Created audio source: ${audioSource.id}`);
      
      // Simulate audio completion
      return new Promise((resolve) => {
        const audioTimeout = this.setTimeout(() => {
          console.log(`🎭 🎵 Audio segment completed: ${audioSource.id}`);
          // Remove from active sources
          this.activeAudioSourcesRef.current = this.activeAudioSourcesRef.current.filter(s => s !== audioSource);
          resolve();
        }, Math.min(100, segment.duration / 10), `audio_completion_${audioSource.id}`);
      });
    }
    
    // Non-audio segments complete immediately
    return Promise.resolve();
  }

  // Create mock segments for testing
  createMockSegments(count = 5) {
    const segments = [];
    for (let i = 0; i < count; i++) {
      segments.push({
        id: i + 1,
        type: i % 2 === 0 ? 'user_speech' : 'api_response',
        duration: 1000 + (i * 500),
        startTime: new Date(Date.now() + i * 2000).toISOString()
      });
    }
    this.state.conversationSegments = segments;
    console.log(`📋 Created ${count} mock segments:`, segments.map(s => `${s.type}(${s.duration}ms)`));
    return segments;
  }

  // Main test function
  async runStopButtonTest() {
    console.log('\n🧪 ===== STOP BUTTON TEST STARTING =====');
    
    // Setup
    this.createMockSegments(5);
    this.updateState({ isPlaying: true, currentSegmentIndex: 0 });
    
    // Start playback
    console.log('\n🎬 Starting segment playback...');
    this.playNextSegment(0, true, this.state.conversationSegments);
    
    // Let it run for a bit
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    console.log(`\n📊 Status after 1.5s:`);
    console.log(`📊 isPlaying: ${this.state.isPlaying}`);
    console.log(`📊 currentSegmentIndex: ${this.state.currentSegmentIndex}`);
    console.log(`📊 Active timeouts: ${this.allActiveTimeouts.size}`);
    console.log(`📊 Active audio sources: ${this.activeAudioSourcesRef.current.length}`);
    
    // Press stop button
    console.log('\n🛑 PRESSING STOP BUTTON...');
    this.stopReplay();
    
    // Wait a bit to see if timeouts still fire
    console.log('\n⏳ Waiting 3 seconds to see if any timeouts still fire...');
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    console.log(`\n📊 Final status:`);
    console.log(`📊 isPlaying: ${this.state.isPlaying}`);
    console.log(`📊 Active timeouts: ${this.allActiveTimeouts.size}`);
    console.log(`📊 Active audio sources: ${this.activeAudioSourcesRef.current.length}`);
    
    if (this.allActiveTimeouts.size > 0) {
      console.log(`\n❌ TEST FAILED: ${this.allActiveTimeouts.size} timeouts still active after stop!`);
      console.log(`❌ This indicates the stop button bug is present`);
      return false;
    } else {
      console.log(`\n✅ TEST PASSED: All timeouts properly cleared`);
      return true;
    }
  }
}

// Run the test
async function runTest() {
  const testInstance = new MockInteractionReplayState();
  const result = await testInstance.runStopButtonTest();
  console.log(`\n🧪 Test result: ${result ? 'PASSED' : 'FAILED'}`);
  return result;
}

// Export for Node.js or run in browser
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { MockInteractionReplayState, runTest };
} else if (typeof window !== 'undefined') {
  window.runStopButtonTest = runTest;
  window.MockInteractionReplayState = MockInteractionReplayState;
}

// Auto-run if this script is executed directly
if (typeof require !== 'undefined' && require.main === module) {
  runTest().then(result => {
    process.exit(result ? 0 : 1);
  });
} 