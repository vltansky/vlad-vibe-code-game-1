import { GameNetworkManager, NetworkMode } from './game-network-manager';

/**
 * This example demonstrates how to use the GameNetworkManager for multiplayer networking
 * with both WebRTC peer-to-peer and fallback to Socket.IO
 */

// Create the network manager with default server URL and hybrid mode
export const networkManager = new GameNetworkManager(
  'http://localhost:8080', // Signaling server URL
  NetworkMode.HYBRID // Use WebRTC with signaling fallback
);

// Example: Set the update rate to 30 updates per second
networkManager.setUpdateRate(30);

// Example: Set the interpolation delay to smooth out network jitter
networkManager.setInterpolationDelay(100); // ms

// Connect to the network
networkManager.connect();

// Listen for network events
networkManager.on('connected', () => {
  console.log('Connected to network!');

  // Join a room after connecting
  const roomId = generateRoomCode();
  console.log(`Joining room: ${roomId}`);
  networkManager.joinRoom(roomId);
});

networkManager.on('player_joined', (playerId) => {
  console.log(`Player joined: ${playerId}`);
});

networkManager.on('player_left', (playerId) => {
  console.log(`Player left: ${playerId}`);
});

networkManager.on('player_update', (playerId, state) => {
  // Update the player in the game world
  console.log(`Received update from player ${playerId}:`, state);
});

networkManager.on('message', (playerId, data) => {
  console.log(`Received message from player ${playerId}:`, data);
});

networkManager.on('error', (error) => {
  console.error('Network error:', error);
});

// Example: Game loop update - call this in your main game loop
export function gameLoop() {
  // Apply network interpolation
  networkManager.update();

  // Get all player states
  const playerStates = networkManager.getPlayerStates();

  // Update game state using player states
  Object.entries(playerStates).forEach(([playerId, state]) => {
    // Example of using player states in game loop
    console.debug(`Player ${playerId} position:`, state.position);
  });

  requestAnimationFrame(gameLoop);
}

// Example: Update local player state
export function updateLocalPlayerPosition(position: [number, number, number]) {
  networkManager.updatePlayerState({
    position,
  });
}

// Example: Update local player rotation
export function updateLocalPlayerRotation(rotation: [number, number, number, number]) {
  networkManager.updatePlayerState({
    rotation,
  });
}

// Example: Send a custom message to all players
export function sendChatMessage(message: string) {
  networkManager.sendMessage({
    type: 'chat',
    text: message,
  });
}

// Example: Leave room and disconnect
export function leaveGame() {
  networkManager.leaveRoom();
  networkManager.disconnect();
}

// Helper function to generate a simple room code
export function generateRoomCode(): string {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let result = '';
  for (let i = 0; i < 4; i++) {
    result += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  return result;
}

// Comment out the auto-start to allow importing without side effects
// gameLoop();
