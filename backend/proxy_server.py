import asyncio
import json
import os

import websockets
from websockets.legacy.protocol import WebSocketCommonProtocol
from websockets.legacy.server import WebSocketServerProtocol

HOST = "us-central1-aiplatform.googleapis.com"
SERVICE_URL = f"wss://{HOST}/ws/google.cloud.aiplatform.v1beta1.LlmBidiService/BidiGenerateContent"

DEBUG = True # Set to False for production


async def proxy_task(
    client_websocket: WebSocketCommonProtocol, server_websocket: WebSocketCommonProtocol
) -> None:
    """
    Forwards messages from one WebSocket connection to another.

    Args:
        client_websocket: The WebSocket connection from which to receive messages.
        server_websocket: The WebSocket connection to which to send messages.
    """
    async for message in client_websocket:
        try:
            data = json.loads(message)
            if DEBUG:
                print("proxying: ", data)
            await server_websocket.send(json.dumps(data))
        except Exception as e:
            print(f"Error processing message: {e}")

    await server_websocket.close()


async def create_proxy(
    client_websocket: WebSocketCommonProtocol, bearer_token: str
) -> None:
    """
    Establishes a WebSocket connection to the server and creates two tasks for
    bidirectional message forwarding between the client and the server.

    Args:
        client_websocket: The WebSocket connection of the client.
        bearer_token: The bearer token for authentication with the server.
    """

    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {bearer_token}",
    }

    try:
        async with websockets.connect(
            SERVICE_URL, additional_headers=headers
        ) as server_websocket:
            client_to_server_task = asyncio.create_task(
                proxy_task(client_websocket, server_websocket)
            )
            server_to_client_task = asyncio.create_task(
                proxy_task(server_websocket, client_websocket)
            )
            await asyncio.gather(client_to_server_task, server_to_client_task)
    except Exception as e:
        print(f"Error connecting to server WebSocket: {e}")
        await client_websocket.close(code=1011, reason=f"Proxy connection failed: {e}")


async def handle_client(client_websocket: WebSocketServerProtocol) -> None:
    """
    Handles a new client connection, expecting the first message to contain a bearer token.
    Establishes a proxy connection to the server upon successful authentication.

    Args:
        client_websocket: The WebSocket connection of the client.
    """
    print("New client connection established.")
    bearer_token = None
    try:
        # Wait for the first message from the client with the bearer token
        auth_message = await asyncio.wait_for(client_websocket.recv(), timeout=5.0)
        auth_data = json.loads(auth_message)

        if "bearer_token" in auth_data:
            bearer_token = auth_data["bearer_token"]
            print("Received bearer token from client.")
        else:
            print("Error: Bearer token not found in the first message.")
            await client_websocket.close(code=1008, reason="Bearer token missing")
            return

        await create_proxy(client_websocket, bearer_token)

    except asyncio.TimeoutError:
        print("Timeout waiting for bearer token.")
        await client_websocket.close(code=1008, reason="Authentication timeout")
    except json.JSONDecodeError:
        print("Received invalid JSON authentication message.")
        await client_websocket.close(code=1008, reason="Invalid authentication message format")
    except Exception as e:
        print(f"Error during client handling: {e}")
        await client_websocket.close(code=1011, reason=f"Internal server error: {e}")

    print("Client connection closed.")


async def main() -> None:
    """
    Starts the WebSocket server and listens for incoming client connections.
    """
    host = os.getenv("PROXY_HOST", "0.0.0.0") # Listen on all interfaces by default
    port = int(os.getenv("PROXY_PORT", 8080)) # Default port 8080
    
    try:
        async with websockets.serve(handle_client, host, port):
            print(f"Running WebSocket proxy server on {host}:{port}...")
            # Run forever
            await asyncio.Future()
    except Exception as e:
        print(f"Failed to start WebSocket server: {e}")


if __name__ == "__main__":
    # This is typically run as a separate process, so asyncio.run is appropriate here.
    asyncio.run(main()) 