# GCS URL Expiration Fix - COMPLETE SOLUTION

## Problem Identified

The InteractionReplay component was failing during media preloading with 502 Bad Gateway errors. Investigation revealed that:

### Root Cause: Expired Google Cloud Storage (GCS) Signed URLs

- **GCS signed URLs expire after a short time** (originally 1 hour for security)
- **Test data URLs were created on May 30, 2025** but were being accessed later
- **502 errors occurred** because the backend proxy couldn't fetch from expired GCS URLs
- **URL format showed expiration**: `X-Goog-Expires=3600` (1 hour) and `X-Goog-Date=20250530T145822Z`

### Example Error Pattern
```
GET http://localhost/api/interaction-logs/media/885 502 (BAD GATEWAY)
Backend logs: "GCS fetch failed: 400"
```

## Complete Solution Implemented

### 1. Long-Lived URLs for New Replay Data

**Modified `backend/app/services/storage.py`**:
- **7-day expiration** for replay data (maximum allowed by GCS)
- **Automatic detection** of replay data by filename pattern (`interactions/`)
- **Backward compatible** with existing 1-hour URLs for regular uploads

```python
# For replay data, use much longer expiration (but within GCS limits)
if custom_filename and 'interactions/' in custom_filename:
    # This is replay data - use maximum allowed GCS expiration: 7 days
    expiration_hours = 168  # 7 days = 7 * 24 hours (max allowed by GCS)
```

### 2. Automatic URL Regeneration

**Enhanced `backend/app/api/routes.py`**:
- **Automatic retry** when encountering 400/403 errors (expired URLs)
- **On-demand regeneration** with 7-day expiration
- **Database update** with fresh URLs
- **Transparent operation** - frontend gets media without knowing URLs were regenerated

```python
elif gcs_response.status_code in [400, 403]:
    # URL likely expired - try to regenerate it
    new_signed_url = GCSStorageService.regenerate_signed_url(blob_path, expiration_hours=168)
    media_data.cloud_storage_url = new_signed_url
    db.session.commit()
```

### 3. Manual URL Regeneration Endpoint

**New API endpoint**: `POST /api/interaction-logs/regenerate-urls/<session_id>`
- **Batch regeneration** for entire sessions
- **Status reporting** with success/failure counts
- **Error details** for troubleshooting

### 4. Frontend "Fix Expired URLs" Button

**Enhanced `frontend/src/components/InteractionReplay.js`**:
- **Smart detection** of expired URL scenarios
- **One-click fix** button appears when needed
- **Automatic reload** after successful regeneration
- **User-friendly status** messages

### 5. Improved Error Handling

**Graceful degradation** when media is unavailable:
- **Clear status messages** explaining URL expiration
- **Visual placeholders** for missing video frames
- **Replay continues** with interaction timing even without media

## Testing Results

### Before Fix:
- ❌ 502 errors crashed preloading process
- ❌ All media became inaccessible after 1 hour
- ❌ No way to recover expired sessions

### After Fix:
- ✅ **New replay data expires in 7 days** instead of 1 hour
- ✅ **Automatic URL regeneration** works transparently
- ✅ **Manual regeneration** available via button
- ✅ **Working media playback** for previously expired sessions
- ✅ **Headers indicate regeneration**: `X-URL-Regenerated: true`

## GCS Constraints Discovered

### Maximum Expiration Limit
- **GCS signed URLs cannot exceed 7 days** (604800 seconds)
- **Initial attempt at 1 year failed** with "Max allowed expiration interval" error
- **Solution: Use maximum allowed 7 days** for optimal longevity

### Security vs Accessibility Trade-off
- **Short URLs = More secure** but break replay functionality
- **7-day URLs = Good balance** between security and usability
- **Future option**: Consider public bucket for non-sensitive replay data

## Technical Implementation Details

### URL Regeneration Process:
1. **Detection**: 400/403 response from GCS indicates expired URL
2. **Extraction**: Parse blob name from existing URL
3. **Regeneration**: Create new signed URL with 7-day expiration
4. **Update**: Save new URL to database
5. **Retry**: Attempt media fetch with fresh URL
6. **Success**: Return media with `X-URL-Regenerated` header

### Frontend Integration:
1. **Status monitoring**: Detect "expired URL" messages
2. **Button display**: Show "Fix Expired URLs" when needed
3. **API call**: POST to regeneration endpoint
4. **Reload**: Refresh session data with new URLs
5. **Feedback**: Clear status messages throughout process

## Files Modified

### Backend Changes:
- `backend/app/services/storage.py`: Extended expiration logic and regeneration
- `backend/app/api/routes.py`: Automatic retry and manual regeneration endpoints

### Frontend Changes:
- `frontend/src/components/InteractionReplay.js`: Error handling, regeneration UI, graceful degradation

## Usage Impact

### Immediate Benefits:
- **No more replay failures** due to expired URLs
- **Automatic recovery** from expired sessions
- **7x longer availability** (7 days vs 1 hour)
- **Transparent operation** - users don't need to think about URLs

### Long-term Benefits:
- **Reliable replay system** for demos and debugging
- **Reduced support burden** from "broken replay" reports
- **Foundation for future** URL management features

## Future Enhancements

1. **Even longer expiration** via public bucket for demo data
2. **Scheduled regeneration** to prevent expiration entirely
3. **URL health monitoring** to proactively detect issues
4. **Media availability** indicators in session list

## Testing Commands

```bash
# Test individual media endpoint (should work now)
curl -I http://localhost/api/interaction-logs/media/885

# Test batch regeneration (optional manual trigger)
curl -X POST http://localhost/api/interaction-logs/regenerate-urls/session_1748616970049_m99k4asnw

# Check for regeneration header
curl -I http://localhost/api/interaction-logs/media/889
# Should show: X-URL-Regenerated: true
```

## Result Summary

✅ **Problem SOLVED**: URLs no longer expire after 1 hour  
✅ **Automatic Recovery**: System self-heals expired URLs  
✅ **User Experience**: Replay works reliably with clear feedback  
✅ **Backward Compatibility**: Existing data recoverable via regeneration  

**The replay system now provides reliable long-term access to media content, making it truly useful for demos, debugging, and analysis.** 