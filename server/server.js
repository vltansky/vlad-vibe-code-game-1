/**
 * WebRTC Signaling Server using Socket.IO and Redis
 */
require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { createClient } = require('redis');
const { createAdapter } = require('@socket.io/redis-adapter');
const winston = require('winston');

// Configure logging
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.printf(({ level, message, timestamp }) => {
      return `${timestamp} ${level}: ${message}`;
    })
  ),
  transports: [new winston.transports.Console()],
});

// Create Express app and HTTP server
const app = express();
const server = http.createServer(app);

// Create Socket.IO server
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

// Redis setup
async function setupRedis() {
  if (process.env.REDIS_URL) {
    try {
      const pubClient = createClient({ url: process.env.REDIS_URL });
      const subClient = pubClient.duplicate();

      await Promise.all([pubClient.connect(), subClient.connect()]);

      io.adapter(createAdapter(pubClient, subClient));

      logger.info('Connected to Redis server');

      // Handle Redis errors
      pubClient.on('error', (err) => logger.error(`Redis pub error: ${err}`));
      subClient.on('error', (err) => logger.error(`Redis sub error: ${err}`));

      return { pubClient, subClient };
    } catch (err) {
      logger.error(`Failed to connect to Redis: ${err}`);
      logger.info('Falling back to in-memory adapter');
    }
  } else {
    logger.info('No REDIS_URL provided, using in-memory adapter');
  }

  return null;
}

// Store connected users and rooms (used when Redis is not available)
const users = {};
const rooms = {};

// Routes
app.get('/', (req, res) => {
  res.send('WebRTC Signaling Server');
});

// Socket.IO event handlers
io.on('connection', (socket) => {
  logger.info(`Client connected: ${socket.id}`);

  // Store user data
  users[socket.id] = {
    id: socket.id,
    room: null,
  };

  // Handle join room
  socket.on('join_room', (data) => {
    const roomId = data.roomId;

    if (!roomId) {
      socket.emit('error', { message: 'Room ID is required' });
      return;
    }

    logger.info(`User ${socket.id} joining room ${roomId}`);

    // Join the Socket.IO room
    socket.join(roomId);
    users[socket.id].room = roomId;

    // Add user to room tracking
    if (!rooms[roomId]) {
      rooms[roomId] = [];
    }
    rooms[roomId].push(socket.id);

    // Notify others in the room (except sender)
    socket.to(roomId).emit('user_joined', {
      userId: socket.id,
      userCount: rooms[roomId].length,
    });

    // Send current users in the room to the new user
    logger.info(`Room users: ${rooms[roomId].join(', ')}`);
    socket.emit('room_users', {
      users: rooms[roomId],
      userCount: rooms[roomId].length,
    });
  });

  // Handle leave room
  socket.on('leave_room', (data) => {
    const roomId = data?.roomId || users[socket.id]?.room;

    if (roomId) {
      handleLeaveRoom(socket, roomId);
    }
  });

  // Handle WebRTC signaling
  socket.on('signal', (data) => {
    const targetId = data.targetId;

    if (targetId && users[targetId]) {
      logger.debug(`Signal from ${socket.id} to ${targetId}`);
      io.to(targetId).emit('signal', {
        userId: socket.id,
        signal: data.signal,
      });
    } else {
      logger.warn(`Invalid signal target: ${targetId}`);
    }
  });

  // Handle broadcast to room
  socket.on('broadcast', (data) => {
    const roomId = users[socket.id]?.room;

    if (roomId) {
      logger.debug(`Broadcast from ${socket.id} to room ${roomId}`);
      socket.to(roomId).emit('broadcast', {
        userId: socket.id,
        data: data.data,
      });
    }
  });

  // Handle disconnection
  socket.on('disconnect', () => {
    logger.info(`Client disconnected: ${socket.id}`);

    const user = users[socket.id];
    if (user && user.room) {
      handleLeaveRoom(socket, user.room);
    }

    // Clean up user data
    delete users[socket.id];
  });
});

// Helper function for handling room leaving logic
function handleLeaveRoom(socket, roomId) {
  logger.info(`User ${socket.id} leaving room ${roomId}`);

  // Leave the Socket.IO room
  socket.leave(roomId);

  if (users[socket.id]) {
    users[socket.id].room = null;
  }

  // Update room tracking
  if (rooms[roomId]) {
    const index = rooms[roomId].indexOf(socket.id);
    if (index !== -1) {
      rooms[roomId].splice(index, 1);

      // Notify others
      io.to(roomId).emit('user_left', { userId: socket.id });

      // Clean up empty rooms
      if (rooms[roomId].length === 0) {
        delete rooms[roomId];
        logger.info(`Room ${roomId} is now empty and has been deleted`);
      }
    }
  }
}

// Start the server
async function startServer() {
  const redisClients = await setupRedis();

  const PORT = process.env.PORT || 8080;
  server.listen(PORT, () => {
    logger.info(`Server listening on port ${PORT}`);
  });

  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    logger.info('Shutting down server...');

    if (redisClients) {
      const { pubClient, subClient } = redisClients;
      await Promise.all([pubClient.quit(), subClient.quit()]);
    }

    server.close(() => {
      logger.info('Server has been terminated');
      process.exit(0);
    });
  });
}

startServer();
