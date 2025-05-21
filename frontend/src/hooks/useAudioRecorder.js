import { useState, useRef, useEffect, useCallback } from 'react';

// Helper to convert audio to 16-bit PCM, 16kHz
const convertAudioToPCM = async (audioBuffer, inputSampleRate) => {
  const targetSampleRate = 16000;
  const numberOfChannels = 1; // Mono
  
  // Create offline context for resampling
  const offlineCtx = new OfflineAudioContext(
    numberOfChannels, 
    audioBuffer.duration * targetSampleRate, 
    targetSampleRate
  );
  
  // Create buffer source
  const source = offlineCtx.createBufferSource();
  source.buffer = audioBuffer;
  source.connect(offlineCtx.destination);
  source.start(0);
  
  // Render and get the resampled buffer
  const renderedBuffer = await offlineCtx.startRendering();
  
  // Get the PCM data (normalized Float32Array, from -1.0 to 1.0)
  const pcmData = renderedBuffer.getChannelData(0);
  
  // Convert to 16-bit PCM (Int16Array, from -32768 to 32767)
  const int16Data = new Int16Array(pcmData.length);
  for (let i = 0; i < pcmData.length; i++) {
    // Scale to 16-bit range and clamp
    const sample = Math.max(-1, Math.min(1, pcmData[i]));
    int16Data[i] = sample < 0 ? sample * 32768 : sample * 32767;
  }
  
  return int16Data;
};

export function useAudioRecorder() {
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [audioStream, setAudioStream] = useState(null);
  const [error, setError] = useState(null);
  const [speechDetected, setSpeechDetected] = useState(false);
  const [silenceDetected, setSilenceDetected] = useState(false);
  
  const mediaRecorderRef = useRef(null);
  const audioContextRef = useRef(null);
  const audioChunksRef = useRef([]);
  const silenceTimeoutRef = useRef(null);
  const audioAnalyserRef = useRef(null);
  const streamRef = useRef(null);
  
  // Speech detection parameters
  const SILENCE_THRESHOLD = 0.01; // Volume threshold for silence
  const SPEECH_THRESHOLD = 0.05; // Volume threshold for speech
  const SILENCE_DURATION = 1500; // Duration of silence in ms to consider end of speech
  
  // Moved detectVolume definition before useEffect that uses it
  const detectVolume = useCallback(() => {
    if (!audioAnalyserRef.current || !isRecording) return;
    
    const bufferLength = audioAnalyserRef.current.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    
    const checkVolume = () => {
      if (!audioAnalyserRef.current || !isRecording) return;
      
      audioAnalyserRef.current.getByteFrequencyData(dataArray);
      
      let sum = 0;
      for (let i = 0; i < bufferLength; i++) {
        sum += dataArray[i];
      }
      const averageVolume = sum / bufferLength / 255; 
      
      if (averageVolume > SPEECH_THRESHOLD) {
        if (!speechDetected) {
          console.log('Speech detected');
          setSpeechDetected(true);
          setSilenceDetected(false);
        }
        
        if (silenceTimeoutRef.current) {
          clearTimeout(silenceTimeoutRef.current);
          silenceTimeoutRef.current = null;
        }
      } else if (averageVolume < SILENCE_THRESHOLD && speechDetected) {
        if (!silenceTimeoutRef.current) {
          silenceTimeoutRef.current = setTimeout(() => {
            console.log('Silence detected (end of speech)');
            setSilenceDetected(true);
            setSpeechDetected(false);
          }, SILENCE_DURATION);
        }
      }
      
      if (isRecording) {
        requestAnimationFrame(checkVolume);
      }
    };
    
    requestAnimationFrame(checkVolume);
  }, [isRecording, speechDetected]);
  
  // Volume analyzer setup
  useEffect(() => {
    if (!audioStream) return;
    
    try {
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
      }
      
      const analyser = audioContextRef.current.createAnalyser();
      analyser.fftSize = 256;
      
      const source = audioContextRef.current.createMediaStreamSource(audioStream);
      source.connect(analyser);
      
      audioAnalyserRef.current = analyser;
      
      detectVolume(); // Now called after definition
    } catch (err) {
      console.error('Error setting up audio analyzer:', err);
      setError('Error setting up audio analyzer: ' + err.message);
    }
    
    return () => {
      if (audioAnalyserRef.current) {
        // Cleanup
      }
    };
  }, [audioStream, detectVolume]);
  
  // Start recording
  const startRecording = useCallback(async () => {
    try {
      setError(null);
      setSpeechDetected(false);
      setSilenceDetected(false);
      
      // Clear any existing timeout
      if (silenceTimeoutRef.current) {
        clearTimeout(silenceTimeoutRef.current);
        silenceTimeoutRef.current = null;
      }
      
      // Reset audio chunks
      audioChunksRef.current = [];
      
      // Request microphone access
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      setAudioStream(stream);
      
      // Create media recorder
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      
      // Handle data available event
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };
      
      // Start recording
      mediaRecorder.start(100); // Capture in 100ms chunks
      setIsRecording(true);
    } catch (err) {
      console.error('Error starting recording:', err);
      setError('Error accessing microphone: ' + err.message);
    }
  }, []);
  
  // Stop recording
  const stopRecording = useCallback(async () => {
    return new Promise((resolve, reject) => {
      if (!mediaRecorderRef.current || mediaRecorderRef.current.state === 'inactive') {
        resolve(null);
        return;
      }
      
      // Clear silence timeout
      if (silenceTimeoutRef.current) {
        clearTimeout(silenceTimeoutRef.current);
        silenceTimeoutRef.current = null;
      }
      
      setIsProcessing(true);
      
      // Handle stop event
      mediaRecorderRef.current.onstop = async () => {
        try {
          // Stop all tracks
          if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => track.stop());
          }
          
          // Process audio to PCM format
          if (audioChunksRef.current.length > 0) {
            const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
            
            // Convert to AudioBuffer
            const arrayBuffer = await audioBlob.arrayBuffer();
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
            
            // Convert to 16kHz 16-bit PCM
            const pcmData = await convertAudioToPCM(audioBuffer, audioContext.sampleRate);
            
            // Convert to base64
            const pcmBuffer = pcmData.buffer;
            const base64Data = btoa(String.fromCharCode(...new Uint8Array(pcmBuffer)));
            
            // Cleanup
            setIsRecording(false);
            setIsProcessing(false);
            setSpeechDetected(false);
            setSilenceDetected(false);
            setAudioStream(null);
            
            resolve(base64Data);
          } else {
            setIsRecording(false);
            setIsProcessing(false);
            setAudioStream(null);
            resolve(null);
          }
        } catch (err) {
          console.error('Error processing audio:', err);
          setError('Error processing audio: ' + err.message);
          setIsRecording(false);
          setIsProcessing(false);
          setAudioStream(null);
          reject(err);
        }
      };
      
      // Stop recording
      mediaRecorderRef.current.stop();
    });
  }, []);
  
  return {
    isRecording,
    isProcessing,
    audioStream,
    error,
    speechDetected,
    silenceDetected,
    startRecording,
    stopRecording
  };
} 