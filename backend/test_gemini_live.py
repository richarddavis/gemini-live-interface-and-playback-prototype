import asyncio
from google import genai

API_KEY = "AIzaSyCzC2LSVG_YfF0ZGdWRTEaoTMHtAAyHRcQ"  # Replace with your API key
MODEL_NAME = "gemini-1.5-flash-live"  # Try a more commonly available model

async def test_live_api():
    # Initialize the client with API key
    print(f"Initializing client for Live API with model: {MODEL_NAME}")
    client = genai.Client(api_key=API_KEY, http_options={'api_version': 'v1alpha'})
    
    # Live API configuration
    config = {
        "response_modalities": ["TEXT", "AUDIO"],
    }
    
    try:
        print(f"Attempting to connect to Gemini Live API...")
        # Attempt to connect to the Live API
        async with client.aio.live.connect(model=MODEL_NAME, config=config) as gemini_session:
            print("Connection to Gemini Live API established successfully!")
            
            # Send a test message
            await gemini_session.send(input="Hello, can you hear me?", end_of_turn=True)
            print("Message sent successfully")
            
            # Receive and print the response
            async for response in gemini_session.receive():
                if response.text:
                    print(f"Response: {response.text}")
                if response.audio:
                    print(f"Received audio chunk of size: {len(response.audio)}")
                if response.error:
                    print(f"Error: {response.error.message}")
                    break
            
            print("Session completed successfully")
    except Exception as e:
        print(f"Error connecting to Gemini Live API: {str(e)}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(test_live_api()) 