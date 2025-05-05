import { create } from 'zustand';
import { PeerManager } from '@/lib/networking/peerManager';
import { PeerData } from '@/lib/networking/peer';
import { Vector3, Quaternion } from 'three';

// Unique identifier for a player
export type PlayerId = string;

// Player state that gets synced across the network
export type PlayerState = {
  id: PlayerId;
  position: Vector3;
  rotation: Quaternion;
  color: string;
  isHost: boolean;
  nickname: string;
  score: number; // Track player score
  isKing: boolean; // Whether player is the current king
  lastPushTime: number; // Last time player used push ability
};

// Game state
export type GameState = {
  // Connection state
  isConnected: boolean;
  isConnecting: boolean;
  connectionError: string | null;
  roomId: string | null;
  playerCount: number;

  // Local player
  localPlayerId: PlayerId | null;

  // All players in game (including local)
  players: Record<PlayerId, PlayerState>;

  // King of the hill mechanics
  currentKingId: PlayerId | null; // ID of current king
  kingZoneOccupants: PlayerId[]; // All players in the king zone
  winningScore: number; // Score needed to win (60 by default)
  gameWinner: PlayerId | null; // ID of player who won the game

  // Networking
  peerManager: PeerManager | null;

  // Actions
  connect: (roomId: string, nickname?: string) => void;
  disconnect: () => void;
  updateLocalPlayerPosition: (position: Vector3) => void;
  updateLocalPlayerRotation: (rotation: Quaternion) => void;

  // King mechanics
  enterKingZone: (playerId: PlayerId) => void;
  leaveKingZone: (playerId: PlayerId) => void;
  updateKingStatus: () => void;
  addPlayerScore: (playerId: PlayerId, points: number) => void;
  resetScores: () => void;

  // Push mechanic
  usePushAbility: () => void;
  canUsePush: () => boolean;
};

// Constants
const PUSH_COOLDOWN = 4000; // 4 seconds between pushes
const WINNING_SCORE = 60; // 60 points to win (1 minute as king)
const CONNECTION_TIMEOUT = 15000; // 15 seconds connection timeout

// Create the store
export const useGameStore = create<GameState>((set, get) => {
  // Helper to update and broadcast player state
  const updateAndBroadcastPlayerState = (partialState: Partial<PlayerState>) => {
    const { localPlayerId, players, peerManager } = get();

    if (!localPlayerId || !peerManager) return;

    // Determine what actually changed to minimize broadcast data
    const currentState = players[localPlayerId];
    let changed = false;
    const updatedState: PlayerState = { ...currentState };

    // Check position change (with a small threshold to avoid tiny updates)
    if (partialState.position && !currentState.position.equals(partialState.position)) {
      updatedState.position.copy(partialState.position);
      changed = true;
    }

    // Check rotation change (with a small threshold)
    if (partialState.rotation && !currentState.rotation.equals(partialState.rotation)) {
      updatedState.rotation.copy(partialState.rotation);
      changed = true;
    }

    // Check score change
    if (partialState.score !== undefined && currentState.score !== partialState.score) {
      updatedState.score = partialState.score;
      changed = true;
    }

    // Check king status change
    if (partialState.isKing !== undefined && currentState.isKing !== partialState.isKing) {
      updatedState.isKing = partialState.isKing;
      changed = true;
    }

    // Check other potential fields if added later (e.g., nickname, color)
    if (partialState.nickname && currentState.nickname !== partialState.nickname) {
      updatedState.nickname = partialState.nickname;
      changed = true;
    }
    // Add checks for other fields like color, isHost if they can change dynamically

    // Only update and broadcast if something actually changed
    if (changed) {
      const updatedPlayers = { ...players, [localPlayerId]: updatedState };
      set({ players: updatedPlayers });

      // Broadcast only the changed properties
      const broadcastPayload: Partial<PlayerState> = { id: localPlayerId };
      if (partialState.position) broadcastPayload.position = updatedState.position;
      if (partialState.rotation) broadcastPayload.rotation = updatedState.rotation;
      if (partialState.nickname) broadcastPayload.nickname = updatedState.nickname;
      if (partialState.score !== undefined) broadcastPayload.score = updatedState.score;
      if (partialState.isKing !== undefined) broadcastPayload.isKing = updatedState.isKing;

      peerManager.broadcast('player_state_update', broadcastPayload);
    }
  };

  // For the connection timeout
  let connectionTimeoutId: ReturnType<typeof setTimeout> | null = null;

  return {
    // Initial state
    isConnected: false,
    isConnecting: false,
    connectionError: null,
    roomId: null,
    playerCount: 0,
    localPlayerId: null,
    players: {},
    peerManager: null,

    // King of the hill state
    currentKingId: null,
    kingZoneOccupants: [],
    winningScore: WINNING_SCORE,
    gameWinner: null,

    // Connect to a room
    connect: (roomId: string, nickname: string = 'Player') => {
      // Don't reconnect if already connected
      if (get().isConnected || get().isConnecting) return;

      set({ isConnecting: true, connectionError: null, roomId });

      const peerManager = new PeerManager();

      // Set up connection timeout
      connectionTimeoutId = setTimeout(() => {
        // Only timeout if we're still connecting
        if (get().isConnecting) {
          // Clean up the peer manager
          peerManager.disconnect();

          set({
            isConnecting: false,
            connectionError: 'Connection timed out. Please try again.',
            roomId: null,
            peerManager: null,
          });
        }
      }, CONNECTION_TIMEOUT);

      // Handle connection events
      peerManager.on('clientConnected', () => {
        // Clear the timeout since we connected successfully
        if (connectionTimeoutId) {
          clearTimeout(connectionTimeoutId);
          connectionTimeoutId = null;
        }

        const localPlayerId = peerManager.clientId;

        if (localPlayerId) {
          const localPlayer: PlayerState = {
            id: localPlayerId,
            position: new Vector3(0, 1, 0), // Spawn slightly above ground
            rotation: new Quaternion(),
            color: getRandomColor(),
            isHost: false, // Will be set to true if first in room
            nickname: nickname,
            score: 0, // Initial score is 0
            isKing: false, // Not king by default
            lastPushTime: 0, // Never used push initially
          };

          // *** Call createPlayerBody AFTER setting initial state ***
          // This ensures the store has the player before physics tries to use it
          import('@/systems/physics').then(({ createPlayerBody }) => {
            createPlayerBody(localPlayerId, localPlayer.position);
          });

          const players = { [localPlayerId]: localPlayer };

          set({
            isConnected: true,
            isConnecting: false,
            localPlayerId,
            players,
          });

          // Join the room
          peerManager.joinRoom(roomId);
        }
      });

      peerManager.on('clientDisconnected', () => {
        // Clear the timeout if it exists
        if (connectionTimeoutId) {
          clearTimeout(connectionTimeoutId);
          connectionTimeoutId = null;
        }

        set({
          isConnected: false,
          isConnecting: false,
          connectionError: 'Disconnected from signaling server',
        });
      });

      // Handle room events
      peerManager.on('roomJoined', (roomId, userCount) => {
        const localPlayerId = get().localPlayerId;
        const players = get().players;

        if (localPlayerId && players[localPlayerId]) {
          set({
            roomId,
            playerCount: userCount,
            // If we're the only one, we're the host
            players:
              userCount === 1
                ? {
                    ...players,
                    [localPlayerId]: { ...players[localPlayerId], isHost: true },
                  }
                : players,
          });

          // Send our initial state to everyone
          const currentPeerManager = get().peerManager;
          if (currentPeerManager) {
            currentPeerManager.broadcast('player_state', players[localPlayerId]);
          }
        }
      });

      peerManager.on('roomLeft', () => {
        set({ roomId: null, playerCount: 0 });
      });

      // Handle peer events
      peerManager.on('peerConnect', (peerId) => {
        const localPlayerId = get().localPlayerId;
        const players = get().players;
        const currentPeerManager = get().peerManager;

        // Send our state to the new peer
        if (localPlayerId && players[localPlayerId] && currentPeerManager) {
          currentPeerManager.send(peerId, 'player_state', players[localPlayerId]);
        }
      });

      peerManager.on('peerDisconnect', (peerId) => {
        // Remove the player from our state
        const { players } = get();
        const updatedPlayers = { ...players };
        delete updatedPlayers[peerId];

        set({
          players: updatedPlayers,
          playerCount: Object.keys(updatedPlayers).length,
        });
      });

      // Handle data events
      peerManager.on('data', (peerId, data: PeerData) => {
        // Existing handler for full initial state
        if (data.type === 'player_state') {
          const playerState = data.payload as PlayerState;
          const { players } = get();
          const updatedPlayers = { ...players };
          const position = new Vector3();
          position.set(
            playerState.position.x || 0,
            playerState.position.y || 0,
            playerState.position.z || 0
          );
          const rotation = new Quaternion();
          rotation.set(
            playerState.rotation.x || 0,
            playerState.rotation.y || 0,
            playerState.rotation.z || 0,
            playerState.rotation.w || 1
          );

          // Include king mechanics properties with defaults
          updatedPlayers[peerId] = {
            ...playerState,
            position,
            rotation,
            id: peerId,
            score: playerState.score || 0,
            isKing: playerState.isKing || false,
            lastPushTime: playerState.lastPushTime || 0,
          };

          set({ players: updatedPlayers });
        }

        // Handler for partial updates
        if (data.type === 'player_state_update') {
          const partialUpdate = data.payload as Partial<PlayerState>;
          const targetPlayerId = partialUpdate.id;

          if (targetPlayerId && targetPlayerId !== get().localPlayerId) {
            const { players } = get();
            const currentPlayerState = players[targetPlayerId];

            if (currentPlayerState) {
              const updatedPlayerState = { ...currentPlayerState };

              if (partialUpdate.position) {
                updatedPlayerState.position.set(
                  partialUpdate.position.x || 0,
                  partialUpdate.position.y || 0,
                  partialUpdate.position.z || 0
                );
              }

              if (partialUpdate.rotation) {
                updatedPlayerState.rotation.set(
                  partialUpdate.rotation.x || 0,
                  partialUpdate.rotation.y || 0,
                  partialUpdate.rotation.z || 0,
                  partialUpdate.rotation.w || 1
                );
              }

              // Handle king mechanics properties in partial update
              if (partialUpdate.score !== undefined) {
                updatedPlayerState.score = partialUpdate.score;
              }

              if (partialUpdate.isKing !== undefined) {
                updatedPlayerState.isKing = partialUpdate.isKing;
              }

              if (partialUpdate.nickname !== undefined) {
                updatedPlayerState.nickname = partialUpdate.nickname;
              }

              const updatedPlayers = { ...players, [targetPlayerId]: updatedPlayerState };
              set({ players: updatedPlayers });

              // Check if any player has reached the winning score
              if (updatedPlayerState.score >= get().winningScore && !get().gameWinner) {
                set({ gameWinner: targetPlayerId });
              }
            }
          }
        }

        // Handle push notifications from other players
        if (data.type === 'push_ability_used') {
          const { position, direction, playerId } = data.payload as {
            position: { x: number; y: number; z: number };
            direction: { x: number; y: number; z: number };
            playerId: string;
          };

          // Import physics system to apply push effect
          import('@/systems/physics').then(({ applyPushEffect }) => {
            // This function will be implemented in physics.ts
            applyPushEffect(
              new Vector3(position.x, position.y, position.z),
              new Vector3(direction.x, direction.y, direction.z),
              playerId
            );
          });
        }
      });

      // Connect to signaling server
      peerManager.connect();

      // Save peer manager
      set({ peerManager });
    },

    // Disconnect from the room
    disconnect: () => {
      // Clear any existing connection timeout
      if (connectionTimeoutId) {
        clearTimeout(connectionTimeoutId);
        connectionTimeoutId = null;
      }

      const { peerManager } = get();
      if (peerManager) {
        peerManager.disconnect();
      }

      set({
        isConnected: false,
        isConnecting: false,
        roomId: null,
        localPlayerId: null,
        players: {},
        peerManager: null,
        currentKingId: null,
        kingZoneOccupants: [],
        gameWinner: null,
      });

      // Clean up physics
      import('@/systems/physics').then(({ cleanupPhysics }) => {
        cleanupPhysics();
      });
    },

    // Update local player position
    updateLocalPlayerPosition: (position: Vector3) => {
      updateAndBroadcastPlayerState({ position });
    },

    // Update local player rotation
    updateLocalPlayerRotation: (rotation: Quaternion) => {
      updateAndBroadcastPlayerState({ rotation });
    },

    // King zone mechanics
    enterKingZone: (playerId: PlayerId) => {
      const { kingZoneOccupants } = get();
      if (!kingZoneOccupants.includes(playerId)) {
        const updatedOccupants = [...kingZoneOccupants, playerId];
        set({ kingZoneOccupants: updatedOccupants });

        // Update king status whenever zone occupancy changes
        get().updateKingStatus();
      }
    },

    leaveKingZone: (playerId: PlayerId) => {
      const { kingZoneOccupants } = get();
      if (kingZoneOccupants.includes(playerId)) {
        const updatedOccupants = kingZoneOccupants.filter((id) => id !== playerId);
        set({ kingZoneOccupants: updatedOccupants });

        // Update king status whenever zone occupancy changes
        get().updateKingStatus();
      }
    },

    updateKingStatus: () => {
      const { kingZoneOccupants, players, currentKingId } = get();

      // If only one player in zone, they're king
      if (kingZoneOccupants.length === 1) {
        const newKingId = kingZoneOccupants[0];

        // If king has changed
        if (currentKingId !== newKingId) {
          // Update old king (if any)
          if (currentKingId && players[currentKingId]) {
            const oldKing = players[currentKingId];
            updateAndBroadcastPlayerState({ id: currentKingId, isKing: false });
          }

          // Update new king
          updateAndBroadcastPlayerState({ id: newKingId, isKing: true });
          set({ currentKingId: newKingId });
        }
      }
      // If no players or multiple players in zone, no one is king
      else if (currentKingId) {
        // Remove king status from current king
        const oldKing = players[currentKingId];
        if (oldKing) {
          updateAndBroadcastPlayerState({ id: currentKingId, isKing: false });
        }
        set({ currentKingId: null });
      }
    },

    addPlayerScore: (playerId: PlayerId, points: number) => {
      const { players, winningScore } = get();
      if (players[playerId]) {
        const newScore = players[playerId].score + points;

        // Update score
        if (playerId === get().localPlayerId) {
          updateAndBroadcastPlayerState({ id: playerId, score: newScore });
        } else {
          // For remote players, update state directly without broadcasting
          const updatedPlayers = {
            ...players,
            [playerId]: { ...players[playerId], score: newScore },
          };
          set({ players: updatedPlayers });
        }

        // Check if player won
        if (newScore >= winningScore) {
          set({ gameWinner: playerId });
        }
      }
    },

    resetScores: () => {
      const { players, localPlayerId } = get();

      // Reset all scores to 0
      const updatedPlayers = { ...players };
      Object.keys(updatedPlayers).forEach((playerId) => {
        updatedPlayers[playerId].score = 0;
      });

      set({
        players: updatedPlayers,
        gameWinner: null,
      });

      // Broadcast score reset for local player
      if (localPlayerId) {
        updateAndBroadcastPlayerState({ id: localPlayerId, score: 0 });
      }
    },

    // Push mechanic
    usePushAbility: () => {
      const { localPlayerId, players, peerManager } = get();
      if (!localPlayerId || !peerManager) return;

      const localPlayer = players[localPlayerId];
      const currentTime = Date.now();

      // Check cooldown
      if (currentTime - localPlayer.lastPushTime < PUSH_COOLDOWN) {
        return; // Still on cooldown
      }

      // Update last push time
      const updatedPlayers = {
        ...players,
        [localPlayerId]: {
          ...localPlayer,
          lastPushTime: currentTime,
        },
      };
      set({ players: updatedPlayers });

      // Get player facing direction from rotation
      const direction = new Vector3(0, 0, -1).applyQuaternion(localPlayer.rotation);

      // Apply push locally through physics system
      import('@/systems/physics').then(({ applyPushEffect }) => {
        applyPushEffect(localPlayer.position, direction, localPlayerId);
      });

      // Broadcast push action to all peers
      peerManager.broadcast('push_ability_used', {
        playerId: localPlayerId,
        position: {
          x: localPlayer.position.x,
          y: localPlayer.position.y,
          z: localPlayer.position.z,
        },
        direction: {
          x: direction.x,
          y: direction.y,
          z: direction.z,
        },
      });
    },

    canUsePush: () => {
      const { localPlayerId, players } = get();
      if (!localPlayerId) return false;

      const localPlayer = players[localPlayerId];
      return Date.now() - localPlayer.lastPushTime >= PUSH_COOLDOWN;
    },
  };
});

// Helper to generate random player colors
function getRandomColor(): string {
  const colors = [
    '#FF5733', // Red-Orange
    '#33FF57', // Green
    '#3357FF', // Blue
    '#F3FF33', // Yellow
    '#FF33F3', // Pink
    '#33FFF3', // Cyan
    '#FF8333', // Orange
    '#8333FF', // Purple
    '#33FF83', // Mint
    '#FF3383', // Rose
  ];
  return colors[Math.floor(Math.random() * colors.length)];
}
