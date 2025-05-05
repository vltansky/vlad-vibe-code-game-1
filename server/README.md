# WebRTC Signaling Server

A simple Flask-based WebSocket signaling server for WebRTC peer-to-peer connections.

## Setup

1. Create a virtual environment:

   ```
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   ```

2. Install dependencies:

   ```
   pip install -r requirements.txt
   ```

3. Create a `.env` file:

   ```
   SECRET_KEY=your_secret_key_here
   PORT=8080
   ```

4. Run the server:
   ```
   source venv/bin/activate.fish && python3 server.py
   ```

The server will run on port 8080 by default.

## API

### Socket.IO Events

- `connect`: Automatically fired when a user connects
- `disconnect`: Automatically fired when a user disconnects
- `join_room`: Join a specific room
  - Payload: `{ roomId: string }`
- `leave_room`: Leave the current room
  - Payload: `{ roomId: string }` (optional)
- `signal`: Send WebRTC signaling data to another user
  - Payload: `{ targetId: string, signal: any }`
- `broadcast`: Broadcast data to all users in the room
  - Payload: `{ data: any }`

### Response Events

- `user_joined`: Fired when a user joins the room
  - Payload: `{ userId: string, userCount: number }`
- `user_left`: Fired when a user leaves the room
  - Payload: `{ userId: string }`
- `user_disconnected`: Fired when a user disconnects
  - Payload: `{ userId: string }`
- `room_users`: Sent to a user when they join a room
  - Payload: `{ users: string[], userCount: number }`
- `signal`: Received when another user sends a signal
  - Payload: `{ userId: string, signal: any }`
- `broadcast`: Received when another user broadcasts data
  - Payload: `{ userId: string, data: any }`
- `error`: Sent when an error occurs
  - Payload: `{ message: string }`
