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
  user_joined: (data: UserEvent) => void;
  user_left: (data: UserEvent) => void;
  user_disconnected: (data: UserEvent) => void;
  room_users: (data: RoomUsers) => void;
  signal: (data: SignalingMessage) => void;
  broadcast: (data: BroadcastMessage) => void;
  error: (data: ErrorMessage) => void;
};

export class SignalingClient {
  private socket: Socket;
  private listeners: Partial<SignalingEvents> = {};

  constructor(serverUrl: string = 'wss://vlad-vibe-code-game-1-production.up.railway.app') {
    this.socket = io(serverUrl, {
      autoConnect: false,
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });

    // Set up default listeners
    this.socket.on('connect', () => {
      console.log('Connected to signaling server');
      this.listeners.connect?.();
    });

    this.socket.on('disconnect', () => {
      console.log('Disconnected from signaling server');
      this.listeners.disconnect?.();
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
  }

  // Connect to the signaling server
  connect(): void {
    this.socket.connect();
  }

  // Disconnect from the signaling server
  disconnect(): void {
    this.socket.disconnect();
  }

  // Join a room
  joinRoom(roomId: string): void {
    this.socket.emit('join_room', { roomId });
  }

  // Leave the current room
  leaveRoom(roomId?: string): void {
    this.socket.emit('leave_room', roomId ? { roomId } : {});
  }

  // Send a signal to another peer
  sendSignal(targetId: string, signal: unknown): void {
    this.socket.emit('signal', { targetId, signal });
  }

  // Broadcast data to all peers in the room
  broadcast(data: unknown): void {
    this.socket.emit('broadcast', { data });
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
