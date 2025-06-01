// Test script to analyze session_1748735557471_ehkgxtvai data
// Run this in the browser console to see exactly what's happening

console.log('🔍 ===== ANALYZING PROBLEMATIC SESSION =====');

// This represents the actual user speech pattern from the session data
const mockSessionLogs = [
  // First user speech period
  { id: 1, interaction_type: 'audio_chunk', timestamp: '2025-05-31T23:52:50.000Z', interaction_metadata: { microphone_on: true } },
  { id: 2, interaction_type: 'audio_chunk', timestamp: '2025-05-31T23:52:58.000Z', interaction_metadata: { microphone_on: true } },
  
  // API Response period (44 seconds)
  { id: 3, interaction_type: 'api_response', timestamp: '2025-05-31T23:53:00.000Z', media_data: { cloud_storage_url: 'test.pcm' } },
  { id: 4, interaction_type: 'api_response', timestamp: '2025-05-31T23:53:20.000Z', media_data: { cloud_storage_url: 'test.pcm' } },
  { id: 5, interaction_type: 'api_response', timestamp: '2025-05-31T23:53:40.000Z', media_data: { cloud_storage_url: 'test.pcm' } },
  
  // Second user speech period (THE MISSING ONE!) - 16+ seconds of continuous speech
  { id: 6, interaction_type: 'audio_chunk', timestamp: '2025-05-31T23:53:42.000Z', interaction_metadata: { microphone_on: true } },
  { id: 7, interaction_type: 'audio_chunk', timestamp: '2025-05-31T23:53:43.000Z', interaction_metadata: { microphone_on: true } },
  { id: 8, interaction_type: 'audio_chunk', timestamp: '2025-05-31T23:53:44.000Z', interaction_metadata: { microphone_on: true } },
  { id: 9, interaction_type: 'audio_chunk', timestamp: '2025-05-31T23:53:45.000Z', interaction_metadata: { microphone_on: true } },
  { id: 10, interaction_type: 'audio_chunk', timestamp: '2025-05-31T23:53:46.000Z', interaction_metadata: { microphone_on: true } },
  { id: 11, interaction_type: 'audio_chunk', timestamp: '2025-05-31T23:53:47.000Z', interaction_metadata: { microphone_on: true } },
  { id: 12, interaction_type: 'audio_chunk', timestamp: '2025-05-31T23:53:48.000Z', interaction_metadata: { microphone_on: true } },
  { id: 13, interaction_type: 'audio_chunk', timestamp: '2025-05-31T23:53:49.000Z', interaction_metadata: { microphone_on: true } },
  { id: 14, interaction_type: 'audio_chunk', timestamp: '2025-05-31T23:53:50.000Z', interaction_metadata: { microphone_on: true } },
  { id: 15, interaction_type: 'audio_chunk', timestamp: '2025-05-31T23:53:51.000Z', interaction_metadata: { microphone_on: true } },
  { id: 16, interaction_type: 'audio_chunk', timestamp: '2025-05-31T23:53:52.000Z', interaction_metadata: { microphone_on: true } },
  { id: 17, interaction_type: 'audio_chunk', timestamp: '2025-05-31T23:53:53.000Z', interaction_metadata: { microphone_on: true } },
  { id: 18, interaction_type: 'audio_chunk', timestamp: '2025-05-31T23:53:54.000Z', interaction_metadata: { microphone_on: true } },
  { id: 19, interaction_type: 'audio_chunk', timestamp: '2025-05-31T23:53:55.000Z', interaction_metadata: { microphone_on: true } },
  { id: 20, interaction_type: 'audio_chunk', timestamp: '2025-05-31T23:53:56.000Z', interaction_metadata: { microphone_on: true } },
  { id: 21, interaction_type: 'audio_chunk', timestamp: '2025-05-31T23:53:57.000Z', interaction_metadata: { microphone_on: true } },
  { id: 22, interaction_type: 'audio_chunk', timestamp: '2025-05-31T23:53:58.000Z', interaction_metadata: { microphone_on: true } },
  { id: 23, interaction_type: 'audio_chunk', timestamp: '2025-05-31T23:54:00.000Z', interaction_metadata: { microphone_on: true } },
];

console.log('🔍 Testing with mock session data representing the actual problematic session...');

// Test the current processIntoSegments function if available
if (window.debugInteractionReplay && window.debugInteractionReplay.processIntoSegments) {
  console.log('🔍 Using current processIntoSegments function...');
  const result = window.debugInteractionReplay.processIntoSegments(mockSessionLogs);
  
  console.log('🔍 ===== SEGMENT ANALYSIS =====');
  console.log(`🔍 Total segments created: ${result.length}`);
  
  result.forEach((segment, index) => {
    console.log(`🔍 Segment ${index + 1}: ${segment.type}`);
    console.log(`   - Duration: ${segment.duration}ms (${(segment.duration/1000).toFixed(2)}s)`);
    console.log(`   - Audio chunks: ${segment.audioChunks.length}`);
    console.log(`   - Start: ${segment.startTime}`);
    console.log(`   - End: ${segment.endTime}`);
    
    if (segment.type === 'user_speech') {
      console.log(`   - 🎤 USER SPEECH: ${segment.audioChunks.length} chunks over ${(segment.duration/1000).toFixed(2)}s`);
      if (segment.duration > 10000) {
        console.log(`   - ✅ LONG USER SPEECH DETECTED (${(segment.duration/1000).toFixed(2)}s) - This should NOT be filtered!`);
      } else if (segment.duration < 800) {
        console.log(`   - 🗑️  SHORT SPEECH - Will be filtered out (< 800ms)`);
      }
    }
  });
  
  // Check specifically for long user speech segments
  const userSpeechSegments = result.filter(s => s.type === 'user_speech');
  const longUserSpeech = userSpeechSegments.filter(s => s.duration > 10000);
  const filteredShortSpeech = userSpeechSegments.filter(s => s.duration < 800);
  
  console.log('🔍 ===== USER SPEECH ANALYSIS =====');
  console.log(`🔍 Total user speech segments: ${userSpeechSegments.length}`);
  console.log(`🔍 Long user speech (>10s): ${longUserSpeech.length}`);
  console.log(`🔍 Short speech to be filtered (<800ms): ${filteredShortSpeech.length}`);
  
  if (longUserSpeech.length > 0) {
    console.log('🔍 ✅ LONG USER SPEECH FOUND:');
    longUserSpeech.forEach(segment => {
      console.log(`   - Segment ${segment.id}: ${(segment.duration/1000).toFixed(2)}s with ${segment.audioChunks.length} chunks`);
    });
  } else {
    console.log('🔍 ❌ NO LONG USER SPEECH FOUND - This suggests the segmentation is incorrect!');
  }
  
} else {
  console.log('🔍 ❌ processIntoSegments function not available - reload the page and try again');
}

console.log('🔍 ===== EXPECTED RESULTS =====');
console.log('🔍 We should see:');
console.log('🔍 1. A short user speech segment (~8s) from the first speech period');
console.log('🔍 2. A merged API response segment (~40s+ duration but only ~11-14s of actual audio)');
console.log('🔍 3. A LONG user speech segment (~16s+) from 23:53:42-23:54:00 - THE MISSING ONE!');
console.log('🔍 4. The long user speech should NOT be filtered out'); 