# Live AI Setup Guide 🤖

## Real-time Camera & Microphone AI with Google Gemini Live API

Your webapp now has **real Live AI capabilities** with actual Google Gemini API integration!

## ✅ What's Working

- 🎥 **Real-time camera streaming** to Gemini
- 🎤 **Real-time microphone streaming** to Gemini  
- 💬 **Text communication** with Live API
- 🗣️ **Voice responses** from Gemini (audio output)
- 👁️ **AI vision** (Gemini can see your camera)
- 👂 **AI hearing** (Gemini can hear your microphone)
- 🔄 **WebSocket streaming** for low-latency communication

## 🔑 Step 1: Get Your Google AI Studio API Key

1. **Go to**: https://aistudio.google.com/apikey
2. **Sign in** with your Google account
3. **Click "Create API Key"**
4. **Copy the API key** (starts with `AIza...`)

## ⚙️ Step 2: Configure Your API Key

### Option A: Use the Setup Script (Recommended)
```bash
./setup_google_ai_studio.sh
```

### Option B: Manual Setup
1. **Open `.env` file** in your project root
2. **Replace** `YOUR_API_KEY_HERE` with your actual API key:
   ```bash
   REACT_APP_GOOGLE_AI_STUDIO_API_KEY="AIza..."
   ```

## 🚀 Step 3: Test the Integration

1. **Start your webapp**:
   ```bash
   docker-compose up
   ```

2. **Open your browser**: http://localhost:3000

3. **Choose "Enhanced Live Chat"**

4. **Enable Camera and/or Microphone**

5. **Click "Start Live AI Session"**

6. **You should see**: "✅ Connected to Gemini Live API!"

## 🎯 How to Use

### 💬 Text Communication
- Type messages in the text input
- Gemini responds in real-time
- No more simulated responses!

### 🎤 Voice Communication  
- **Enable Microphone** before starting session
- **Speak naturally** - Gemini hears you in real-time
- **Listen** for voice responses from Gemini

### 📷 Camera Vision
- **Enable Camera** before starting session
- **Show objects** to the camera
- **Ask "What do you see?"** - Gemini can see your camera feed

### 🔄 Combined Experience
- **Enable both** camera and microphone
- **Have natural conversations** while showing things
- **Ask about what you're showing**: "What's this in my hand?"

## 🎛️ Configuration Options

### Voice Selection
- **Aoede** (Female) - Default
- **Charon** (Male)
- **Kore** (Female) 
- **Fenrir** (Male)

### Response Modes
- **Audio responses** (voice replies)
- **Text responses** (written replies)
- **Real-time transcription** available

## 🔧 Troubleshooting

### "API key not configured"
- ✅ Make sure you added your API key to `.env`
- ✅ Restart the frontend: `docker-compose restart frontend`

### "Live API session failed"
- ✅ Check your internet connection
- ✅ Verify your API key is valid
- ✅ Check browser console for detailed errors

### Camera/Microphone not working
- ✅ Allow permissions when browser asks
- ✅ Check browser console for permission errors
- ✅ Try refreshing the page

### No audio responses
- ✅ Check your system volume
- ✅ Make sure audio output is enabled
- ✅ Try different voice options

## 📊 What Changed

### Before (Simulated)
```javascript
// Fake response
setTimeout(() => {
  addMessage({
    type: 'assistant', 
    content: "I received your message..."
  });
}, 1500);
```

### After (Real Live API)
```javascript
// Real WebSocket connection to Gemini
const session = await genAI.live.connect({
  model: 'gemini-2.0-flash-live-001',
  config: liveConfig,
  callbacks: {
    onmessage: (message) => {
      // Real responses from Gemini!
      if (message.text) {
        addMessage({
          type: 'assistant',
          content: message.text
        });
      }
    }
  }
});
```

## 🌟 Live AI Capabilities

### 👁️ Visual Understanding
- **Object recognition**: "What's this?"
- **Scene description**: "Describe what you see"
- **Text reading**: "Read this text"
- **Color analysis**: "What colors do you see?"

### 👂 Audio Understanding  
- **Speech recognition**: Real-time transcription
- **Natural conversation**: Interruption handling
- **Voice activity detection**: Automatic turn-taking

### 🧠 Multimodal Intelligence
- **Combined input**: Camera + microphone + text
- **Context awareness**: Remembers conversation
- **Real-time processing**: Low-latency responses

## 🔐 Security Notes

- ✅ **API key is client-side** - fine for development
- ⚠️ **For production**: Move API calls to backend server
- 🔒 **Rate limits apply** - see Google AI Studio dashboard
- 💰 **Usage costs** - monitor your API usage

## 🎉 You're Ready!

Your Live AI integration is now **fully functional** with real Gemini API responses!

**Try saying**: "Hello Gemini, can you see me? What do you notice about my environment?"

**Try showing**: Objects, documents, or your surroundings to the camera

**Try asking**: "What's the weather like?" (with Google Search grounding)

---

**Need help?** Check the browser console for detailed error messages and refer to the [Google AI Studio Live API documentation](https://ai.google.dev/gemini-api/docs/live). 