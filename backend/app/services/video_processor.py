import os
import subprocess
import tempfile
import logging
import urllib.parse
from typing import List, Dict, Optional, Tuple
from google.cloud import storage
import json
from datetime import datetime
from ..services.storage import GCSStorageService
import requests

logger = logging.getLogger(__name__)

class VideoProcessor:
    """Service for creating unified videos from interaction segments"""
    
    def __init__(self, bucket_name: str):
        self.storage_client = storage.Client()
        self.bucket_name = bucket_name
        self.bucket = self.storage_client.bucket(bucket_name)
    
    def create_session_video(self, session_id: str, segments: List[Dict]) -> Optional[Dict]:
        """
        Create individual media files for each conversation turn/segment
        
        Args:
            session_id: The session identifier
            segments: List of conversation segments
            
        Returns:
            Dictionary with segment media URLs or None if creation failed
        """
        logger.info(f"🎬 DEBUG: create_session_video called for session {session_id}")
        logger.info(f"🎬 DEBUG: Received {len(segments)} segments")
        for i, segment in enumerate(segments):
            logger.info(f"🎬 DEBUG: Segment {i+1}: ID={segment.get('id')}, type={segment.get('type')}, audio_chunks={len(segment.get('audio_chunks', []))}, video_frames={len(segment.get('video_frames', []))}")
        
        logger.info(f"Creating turn-based media files for session {session_id} with {len(segments)} segments")
        
        try:
            segment_media = {}
            base_url = os.getenv('FLASK_APP_URL', 'http://localhost:8080')
            
            with tempfile.TemporaryDirectory() as temp_dir:
                for i, segment in enumerate(segments):
                    logger.info(f"Processing segment {i+1}/{len(segments)}: {segment['type']} with {len(segment.get('audio_chunks', []))} audio chunks and {len(segment.get('video_frames', []))} video frames")
                    
                    segment_id = segment['id']
                    segment_info = {
                        'id': segment_id,
                        'type': segment['type'],
                        'start_time': segment['start_time'],
                        'end_time': segment['end_time'],
                        'duration': segment['duration']
                    }
                    
                    # Create audio file for this segment
                    if segment.get('audio_chunks'):
                        logger.info(f"🎬 DEBUG: Segment {segment_id} has {len(segment['audio_chunks'])} audio chunks - calling _create_segment_audio")
                        audio_file = self._create_segment_audio(segment['audio_chunks'], temp_dir, str(segment_id))
                        if audio_file:
                            audio_gcs_url = self._upload_segment_media(audio_file, session_id, str(segment_id), 'audio')
                            if audio_gcs_url:
                                # Return backend proxy URL instead of direct GCS URL
                                segment_info['audio_url'] = f"{base_url}/api/video/segment-media/{session_id}/{segment_id}/audio"
                                logger.info(f"Created audio segment {segment_id}: {segment_info['audio_url']}")
                    else:
                        logger.info(f"🎬 DEBUG: Segment {segment_id} has NO audio chunks - skipping audio creation")
                    
                    # Create video file for this segment
                    if segment.get('video_frames'):
                        video_file = self._create_segment_video(segment['video_frames'], segment['audio_chunks'], temp_dir, str(segment_id))
                        if video_file:
                            video_gcs_url = self._upload_segment_media(video_file, session_id, str(segment_id), 'video')
                            if video_gcs_url:
                                # Return backend proxy URL instead of direct GCS URL  
                                segment_info['video_url'] = f"{base_url}/api/video/segment-media/{session_id}/{segment_id}/video"
                                logger.info(f"Created video segment {segment_id}: {segment_info['video_url']}")
                    
                    # Only add segment if it has media
                    if 'audio_url' in segment_info or 'video_url' in segment_info:
                        segment_media[str(segment_id)] = segment_info
                        logger.info(f"Completed segment {segment_id}: {segment['type']} ({segment['duration']}ms)")
                    else:
                        logger.warning(f"Segment {segment_id} has no media files - skipping")
            
            if segment_media:
                logger.info(f"Successfully created {len(segment_media)} segment media files for session {session_id}")
                return {
                    'session_id': session_id,
                    'segments': segment_media,
                    'segment_count': len(segment_media),
                    'approach': 'turn_based_segments'
                }
            else:
                logger.warning(f"No segment media files created for session {session_id}")
                return None
                
        except Exception as e:
            logger.error(f"Error creating segment media for session {session_id}: {e}")
            return None
    
    def _prepare_media_files(self, segments: List[Dict], temp_dir: str) -> Tuple[List[str], List[str], float]:
        """Download and prepare audio and video files for processing"""
        audio_files = []
        video_files = []
        total_duration = 0.0
        
        for i, segment in enumerate(segments):
            segment_duration = segment.get('duration', 0) / 1000.0  # Convert to seconds
            total_duration += segment_duration
            
            # Process audio chunks for this segment
            audio_chunks = segment.get('audioChunks', [])
            if audio_chunks:
                segment_audio_path = self._create_segment_audio(
                    audio_chunks, temp_dir, i
                )
                if segment_audio_path:
                    audio_files.append(segment_audio_path)
            
            # Process video frames for this segment  
            video_frames = segment.get('videoFrames', [])
            if video_frames:
                segment_video_path = self._create_segment_video(
                    video_frames, segment_duration, f"segment_{i}_video.mp4", temp_dir
                )
                if segment_video_path:
                    video_files.append(segment_video_path)
        
        logger.info(f"Prepared {len(audio_files)} audio files and {len(video_files)} video files, total duration: {total_duration:.2f}s")
        return audio_files, video_files, total_duration
    
    def _create_segment_audio(self, audio_chunks: List[Dict], temp_dir: str, segment_id: str) -> Optional[str]:
        """Create audio file for a single segment"""
        try:
            logger.info(f"🎵 Creating audio for segment {segment_id} with {len(audio_chunks)} chunks")
            logger.info(f"🎵 Audio chunks: {[chunk.get('id', 'no-id') for chunk in audio_chunks]}")
            
            # Download and concatenate audio chunks
            audio_files = []
            for i, chunk in enumerate(audio_chunks):
                logger.info(f"🎵 Processing audio chunk {i+1}/{len(audio_chunks)}: {chunk.get('id', 'no-id')}")
                audio_file = self._download_and_save_audio(chunk, temp_dir, f"segment_{segment_id}_chunk_{i}")
                if audio_file:
                    audio_files.append(audio_file)
                    logger.info(f"🎵 Successfully downloaded chunk {i}: {audio_file}")
                else:
                    logger.error(f"🎵 Failed to download chunk {i}: {chunk.get('id', 'no-id')}")
            
            logger.info(f"🎵 Downloaded {len(audio_files)} out of {len(audio_chunks)} audio files for segment {segment_id}")
            
            if not audio_files:
                logger.warning(f"🎵 No audio files found for segment {segment_id}")
                return None
            
            if audio_files:
                logger.info(f"🎵 Creating segment audio with {len(audio_files)} audio files")
                
                output_file = os.path.join(temp_dir, f"segment_{segment_id}_audio.wav")
                
                if len(audio_files) == 1:
                    # Single file - convert directly
                    # Determine sample rate based on chunk metadata
                    chunk = audio_chunks[0]
                    chunk_metadata = chunk.get('interaction_metadata', {})
                    
                    # Use metadata sample rate if available, otherwise default based on source
                    if chunk_metadata.get('audio_sample_rate'):
                        sample_rate = str(chunk_metadata['audio_sample_rate'])
                    elif chunk.get('interaction_type') == 'audio_chunk' and chunk_metadata.get('microphone_on'):
                        sample_rate = '16000'  # User microphone audio is typically 16kHz
                    else:
                        sample_rate = '24000'  # API audio default
                    
                    print(f"🎵 PRINT: Using sample rate {sample_rate}Hz for single file")
                    
                    ffmpeg_cmd = [
                        'ffmpeg', '-y',
                        '-f', 's16le', '-ar', sample_rate, '-ac', '1',
                        '-i', audio_files[0],
                        '-c:a', 'pcm_s16le', '-ar', '24000',  # Output at consistent 24kHz
                        output_file
                    ]
                    print(f"🎵 PRINT: Single file conversion: {' '.join(ffmpeg_cmd)}")
                    
                else:
                    # Multiple files - use filter_complex instead of concat demuxer
                    print(f"🎵 PRINT: Using filter_complex for {len(audio_files)} files")
                    
                    # Build input arguments with appropriate sample rates for each file
                    input_args = []
                    for i, audio_file in enumerate(audio_files):
                        chunk = audio_chunks[i] if i < len(audio_chunks) else audio_chunks[0]
                        chunk_metadata = chunk.get('interaction_metadata', {})
                        
                        # Determine sample rate for this chunk
                        if chunk_metadata.get('audio_sample_rate'):
                            chunk_sample_rate = str(chunk_metadata['audio_sample_rate'])
                        elif chunk.get('interaction_type') == 'audio_chunk' and chunk_metadata.get('microphone_on'):
                            chunk_sample_rate = '16000'  # User audio
                        else:
                            chunk_sample_rate = '24000'  # API audio
                            
                        print(f"🎵 PRINT: File {i+1}: {chunk_sample_rate}Hz")
                        input_args.extend(['-f', 's16le', '-ar', chunk_sample_rate, '-ac', '1', '-i', audio_file])
                    
                    # Build filter complex for concatenation
                    # Example: "[0:a][1:a][2:a]concat=n=3:v=0:a=1[outa]"
                    filter_inputs = "".join(f"[{i}:a]" for i in range(len(audio_files)))
                    filter_complex = f"{filter_inputs}concat=n={len(audio_files)}:v=0:a=1[outa]"
                    
                    ffmpeg_cmd = [
                        'ffmpeg', '-y'
                    ] + input_args + [
                        '-filter_complex', filter_complex,
                        '-map', '[outa]',
                        '-c:a', 'pcm_s16le', '-ar', '24000',  # Output at consistent 24kHz
                        output_file
                    ]
                    print(f"🎵 PRINT: Multi-file filter_complex: {' '.join(ffmpeg_cmd[:10])}... (truncated)")
                    print(f"🎵 PRINT: Filter complex: {filter_complex}")
                
                result = subprocess.run(ffmpeg_cmd, capture_output=True, text=True)
                
                if result.returncode == 0:
                    output_size = os.path.getsize(output_file) if os.path.exists(output_file) else 0
                    print(f"🎵 PRINT: SUCCESS! Created audio segment: {output_size} bytes")
                    logger.info(f"Successfully created audio segment: {output_file} ({output_size} bytes)")
                    return output_file
                else:
                    print(f"🎵 PRINT: FFmpeg FAILED: {result.stderr}")
                    logger.error(f"FFmpeg failed for segment {segment_id}: {result.stderr}")
                    return None
                
        except Exception as e:
            logger.error(f"Error creating segment audio for {segment_id}: {e}")
            return None
    
    def _create_segment_video(self, video_frames: List[Dict], audio_chunks: List[Dict], temp_dir: str, segment_id: str) -> Optional[str]:
        """Create video file for a single segment with frames and optional audio"""
        try:
            logger.info(f"Creating video for segment {segment_id} with {len(video_frames)} frames and {len(audio_chunks)} audio chunks")
            
            # Download video frames  
            frame_files = []
            for i, frame in enumerate(video_frames):
                frame_file = self._download_and_save_frame(frame, temp_dir, f"segment_{segment_id}_frame_{i:04d}")
                if frame_file:
                    frame_files.append(frame_file)
            
            if not frame_files:
                logger.warning(f"No video frames found for segment {segment_id}")
                return None
            
            # Create video from frames
            output_file = os.path.join(temp_dir, f"segment_{segment_id}_video.mp4")
            
            # Calculate frame rate (assume ~10fps for now)
            frame_rate = 10
            
            # Create video from frame sequence
            pattern_file = os.path.join(temp_dir, f"segment_{segment_id}_frame_%04d.jpg")
            
            cmd = [
                'ffmpeg', '-y',
                '-framerate', str(frame_rate),
                '-i', pattern_file,
                '-c:v', 'libx264',
                '-pix_fmt', 'yuv420p',
                '-movflags', '+faststart',
                output_file
            ]
            
            logger.info(f"Running FFmpeg command for segment {segment_id} video: {' '.join(cmd)}")
            result = subprocess.run(cmd, capture_output=True, text=True, cwd=temp_dir)
            
            if result.returncode != 0:
                logger.error(f"FFmpeg failed for segment {segment_id} video: {result.stderr}")
                return None
            
            if os.path.exists(output_file):
                logger.info(f"Created segment video: {output_file}")
                return output_file
            else:
                logger.error(f"Output video file not created for segment {segment_id}")
                return None
                
        except Exception as e:
            logger.error(f"Error creating segment video for {segment_id}: {e}")
            return None
    
    def _download_and_save_audio(self, chunk: Dict, temp_dir: str, filename_prefix: str) -> Optional[str]:
        """Download and save an audio chunk to temp directory"""
        print(f"🎵 PRINT: _download_and_save_audio called for chunk {chunk.get('id', 'unknown')}")
        logger.info(f"🎵 LOGGER: _download_and_save_audio called for chunk {chunk.get('id', 'unknown')}")
        
        try:
            if not chunk.get('media_data') or not chunk['media_data'].get('cloud_storage_url'):
                print(f"🎵 PRINT: Audio chunk {chunk.get('id', 'unknown')} has no media_data or cloud_storage_url")
                logger.warning(f"Audio chunk {chunk.get('id', 'unknown')} has no media_data or cloud_storage_url")
                return None
                
            gcs_url = chunk['media_data']['cloud_storage_url']
            print(f"🎵 PRINT: Downloading audio chunk {chunk.get('id', 'unknown')} from: {gcs_url[:100]}...")
            
            # Extract blob name for regenerating signed URL if needed
            blob_name = gcs_url.split('/')[-1].split('?')[0]
            print(f"🎵 PRINT: Extracted blob name: {blob_name}")
            
            target_file = os.path.join(temp_dir, f"{filename_prefix}.pcm")
            print(f"🎵 PRINT: Target file path: {target_file}")
            
            # Download with retry logic and URL regeneration
            max_retries = 3
            for attempt in range(max_retries):
                try:
                    if attempt > 0:
                        # Regenerate URL on retry
                        logger.info(f"Regenerating signed URL for blob: {blob_name}")
                        gcs_url = self.storage_service.regenerate_signed_url(blob_name)
                        if not gcs_url:
                            logger.error(f"Failed to regenerate signed URL for blob: {blob_name}")
                            continue
                            
                    response = requests.get(gcs_url, timeout=30)
                    response.raise_for_status()
                    
                    # Write to file
                    with open(target_file, 'wb') as f:
                        f.write(response.content)
                    
                    # Verify file was written and check size
                    if os.path.exists(target_file):
                        file_size = os.path.getsize(target_file)
                        print(f"🎵 PRINT: Successfully downloaded {len(response.content)} bytes to {target_file}")
                        print(f"🎵 PRINT: File exists on disk: {os.path.exists(target_file)}, size: {file_size} bytes")
                        logger.info(f"Downloaded audio chunk {chunk.get('id', 'unknown')}: {file_size} bytes")
                        return target_file
                    else:
                        print(f"🎵 PRINT: ERROR - File does not exist after download: {target_file}")
                        logger.error(f"File does not exist after download: {target_file}")
                        
                except requests.exceptions.RequestException as e:
                    logger.warning(f"Download attempt {attempt + 1}/{max_retries} failed for chunk {chunk.get('id', 'unknown')}: {e}")
                    if attempt == max_retries - 1:
                        print(f"🎵 PRINT: All download attempts failed for chunk {chunk.get('id', 'unknown')}")
                        logger.error(f"Failed to download audio chunk {chunk.get('id', 'unknown')} after {max_retries} attempts")
                        return None
                        
        except Exception as e:
            print(f"🎵 PRINT: Exception in _download_and_save_audio: {e}")
            logger.error(f"Error downloading audio chunk {chunk.get('id', 'unknown')}: {e}")
            return None
            
        return None

    def _download_and_save_frame(self, frame: Dict, temp_dir: str, filename_prefix: str) -> Optional[str]:
        """Download and save a video frame to temp directory"""
        try:
            gcs_url = frame['media_data']['cloud_storage_url']
            
            # Handle different URL formats to extract blob name
            blob_name = self._extract_blob_name_from_url(gcs_url)
            if not blob_name:
                return None
            
            blob = self.bucket.blob(blob_name)
            frame_path = os.path.join(temp_dir, f"{filename_prefix}.jpg")
            
            # Try to download with retry logic for expired URLs
            max_retries = 2
            for attempt in range(max_retries):
                try:
                    if not blob.exists():
                        logger.error(f"Video frame blob does not exist: {blob_name}")
                        return None
                    
                    blob.download_to_filename(frame_path)
                    logger.debug(f"Successfully downloaded video frame {frame['id']} to {frame_path}")
                    return frame_path
                    
                except Exception as download_error:
                    if attempt < max_retries - 1:
                        logger.warning(f"Download failed for video frame {frame['id']}, attempting URL refresh (attempt {attempt + 1}/{max_retries})")
                        try:
                            # Regenerate URL with 1 week expiration
                            new_url = self.storage_service.regenerate_signed_url(blob_name, expiration_hours=168)
                            if new_url:
                                logger.info(f"Regenerated URL for video frame {frame['id']}")
                                blob = self.bucket.blob(blob_name)
                            else:
                                logger.error(f"Failed to regenerate URL for video frame {frame['id']}")
                                break
                        except Exception as regen_error:
                            logger.error(f"URL regeneration failed for video frame {frame['id']}: {regen_error}")
                            break
                    else:
                        logger.error(f"Final download attempt failed for video frame {frame['id']}: {download_error}")
                        return None
            
            return None
            
        except Exception as e:
            logger.error(f"Error downloading video frame {frame['id']}: {e}")
            return None
    
    def _extract_blob_name_from_url(self, gcs_url: str) -> Optional[str]:
        """Extract blob name from various GCS URL formats"""
        try:
            if gcs_url.startswith('gs://'):
                # Direct GCS URL format: gs://bucket/path
                return gcs_url.split(f'gs://{self.bucket_name}/')[-1]
            elif 'storage.googleapis.com' in gcs_url:
                # Signed URL format - extract blob name from URL path
                if '/o/' in gcs_url:
                    # URL-encoded format
                    blob_part = gcs_url.split('/o/')[-1].split('?')[0]
                    # URL decode the blob name
                    return urllib.parse.unquote(blob_part)
                else:
                    # Direct path format
                    return gcs_url.split(f'/{self.bucket_name}/')[-1].split('?')[0]
            else:
                logger.error(f"Unsupported URL format: {gcs_url}")
                return None
        except Exception as e:
            logger.error(f"Error extracting blob name from URL {gcs_url}: {e}")
            return None
    
    def _create_video_with_ffmpeg(self, audio_files: List[str], video_files: List[str], 
                                  total_duration: float, temp_dir: str) -> Optional[str]:
        """Create final unified video from prepared audio and video files"""
        try:
            output_path = os.path.join(temp_dir, "unified_video.mp4")
            
            # Build FFmpeg command based on available media
            if audio_files and video_files:
                # Both audio and video available
                cmd = self._build_audio_video_command(audio_files, video_files, total_duration, output_path)
            elif audio_files:
                # Audio only - create video with static image
                cmd = self._build_audio_only_command(audio_files, total_duration, output_path, temp_dir)
            elif video_files:
                # Video only - combine video files
                cmd = self._build_video_only_command(video_files, output_path)
            else:
                logger.error("No audio or video files available")
                return None
            
            logger.info(f"Running FFmpeg command: {' '.join(cmd)}")
            result = subprocess.run(cmd, capture_output=True, text=True)
            
            if result.returncode == 0:
                return output_path
            else:
                logger.error(f"FFmpeg final video creation failed: {result.stderr}")
                return None
                
        except Exception as e:
            logger.error(f"Error creating unified video: {e}")
            return None
    
    def _build_audio_video_command(self, audio_files: List[str], video_files: List[str], 
                                   duration: float, output_path: str) -> List[str]:
        """Build FFmpeg command for audio + video"""
        # For now, use first audio file and first video file
        # TODO: Implement proper timeline-based mixing
        cmd = [
            'ffmpeg', '-y',
            '-i', audio_files[0],  # Audio input
            '-i', video_files[0],  # Video input
            '-c:v', 'libx264',     # Video codec
            '-c:a', 'aac',         # Audio codec
            '-pix_fmt', 'yuv420p', # Pixel format for compatibility
            '-t', str(duration),   # Duration
            output_path
        ]
        return cmd
    
    def _build_audio_only_command(self, audio_files: List[str], duration: float, 
                                  output_path: str, temp_dir: str) -> List[str]:
        """Build FFmpeg command for audio only with static video"""
        # Create a simple black background image
        bg_image = os.path.join(temp_dir, "background.png")
        subprocess.run([
            'ffmpeg', '-y', '-f', 'lavfi', '-i', 'color=black:320x240:d=1',
            bg_image
        ])
        
        cmd = [
            'ffmpeg', '-y',
            '-loop', '1', '-i', bg_image,  # Static background
            '-i', audio_files[0],          # Audio input
            '-c:v', 'libx264',
            '-c:a', 'aac',
            '-pix_fmt', 'yuv420p',
            '-t', str(duration),
            '-shortest',  # End when audio ends
            output_path
        ]
        return cmd
    
    def _build_video_only_command(self, video_files: List[str], output_path: str) -> List[str]:
        """Build FFmpeg command for video only"""
        cmd = [
            'ffmpeg', '-y',
            '-i', video_files[0],  # Video input
            '-c:v', 'libx264',
            '-an',  # No audio
            '-pix_fmt', 'yuv420p',
            output_path
        ]
        return cmd
    
    def _upload_video_to_gcs(self, video_path: str, session_id: str) -> Optional[str]:
        """Upload the created video to GCS"""
        try:
            timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
            blob_name = f"replay_videos/{session_id}/unified_video_{timestamp}.mp4"
            
            blob = self.bucket.blob(blob_name)
            blob.upload_from_filename(video_path)
            
            # Don't set ACL if uniform bucket-level access is enabled
            try:
                blob.make_public()
                logger.info(f"Video uploaded and made public: {blob_name}")
            except Exception as acl_error:
                logger.warning(f"Could not set public ACL (uniform bucket access may be enabled): {acl_error}")
                logger.info(f"Video uploaded (private): {blob_name}")
            
            # Return the public URL or signed URL
            try:
                return blob.public_url
            except:
                # If public URL doesn't work, generate a signed URL
                from datetime import timedelta
                return blob.generate_signed_url(expiration=timedelta(days=7))
            
        except Exception as e:
            logger.error(f"Error uploading video to GCS: {e}")
            return None

    def _upload_segment_media(self, media_path: str, session_id: str, segment_id: str, media_type: str) -> Optional[str]:
        """Upload a segment media file to GCS"""
        try:
            timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
            file_extension = os.path.splitext(media_path)[1]
            if not file_extension:
                file_extension = '.wav' if media_type == 'audio' else '.mp4'
            
            blob_name = f"replay_videos/{session_id}/{media_type}_segments/{segment_id}_{media_type}_{timestamp}{file_extension}"
            
            blob = self.bucket.blob(blob_name)
            blob.upload_from_filename(media_path)
            
            # Don't set ACL if uniform bucket-level access is enabled
            try:
                blob.make_public()
                logger.info(f"{media_type.capitalize()} segment {segment_id} uploaded and made public: {blob_name}")
            except Exception as acl_error:
                logger.warning(f"Could not set public ACL (uniform bucket access may be enabled): {acl_error}")
                logger.info(f"{media_type.capitalize()} segment {segment_id} uploaded (private): {blob_name}")
            
            # Return the public URL or signed URL
            try:
                return blob.public_url
            except:
                # If public URL doesn't work, generate a signed URL
                from datetime import timedelta
                return blob.generate_signed_url(expiration=timedelta(days=7))
            
        except Exception as e:
            logger.error(f"Failed to upload segment media {media_path}: {e}")
            return None

    def group_into_conversation_segments(self, logs: List[Dict]) -> List[Dict]:
        """Group interaction logs into conversation segments"""
        logger.info(f"Processing {len(logs)} logs into conversation segments...")
        
        segments = []
        current_segment = None
        segment_id = 0
        last_segment_type = None

        for i, log in enumerate(logs):
            interaction_type = log.get('interaction_type')
            timestamp = log.get('timestamp')
            metadata = log.get('interaction_metadata', {})
            
            # Convert string timestamp to int if needed for consistent comparison
            if isinstance(timestamp, str):
                try:
                    timestamp = int(datetime.fromisoformat(timestamp.replace('Z', '+00:00')).timestamp() * 1000)
                except:
                    timestamp = 0
            
            # Ensure timestamp is an integer for calculations
            if not isinstance(timestamp, int):
                timestamp = int(timestamp) if timestamp else 0
            
            # Determine segment type for this log
            segment_type = None
            is_new_segment = False
            
            if interaction_type == 'audio_chunk':
                is_user_audio = metadata.get('microphone_on', False)
                if is_user_audio:
                    segment_type = 'user_speech'
                else:
                    segment_type = 'api_response'
                    
                # Only create new segment if type changes AND there's a significant time gap
                # This prevents micro-segmentation of consecutive chunks
                if not current_segment or last_segment_type != segment_type:
                    # Check for time gap to determine if this should really be a new segment
                    if current_segment and last_segment_type == segment_type:
                        time_gap = timestamp - current_segment.get('last_timestamp', timestamp)
                        # Only create new segment if there's more than 2 seconds gap
                        if time_gap < 2000:  # 2 seconds in milliseconds
                            is_new_segment = False
                        else:
                            is_new_segment = True
                    else:
                        is_new_segment = True
                        
            elif interaction_type == 'api_response':
                # Check if this is an audio response
                is_audio_response = (
                    metadata.get('response_type') == 'audio' or
                    metadata.get('mime_type', '').startswith('audio/') or
                    (log.get('media_data', {}).get('cloud_storage_url', '').endswith('.pcm')) or
                    ('.pcm' in log.get('media_data', {}).get('cloud_storage_url', ''))  # More robust check
                )
                
                if is_audio_response:
                    segment_type = 'api_response'
                    # Group consecutive API audio responses together
                    if not current_segment or last_segment_type != segment_type:
                        # Check for time gap
                        if current_segment and last_segment_type == segment_type:
                            time_gap = timestamp - current_segment.get('last_timestamp', timestamp)
                            if time_gap < 2000:  # 2 seconds
                                is_new_segment = False
                            else:
                                is_new_segment = True
                        else:
                            is_new_segment = True
                else:
                    # Text API response - keep current segment if audio, otherwise create text segment
                    if current_segment and current_segment['type'] in ['user_speech', 'api_response']:
                        segment_type = current_segment['type']  # Keep current audio segment
                        is_new_segment = False
                    else:
                        segment_type = 'api_text_response'
                        is_new_segment = True
                        
            elif interaction_type == 'text_input':
                segment_type = 'user_text'
                is_new_segment = True
                
            elif interaction_type == 'user_action':
                # Don't create segments for user actions, just add to current segment
                if current_segment:
                    segment_type = current_segment['type']
                    is_new_segment = False
                else:
                    segment_type = 'user_action'
                    is_new_segment = True
                
            elif interaction_type == 'video_frame':
                # Video frames follow the current segment type or create user_speech if none
                segment_type = last_segment_type if last_segment_type else 'user_speech'
                # Don't create new segments for video frames alone
                is_new_segment = not current_segment
            
            # Create new segment if needed
            if is_new_segment:
                # Finalize previous segment
                if current_segment:
                    current_segment['end_time'] = current_segment.get('last_timestamp', current_segment['start_time'])
                    current_segment['duration'] = max(1000, current_segment['end_time'] - current_segment['start_time'])  # Minimum 1 second
                    segments.append(current_segment)
                    logger.debug(f"Finalized segment {current_segment['id']}: {current_segment['type']} with {len(current_segment['audio_chunks'])} audio and {len(current_segment['video_frames'])} video ({current_segment['duration']}ms)")
                    print(f"🎬 DEBUG: Finalized segment {current_segment['id']}: {current_segment['type']} - {len(current_segment['audio_chunks'])} audio, {len(current_segment['video_frames'])} video, {current_segment['duration']}ms")
                
                # Create new segment
                segment_id += 1
                current_segment = {
                    'id': segment_id,
                    'type': segment_type,
                    'start_time': timestamp,
                    'end_time': timestamp,
                    'duration': 0,
                    'audio_chunks': [],
                    'video_frames': [],
                    'logs': []
                }
                last_segment_type = segment_type
                logger.debug(f"Created new segment {segment_id}: {segment_type}")
                print(f"🎬 DEBUG: Created new segment {segment_id}: {segment_type} at {timestamp}")
            
            # Add log to current segment
            if current_segment:
                current_segment['logs'].append(log)
                current_segment['last_timestamp'] = timestamp
                
                # Categorize media
                if interaction_type == 'audio_chunk':
                    current_segment['audio_chunks'].append(log)
                    print(f"🎬 DEBUG: Added audio_chunk to segment {current_segment['id']} (now {len(current_segment['audio_chunks'])} audio chunks)")
                elif interaction_type == 'api_response':
                    # Check if this is an audio response and add to audio_chunks
                    is_audio_response = (
                        metadata.get('response_type') == 'audio' or
                        metadata.get('mime_type', '').startswith('audio/') or
                        (log.get('media_data', {}).get('cloud_storage_url', '').endswith('.pcm')) or
                        ('.pcm' in log.get('media_data', {}).get('cloud_storage_url', ''))  # More robust check
                    )
                    if is_audio_response:
                        current_segment['audio_chunks'].append(log)
                        print(f"🎬 DEBUG: Added api_response audio to segment {current_segment['id']} (now {len(current_segment['audio_chunks'])} audio chunks)")
                elif interaction_type == 'video_frame':
                    current_segment['video_frames'].append(log)
            else:
                print(f"🎬 DEBUG: WARNING - No current segment for log {interaction_type}")
        
        # Finalize last segment
        if current_segment:
            current_segment['end_time'] = current_segment.get('last_timestamp', current_segment['start_time'])
            current_segment['duration'] = max(1000, current_segment['end_time'] - current_segment['start_time'])  # Minimum 1 second
            segments.append(current_segment)
            logger.debug(f"Finalized last segment {current_segment['id']}: {current_segment['type']} with {len(current_segment['audio_chunks'])} audio and {len(current_segment['video_frames'])} video ({current_segment['duration']}ms)")
        
        # Filter out segments without any media
        segments_with_media = []
        for segment in segments:
            if segment.get('audio_chunks') or segment.get('video_frames'):
                segments_with_media.append(segment)
            else:
                logger.debug(f"Skipping segment {segment['id']} - no media content")
        
        logger.info(f"Created {len(segments_with_media)} conversation segments with media from {len(segments)} total segments")
        
        # Log segment summary
        for segment in segments_with_media:
            logger.info(f"Segment {segment['id']}: {segment['type']} - {len(segment['audio_chunks'])} audio, {len(segment['video_frames'])} video, {segment['duration']}ms")
        
        return segments_with_media

    def analyze_session_quality(self, session_id: str, logs: List[Dict]) -> Dict:
        """Analyze session quality for video creation"""
        try:
            # Categorize logs
            audio_chunks = [log for log in logs if log.get('interaction_type') == 'audio_chunk']
            video_frames = [log for log in logs if log.get('interaction_type') == 'video_frame']
            
            # Check for media data availability
            audio_with_media = len([log for log in audio_chunks if log.get('media_data', {}).get('cloud_storage_url')])
            video_with_media = len([log for log in video_frames if log.get('media_data', {}).get('cloud_storage_url')])
            
            # Calculate coverage rates
            audio_coverage = (audio_with_media / len(audio_chunks) * 100) if audio_chunks else 0
            video_coverage = (video_with_media / len(video_frames) * 100) if video_frames else 0
            
            # Calculate session duration
            if logs:
                timestamps = [log.get('timestamp', 0) for log in logs if log.get('timestamp')]
                if timestamps:
                    # Convert string timestamps to int if needed
                    converted_timestamps = []
                    for ts in timestamps:
                        if isinstance(ts, str):
                            try:
                                ts = int(datetime.fromisoformat(ts.replace('Z', '+00:00')).timestamp() * 1000)
                            except:
                                ts = 0
                        converted_timestamps.append(ts)
                    
                    session_duration_ms = max(converted_timestamps) - min(converted_timestamps)
                    session_duration_seconds = session_duration_ms / 1000
                else:
                    session_duration_seconds = 0
            else:
                session_duration_seconds = 0
            
            # Calculate quality score
            quality_factors = {
                'audio_coverage': audio_coverage * 0.4,
                'video_coverage': video_coverage * 0.3,
                'sufficient_data': min(100, (len(logs) / 50) * 100) * 0.3
            }
            
            overall_quality_score = sum(quality_factors.values())
            
            # Generate recommendations
            recommendations = []
            if audio_coverage < 80:
                recommendations.append(f"Enable full audio logging ({audio_coverage:.1f}% coverage)")
            if video_coverage < 50 and video_frames:
                recommendations.append(f"Improve video coverage ({video_coverage:.1f}%)")
            if len(logs) < 30:
                recommendations.append("Session may be too short for video creation")
            
            return {
                'session_id': session_id,
                'session_duration_seconds': session_duration_seconds,
                'audio_chunks': {
                    'total': len(audio_chunks),
                    'with_media': audio_with_media,
                    'coverage_percent': round(audio_coverage, 1)
                },
                'video_frames': {
                    'total': len(video_frames),
                    'with_media': video_with_media,
                    'coverage_percent': round(video_coverage, 1)
                },
                'overall_quality_score': round(overall_quality_score, 1),
                'recommendations': recommendations
            }
            
        except Exception as e:
            logger.error(f"Error analyzing session {session_id}: {e}")
            return {
                'session_id': session_id,
                'error': str(e),
                'overall_quality_score': 0,
                'recommendations': ['Analysis failed - check logs']
            }

def get_video_processor():
    """Get video processor instance"""
    bucket_name = os.getenv('GCS_BUCKET_NAME', 'cursor-test-llm-assets')
    return VideoProcessor(bucket_name) 