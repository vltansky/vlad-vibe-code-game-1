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
  private debugEnabled: boolean = true; // Enable detailed debugging

  constructor(private config: PeerConnectionConfig = {}) {
    // Default configuration with Google's STUN servers and optional TURN fallback
    this.config = {
      ...this.config,
      config: {
        iceServers: [
          // Public STUN servers
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
          { urls: 'stun:stun2.l.google.com:19302' },
          { urls: 'stun:stun3.l.google.com:19302' },
          { urls: 'stun:global.stun.twilio.com:3478' },

          // Xirsys TURN server - ensure credentials are valid
          {
            username:
              'YewABlKHAzhfOBZ7GDSJ8376mkdgSSIN_Ze0bI4QnuZFePM8uRzuLHaoglOIuurUAAAAAGgYo3N2bGFkdGE=',
            credential: '9becf21e-29a5-11f0-9a18-a68a84931b85',
            urls: [
              'turn:fr-turn8.xirsys.com:80?transport=udp',
              'turn:fr-turn8.xirsys.com:3478?transport=udp',
              'turn:fr-turn8.xirsys.com:80?transport=tcp',
              'turn:fr-turn8.xirsys.com:3478?transport=tcp',
              'turns:fr-turn8.xirsys.com:443?transport=tcp',
              'turns:fr-turn8.xirsys.com:5349?transport=tcp',
            ],
          },

          // Free public TURN servers - multiple options for reliability
          {
            urls: 'turn:openrelay.metered.ca:80',
            username: 'openrelayproject',
            credential: 'openrelayproject',
          },
          {
            urls: 'turn:openrelay.metered.ca:443',
            username: 'openrelayproject',
            credential: 'openrelayproject',
          },
          {
            urls: 'turn:openrelay.metered.ca:443?transport=tcp',
            username: 'openrelayproject',
            credential: 'openrelayproject',
          },
          // Google's TURN servers
          {
            urls: 'turn:relay.webrtc.org:3478',
            username: 'webrtc',
            credential: 'webrtc',
          },
        ],
        // Additional ICE configuration to improve connectivity
        iceCandidatePoolSize: 10, // Pre-gather ICE candidates
        iceTransportPolicy: 'all', // Try all connection methods (including relay)
        rtcpMuxPolicy: 'require', // Required for modern WebRTC
        bundlePolicy: 'max-bundle', // Optimize connection setup
        ...this.config.config,
      },
    };

    console.log('[WebRTC] Initialized with ICE config:', JSON.stringify(this.config.config));
  }

  // Initialize and connect to PeerJS server
  initialize(signalClient: SignalingClient | null = null): Promise<string> {
    // Store signaling client for hybrid approach
    this.signalClient = signalClient;

    // Test TURN servers before initializing
    this.testTurnServers();

    return new Promise((resolve, reject) => {
      try {
        const peerId = this.generateRandomId();
        console.log(`[WebRTC] Creating peer with ID: ${peerId}`);

        this.peer = new Peer(peerId, this.config);

        // Add additional debugging for RTCPeerConnection events
        // Accessing internal _pc property for debugging
        const internalPeer = this.peer as { _pc?: RTCPeerConnection };

        // Wait for the internal PeerConnection to be created
        const checkForPeerConnection = () => {
          if (internalPeer._pc) {
            this.attachRTCDebugEvents(internalPeer._pc);
          } else {
            setTimeout(checkForPeerConnection, 100);
          }
        };
        checkForPeerConnection();

        this.peer.on('open', (id: string) => {
          console.log(`[WebRTC] Peer connected with ID: ${id}`);
          this.listeners.open?.(id);
          resolve(id);
        });

        this.peer.on('connection', (conn: DataConnection) => {
          console.log(`[WebRTC] Incoming connection from peer: ${conn.peer}`);
          this.handleNewConnection(conn);
          this.listeners.connection?.(conn);
        });

        this.peer.on('disconnected', () => {
          console.log('[WebRTC] Peer disconnected from server');
          this.listeners.disconnected?.();

          // Attempt to reconnect after a short delay
          setTimeout(() => {
            if (this.peer) {
              console.log('[WebRTC] Attempting to reconnect...');
              this.peer.reconnect();
            }
          }, 3000);
        });

        this.peer.on('close', () => {
          console.log('[WebRTC] Peer connection closed');
          this.connections.clear();
          this.listeners.close?.();
        });

        this.peer.on('error', (error: Error) => {
          console.error('[WebRTC] Peer error:', error);

          // Check if it's a specific error type
          if (error.toString().includes('Could not connect to peer')) {
            console.error('[WebRTC] Connection failed. Possible causes:');
            console.error('1. STUN/TURN servers might be unreachable');
            console.error('2. One or both peers might be behind restrictive firewalls/NATs');
            console.error('3. Signaling may not be working correctly');
            console.error('HINT: Try joining the same room with a different code');
          }

          this.listeners.error?.(error);
          reject(error);
        });
      } catch (error) {
        console.error('[WebRTC] Failed to initialize peer:', error);
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  /**
   * Test TURN servers to ensure they are accessible and working
   * This helps in diagnosing connection issues early
   */
  private testTurnServers(): void {
    if (!this.debugEnabled) return;

    const iceServers = this.config.config?.iceServers || [];
    console.log(`[WebRTC] Testing ${iceServers.length} ICE servers...`);

    iceServers.forEach((server, index) => {
      const urls = Array.isArray(server.urls) ? server.urls : [server.urls];

      urls.forEach((url) => {
        const isTurn = url.toString().toLowerCase().startsWith('turn');
        const isStun = url.toString().toLowerCase().startsWith('stun');

        if (isTurn) {
          console.log(`[WebRTC] TURN server #${index}: ${url}`);
          console.log(`[WebRTC] TURN credentials: ${server.username ? 'Provided' : 'None'}`);
        } else if (isStun) {
          console.log(`[WebRTC] STUN server #${index}: ${url}`);
        }
      });
    });

    // Create a temporary connection to test ICE connectivity
    try {
      const pc = new RTCPeerConnection({
        iceServers: this.config.config?.iceServers,
        iceCandidatePoolSize: 2,
      });

      pc.createDataChannel('test');

      pc.addEventListener('icegatheringstatechange', () => {
        console.log(`[WebRTC] ICE gathering state: ${pc.iceGatheringState}`);
        if (pc.iceGatheringState === 'complete') {
          console.log('[WebRTC] ICE gathering complete. Test finished.');
          // Close the test connection
          setTimeout(() => pc.close(), 1000);
        }
      });

      pc.addEventListener('icecandidate', (event) => {
        if (event.candidate) {
          const candidateType = event.candidate.candidate.split(' ')[7];
          if (candidateType === 'relay') {
            console.log('[WebRTC] ✅ TURN server working! Relay candidate found.');
          } else if (candidateType === 'srflx') {
            console.log('[WebRTC] ✅ STUN server working! srflx candidate found.');
          }
        }
      });

      // Start ICE gathering
      pc.createOffer()
        .then((offer) => pc.setLocalDescription(offer))
        .catch((err) => console.error('[WebRTC] Error testing TURN:', err));
    } catch (e) {
      console.error('[WebRTC] Error setting up test connection:', e);
    }
  }

  // Attach debug events to the RTCPeerConnection object
  private attachRTCDebugEvents(pc: RTCPeerConnection): void {
    if (!this.debugEnabled) return;

    console.log('[WebRTC] Debug: Attaching event listeners to RTCPeerConnection');

    pc.addEventListener('icecandidate', (event) => {
      if (event.candidate) {
        console.log(`[WebRTC] ICE candidate found: ${event.candidate.candidate}`);
        // Candidate type is useful for debugging (host/srflx/relay)
        const candidateType = event.candidate.candidate.split(' ')[7];
        console.log(`[WebRTC] Candidate type: ${candidateType}`);

        // If it's a relay candidate, we know TURN is being used
        if (candidateType === 'relay') {
          console.log('[WebRTC] TURN relay candidate found - TURN server is working!');
        }
      } else {
        console.log('[WebRTC] ICE candidate gathering complete');
      }
    });

    pc.addEventListener('icecandidateerror', (event: RTCPeerConnectionIceErrorEvent) => {
      console.error('[WebRTC] ICE candidate error:', event);
    });

    pc.addEventListener('iceconnectionstatechange', () => {
      console.log(`[WebRTC] ICE connection state changed: ${pc.iceConnectionState}`);
      if (pc.iceConnectionState === 'failed') {
        console.error('[WebRTC] ICE connection failed. Likely causes:');
        console.error('1. STUN/TURN servers are not accessible');
        console.error('2. Firewalls or NAT traversal issues');
        console.error('3. Network conditions are preventing connection');
      }
    });

    pc.addEventListener('connectionstatechange', () => {
      console.log(`[WebRTC] Connection state changed: ${pc.connectionState}`);
    });

    pc.addEventListener('signalingstatechange', () => {
      console.log(`[WebRTC] Signaling state changed: ${pc.signalingState}`);
    });

    pc.addEventListener('negotiationneeded', () => {
      console.log('[WebRTC] Negotiation needed');
    });
  }

  // Generate a random ID for the peer
  private generateRandomId(): string {
    return Math.random().toString(36).substring(2, 10);
  }

  // Create or join a room with the given code
  joinRoom(roomCode: string): void {
    console.log(`[WebRTC] Joining room: ${roomCode}`);
    this.roomCode = roomCode;

    // If we have a signaling client, use it to discover peers in the room
    if (this.signalClient) {
      this.signalClient.joinRoom(roomCode);

      // Set up signal handler to receive peer IDs from the signaling server
      this.signalClient.on('room_users', (data: RoomUsers) => {
        console.log(`[WebRTC] Room users received:`, data);
        // Connect to each peer in the room
        data.users.forEach((userId: string) => {
          // Don't connect to ourselves
          if (userId !== this.signalClient?.id && !this.connections.has(userId)) {
            console.log(`[WebRTC] Initiating connection to room peer: ${userId}`);
            this.connectToPeer(userId);
          }
        });
      });
    }
  }

  // Leave the current room
  leaveRoom(): void {
    console.log(`[WebRTC] Leaving room: ${this.roomCode}`);
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
      console.error('[WebRTC] Error: Peer not initialized');
      return;
    }

    // Only connect if we're not already connected
    if (!this.connections.has(peerId)) {
      try {
        console.log(`[WebRTC] Connecting to peer: ${peerId}`);
        // Set up data channel options for unreliable transport (UDP-like)
        const dataConnectionOptions = {
          reliable: false, // Use unreliable mode for real-time data
          serialization: 'json', // Automatically serialize/deserialize JSON
        };

        const conn = this.peer.connect(peerId, dataConnectionOptions);
        this.handleNewConnection(conn);
      } catch (error) {
        console.error(`[WebRTC] Failed to connect to peer ${peerId}:`, error);
      }
    } else {
      console.log(`[WebRTC] Already connected to peer: ${peerId}`);
    }
  }

  // Handle a new connection from another peer
  private handleNewConnection(conn: DataConnection): void {
    console.log(`[WebRTC] Setting up connection to peer: ${conn.peer}`);

    conn.on('open', () => {
      console.log(`[WebRTC] Connection OPEN for peer: ${conn.peer}`);
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
      console.log(`[WebRTC] Disconnected from peer: ${conn.peer}`);
      this.connections.delete(conn.peer);
      this.listeners.peer_disconnected?.(conn.peer);
    });

    conn.on('error', (error: Error) => {
      console.error(`[WebRTC] Error with connection to ${conn.peer}:`, error);
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
        console.error(`[WebRTC] Failed to send message to peer ${peerId}:`, error);
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
          console.error(`[WebRTC] Failed to broadcast to peer ${peerId}:`, error);
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
      console.log('[WebRTC] Destroying peer connection');
      this.peer.destroy();
      this.peer = null;
    }

    this.connections.clear();
  }
}
