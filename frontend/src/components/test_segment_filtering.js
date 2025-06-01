// Test for segment filtering fix
// This tests whether short user speech segments are being filtered out correctly

// Mock data simulating the problematic session
const mockLogsWithShortUserSpeech = [
  {
    id: 1,
    interaction_type: 'user_action',
    timestamp: '2025-05-31T23:52:47.976542',
    interaction_metadata: { action_type: 'audio_stream_start' }
  },
  {
    id: 2,
    interaction_type: 'audio_chunk',
    timestamp: '2025-05-31T23:52:48.962553',
    interaction_metadata: { microphone_on: true, audio_sample_rate: 16000 }
  },
  {
    id: 3,
    interaction_type: 'audio_chunk',
    timestamp: '2025-05-31T23:52:48.964553', // Only 2ms later - very short segment
    interaction_metadata: { microphone_on: true, audio_sample_rate: 16000 }
  },
  {
    id: 4,
    interaction_type: 'api_response',
    timestamp: '2025-05-31T23:52:58.862340',
    media_data: { cloud_storage_url: 'test.pcm' },
    interaction_metadata: { response_type: 'audio' }
  },
  {
    id: 5,
    interaction_type: 'audio_chunk',
    timestamp: '2025-05-31T23:53:02.809097',
    interaction_metadata: { microphone_on: true, audio_sample_rate: 16000 }
  },
  {
    id: 6,
    interaction_type: 'audio_chunk',
    timestamp: '2025-05-31T23:53:02.827097', // Only 18ms later - very short segment
    interaction_metadata: { microphone_on: true, audio_sample_rate: 16000 }
  },
  {
    id: 7,
    interaction_type: 'api_response',
    timestamp: '2025-05-31T23:53:03.447534',
    media_data: { cloud_storage_url: 'test2.pcm' },
    interaction_metadata: { response_type: 'audio' }
  },
  {
    id: 8,
    interaction_type: 'audio_chunk',
    timestamp: '2025-05-31T23:53:09.352126',
    interaction_metadata: { microphone_on: true, audio_sample_rate: 16000 }
  },
  {
    id: 9,
    interaction_type: 'audio_chunk',
    timestamp: '2025-05-31T23:53:10.952126', // 1600ms later - this should be kept
    interaction_metadata: { microphone_on: true, audio_sample_rate: 16000 }
  }
];

// Copy the segment processing logic from InteractionReplay.js
const processIntoSegmentsTest = (logs) => {
  console.log('🧪 TEST: Processing', logs.length, 'logs into conversation segments...');
  
  const segments = [];
  let currentSegment = null;
  let segmentId = 0;
  
  // Constants for filtering noise (same as in the fix)
  const MIN_USER_SPEECH_DURATION = 1500; // Updated to match new threshold: Minimum 1500ms for user speech to be considered valid

  // Group logs by conversation segments
  logs.forEach((log, index) => {
    const { interaction_type, timestamp, interaction_metadata } = log;
    const isUserAudio = interaction_type === 'audio_chunk' && interaction_metadata?.microphone_on === true;
    
    const isApiAudioResponse = interaction_type === 'api_response' && (
      log.media_data?.cloud_storage_url?.includes('.pcm') ||
      interaction_metadata?.response_type === 'audio' ||
      (log.media_data?.cloud_storage_url && interaction_metadata?.mime_type?.includes('audio'))
    );
    
    const isVideoFrame = interaction_type === 'video_frame';
    const isTextInput = interaction_type === 'text_input';
    const isTextApiResponse = interaction_type === 'api_response' && !isApiAudioResponse;
    const isUserAction = interaction_type === 'user_action';

    console.log(`🧪 Processing log ${log.id}: ${interaction_type}, isUserAudio: ${isUserAudio}, isApiAudioResponse: ${isApiAudioResponse}`);

    // Define segment boundaries
    const isSegmentStart = (
      isTextInput || 
      (isUserAction && interaction_metadata?.action_type === 'audio_stream_start') ||
      (isUserAudio && (!currentSegment || currentSegment.type !== 'user_speech')) ||
      (isApiAudioResponse && (!currentSegment || currentSegment.type !== 'api_response'))
    );

    // Create new segment if needed
    if (isSegmentStart || !currentSegment) {
      // Finalize previous segment
      if (currentSegment) {
        currentSegment.endTime = currentSegment.logs[currentSegment.logs.length - 1].timestamp;
        currentSegment.duration = new Date(currentSegment.endTime) - new Date(currentSegment.startTime);
        console.log(`🧪 Finalized segment ${currentSegment.id} (${currentSegment.type}): ${currentSegment.audioChunks.length} audio, ${currentSegment.duration}ms`);
      }

      // Determine segment type
      let segmentType = 'unknown';
      if (isTextInput) segmentType = 'user_text';
      else if (isUserAudio) segmentType = 'user_speech';
      else if (isApiAudioResponse || isTextApiResponse) segmentType = 'api_response';
      else if (isUserAction) segmentType = 'user_action';

      currentSegment = {
        id: ++segmentId,
        type: segmentType,
        startTime: timestamp,
        endTime: timestamp,
        duration: 0,
        logs: [],
        audioChunks: [],
        videoFrames: [],
        metadata: {
          chunkCount: 0,
          totalBytes: 0,
          sampleRate: interaction_metadata?.audio_sample_rate || (isUserAudio ? 16000 : 24000)
        }
      };
      segments.push(currentSegment);
      console.log(`🧪 Created new segment ${segmentId} (${segmentType}) starting at ${timestamp}`);
    }

    // Add log to current segment
    currentSegment.logs.push(log);
    currentSegment.endTime = timestamp;

    // Categorize by type
    if (interaction_type === 'audio_chunk' || isApiAudioResponse) {
      currentSegment.audioChunks.push(log);
      currentSegment.metadata.chunkCount++;
      console.log(`🧪 Added audio to segment ${currentSegment.id}: ${currentSegment.audioChunks.length} chunks`);
    } else if (isVideoFrame) {
      currentSegment.videoFrames.push(log);
    }
  });

  // Finalize last segment
  if (currentSegment) {
    currentSegment.duration = new Date(currentSegment.endTime) - new Date(currentSegment.startTime);
    console.log(`🧪 Finalized final segment ${currentSegment.id} (${currentSegment.type}): ${currentSegment.audioChunks.length} audio, ${currentSegment.duration}ms`);
  }

  console.log('🧪 BEFORE FILTERING - Created', segments.length, 'segments:', 
    segments.map(s => `${s.type}(${s.audioChunks.length}a,${s.duration}ms)`));

  // FILTER OUT SHORT USER SPEECH SEGMENTS that are likely noise
  const originalSegmentCount = segments.length;
  const filteredSegments = segments.filter(segment => {
    if (segment.type === 'user_speech' && segment.duration < MIN_USER_SPEECH_DURATION) {
      console.log(`🧪 ✂️  FILTERING OUT short user speech segment ${segment.id}: ${segment.duration}ms < ${MIN_USER_SPEECH_DURATION}ms (likely noise)`);
      return false;
    }
    return true;
  });
  
  if (filteredSegments.length !== originalSegmentCount) {
    console.log(`🧪 📊 FILTERED ${originalSegmentCount - filteredSegments.length} short user speech segments out of ${originalSegmentCount} total segments`);
  }

  console.log('🧪 AFTER FILTERING - Created', filteredSegments.length, 'segments:', 
    filteredSegments.map(s => `${s.type}(${s.audioChunks.length}a,${s.duration}ms)`));

  return filteredSegments;
};

// Run the test
const runSegmentFilteringTest = () => {
  console.log('🧪 ===== SEGMENT FILTERING TEST =====');
  console.log('🧪 Testing with mock data that has short user speech segments...');
  
  const segments = processIntoSegmentsTest(mockLogsWithShortUserSpeech);
  
  // Analyze results
  const userSpeechSegments = segments.filter(s => s.type === 'user_speech');
  const shortUserSpeechSegments = userSpeechSegments.filter(s => s.duration < 1500);
  
  console.log('🧪 ===== TEST RESULTS =====');
  console.log(`🧪 Total segments: ${segments.length}`);
  console.log(`🧪 User speech segments: ${userSpeechSegments.length}`);
  console.log(`🧪 Short user speech segments (< 1500ms): ${shortUserSpeechSegments.length}`);
  
  if (shortUserSpeechSegments.length === 0) {
    console.log('🧪 ✅ TEST PASSED: No short user speech segments remain after filtering');
    return true;
  } else {
    console.log('🧪 ❌ TEST FAILED: Short user speech segments still exist:');
    shortUserSpeechSegments.forEach(segment => {
      console.log(`🧪    - Segment ${segment.id}: ${segment.duration}ms`);
    });
    return false;
  }
};

// Export for testing in browser console
if (typeof window !== 'undefined') {
  window.runSegmentFilteringTest = runSegmentFilteringTest;
  window.mockLogsWithShortUserSpeech = mockLogsWithShortUserSpeech;
  window.processIntoSegmentsTest = processIntoSegmentsTest;
}

export { runSegmentFilteringTest, mockLogsWithShortUserSpeech, processIntoSegmentsTest }; 