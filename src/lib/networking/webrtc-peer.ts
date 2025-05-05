import Peer, { DataConnection } from 'peerjs';
import { SignalingClient, RoomUsers } from './signaling';

export type PeerConnectionConfig = {
  host?: string;
  port?: number;
  path?: string;
  secure?: boolean;
  debug?: 0 | 1 | 2 | 3;
  config?: RTCConfiguration;
};

export type PeerMessage = {
  type: string;
  data: unknown;
};

export type PeerId = string;

export type PeerEventMap = {
  open: (id: string) => void;
  connection: (connection: DataConnection) => void;
  disconnected: () => void;
  close: () => void;
  error: (error: Error) => void;
  peer_connected: (peerId: string, connection: DataConnection) => void;
  peer_disconnected: (peerId: string) => void;
  message: (peerId: string, message: PeerMessage) => void;
};

export class WebRTCPeer {
  private peer: Peer | null = null;
  private connections: Map<PeerId, DataConnection> = new Map();
  private listeners: Partial<PeerEventMap> = {};
  private roomCode: string | null = null;
  private signalClient: SignalingClient | null = null;

  constructor(private config: PeerConnectionConfig = {}) {
    // Default configuration with Google's STUN servers and optional TURN fallback
    this.config = {
      ...this.config,
      config: {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:global.stun.twilio.com:3478' },
          // Add TURN servers here if needed for fallback
          // { urls: 'turn:your-turn-server.com', username: 'username', credential: 'credential' }
        ],
        ...this.config.config,
      },
    };
  }

  // Initialize and connect to PeerJS server
  initialize(signalClient: SignalingClient | null = null): Promise<string> {
    // Store signaling client for hybrid approach
    this.signalClient = signalClient;

    return new Promise((resolve, reject) => {
      try {
        this.peer = new Peer(this.generateRandomId(), this.config);

        this.peer.on('open', (id: string) => {
          console.log(`Peer connected with ID: ${id}`);
          this.listeners.open?.(id);
          resolve(id);
        });

        this.peer.on('connection', (conn: DataConnection) => {
          this.handleNewConnection(conn);
          this.listeners.connection?.(conn);
        });

        this.peer.on('disconnected', () => {
          console.log('Peer disconnected from server');
          this.listeners.disconnected?.();

          // Attempt to reconnect after a short delay
          setTimeout(() => {
            if (this.peer) {
              this.peer.reconnect();
            }
          }, 3000);
        });

        this.peer.on('close', () => {
          console.log('Peer connection closed');
          this.connections.clear();
          this.listeners.close?.();
        });

        this.peer.on('error', (error: Error) => {
          console.error('Peer error:', error);
          this.listeners.error?.(error);
          reject(error);
        });
      } catch (error) {
        console.error('Failed to initialize peer:', error);
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  // Generate a random ID for the peer
  private generateRandomId(): string {
    return Math.random().toString(36).substring(2, 10);
  }

  // Create or join a room with the given code
  joinRoom(roomCode: string): void {
    this.roomCode = roomCode;

    // If we have a signaling client, use it to discover peers in the room
    if (this.signalClient) {
      this.signalClient.joinRoom(roomCode);

      // Set up signal handler to receive peer IDs from the signaling server
      this.signalClient.on('room_users', (data: RoomUsers) => {
        // Connect to each peer in the room
        data.users.forEach((userId: string) => {
          // Don't connect to ourselves
          if (userId !== this.signalClient?.id && !this.connections.has(userId)) {
            this.connectToPeer(userId);
          }
        });
      });
    }
  }

  // Leave the current room
  leaveRoom(): void {
    if (this.roomCode && this.signalClient) {
      this.signalClient.leaveRoom(this.roomCode);
    }

    // Close all connections
    this.connections.forEach((conn) => {
      conn.close();
    });

    this.connections.clear();
    this.roomCode = null;
  }

  // Connect to a specific peer using their ID
  connectToPeer(peerId: string): void {
    if (!this.peer) {
      console.error('Peer not initialized');
      return;
    }

    // Only connect if we're not already connected
    if (!this.connections.has(peerId)) {
      try {
        // Set up data channel options for unreliable transport (UDP-like)
        const dataConnectionOptions = {
          reliable: false, // Use unreliable mode for real-time data
          serialization: 'json', // Automatically serialize/deserialize JSON
        };

        const conn = this.peer.connect(peerId, dataConnectionOptions);
        this.handleNewConnection(conn);
      } catch (error) {
        console.error(`Failed to connect to peer ${peerId}:`, error);
      }
    }
  }

  // Handle a new connection from another peer
  private handleNewConnection(conn: DataConnection): void {
    conn.on('open', () => {
      console.log(`Connected to peer: ${conn.peer}`);
      this.connections.set(conn.peer, conn);
      this.listeners.peer_connected?.(conn.peer, conn);

      // Send a welcome message
      this.sendToPeer(conn.peer, {
        type: 'welcome',
        data: { peerId: this.peer?.id },
      });
    });

    conn.on('data', (data: unknown) => {
      const message = data as PeerMessage;
      this.listeners.message?.(conn.peer, message);
    });

    conn.on('close', () => {
      console.log(`Disconnected from peer: ${conn.peer}`);
      this.connections.delete(conn.peer);
      this.listeners.peer_disconnected?.(conn.peer);
    });

    conn.on('error', (error: Error) => {
      console.error(`Error with connection to ${conn.peer}:`, error);
    });
  }

  // Send a message to a specific peer
  sendToPeer(peerId: string, message: PeerMessage): boolean {
    const connection = this.connections.get(peerId);

    if (connection && connection.open) {
      try {
        connection.send(message);
        return true;
      } catch (error) {
        console.error(`Failed to send message to peer ${peerId}:`, error);
        return false;
      }
    }

    return false;
  }

  // Broadcast a message to all connected peers
  broadcast(message: PeerMessage): void {
    this.connections.forEach((connection, peerId) => {
      if (connection.open) {
        try {
          connection.send(message);
        } catch (error) {
          console.error(`Failed to broadcast to peer ${peerId}:`, error);
        }
      }
    });
  }

  // Register an event listener
  on<K extends keyof PeerEventMap>(event: K, callback: PeerEventMap[K]): void {
    this.listeners[event] = callback;
  }

  // Unregister an event listener
  off<K extends keyof PeerEventMap>(event: K): void {
    delete this.listeners[event];
  }

  // Get the peer ID
  get id(): string | null {
    return this.peer?.id ?? null;
  }

  // Get all connected peer IDs
  get peers(): string[] {
    return Array.from(this.connections.keys());
  }

  // Check if connected to the server
  get isConnected(): boolean {
    return this.peer?.open ?? false;
  }

  // Destroy the peer connection
  destroy(): void {
    if (this.peer) {
      this.peer.destroy();
      this.peer = null;
    }

    this.connections.clear();
  }
}
