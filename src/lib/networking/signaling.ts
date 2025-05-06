import { io, Socket } from 'socket.io-client';

// Define the types for our signaling messages
export type SignalingMessage = {
  userId: string;
  signal: unknown;
};

export type RoomUsers = {
  users: string[];
  userCount: number;
};

export type UserEvent = {
  userId: string;
  userCount?: number;
};

export type BroadcastMessage = {
  userId: string;
  data: unknown;
};

export type ErrorMessage = {
  message: string;
};

// Define the events we'll listen for
export type SignalingEvents = {
  connect: () => void;
  disconnect: () => void;
  reconnecting: (attempt: number) => void;
  reconnect_failed: () => void;
  user_joined: (data: UserEvent) => void;
  user_left: (data: UserEvent) => void;
  user_disconnected: (data: UserEvent) => void;
  room_users: (data: RoomUsers) => void;
  signal: (data: SignalingMessage) => void;
  broadcast: (data: BroadcastMessage) => void;
  error: (data: ErrorMessage) => void;
};

export class SignalingClient {
  private socket!: Socket; // Using definite assignment assertion
  private listeners: Partial<SignalingEvents> = {};
  private reconnectTimer: number | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 15; // Increased from 5 to 15
  private reconnectDelay = 1000;
  private currentRoom: string | null = null;
  private isReconnecting = false;
  private serverUrl: string;

  constructor(serverUrl?: string) {
    // Check if we should use local server based on URL query parameter
    const urlParams = new URLSearchParams(window.location.search);
    const useLocal = urlParams.get('local') === 'true';

    // Use provided serverUrl, or determine based on local parameter
    // Ensure we use secure WebSocket connections for production
    let finalServerUrl = serverUrl;

    if (!finalServerUrl) {
      if (useLocal) {
        finalServerUrl = 'http://localhost:8080';
        console.log('[Signaling] Using local server:', finalServerUrl);
      } else {
        // Ensure we're using secure WebSocket for production
        const railwayUrl = 'https://vlad-vibe-code-game-1-production.up.railway.app';

        // Socket.IO will automatically convert https:// to wss:// internally
        finalServerUrl = railwayUrl;

        console.log('[Signaling] Using production server:', finalServerUrl);
      }
    }

    this.serverUrl = finalServerUrl;

    this.initializeSocket();
  }

  private initializeSocket(): void {
    this.socket = io(this.serverUrl, {
      autoConnect: false,
      reconnection: true,
      reconnectionAttempts: this.maxReconnectAttempts,
      reconnectionDelay: this.reconnectDelay,
      // Explicitly set transports to ensure we try WebSocket first
      transports: ['websocket', 'polling'],
      timeout: 20000, // Increase timeout to 20 seconds
    });

    // Set up default listeners
    this.socket.on('connect', () => {
      console.log('Connected to signaling server');
      this.reconnectAttempts = 0;
      this.isReconnecting = false;

      // Clear any pending reconnect timers
      if (this.reconnectTimer !== null) {
        window.clearTimeout(this.reconnectTimer);
        this.reconnectTimer = null;
      }

      // If we were in a room before, rejoin it
      if (this.currentRoom) {
        this.joinRoom(this.currentRoom);
      }

      this.listeners.connect?.();
    });

    this.socket.on('disconnect', () => {
      console.log('Disconnected from signaling server');
      this.listeners.disconnect?.();

      // Start custom reconnection logic if not already reconnecting
      if (!this.isReconnecting && !this.socket.connected) {
        this.attemptReconnect();
      }
    });

    this.socket.io.on('reconnect_attempt', (attempt) => {
      console.log(`Reconnect attempt ${attempt}/${this.maxReconnectAttempts}`);
      this.listeners.reconnecting?.(attempt);
    });

    this.socket.io.on('reconnect_failed', () => {
      console.log('Socket.IO reconnection failed, switching to custom reconnect strategy');
      this.listeners.reconnect_failed?.();

      // Start custom reconnection strategy
      this.attemptReconnect();
    });

    this.socket.on('user_joined', (data: UserEvent) => {
      console.log(`User joined: ${data.userId}`);
      this.listeners.user_joined?.(data);
    });

    this.socket.on('user_left', (data: UserEvent) => {
      console.log(`User left: ${data.userId}`);
      this.listeners.user_left?.(data);
    });

    this.socket.on('user_disconnected', (data: UserEvent) => {
      console.log(`User disconnected: ${data.userId}`);
      this.listeners.user_disconnected?.(data);
    });

    this.socket.on('room_users', (data: RoomUsers) => {
      console.log(`Room users: ${data.users.join(', ')}`);
      this.listeners.room_users?.(data);
    });

    this.socket.on('signal', (data: SignalingMessage) => {
      this.listeners.signal?.(data);
    });

    this.socket.on('broadcast', (data: BroadcastMessage) => {
      this.listeners.broadcast?.(data);
    });

    this.socket.on('error', (data: ErrorMessage) => {
      console.error(`Signaling error: ${data.message}`);
      this.listeners.error?.(data);
    });

    // Handle connection errors
    this.socket.io.on('error', (error) => {
      console.error('Socket.IO connection error:', error);
    });
  }

  private attemptReconnect(): void {
    // Prevent multiple reconnection attempts
    if (this.isReconnecting) return;

    this.isReconnecting = true;
    this.reconnectAttempts++;

    console.log(`Custom reconnect attempt ${this.reconnectAttempts}`);

    // If we've exceeded our max attempts, try a different strategy
    if (this.reconnectAttempts > this.maxReconnectAttempts) {
      console.log('Maximum reconnection attempts reached, recreating socket');
      this.socket.disconnect();
      this.initializeSocket();
      this.connect();
      return;
    }

    // Exponential backoff for reconnect delay (1s, 2s, 4s, etc., max 30s)
    const delay = Math.min(this.reconnectDelay * Math.pow(1.5, this.reconnectAttempts - 1), 30000);

    // Schedule reconnect attempt
    this.reconnectTimer = window.setTimeout(() => {
      if (!this.socket.connected) {
        console.log(`Attempting to reconnect after ${delay}ms`);
        this.socket.connect();
      }
      this.isReconnecting = false;
    }, delay);
  }

  // Connect to the signaling server
  connect(): void {
    this.reconnectAttempts = 0;
    this.isReconnecting = false;
    this.socket.connect();
  }

  // Disconnect from the signaling server
  disconnect(): void {
    if (this.reconnectTimer !== null) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.isReconnecting = false;
    this.currentRoom = null;
    this.socket.disconnect();
  }

  // Join a room
  joinRoom(roomId: string): void {
    this.currentRoom = roomId;
    if (this.socket.connected) {
      this.socket.emit('join_room', { roomId });
    }
  }

  // Leave the current room
  leaveRoom(roomId?: string): void {
    this.currentRoom = null;
    if (this.socket.connected) {
      this.socket.emit('leave_room', roomId ? { roomId } : {});
    }
  }

  // Send a signal to another peer
  sendSignal(targetId: string, signal: unknown): void {
    if (this.socket.connected) {
      this.socket.emit('signal', { targetId, signal });
    }
  }

  // Broadcast data to all peers in the room
  broadcast(data: unknown): void {
    if (this.socket.connected) {
      this.socket.emit('broadcast', { data });
    }
  }

  // Register event listeners
  on<K extends keyof SignalingEvents>(event: K, callback: SignalingEvents[K]): void {
    this.listeners[event] = callback;
  }

  // Unregister event listeners
  off<K extends keyof SignalingEvents>(event: K): void {
    delete this.listeners[event];
  }

  // Get socket ID (our user ID)
  get id(): string | null {
    return this.socket.connected ? (this.socket.id ?? null) : null;
  }

  // Check if we're connected
  get isConnected(): boolean {
    return this.socket.connected;
  }
}
