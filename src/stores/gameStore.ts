import { create } from 'zustand';
import { PeerManager } from '@/lib/networking/peerManager';
import { PeerData } from '@/lib/networking/peer';
import { Vector3, Quaternion } from 'three';
import {
  // applyBombEffect, // Not directly used here
  initPhysics,
  updatePhysics,
} from '@/systems/physics';

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
  lastBombTime: number; // Last time player used bomb ability
  skin: string; // Identifier for player skin/appearance
};

// Game state
export type GameState = {
  // Connection state
  isConnected: boolean;
  isConnecting: boolean;
  isReconnecting: boolean; // Track reconnection attempts
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
  connect: (roomId: string, nickname?: string, color?: string, skin?: string) => void;
  disconnect: () => void;
  updateLocalPlayerPosition: (position: Vector3) => void;
  updateLocalPlayerRotation: (rotation: Quaternion) => void;

  // King mechanics
  enterKingZone: (playerId: PlayerId) => void;
  leaveKingZone: (playerId: PlayerId) => void;
  updateKingStatus: () => void;
  addPlayerScore: (playerId: PlayerId, points: number) => void;
  resetScores: () => void;

  // Bomb mechanic
  useBombAbility: () => void;
  canUseBomb: () => boolean;

  // Joystick state
  joystickDelta: { x: number; y: number };
  setJoystickDelta: (delta: { x: number; y: number }) => void;

  // Physics related
  initPhysics: () => Promise<void>;
  updatePhysics: (delta: number) => void;

  // New action to change player skin
  changeSkin: (skinId: string) => void;
};

// Constants
const BOMB_COOLDOWN = 500; // reasonable cooldown to prevent cheating but still allow aggressive bomb usage
const WINNING_SCORE = 60; // 60 points to win (1 minute as king)
const CONNECTION_TIMEOUT = 15000; // 15 seconds connection timeout

console.log(`[GameStore] Constants: WINNING_SCORE=${WINNING_SCORE}`);

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

    // Check skin change
    if (partialState.skin && currentState.skin !== partialState.skin) {
      updatedState.skin = partialState.skin;
      changed = true;
    }

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
      if (partialState.skin) broadcastPayload.skin = updatedState.skin;

      peerManager.broadcast('player_state_update', broadcastPayload);
    }
  };

  // For the connection timeout
  let connectionTimeoutId: ReturnType<typeof setTimeout> | null = null;

  return {
    // Initial state
    isConnected: false,
    isConnecting: false,
    isReconnecting: false,
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
    connect: (roomId: string, nickname: string = 'Player', color?: string, skin?: string) => {
      // Don't reconnect if already connected
      if (get().isConnected || get().isConnecting) return;

      set({ isConnecting: true, connectionError: null, roomId, isReconnecting: false });

      // --- MODIFY: Instantiate PeerManager with ICE Servers ---
      const iceServers: RTCIceServer[] = [
        // Public STUN servers
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
        { urls: 'stun:stun3.l.google.com:19302' },
        { urls: 'stun:global.stun.twilio.com:3478' },
        // custom

        {
          urls: 'stun:stun.relay.metered.ca:80',
        },
        {
          urls: 'turn:global.relay.metered.ca:80',
          username: '5df6a73f882e0b2c6e7ff098',
          credential: '4SS6CksF518Kj/zH',
        },
        {
          urls: 'turn:global.relay.metered.ca:80?transport=tcp',
          username: '5df6a73f882e0b2c6e7ff098',
          credential: '4SS6CksF518Kj/zH',
        },
        {
          urls: 'turn:global.relay.metered.ca:443',
          username: '5df6a73f882e0b2c6e7ff098',
          credential: '4SS6CksF518Kj/zH',
        },
        {
          urls: 'turns:global.relay.metered.ca:443?transport=tcp',
          username: '5df6a73f882e0b2c6e7ff098',
          credential: '4SS6CksF518Kj/zH',
        },
      ];

      const peerManager = new PeerManager({
        debug: true, // Enable debug logs
        iceServers: iceServers,
      });
      // --- END MODIFY ---

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
            position: getRandomCornerPosition(), // Spawn in a random corner instead of center
            rotation: new Quaternion(),
            color: color || getRandomColor(), // Use provided color or generate random
            isHost: false, // Will be set to true if first in room
            nickname: nickname,
            score: 0, // Initial score is 0
            isKing: false, // Not king by default
            lastBombTime: 0, // Never used bomb initially
            skin: skin || 'default', // Use provided skin or default
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
            isReconnecting: false,
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
          isReconnecting: true,
          connectionError: 'Disconnected from signaling server',
        });
      });

      peerManager.on('clientReconnecting', (attempt) => {
        console.log(`Reconnection attempt ${attempt}`);
        set({
          isReconnecting: true,
          connectionError: 'Disconnected from signaling server',
        });
      });

      peerManager.on('clientReconnectFailed', () => {
        console.log('Reconnection failed, will try again with fallback strategy');
        set({
          isReconnecting: true,
          connectionError: 'Connection issues, attempting fallback reconnection...',
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

        // --- MODIFY: Get state directly and send ---
        if (localPlayerId && players[localPlayerId] && currentPeerManager) {
          const localState = players[localPlayerId];
          console.log(`[GameStore] Attempting to send initial player_state to new peer ${peerId}`);
          currentPeerManager.send(peerId, 'player_state', localState);
        } else {
          console.warn(
            `[GameStore] Cannot send initial state to ${peerId}: Missing localPlayerId, state, or peerManager`
          );
        }
        // --- END MODIFY ---
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
        console.log(`[GameStore] Received data from ${peerId}:`, data);

        // Existing handler for full initial state
        if (data.type === 'player_state') {
          const playerState = data.payload as PlayerState;
          const { players } = get();
          const updatedPlayers = { ...players };

          if (updatedPlayers[peerId]) {
            console.warn(
              `[GameStore] Player state for ${peerId} already exists. Ignoring duplicate.`
            );
            return;
          }

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

          updatedPlayers[peerId] = {
            ...playerState,
            position,
            rotation,
            id: peerId,
            score: playerState.score || 0,
            isKing: playerState.isKing || false,
            lastBombTime: playerState.lastBombTime || 0,
            skin: playerState.skin || 'default',
          };

          console.log('[GameStore] Adding player state:', peerId, updatedPlayers[peerId]);

          set({
            players: updatedPlayers,
            playerCount: Object.keys(updatedPlayers).length,
          });

          // *** Create physics body for the NEW remote player ***

          import('@/systems/physics').then(({ createPlayerBody, syncRemotePlayerPhysics }) => {
            console.log(`[GameStore] Creating physics body for remote player ${peerId}`);
            createPlayerBody(peerId, position);

            // Also do an initial sync to make sure physics and visuals are aligned
            syncRemotePlayerPhysics(peerId, position, rotation);
          });
          // *** END ***
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

                // Check if this is a respawn notification (score reset to 0 + position change)
                if (partialUpdate.score !== undefined && partialUpdate.score === 0) {
                  console.log(`[GameStore] Detected respawn for player ${targetPlayerId}`);

                  // Apply respawn physics update for this remote player
                  import('@/systems/physics').then(({ respawnPlayerBody }) => {
                    respawnPlayerBody(targetPlayerId, updatedPlayerState.position);
                  });
                }
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

                // Check if this player has won based on updated score
                if (updatedPlayerState.score >= get().winningScore && !get().gameWinner) {
                  console.log(
                    `[GameStore] Player ${targetPlayerId} has won via partial update with score ${updatedPlayerState.score}!`
                  );
                  set({ gameWinner: targetPlayerId });
                }
              }

              if (partialUpdate.isKing !== undefined) {
                updatedPlayerState.isKing = partialUpdate.isKing;
              }

              if (partialUpdate.nickname !== undefined) {
                updatedPlayerState.nickname = partialUpdate.nickname;
              }

              if (partialUpdate.skin && currentPlayerState.skin !== partialUpdate.skin) {
                updatedPlayerState.skin = partialUpdate.skin;
              }

              const updatedPlayers = { ...players, [targetPlayerId]: updatedPlayerState };
              set({ players: updatedPlayers });

              // We've moved the winning check to be immediately after the score update
              // This ensures it happens before any other state updates that might reset it

              // --- SYNC WITH PHYSICS ---
              // Synchronize the physics body with the network position
              if (partialUpdate.position && partialUpdate.rotation) {
                import('@/systems/physics').then(({ syncRemotePlayerPhysics }) => {
                  syncRemotePlayerPhysics(
                    targetPlayerId,
                    updatedPlayerState.position,
                    updatedPlayerState.rotation
                  );
                });
              }
              // --- END SYNC WITH PHYSICS ---

              // --- REFINE LOG: Show *before* and *after* ---
              console.log(
                `[GameStore] Applying partial update for ${targetPlayerId}. Before:`,
                currentPlayerState.position,
                `After:`,
                updatedPlayerState.position
              );
              // --- END REFINE LOG ---

              console.log(
                `[GameStore] Partially updated player state for ${targetPlayerId}:`,
                updatedPlayerState
              );
            }
          }
        }

        // Handle bomb notifications from other players
        if (data.type === 'bomb_ability_used') {
          const { position, playerId } = data.payload as {
            position: { x: number; y: number; z: number };
            playerId: string;
          };

          // Import physics system to apply bomb effect
          import('@/systems/physics').then(({ applyBombEffect }) => {
            applyBombEffect(new Vector3(position.x, position.y, position.z), playerId);
          });
        }

        // Handle game reset notification
        if (data.type === 'game_reset') {
          const { initiator, timestamp } = data.payload as {
            initiator: string;
            timestamp: number;
          };

          console.log(
            `[GameStore] Game reset initiated by ${initiator} at ${new Date(timestamp).toLocaleTimeString()}`
          );

          // Only process if we're not the initiator (they already reset their own game)
          if (initiator !== get().localPlayerId) {
            // Reset all scores to 0 and respawn players to random positions
            const { players, localPlayerId } = get();
            const updatedPlayers = { ...players };

            Object.keys(updatedPlayers).forEach((playerId) => {
              // Reset score
              updatedPlayers[playerId].score = 0;

              // Generate new random position for respawn
              const newPosition = getRandomCornerPosition();
              updatedPlayers[playerId].position.copy(newPosition);

              // Reset king status
              updatedPlayers[playerId].isKing = false;
            });

            set({
              players: updatedPlayers,
              gameWinner: null,
              currentKingId: null,
              kingZoneOccupants: [],
            });

            // Respawn local player's physics body
            if (localPlayerId) {
              const localPlayerPosition = updatedPlayers[localPlayerId].position;

              // Respawn physics body via physics system
              import('@/systems/physics').then(({ respawnPlayerBody }) => {
                respawnPlayerBody(localPlayerId, localPlayerPosition);
              });

              // Broadcasting our new position to others
              const { peerManager } = get();
              if (peerManager) {
                peerManager.broadcast('player_state_update', {
                  id: localPlayerId,
                  score: 0,
                  position: localPlayerPosition,
                  isKing: false,
                });
              }
            }
          }
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
        isReconnecting: false,
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
        if (players[currentKingId]) {
          updateAndBroadcastPlayerState({ id: currentKingId, isKing: false });
        }
        set({ currentKingId: null });
      }
    },

    addPlayerScore: (playerId: PlayerId, points: number) => {
      const { players, winningScore } = get();
      console.log('[DEBUG] Adding score:', {
        playerId,
        points,
        currentScore: players[playerId]?.score,
        isKing: players[playerId]?.isKing,
        isLocalPlayer: playerId === get().localPlayerId,
      });
      if (players[playerId]) {
        const newScore = players[playerId].score + points;

        // Update score
        if (playerId === get().localPlayerId) {
          // Check if local player won BEFORE updating state
          if (newScore >= winningScore && !get().gameWinner) {
            console.log(`[GameStore] Local player ${playerId} has won with score ${newScore}!`);
            set({ gameWinner: playerId });
          }

          updateAndBroadcastPlayerState({ id: playerId, score: newScore });
        } else {
          // For remote players, update state directly without broadcasting
          const updatedPlayers = {
            ...players,
            [playerId]: { ...players[playerId], score: newScore },
          };

          // Check if remote player won
          if (newScore >= winningScore && !get().gameWinner) {
            console.log(`[GameStore] Remote player ${playerId} has won with score ${newScore}!`);
            set({ gameWinner: playerId, players: updatedPlayers });
          } else {
            set({ players: updatedPlayers });
          }
        }
      }
    },

    resetScores: () => {
      const { players, localPlayerId, peerManager } = get();

      // Reset all scores to 0 and respawn players to random positions
      const updatedPlayers = { ...players };
      Object.keys(updatedPlayers).forEach((playerId) => {
        // Reset score
        updatedPlayers[playerId].score = 0;

        // Generate new random position for respawn
        const newPosition = getRandomCornerPosition();
        updatedPlayers[playerId].position.copy(newPosition);

        // Reset king status
        updatedPlayers[playerId].isKing = false;
      });

      set({
        players: updatedPlayers,
        gameWinner: null,
        currentKingId: null,
        kingZoneOccupants: [],
      });

      // Respawn local player's physics body
      if (localPlayerId) {
        const localPlayerPosition = updatedPlayers[localPlayerId].position;

        // Respawn physics body via physics system
        import('@/systems/physics').then(({ respawnPlayerBody }) => {
          respawnPlayerBody(localPlayerId, localPlayerPosition);
        });

        // Send game reset announcement to all peers
        if (peerManager) {
          // First, broadcast a special game_reset message to notify all players
          peerManager.broadcast('game_reset', {
            initiator: localPlayerId,
            timestamp: Date.now(),
          });

          // Then broadcast position update for local player
          peerManager.broadcast('player_state_update', {
            id: localPlayerId,
            score: 0,
            position: localPlayerPosition,
            isKing: false,
          });
        }
      }
    },

    // Bomb mechanic
    useBombAbility: () => {
      const { localPlayerId, players, peerManager } = get();
      if (!localPlayerId || !peerManager) return;

      const localPlayer = players[localPlayerId];
      const currentTime = Date.now();

      // Check for hack mode to bypass cooldown
      const isHackMode =
        typeof window !== 'undefined' &&
        new URLSearchParams(window.location.search).get('hack') === 'true';

      // Check cooldown if not in hack mode
      if (!isHackMode && currentTime - localPlayer.lastBombTime < BOMB_COOLDOWN) {
        return; // Still on cooldown
      }

      // Update last bomb time
      const updatedPlayers = {
        ...players,
        [localPlayerId]: {
          ...localPlayer,
          lastBombTime: currentTime,
        },
      };
      set({ players: updatedPlayers });

      // Apply bomb locally through physics system
      import('@/systems/physics').then(({ applyBombEffect }) => {
        applyBombEffect(localPlayer.position, localPlayerId);
      });

      // Prepare the bomb payload
      const bombPayload = {
        playerId: localPlayerId,
        position: {
          x: localPlayer.position.x,
          y: localPlayer.position.y,
          z: localPlayer.position.z,
        },
        timestamp: currentTime,
      };

      // Broadcast bomb action to all peers using both event types for compatibility
      peerManager.broadcast('bomb_ability_used', bombPayload);

      // Also send as bomb_event which our new listener is watching for
      peerManager.broadcast('bomb_event', bombPayload);

      console.log(
        `[GameStore] Local player ${localPlayerId} used bomb ability at:`,
        localPlayer.position
      );
    },

    canUseBomb: () => {
      const { localPlayerId, players } = get();
      if (!localPlayerId) return false;

      // Check for hack mode to bypass cooldown
      if (
        typeof window !== 'undefined' &&
        new URLSearchParams(window.location.search).get('hack') === 'true'
      ) {
        return true;
      }

      const localPlayer = players[localPlayerId];
      return Date.now() - (localPlayer.lastBombTime || 0) >= BOMB_COOLDOWN;
    },

    // Joystick state implementation
    joystickDelta: { x: 0, y: 0 },
    setJoystickDelta: (delta) => set({ joystickDelta: delta }),

    // Physics
    initPhysics: async () => {
      await initPhysics();
    },
    updatePhysics: (delta) => {
      updatePhysics(delta);
    },

    // New action to change player skin
    changeSkin: (skinId: string) => {
      const { localPlayerId } = get();
      if (localPlayerId) {
        updateAndBroadcastPlayerState({ skin: skinId });
      }
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

// Add the function to get a random corner position
function getRandomCornerPosition(): Vector3 {
  // Map boundaries from mapPhysics.ts (MAP_SIZE = 30)
  const mapSizeHalf = 14; // Half of MAP_SIZE minus a little buffer
  const margin = 3; // Add margin from the exact corners

  // Define the four corners (x, z coordinates)
  const corners = [
    [-mapSizeHalf + margin, -mapSizeHalf + margin], // Northwest corner
    [mapSizeHalf - margin, -mapSizeHalf + margin], // Northeast corner
    [-mapSizeHalf + margin, mapSizeHalf - margin], // Southwest corner
    [mapSizeHalf - margin, mapSizeHalf - margin], // Southeast corner
  ];

  // Select a random corner
  const randomCorner = corners[Math.floor(Math.random() * corners.length)];

  // Return the position with y = 1 (slightly above ground)
  return new Vector3(randomCorner[0], 1, randomCorner[1]);
}
