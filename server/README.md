# WebRTC Signaling Server

A Socket.IO signaling server for WebRTC connections in multiplayer web games, with Redis for session management and scaling.

## Features

- Real-time signaling for WebRTC peer-to-peer connections
- Room-based player grouping
- Redis integration for horizontal scaling
- Fallback to in-memory adapter when Redis is unavailable
- Comprehensive logging
- Graceful shutdown handling

## Requirements

- Node.js 18+
- Redis (optional, for horizontal scaling)

## Installation

```bash
# Install dependencies
yarn install
```

## Configuration

Create a `.env` file in the project root based on the example:

```
# Server configuration
PORT=8080
LOG_LEVEL=info

# Security
SECRET_KEY=your_secret_key_here

# Redis configuration (optional)
# REDIS_URL=redis://username:password@host:port
```

## Running the Server

```bash
# Development mode with auto-restart
yarn dev

# Production mode
yarn start
```

## API

### Socket.IO Events

#### Client → Server

- `join_room`: Join a specific room

  ```javascript
  socket.emit('join_room', { roomId: 'game-room-123' });
  ```

- `leave_room`: Leave the current room

  ```javascript
  socket.emit('leave_room', { roomId: 'game-room-123' });
  ```

- `signal`: Send WebRTC signaling data to a specific peer

  ```javascript
  socket.emit('signal', {
    targetId: 'peer-socket-id',
    signal: {
      /* signaling data */
    },
  });
  ```

- `broadcast`: Broadcast data to all peers in the room
  ```javascript
  socket.emit('broadcast', {
    data: {
      /* any data */
    },
  });
  ```

#### Server → Client

- `user_joined`: When a new user joins the room

  ```javascript
  socket.on('user_joined', ({ userId, userCount }) => {
    console.log(`User ${userId} joined, total users: ${userCount}`);
  });
  ```

- `user_left`: When a user leaves the room

  ```javascript
  socket.on('user_left', ({ userId }) => {
    console.log(`User ${userId} left`);
  });
  ```

- `room_users`: List of users in the room (sent to new users)

  ```javascript
  socket.on('room_users', ({ users, userCount }) => {
    console.log(`Users in room: ${users.join(', ')}`);
  });
  ```

- `signal`: Signaling data from a peer

  ```javascript
  socket.on('signal', ({ userId, signal }) => {
    // Handle incoming signal from userId
  });
  ```

- `broadcast`: Broadcast data from a peer

  ```javascript
  socket.on('broadcast', ({ userId, data }) => {
    // Handle broadcast from userId
  });
  ```

- `error`: Error messages
  ```javascript
  socket.on('error', ({ message }) => {
    console.error(`Server error: ${message}`);
  });
  ```

## Deployment

This server is designed to be deployed on Railway.app or similar services:

1. Push code to a repository
2. Create a new Railway project
3. Connect to the repository
4. Add environment variables (PORT, etc.)
5. Deploy

For horizontal scaling, add a Redis instance and configure the `REDIS_URL` environment variable.

## License

MIT
