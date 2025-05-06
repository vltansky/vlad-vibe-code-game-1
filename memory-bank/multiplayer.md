# WebRTC Multiplayer Implementation Guide

This guide provides a complete overview of implementing real-time peer-to-peer multiplayer in web games using WebRTC, simple-peer, and Socket.IO. This approach is game-agnostic and can be adapted for any multiplayer game.

## Architecture Overview

### Core Technologies

- **WebRTC**: Browser-to-browser communication protocol
- **simple-peer**: Simplifies WebRTC implementation
- **Socket.IO**: Used for signaling and fallback
- **Railway.app**: Cloud hosting for the signaling server

### Network Topology

1. **Hybrid P2P**: WebRTC for direct peer connections with Socket.IO for signaling
2. **Fallback**: Automatic fallback to Socket.IO if WebRTC connection fails
3. **Scaling**: Supports 6-8 players per room (limited by WebRTC mesh topology)

## Infrastructure Requirements

### Servers

1. **Signaling Server**:

   - Socket.IO server using Flask and Eventlet
   - Hosted on Railway.app or similar service
   - Handles initial connection, room creation, and peer discovery

2. **STUN/TURN Servers** (essential for internet connections):
   - STUN: Free options (Google, Twilio)
   - TURN: Required for NAT traversal
   - Example TURN config:
     ```typescript
     iceServers: [
       { urls: 'stun:stun.l.google.com:19302' },
       { urls: 'stun:global.stun.twilio.com:3478' },
     ];
     ```

## Key Components

### 1. Signaling Client

```typescript
// signaling.ts
export class SignalingClient {
  private socket: Socket;
  private listeners: Partial<SignalingEvents> = {};

  constructor(serverUrl?: string) {
    // Use provided serverUrl or determine based on environment
    let finalServerUrl = serverUrl;

    if (!finalServerUrl) {
      // Check for local development mode
      const urlParams = new URLSearchParams(window.location.search);
      const useLocal = urlParams.get('local') === 'true';

      if (useLocal) {
        finalServerUrl = 'http://localhost:8080';
      } else {
        // Use production URL for deployment
        finalServerUrl = 'https://vlad-vibe-code-game-1-production.up.railway.app';
      }
    }

    this.socket = io(finalServerUrl, {
      autoConnect: false,
      reconnection: true,
      transports: ['websocket', 'polling'],
    });

    // Set up event handlers
    // ...
  }

  // Connect to the signaling server
  connect(): void {
    this.socket.connect();
  }

  // Join a room
  joinRoom(roomId: string): void {
    this.socket.emit('join_room', { roomId });
  }

  // Additional methods for signaling
  // ...
}
```

### 2. Peer Connection

```typescript
// peer.ts
export class PeerConnection {
  private peer: SimplePeer.Instance;
  private listeners: Partial<PeerEvents> = {};

  constructor(initiator: boolean, options: PeerOptions = {}) {
    const peerOptions: SimplePeer.Options = {
      ...options,
      initiator,
      trickle: true,
    };

    this.peer = new SimplePeer(peerOptions);

    // Set up event handlers
    this.peer.on('signal', (data: SimplePeer.SignalData) => {
      this.listeners.signal?.(data);
    });

    this.peer.on('connect', () => {
      this.listeners.connect?.();
    });

    this.peer.on('data', (data: Buffer) => {
      try {
        const parsedData = JSON.parse(data.toString()) as PeerData;
        this.listeners.data?.(parsedData);
      } catch (error) {
        console.error('Failed to parse peer data:', error);
      }
    });

    // Additional event handlers
    // ...
  }

  // Send data to the peer
  send(type: string, payload: unknown): void {
    if (!this.peer.connected) {
      console.warn('Cannot send data: peer not connected');
      return;
    }

    try {
      const data: PeerData = { type, payload };
      this.peer.send(JSON.stringify(data));
    } catch (error) {
      console.error('Failed to send data:', error);
    }
  }

  // Additional methods
  // ...
}
```

### 3. Peer Manager

```typescript
// peerManager.ts
export class PeerManager {
  private signalingClient: SignalingClient;
  private peers: Map<string, PeerConnection> = new Map();
  private roomId: string | null = null;
  private listeners: Partial<PeerManagerEvents> = {};

  constructor(options: PeerManagerOptions = {}) {
    this.signalingClient = new SignalingClient(options.signalingServer);
    this.peerOptions = {
      debug: options.debug || false,
      config: {
        iceServers: options.iceServers || [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:global.stun.twilio.com:3478' },
        ],
      },
    };

    this.setupSignalingListeners();
  }

  // Join a room
  joinRoom(roomId: string): void {
    if (this.roomId) {
      this.leaveRoom();
    }

    this.roomId = roomId;
    this.signalingClient.joinRoom(roomId);
  }

  // Send data to all peers
  broadcast(type: string, payload: unknown): void {
    for (const peer of this.peers.values()) {
      if (peer.isConnected) {
        peer.send(type, payload);
      }
    }
  }

  // Additional methods
  // ...
}
```

### 4. Game Network Manager

```typescript
// game-network-manager.ts
export class GameNetworkManager {
  private signalClient: SignalingClient;
  private peerClient: WebRTCPeer | null = null;
  private listeners: Partial<NetworkEventMap> = {};
  private playerStates: Record<string, PlayerState> = {};
  private updateRate = 1000 / 20; // 20 updates per second
  private interpolationBuffer: Record<string, PlayerState[]> = {};
  private interpolationDelay = 100; // ms
  private mode: NetworkMode;

  constructor(
    signalServerUrl: string = 'http://0.0.0.0:8080',
    mode: NetworkMode = NetworkMode.HYBRID
  ) {
    this.signalClient = new SignalingClient(signalServerUrl);
    this.mode = mode;

    // Set up event handlers
    // ...
  }

  // Update player state
  updatePlayerState(playerState: Partial<PlayerState>): void {
    if (!this.localPlayerId) return;

    // Create a complete player state
    const state: PlayerState = {
      ...this.createEmptyPlayerState(this.localPlayerId),
      ...this.playerStates[this.localPlayerId],
      ...playerState,
      id: this.localPlayerId,
      timestamp: Date.now(),
    };

    // Update local state
    this.playerStates[this.localPlayerId] = state;

    // Send to network
    this.sendPlayerState(state);
  }

  // Additional methods
  // ...
}
```

## Data Flow Optimization

### Performance Techniques

1. **Update Throttling**: Limit updates (default: 20 per second)
2. **JSON Serialization**: Efficient data transfer using JSON
3. **Interpolation**: Buffer-based smoothing for jitter compensation
4. **Quaternion SLERP**: Smooth rotation interpolation
5. **Timestamp-based Updates**: Proper handling of out-of-order packets

### Network Modes

```typescript
enum NetworkMode {
  SIGNALING_ONLY, // Traditional client-server via Socket.IO
  WEBRTC_ONLY, // Pure P2P with WebRTC
  HYBRID, // WebRTC with Socket.IO signaling/fallback
}
```

## Implementation Steps

### 1. Flask-SocketIO Signaling Server

```python
# server.py
import eventlet
eventlet.monkey_patch()

from flask import Flask, request
from flask_socketio import SocketIO, emit, join_room, leave_room
import os
import logging
from dotenv import load_dotenv

load_dotenv()
app = Flask(__name__)
app.config['SECRET_KEY'] = os.getenv('SECRET_KEY', 'dev_key')

# Store connected users and rooms
users = {}
rooms = {}

# Create SocketIO instance with eventlet async mode
socketio = SocketIO(app, cors_allowed_origins='*', async_mode='eventlet')

@socketio.on('connect')
def handle_connect():
    users[request.sid] = {
        'id': request.sid,
        'room': None
    }

@socketio.on('join_room')
def handle_join_room(data):
    room_id = data.get('roomId')
    if not room_id:
        emit('error', {'message': 'Room ID is required'})
        return

    join_room(room_id)
    users[request.sid]['room'] = room_id

    # Add user to room
    if room_id not in rooms:
        rooms[room_id] = []
    rooms[room_id].append(request.sid)

    # Notify others in the room
    emit('user_joined', {
        'userId': request.sid,
        'userCount': len(rooms[room_id])
    }, to=room_id, include_self=False)

    # Send current users in the room to the new user
    emit('room_users', {
        'users': rooms[room_id],
        'userCount': len(rooms[room_id])
    })

# Additional event handlers
# ...

if __name__ == '__main__':
    port = int(os.getenv('PORT', 8080))
    # Use eventlet's WSGI server for production
    eventlet.wsgi.server(eventlet.listen(('0.0.0.0', port)), app)
```

### 2. Client Setup

Example of initializing the multiplayer system in a game:

```typescript
// Usage example
import {
  GameNetworkManager,
  NetworkMode,
  PlayerState,
} from './lib/networking/game-network-manager';

// Initialize network manager
const networkManager = new GameNetworkManager(
  'https://vlad-vibe-code-game-1-production.up.railway.app',
  NetworkMode.HYBRID
);

// Connect to the server
networkManager.connect();

// Join a room
networkManager.joinRoom('game-room-123');

// Set up event handlers
networkManager.on('player_joined', (playerId) => {
  console.log(`Player joined: ${playerId}`);
  // Add player to the game scene
});

networkManager.on('player_left', (playerId) => {
  console.log(`Player left: ${playerId}`);
  // Remove player from the game scene
});

networkManager.on('player_update', (playerId, state) => {
  // Update player in the game scene
  updatePlayerInScene(playerId, state);
});

// Game loop
function gameLoop() {
  // Update network (handle interpolation)
  networkManager.update();

  // Get all player states
  const playerStates = networkManager.getPlayerStates();

  requestAnimationFrame(gameLoop);
}

// Start the game loop
requestAnimationFrame(gameLoop);

// When local player moves
function onPlayerMove(position, rotation) {
  networkManager.updatePlayerState({
    position,
    rotation,
  });
}
```

## Deployment Guide

### Signaling Server

1. Create Railway.app account and project
2. Connect repository or push code manually
3. **Important:** Ensure your server code uses eventlet's WSGI server as shown above
4. Configure environment variables (e.g., `SECRET_KEY`)
5. Deploy with auto-scaling

### Frontend

1. Build your frontend with WebRTC integration
2. Set the signaling server URL to your Railway deployment
3. Deploy frontend to Vercel, Netlify, or similar

## Testing Tips

1. Test with different network conditions (throttling, high latency)
2. Use Chrome DevTools Network tab to simulate poor connections
3. Test across different networks (not just localhost)
4. Test with at least 3 peers to verify mesh topology
5. Verify STUN server usage with network debugging tools

## Troubleshooting

### Common Issues

1. **Peers can't connect**: Check STUN server configuration
2. **Works locally but not online**: Network configuration issues
3. **High latency**: Check update rate, reduce data payload size
4. **Jerky movement**: Implement or tune interpolation
5. **Random disconnects**: Implement reconnection logic

## Security Considerations

1. Room codes should be hard to guess (min 6 characters)
2. Validate all incoming network messages
3. Protect server credentials using environment variables
4. Implement basic authentication for room creation
5. Add rate limiting to prevent DoS attacks

---

This implementation provides a robust foundation for any real-time multiplayer game, focusing on low-latency updates while gracefully handling network issues through fallback mechanisms.
