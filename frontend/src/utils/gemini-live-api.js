class GeminiLiveResponseMessage {
    constructor(data) {
        this.data = "";
        this.type = "";
        this.endOfTurn = data?.serverContent?.turnComplete;

        const parts = data?.serverContent?.modelTurn?.parts;

        if (data?.setupComplete) {
            this.type = "SETUP_COMPLETE";
        } else if (parts?.length && parts[0].text) {
            this.data = parts[0].text;
            this.type = "TEXT";
        } else if (parts?.length && parts[0].inlineData) {
            this.data = parts[0].inlineData.data;
            this.type = "AUDIO";
        }
    }
}

class GeminiLiveAPI {
    constructor(proxyUrl, model) {
        this.proxyUrl = proxyUrl;
        this.model = model || 'models/gemini-2.0-flash-live-001';

        this.responseModalities = ["TEXT"];
        this.systemInstructions = "";

        this.onReceiveResponse = (message) => {
            console.log("Default message received callback", message);
        };

        this.onConnectionStarted = () => {
            console.log("Default onConnectionStarted");
        };

        this.onErrorMessage = (message) => {
            alert(message);
        };

        this.accessToken = "";
        this.websocket = null;

        console.log("Created Gemini Live API object: ", this);
    }

    setAccessToken(newAccessToken) {
        console.log("setting access token: ", newAccessToken);
        this.accessToken = newAccessToken || "";
    }

    connect(accessToken) {
        // For proxy connections, we don't need an access token
        if (accessToken) {
            this.setAccessToken(accessToken);
        }
        this.setupWebSocketToService();
    }

    disconnect() {
        if (this.webSocket) {
            this.webSocket.close();
        }
    }

    sendMessage(message) {
        if (this.webSocket && this.webSocket.readyState === WebSocket.OPEN) {
            this.webSocket.send(JSON.stringify(message));
        }
    }

    async onReceiveMessage(messageEvent) {
        console.log("Message received: ", messageEvent);
        
        let messageData;
        
        // Handle both string and Blob data
        if (messageEvent.data instanceof Blob) {
            // Convert Blob to text
            const text = await messageEvent.data.text();
            messageData = JSON.parse(text);
        } else if (typeof messageEvent.data === 'string') {
            messageData = JSON.parse(messageEvent.data);
        } else {
            console.error("Unknown message data type:", typeof messageEvent.data);
            return;
        }
        
        const message = new GeminiLiveResponseMessage(messageData);
        console.log("onReceiveMessageCallBack this ", this);
        this.onReceiveResponse(message);
    }

    setupWebSocketToService() {
        console.log("connecting: ", this.proxyUrl);

        this.webSocket = new WebSocket(this.proxyUrl);

        this.webSocket.onclose = (event) => {
            console.log("websocket closed: ", event);
            this.onErrorMessage("Connection closed");
        };

        this.webSocket.onerror = (event) => {
            console.log("websocket error: ", event);
            this.onErrorMessage("Connection error");
        };

        this.webSocket.onopen = (event) => {
            console.log("websocket open: ", event);
            this.sendInitialSetupMessages();
            this.onConnectionStarted();
        };

        this.webSocket.onmessage = this.onReceiveMessage.bind(this);
    }

    sendInitialSetupMessages() {
        // Send setup message using the format that works with our proxy
        const sessionSetupMessage = {
            type: "setup",
            model: this.model,
            systemInstructions: this.systemInstructions,
            responseModalities: this.responseModalities
        };
        this.sendMessage(sessionSetupMessage);
    }

    sendTextMessage(text) {
        const textMessage = {
            client_content: {
                turns: [
                    {
                        role: "user",
                        parts: [{ text: text }],
                    },
                ],
                turn_complete: true,
            },
        };
        this.sendMessage(textMessage);
    }

    sendRealtimeInputMessage(data, mime_type) {
        const message = {
            realtime_input: {
                media_chunks: [
                    {
                        mime_type: mime_type,
                        data: data,
                    },
                ],
            },
        };
        this.sendMessage(message);
    }

    sendAudioMessage(base64PCM) {
        this.sendRealtimeInputMessage(base64PCM, "audio/pcm");
    }

    sendImageMessage(base64Image, mime_type = "image/jpeg") {
        this.sendRealtimeInputMessage(base64Image, mime_type);
    }
}

console.log("loaded gemini-live-api.js");

export default GeminiLiveAPI; 