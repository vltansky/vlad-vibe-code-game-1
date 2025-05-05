import { SignalingClient, SignalingMessage, RoomUsers } from './signaling';
import { PeerConnection, PeerData, PeerOptions } from './peer';
import SimplePeer from 'simple-peer';

export type PeerManagerOptions = {
  signalingServer?: string;
  debug?: boolean;
  iceServers?: RTCIceServer[];
};

export type PeerManagerEvents = {
  peerConnect: (peerId: string) => void;
  peerDisconnect: (peerId: string) => void;
  data: (peerId: string, data: PeerData) => void;
  userJoined: (userId: string) => void;
  userLeft: (userId: string) => void;
  roomJoined: (roomId: string, userCount: number) => void;
  roomLeft: () => void;
  clientConnected: () => void;
  clientDisconnected: () => void;
};

export class PeerManager {
  private signalingClient: SignalingClient;
  private peers: Map<string, PeerConnection> = new Map();
  private roomId: string | null = null;
  private listeners: Partial<PeerManagerEvents> = {};
  private debug: boolean;
  private peerOptions: PeerOptions;

  constructor(options: PeerManagerOptions = {}) {
    this.debug = options.debug || false;
    this.signalingClient = new SignalingClient(options.signalingServer);
    this.peerOptions = {
      debug: this.debug,
      config: {
        iceServers: options.iceServers || [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:global.stun.twilio.com:3478' },
        ],
      },
    };

    this.setupSignalingListeners();
  }

  private setupSignalingListeners(): void {
    // Handle connection events
    this.signalingClient.on('connect', () => {
      if (this.debug) console.log('Connected to signaling server');
      this.listeners.clientConnected?.();
    });

    this.signalingClient.on('disconnect', () => {
      if (this.debug) console.log('Disconnected from signaling server');
      this.listeners.clientDisconnected?.();

      // Close all peer connections
      this.closeAllPeers();
    });

    // Handle room events
    this.signalingClient.on('room_users', (data: RoomUsers) => {
      if (this.debug) console.log('Room users:', data);

      // Create peer connections for each user already in the room
      data.users.forEach((userId) => {
        if (userId !== this.signalingClient.id && !this.peers.has(userId)) {
          this.createPeer(userId, false);
        }
      });

      if (this.roomId) {
        this.listeners.roomJoined?.(this.roomId, data.userCount);
      }
    });

    this.signalingClient.on('user_joined', (data) => {
      if (this.debug) console.log('User joined:', data);
      this.listeners.userJoined?.(data.userId);

      // Create a peer connection for the new user
      if (data.userId !== this.signalingClient.id && !this.peers.has(data.userId)) {
        this.createPeer(data.userId, true);
      }
    });

    this.signalingClient.on('user_left', (data) => {
      if (this.debug) console.log('User left:', data);
      this.listeners.userLeft?.(data.userId);

      // Close the peer connection
      this.closePeer(data.userId);
    });

    this.signalingClient.on('user_disconnected', (data) => {
      if (this.debug) console.log('User disconnected:', data);
      this.listeners.userLeft?.(data.userId);

      // Close the peer connection
      this.closePeer(data.userId);
    });

    // Handle signaling
    this.signalingClient.on('signal', (data: SignalingMessage) => {
      if (this.debug) console.log('Received signal from:', data.userId);

      // Get or create the peer
      let peer = this.peers.get(data.userId);

      if (!peer) {
        peer = this.createPeer(data.userId, false);
      }

      // Process the signal
      peer.signal(data.signal as SimplePeer.SignalData);
    });
  }

  private createPeer(peerId: string, initiator: boolean): PeerConnection {
    if (this.debug)
      console.log(`Creating ${initiator ? 'initiator' : 'receiver'} peer for ${peerId}`);

    const peer = new PeerConnection(initiator, this.peerOptions);

    // Handle signals
    peer.on('signal', (signal: SimplePeer.SignalData) => {
      this.signalingClient.sendSignal(peerId, signal);
    });

    // Handle connection
    peer.on('connect', () => {
      if (this.debug) console.log(`Connected to peer: ${peerId}`);
      this.listeners.peerConnect?.(peerId);
    });

    // Handle data
    peer.on('data', (data: PeerData) => {
      this.listeners.data?.(peerId, data);
    });

    // Handle close
    peer.on('close', () => {
      if (this.debug) console.log(`Peer connection closed: ${peerId}`);
      this.peers.delete(peerId);
      this.listeners.peerDisconnect?.(peerId);
    });

    // Handle errors
    peer.on('error', (error: Error) => {
      console.error(`Peer error for ${peerId}:`, error);
      // Don't auto-close on error, wait for close event
    });

    // Store the peer
    this.peers.set(peerId, peer);

    return peer;
  }

  private closePeer(peerId: string): void {
    const peer = this.peers.get(peerId);
    if (peer) {
      peer.close();
      this.peers.delete(peerId);
      this.listeners.peerDisconnect?.(peerId);
    }
  }

  private closeAllPeers(): void {
    for (const peerId of this.peers.keys()) {
      this.closePeer(peerId);
    }
  }

  // Connect to the signaling server
  connect(): void {
    this.signalingClient.connect();
  }

  // Disconnect from the signaling server
  disconnect(): void {
    if (this.roomId) {
      this.leaveRoom();
    }
    this.closeAllPeers();
    this.signalingClient.disconnect();
  }

  // Join a room
  joinRoom(roomId: string): void {
    if (this.roomId) {
      this.leaveRoom();
    }

    this.roomId = roomId;
    this.signalingClient.joinRoom(roomId);
  }

  // Leave the current room
  leaveRoom(): void {
    if (this.roomId) {
      this.signalingClient.leaveRoom(this.roomId);
      this.roomId = null;
      this.closeAllPeers();
      this.listeners.roomLeft?.();
    }
  }

  // Send data to all peers
  broadcast(type: string, payload: unknown): void {
    for (const peer of this.peers.values()) {
      if (peer.isConnected) {
        peer.send(type, payload);
      }
    }
  }

  // Send data to a specific peer
  send(peerId: string, type: string, payload: unknown): void {
    const peer = this.peers.get(peerId);
    if (peer && peer.isConnected) {
      peer.send(type, payload);
    } else {
      console.warn(`Cannot send data to peer ${peerId}: not connected`);
    }
  }

  // Register event listeners
  on<K extends keyof PeerManagerEvents>(event: K, callback: PeerManagerEvents[K]): void {
    this.listeners[event] = callback;
  }

  // Unregister event listeners
  off<K extends keyof PeerManagerEvents>(event: K): void {
    delete this.listeners[event];
  }

  // Get a list of connected peer IDs
  getPeerIds(): string[] {
    return Array.from(this.peers.keys());
  }

  // Check if we're connected to the signaling server
  get isConnected(): boolean {
    return this.signalingClient.isConnected;
  }

  // Get our client ID
  get clientId(): string | null {
    return this.signalingClient.id;
  }

  // Get the current room ID
  get currentRoomId(): string | null {
    return this.roomId;
  }
}
