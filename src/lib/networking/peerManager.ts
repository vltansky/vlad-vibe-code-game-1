import { SignalingClient, SignalingMessage, RoomUsers } from './signaling';
import { PeerConnection, PeerData, PeerConnectionOptions } from './peer';
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
  clientReconnecting: (attempt: number) => void;
  clientReconnectFailed: () => void;
};

export class PeerManager {
  private signalingClient: SignalingClient;
  private peers: Map<string, PeerConnection> = new Map();
  private roomId: string | null = null;
  private eventListeners: Map<keyof PeerManagerEvents, Set<(...args: any[]) => void>> = new Map();
  private debug: boolean;
  private peerConnectionOptionsForPeer: PeerConnectionOptions;

  constructor(options: PeerManagerOptions = {}) {
    this.debug = options.debug || false;
    this.signalingClient = new SignalingClient(options.signalingServer);
    this.peerConnectionOptionsForPeer = {
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

  private emit<K extends keyof PeerManagerEvents>(
    event: K,
    ...args: Parameters<PeerManagerEvents[K]>
  ): void {
    const callbacks = this.eventListeners.get(event);
    if (callbacks) {
      callbacks.forEach((callback) => {
        try {
          callback(...args);
        } catch (error) {
          console.error(`Error in event listener for ${event}:`, error);
        }
      });
    }
  }

  private setupSignalingListeners(): void {
    this.signalingClient.on('connect', () => {
      if (this.debug) console.log('Connected to signaling server');
      this.emit('clientConnected');
    });

    this.signalingClient.on('disconnect', () => {
      if (this.debug) console.log('Disconnected from signaling server');
      this.emit('clientDisconnected');
      this.closeAllPeers();
    });

    this.signalingClient.on('reconnecting', (attempt) => {
      if (this.debug) console.log(`Reconnecting to signaling server, attempt ${attempt}`);
      this.emit('clientReconnecting', attempt);
    });

    this.signalingClient.on('reconnect_failed', () => {
      if (this.debug) console.log('Reconnection to signaling server failed');
      this.emit('clientReconnectFailed');
    });

    this.signalingClient.on('room_users', (data: RoomUsers) => {
      if (this.debug) console.log('Room users:', data);
      data.users.forEach((userId) => {
        if (userId !== this.signalingClient.id && !this.peers.has(userId)) {
          this.createPeer(userId, false);
        }
      });
      if (this.roomId) {
        this.emit('roomJoined', this.roomId, data.userCount);
      }
    });

    this.signalingClient.on('user_joined', (data) => {
      if (this.debug) console.log('User joined:', data);
      this.emit('userJoined', data.userId);
      if (data.userId !== this.signalingClient.id && !this.peers.has(data.userId)) {
        this.createPeer(data.userId, true);
      }
    });

    this.signalingClient.on('user_left', (data) => {
      if (this.debug) console.log('User left:', data);
      this.emit('userLeft', data.userId);
      this.closePeer(data.userId);
    });

    this.signalingClient.on('user_disconnected', (data) => {
      if (this.debug) console.log('User disconnected:', data);
      this.emit('userLeft', data.userId);
      this.closePeer(data.userId);
    });

    this.signalingClient.on('signal', (data: SignalingMessage) => {
      if (this.debug) console.log('Received signal from:', data.userId);
      let peer = this.peers.get(data.userId);
      if (!peer) {
        peer = this.createPeer(data.userId, false);
      }
      peer.signal(data.signal as SimplePeer.SignalData);
    });
  }

  private createPeer(peerId: string, initiator: boolean): PeerConnection {
    if (this.debug)
      console.log(`Creating ${initiator ? 'initiator' : 'receiver'} peer for ${peerId}`);

    const peer = new PeerConnection(initiator, this.peerConnectionOptionsForPeer);

    peer.on('signal', (signal: SimplePeer.SignalData) => {
      this.signalingClient.sendSignal(peerId, signal);
    });

    peer.on('connect', () => {
      if (this.debug) console.log(`Connected to peer: ${peerId}`);
      this.emit('peerConnect', peerId);
    });

    peer.on('data', (data: PeerData) => {
      console.log(`[PeerManager] Received data from PeerConnection ${peerId}:`, data);
      this.emit('data', peerId, data);
    });

    peer.on('close', () => {
      if (this.debug) console.log(`Peer connection closed: ${peerId}`);
      this.peers.delete(peerId);
      this.emit('peerDisconnect', peerId);
    });

    peer.on('error', (error: Error) => {
      console.error(`Peer error for ${peerId}:`, error);
    });

    this.peers.set(peerId, peer);
    return peer;
  }

  private closePeer(peerId: string): void {
    const peer = this.peers.get(peerId);
    if (peer) {
      peer.close();
    }
  }

  private closeAllPeers(): void {
    for (const peerId of this.peers.keys()) {
      this.closePeer(peerId);
    }
  }

  connect(): void {
    this.signalingClient.connect();
  }

  disconnect(): void {
    if (this.roomId) {
      this.leaveRoom();
    } else {
      this.closeAllPeers();
    }
    this.signalingClient.disconnect();
  }

  joinRoom(roomId: string): void {
    if (this.roomId) {
      this.leaveRoom();
    }

    this.roomId = roomId;
    this.signalingClient.joinRoom(roomId);
  }

  leaveRoom(): void {
    if (this.roomId) {
      this.signalingClient.leaveRoom(this.roomId);
      this.roomId = null;
      this.closeAllPeers();
      this.emit('roomLeft');
    }
  }

  broadcast(type: string, payload: unknown): void {
    for (const [peerId, peer] of this.peers.entries()) {
      console.log(`[PeerManager] Broadcasting data to ${peerId} - Type: ${type}`);
      if (peer.isConnected) {
        peer.send(type, payload);
      }
    }
  }

  send(peerId: string, type: string, payload: unknown): void {
    const peer = this.peers.get(peerId);
    if (peer && peer.isConnected) {
      console.log(`[PeerManager] Sending data to ${peerId} - Type: ${type}`);
      peer.send(type, payload);
    } else {
      console.warn(`Cannot send data to peer ${peerId}: not connected`);
    }
  }

  on<K extends keyof PeerManagerEvents>(event: K, callback: PeerManagerEvents[K]): void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, new Set());
    }
    this.eventListeners.get(event)!.add(callback as (...args: any[]) => void);
  }

  off<K extends keyof PeerManagerEvents>(event: K, callback?: PeerManagerEvents[K]): void {
    const callbacks = this.eventListeners.get(event);
    if (callbacks) {
      if (callback) {
        callbacks.delete(callback as (...args: any[]) => void);
        if (callbacks.size === 0) {
          this.eventListeners.delete(event);
        }
      } else {
        this.eventListeners.delete(event);
      }
    }
  }

  getPeerIds(): string[] {
    return Array.from(this.peers.keys());
  }

  get isConnected(): boolean {
    return this.signalingClient.isConnected;
  }

  get clientId(): string | null {
    return this.signalingClient.id;
  }

  get currentRoomId(): string | null {
    return this.roomId;
  }
}
