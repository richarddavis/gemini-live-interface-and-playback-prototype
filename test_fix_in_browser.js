// Paste this into the browser console to test the segment filtering fix
// This will verify that short user speech segments are being filtered out

console.log('🧪 ===== TESTING SEGMENT FILTERING FIX =====');

// Test 1: Check if the debug function is available
console.log('🧪 Test 1: Checking if debug functions are available...');
if (typeof window.testSegmentFiltering === 'function') {
  console.log('🧪 ✅ testSegmentFiltering function is available');
  
  // Run the test
  console.log('🧪 Running segment filtering test...');
  window.testSegmentFiltering();
} else {
  console.log('🧪 ❌ testSegmentFiltering function not found');
  console.log('🧪 Available window functions:', Object.keys(window).filter(k => k.includes('test') || k.includes('debug')));
}

// Test 2: Check current state of InteractionReplay
console.log('🧪 Test 2: Checking InteractionReplay state...');
if (window.debugInteractionReplay) {
  console.log('🧪 ✅ debugInteractionReplay is available');
  console.log('🧪 Current conversation segments:', window.debugInteractionReplay.conversationSegments?.length || 0);
  
  if (window.debugInteractionReplay.conversationSegments) {
    const userSpeechSegments = window.debugInteractionReplay.conversationSegments.filter(s => s.type === 'user_speech');
    const shortSegments = userSpeechSegments.filter(s => s.duration < 1500);
    
    console.log(`🧪 Current user speech segments: ${userSpeechSegments.length}`);
    console.log(`🧪 Current short user speech segments (< 1500ms): ${shortSegments.length}`);
    
    if (shortSegments.length > 0) {
      console.log('🧪 ❌ SHORT SEGMENTS STILL EXIST - Fix may not be working:', shortSegments);
    } else {
      console.log('🧪 ✅ No short segments found - Fix appears to be working');
    }
  }
} else {
  console.log('🧪 ❌ debugInteractionReplay not found');
}

// Test 3: Manual test with known problematic data
console.log('🧪 Test 3: Manual test with problematic session data...');

// Simulate the exact pattern from the problematic session
const problemData = [
  {
    id: 4,
    interaction_type: 'audio_chunk',
    timestamp: '2025-05-31T23:52:48.962553',
    interaction_metadata: { microphone_on: true, audio_sample_rate: 16000 }
  },
  {
    id: 42,
    interaction_type: 'audio_chunk', 
    timestamp: '2025-05-31T23:53:02.809097', // Very short segment - only few ms
    interaction_metadata: { microphone_on: true, audio_sample_rate: 16000 }
  },
  {
    id: 44,
    interaction_type: 'api_response',
    timestamp: '2025-05-31T23:53:03.447534',
    media_data: { cloud_storage_url: 'test.pcm' },
    interaction_metadata: { response_type: 'audio' }
  },
  {
    id: 61,
    interaction_type: 'audio_chunk',
    timestamp: '2025-05-31T23:53:09.352126', // Another very short segment
    interaction_metadata: { microphone_on: true, audio_sample_rate: 16000 }
  },
  {
    id: 78,
    interaction_type: 'audio_chunk',
    timestamp: '2025-05-31T23:53:14.659472', // Another very short segment
    interaction_metadata: { microphone_on: true, audio_sample_rate: 16000 }
  }
];

// If processIntoSegments function is available, test it
if (window.debugInteractionReplay?.processIntoSegments) {
  console.log('🧪 Testing processIntoSegments with problematic data...');
  const result = window.debugInteractionReplay.processIntoSegments(problemData);
  
  const userSpeechSegments = result.filter(s => s.type === 'user_speech');
  const shortSegments = userSpeechSegments.filter(s => s.duration < 1500);
  
  console.log(`🧪 Manual test results:`);
  console.log(`🧪 - Total segments: ${result.length}`);
  console.log(`🧪 - User speech segments: ${userSpeechSegments.length}`);
  console.log(`🧪 - Short user speech segments (< 1500ms): ${shortSegments.length}`);
  
  if (shortSegments.length === 0) {
    console.log('🧪 ✅ MANUAL TEST PASSED: No short segments remain after filtering');
  } else {
    console.log('🧪 ❌ MANUAL TEST FAILED: Short segments still exist:', shortSegments);
  }
} else {
  console.log('🧪 ❌ processIntoSegments function not available for manual test');
}

// Test 4: Check if the fix version is loaded
console.log('🧪 Test 4: Checking if the updated code is loaded...');
const interactionReplayElement = document.querySelector('.interaction-replay');
if (interactionReplayElement) {
  console.log('🧪 ✅ InteractionReplay component is mounted');
  
  // Check for specific console logs that indicate the fix is present
  console.log('🧪 Look for these logs when replaying:');
  console.log('🧪 - "🎭 🔍 STARTING SEGMENT FILTERING"');
  console.log('🧪 - "🎭 ✂️  FILTERING OUT short user speech segment"'); 
  console.log('🧪 - "🎭 📊 FILTERING WAS APPLIED"');
} else {
  console.log('🧪 ❌ InteractionReplay component not found - may not be on the replay page');
}

console.log('🧪 ===== TEST COMPLETE =====');
console.log('🧪 To fully test: Load session session_1748735557471_ehkgxtvai and start replay');
console.log('🧪 Look for the filtering logs in the console during segment processing'); 