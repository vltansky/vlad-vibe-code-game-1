import {
  SignalingClient,
  SignalingMessage,
  BroadcastMessage,
  UserEvent,
  ErrorMessage,
} from './signaling';
import { WebRTCPeer, PeerMessage } from './webrtc-peer';

// Player state model
export type PlayerState = {
  id: string;
  position: [number, number, number];
  rotation: [number, number, number, number]; // Quaternion
  velocity?: [number, number, number];
  animation?: string;
  timestamp: number;
};

// Game object state
export type ObjectState = {
  id: string;
  type: string;
  position?: [number, number, number];
  rotation?: [number, number, number, number];
  properties?: Record<string, unknown>;
  timestamp: number;
};

// Game state model
export type GameState = {
  players: Record<string, PlayerState>;
  objects?: Record<string, ObjectState>;
  timestamp: number;
};

export type NetworkEventMap = {
  player_joined: (playerId: string) => void;
  player_left: (playerId: string) => void;
  player_update: (playerId: string, state: PlayerState) => void;
  game_state: (state: GameState) => void;
  object_update: (objectId: string, data: ObjectState) => void;
  message: (playerId: string, data: unknown) => void;
  connected: () => void;
  disconnected: () => void;
  error: (error: Error) => void;
};

export enum NetworkMode {
  SIGNALING_ONLY, // Traditional client-server using signaling server
  WEBRTC_ONLY, // Pure peer-to-peer using WebRTC
  HYBRID, // Uses signaling for discovery, WebRTC for game data
}

// Message types for network communication
export type NetworkMessageType = 'player_update' | 'game_state' | 'object_update' | 'message';

export type NetworkMessage = {
  type: NetworkMessageType;
  data: unknown;
};

export class GameNetworkManager {
  private signalClient: SignalingClient;
  private peerClient: WebRTCPeer | null = null;
  private listeners: Partial<NetworkEventMap> = {};
  private localPlayerId: string | null = null;
  private playerStates: Record<string, PlayerState> = {};
  private lastUpdateTime = 0;
  private updateRate = 1000 / 20; // 20 updates per second
  private interpolationBuffer: Record<string, PlayerState[]> = {};
  private interpolationDelay = 100; // ms
  private mode: NetworkMode;
  private roomId: string | null = null;
  private isHost = false;

  constructor(
    signalServerUrl: string = 'http://localhost:8080',
    mode: NetworkMode = NetworkMode.HYBRID
  ) {
    this.signalClient = new SignalingClient(signalServerUrl);
    this.mode = mode;

    // Set up signaling client event handlers
    this.signalClient.on('connect', () => {
      console.log('Connected to signaling server');
      this.localPlayerId = this.signalClient.id;

      if (this.mode !== NetworkMode.SIGNALING_ONLY) {
        this.setupPeerClient();
      } else {
        this.listeners.connected?.();
      }
    });

    this.signalClient.on('disconnect', () => {
      console.log('Disconnected from signaling server');
      this.listeners.disconnected?.();
    });

    this.signalClient.on('user_joined', (data: UserEvent) => {
      console.log(`User joined: ${data.userId}`);

      if (this.mode === NetworkMode.SIGNALING_ONLY) {
        this.listeners.player_joined?.(data.userId);
      }

      // In HYBRID mode, user_joined is handled by the peer client
    });

    this.signalClient.on('user_left', (data: UserEvent) => {
      console.log(`User left: ${data.userId}`);

      if (this.mode === NetworkMode.SIGNALING_ONLY) {
        this.listeners.player_left?.(data.userId);
        delete this.playerStates[data.userId];
      }

      // In HYBRID mode, player_left is handled by the peer client
    });

    this.signalClient.on('signal', (data: SignalingMessage) => {
      if (this.mode === NetworkMode.SIGNALING_ONLY) {
        this.handleSignalingMessage(data);
      }
    });

    this.signalClient.on('broadcast', (data: BroadcastMessage) => {
      if (
        this.mode === NetworkMode.SIGNALING_ONLY &&
        typeof data.data === 'object' &&
        data.data !== null &&
        'type' in data.data
      ) {
        this.handleBroadcastMessage(data.userId, data.data as NetworkMessage);
      }
    });

    this.signalClient.on('error', (data: ErrorMessage) => {
      console.error(`Signaling error: ${data.message}`);
      this.listeners.error?.(new Error(data.message));
    });
  }

  private setupPeerClient(): void {
    if (this.peerClient) return;

    this.peerClient = new WebRTCPeer();

    this.peerClient
      .initialize(this.signalClient)
      .then((id) => {
        console.log(`Peer initialized with ID: ${id}`);
        this.listeners.connected?.();

        // If we already joined a room, join it with the peer client too
        if (this.roomId) {
          this.peerClient!.joinRoom(this.roomId);
        }
      })
      .catch((error) => {
        console.error('Failed to initialize peer client:', error);
        this.listeners.error?.(error);

        // Fall back to signaling-only if WebRTC fails
        if (this.mode === NetworkMode.HYBRID) {
          console.log('Falling back to signaling-only mode');
          this.mode = NetworkMode.SIGNALING_ONLY;
          this.listeners.connected?.();
        }
      });

    // Set up peer client event handlers
    this.peerClient.on('peer_connected', (peerId) => {
      console.log(`Peer connected: ${peerId}`);
      this.listeners.player_joined?.(peerId);

      // Send our current state to the new peer
      if (this.localPlayerId) {
        const playerState =
          this.playerStates[this.localPlayerId] || this.createEmptyPlayerState(this.localPlayerId);
        this.sendPlayerState(playerState);
      }
    });

    this.peerClient.on('peer_disconnected', (peerId) => {
      console.log(`Peer disconnected: ${peerId}`);
      this.listeners.player_left?.(peerId);
      delete this.playerStates[peerId];
    });

    this.peerClient.on('message', (peerId, message) => {
      this.handlePeerMessage(peerId, message);
    });

    this.peerClient.on('error', (error) => {
      console.error('Peer error:', error);
      this.listeners.error?.(error);
    });
  }

  // Connect to the network
  connect(): void {
    this.signalClient.connect();
  }

  // Disconnect from the network
  disconnect(): void {
    if (this.peerClient) {
      this.peerClient.destroy();
      this.peerClient = null;
    }

    this.signalClient.disconnect();
    this.playerStates = {};
    this.interpolationBuffer = {};
    this.roomId = null;
  }

  // Join a room
  joinRoom(roomId: string): void {
    this.roomId = roomId;
    this.signalClient.joinRoom(roomId);

    if (this.peerClient && this.peerClient.isConnected) {
      this.peerClient.joinRoom(roomId);
    }
  }

  // Leave the current room
  leaveRoom(): void {
    if (this.roomId) {
      this.signalClient.leaveRoom(this.roomId);

      if (this.peerClient) {
        this.peerClient.leaveRoom();
      }

      this.roomId = null;
      this.playerStates = {};
      this.interpolationBuffer = {};
    }
  }

  // Update local player state
  updatePlayerState(playerState: Partial<PlayerState>): void {
    if (!this.localPlayerId) return;

    const currentTime = Date.now();
    if (currentTime - this.lastUpdateTime < this.updateRate) {
      // Throttle updates
      return;
    }

    this.lastUpdateTime = currentTime;

    // Get current state or create empty state
    const currentState =
      this.playerStates[this.localPlayerId] || this.createEmptyPlayerState(this.localPlayerId);

    // Update with new data
    const newState: PlayerState = {
      ...currentState,
      ...playerState,
      timestamp: currentTime,
    };

    // Store locally
    this.playerStates[this.localPlayerId] = newState;

    // Send to network
    this.sendPlayerState(newState);
  }

  // Create an empty player state
  private createEmptyPlayerState(playerId: string): PlayerState {
    return {
      id: playerId,
      position: [0, 0, 0],
      rotation: [0, 0, 0, 1], // Identity quaternion
      timestamp: Date.now(),
    };
  }

  // Send player state to the network
  private sendPlayerState(state: PlayerState): void {
    const message: NetworkMessage = {
      type: 'player_update',
      data: state,
    };

    if (this.mode === NetworkMode.SIGNALING_ONLY) {
      this.signalClient.broadcast(message);
    } else if (this.peerClient) {
      this.peerClient.broadcast(message);
    }
  }

  // Handle messages from the signaling server
  private handleSignalingMessage(data: SignalingMessage): void {
    const { userId, signal } = data;

    if (typeof signal === 'object' && signal !== null && 'type' in signal) {
      this.handleBroadcastMessage(userId, signal as NetworkMessage);
    }
  }

  // Handle broadcast messages
  private handleBroadcastMessage(senderId: string, message: NetworkMessage): void {
    if (!message || typeof message !== 'object' || !('type' in message)) {
      return;
    }

    // Process object data outside switch to avoid lexical declaration error
    let objectData: ObjectState | null = null;
    if (message.type === 'object_update') {
      objectData = message.data as ObjectState;
    }

    switch (message.type) {
      case 'player_update':
        this.handlePlayerUpdate(senderId, message.data as PlayerState);
        break;
      case 'game_state':
        this.handleGameState(message.data as GameState);
        break;
      case 'object_update':
        if (objectData && typeof objectData === 'object' && 'id' in objectData) {
          this.listeners.object_update?.(objectData.id, objectData);
        }
        break;
      case 'message':
        this.listeners.message?.(senderId, message.data);
        break;
      default:
        // Unknown message type
        break;
    }
  }

  // Handle messages from WebRTC peers
  private handlePeerMessage(peerId: string, message: PeerMessage): void {
    this.handleBroadcastMessage(peerId, message as unknown as NetworkMessage);
  }

  // Handle player update messages
  private handlePlayerUpdate(playerId: string, state: PlayerState): void {
    // Add to interpolation buffer
    if (!this.interpolationBuffer[playerId]) {
      this.interpolationBuffer[playerId] = [];
    }

    this.interpolationBuffer[playerId].push(state);

    // Sort by timestamp
    this.interpolationBuffer[playerId].sort((a, b) => a.timestamp - b.timestamp);

    // Trim old entries (keep last 10 seconds worth)
    const currentTime = Date.now();
    this.interpolationBuffer[playerId] = this.interpolationBuffer[playerId].filter(
      (state) => currentTime - state.timestamp < 10000
    );

    // Update player state (using interpolation in the game loop)
    if (!this.playerStates[playerId]) {
      // First update for this player, set initial state
      this.playerStates[playerId] = state;
      this.listeners.player_joined?.(playerId);
    }

    // Notify listeners about the update
    this.listeners.player_update?.(playerId, state);
  }

  // Handle game state updates
  private handleGameState(state: GameState): void {
    // Store player states
    Object.entries(state.players).forEach(([playerId, playerState]) => {
      if (playerId !== this.localPlayerId) {
        this.handlePlayerUpdate(playerId, playerState);
      }
    });

    this.listeners.game_state?.(state);
  }

  // Game loop update - apply interpolation
  update(): void {
    if (!this.localPlayerId) return;

    const currentTime = Date.now() - this.interpolationDelay;

    // Update each player with interpolation
    Object.keys(this.interpolationBuffer).forEach((playerId) => {
      if (playerId === this.localPlayerId) return; // Skip local player

      const buffer = this.interpolationBuffer[playerId];
      if (buffer.length < 2) return;

      // Find the two states that surround the current time
      let previousState: PlayerState | null = null;
      let nextState: PlayerState | null = null;

      for (let i = 0; i < buffer.length; i++) {
        if (buffer[i].timestamp > currentTime) {
          nextState = buffer[i];
          previousState = buffer[i - 1] || buffer[i];
          break;
        }
      }

      if (!previousState || !nextState) {
        // Use the most recent state if we can't interpolate
        const latestState = buffer[buffer.length - 1];
        this.playerStates[playerId] = latestState;
        return;
      }

      // Calculate interpolation factor
      const total = nextState.timestamp - previousState.timestamp;
      const progress = total > 0 ? (currentTime - previousState.timestamp) / total : 0;
      const factor = Math.max(0, Math.min(1, progress));

      // Interpolate position
      const position: [number, number, number] = [
        this.lerp(previousState.position[0], nextState.position[0], factor),
        this.lerp(previousState.position[1], nextState.position[1], factor),
        this.lerp(previousState.position[2], nextState.position[2], factor),
      ];

      // Interpolate rotation (SLERP for quaternions)
      const rotation = this.slerpQuaternions(previousState.rotation, nextState.rotation, factor);

      // Update player state with interpolated values
      this.playerStates[playerId] = {
        ...nextState,
        position,
        rotation,
      };
    });
  }

  // Linear interpolation helper
  private lerp(a: number, b: number, t: number): number {
    return a + (b - a) * t;
  }

  // Spherical linear interpolation for quaternions
  private slerpQuaternions(
    q1: [number, number, number, number],
    q2: [number, number, number, number],
    t: number
  ): [number, number, number, number] {
    // Simplified slerp implementation
    // In a real application, use a proper quaternion library

    // Copy quaternions to avoid modifying the originals
    const [x1, y1, z1, w1] = q1;
    const [x2, y2, z2, w2] = q2;

    // Calculate dot product (cosine of angle between quaternions)
    let dot = x1 * x2 + y1 * y2 + z1 * z2 + w1 * w2;

    // If the dot product is negative, one quaternion should be negated to ensure
    // the shortest path is taken
    const q2x = dot < 0 ? -x2 : x2;
    const q2y = dot < 0 ? -y2 : y2;
    const q2z = dot < 0 ? -z2 : z2;
    const q2w = dot < 0 ? -w2 : w2;

    // If the inputs are too close, linearly interpolate
    dot = Math.abs(dot);
    if (dot > 0.9995) {
      return [
        this.lerp(x1, q2x, t),
        this.lerp(y1, q2y, t),
        this.lerp(z1, q2z, t),
        this.lerp(w1, q2w, t),
      ];
    }

    // Calculate the angle between the quaternions
    const theta0 = Math.acos(dot);
    const theta = theta0 * t;

    // Calculate the interpolation factors
    const sinTheta = Math.sin(theta);
    const sinTheta0 = Math.sin(theta0);
    const s0 = Math.cos(theta) - (dot * sinTheta) / sinTheta0;
    const s1 = sinTheta / sinTheta0;

    // Interpolate
    return [s0 * x1 + s1 * q2x, s0 * y1 + s1 * q2y, s0 * z1 + s1 * q2z, s0 * w1 + s1 * q2w];
  }

  // Send a message to all peers
  sendMessage(data: unknown): void {
    const message: NetworkMessage = {
      type: 'message',
      data,
    };

    if (this.mode === NetworkMode.SIGNALING_ONLY) {
      this.signalClient.broadcast(message);
    } else if (this.peerClient) {
      this.peerClient.broadcast(message);
    }
  }

  // Register event listeners
  on<K extends keyof NetworkEventMap>(event: K, callback: NetworkEventMap[K]): void {
    this.listeners[event] = callback;
  }

  // Unregister event listeners
  off<K extends keyof NetworkEventMap>(event: K): void {
    delete this.listeners[event];
  }

  // Get all current player states
  getPlayerStates(): Record<string, PlayerState> {
    return { ...this.playerStates };
  }

  // Get a specific player's state
  getPlayerState(playerId: string): PlayerState | null {
    return this.playerStates[playerId] || null;
  }

  // Get local player ID
  get playerId(): string | null {
    return this.localPlayerId;
  }

  // Check if connected
  get isConnected(): boolean {
    return this.signalClient.isConnected;
  }

  // Set update rate (Hz)
  setUpdateRate(updatesPerSecond: number): void {
    this.updateRate = 1000 / updatesPerSecond;
  }

  // Set interpolation delay (ms)
  setInterpolationDelay(delay: number): void {
    this.interpolationDelay = delay;
  }

  // Set network mode
  setNetworkMode(mode: NetworkMode): void {
    this.mode = mode;

    if (mode !== NetworkMode.SIGNALING_ONLY && !this.peerClient) {
      this.setupPeerClient();
    }
  }

  // Check if we're the host
  get isRoomHost(): boolean {
    return this.isHost;
  }

  // Set host status
  setAsHost(isHost: boolean): void {
    this.isHost = isHost;
  }
}
