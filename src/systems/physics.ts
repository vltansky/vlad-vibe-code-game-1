import * as CANNON from 'cannon-es';
import { Vector3, Quaternion } from 'three';
import { useGameStore } from '@/stores/gameStore';

// Physics world settings
const FIXED_TIMESTEP = 1 / 60;
const MAX_SUBSTEPS = 5;

// Physics constants
const PUSH_FORCE = 40; // Force applied by push ability
const PUSH_RADIUS = 3; // Meters - radius of push effect
const KING_ZONE_RADIUS = 3; // Meters - radius of king zone

// Physics world
let world: CANNON.World | null = null;

// Player material - Define here to be shared with mapPhysics
let playerMaterial: CANNON.Material | null = null;

// Map of player IDs to physics bodies
const playerBodies: Record<string, CANNON.Body> = {};

// Ground body
let groundBody: CANNON.Body | null = null;

// King zone trigger body (used for collision detection)
let kingZoneTrigger: CANNON.Body | null = null;

// Expose world for map physics
export function getPhysicsWorld(): CANNON.World | null {
  return world;
}

// Expose player material for map physics
export function getPlayerMaterial(): CANNON.Material | null {
  return playerMaterial;
}

// Initialize the physics world
export function initPhysics() {
  // Create world
  world = new CANNON.World({
    gravity: new CANNON.Vec3(0, -9.81, 0),
    allowSleep: true, // Allow bodies to sleep for performance
    quatNormalizeFast: true, // Use fast quaternion normalization
    quatNormalizeSkip: 3, // Skip quaternion normalization every N steps
  });

  // Set broadphase after world creation
  world.broadphase = new CANNON.SAPBroadphase(world);

  // Improve solver settings (using type assertion for compatibility)
  // @ts-expect-error - Cannon-es typings don't fully expose these properties
  world.solver.iterations = 6; // Reduced from 10 for better performance
  // @ts-expect-error - Cannon-es typings don't fully expose these properties
  world.solver.tolerance = 0.2; // Increased for better performance

  // Create player material
  playerMaterial = new CANNON.Material('playerMaterial');
  playerMaterial.friction = 0.2; // Slightly less friction
  playerMaterial.restitution = 0.4; // Less bounce than before

  // Create ground material
  const groundMaterial = new CANNON.Material('groundMaterial');
  groundMaterial.friction = 0.4;
  groundMaterial.restitution = 0.1;

  // Create ground
  const groundShape = new CANNON.Plane();
  groundBody = new CANNON.Body({
    mass: 0, // Static body
    type: CANNON.Body.STATIC,
    material: groundMaterial,
  });
  groundBody.addShape(groundShape);
  groundBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0); // Make it face up

  // Add ground to world
  world.addBody(groundBody);

  // Create king zone trigger (invisible for collision detection)
  createKingZoneTrigger();

  console.log('Physics world initialized');
}

// Create a king zone trigger for collision detection
function createKingZoneTrigger() {
  if (!world) return;

  // Create a cylinder shape for the king zone
  const kingZoneShape = new CANNON.Cylinder(
    KING_ZONE_RADIUS, // radiusTop
    KING_ZONE_RADIUS, // radiusBottom
    0.1, // height (thin cylinder)
    16 // numSegments
  );

  // Create trigger body - a non-colliding trigger
  kingZoneTrigger = new CANNON.Body({
    mass: 0, // Static body
    type: CANNON.Body.STATIC,
    collisionResponse: false, // Doesn't affect physics, just detects
    position: new CANNON.Vec3(0, 0.35, 0), // Slightly above the center platform
  });

  kingZoneTrigger.addShape(kingZoneShape);
  world.addBody(kingZoneTrigger);
}

// Create a physics body for a player
export function createPlayerBody(playerId: string, position: Vector3, radius: number = 0.5) {
  console.log(`Attempting to create physics body for player: ${playerId}`); // Log entry

  if (!world || !playerMaterial) {
    console.error(
      `Physics world or material not ready for player: ${playerId}. World: ${!!world}, Material: ${!!playerMaterial}`
    ); // Log error if not ready
    return null;
  }

  console.log(`Creating physics body for player: ${playerId} at`, position); // Log actual creation

  // Create sphere body using the shared player material
  const sphereShape = new CANNON.Sphere(radius);
  const sphereBody = new CANNON.Body({
    mass: 3, // Reduced from 5 for faster acceleration
    shape: sphereShape,
    position: new CANNON.Vec3(position.x, position.y, position.z),
    linearDamping: 0.1, // Further reduced from 0.2 for less resistance
    angularDamping: 0.1, // Further reduced from 0.2 for less resistance
    fixedRotation: false,
    material: playerMaterial,
  });

  // Add to world
  world.addBody(sphereBody);
  console.log(`Added physics body for player: ${playerId} to world.`); // Log addition

  // Store in player bodies map
  playerBodies[playerId] = sphereBody;

  // Set up player body collision event handlers for king zone detection
  setupPlayerCollisionEvents(sphereBody, playerId);

  return sphereBody;
}

// Set up collision events for a player body
function setupPlayerCollisionEvents(body: CANNON.Body, playerId: string) {
  // Set up a king zone collision handler for this player
  body.addEventListener(
    'collide',
    (event: { type: string; body: CANNON.Body; target: CANNON.Body }) => {
      if (!kingZoneTrigger) return;

      // Check if player collided with king zone
      if (event.body === kingZoneTrigger) {
        const gameStore = useGameStore.getState();
        gameStore.enterKingZone(playerId);
      }
    }
  );
}

// Remove a player's physics body
export function removePlayerBody(playerId: string) {
  if (!world) return;

  const body = playerBodies[playerId];
  if (body) {
    world.removeBody(body);
    delete playerBodies[playerId];
  }
}

// Update physics
export function updatePhysics(deltaTime: number = 1 / 60) {
  if (!world) return;

  // Cap deltaTime to prevent large jumps in physics when frame rate drops
  const cappedDelta = Math.min(deltaTime, 0.1);

  world.step(FIXED_TIMESTEP, cappedDelta, MAX_SUBSTEPS);

  // Update all player meshes from physics bodies
  const gameState = useGameStore.getState();
  const updateLocalPlayerPosition = gameState.updateLocalPlayerPosition;
  const updateLocalPlayerRotation = gameState.updateLocalPlayerRotation;
  const localPlayerId = gameState.localPlayerId;

  Object.entries(playerBodies).forEach(([playerId, body]) => {
    // Skip sleeping bodies to improve performance
    if (body.sleepState === CANNON.Body.SLEEPING) return;

    // Add boundary check to prevent players from escaping the map
    checkAndResetPlayerBoundary(body);

    const position = new Vector3(body.position.x, body.position.y, body.position.z);
    const rotation = new Quaternion(
      body.quaternion.x,
      body.quaternion.y,
      body.quaternion.z,
      body.quaternion.w
    );

    if (playerId === localPlayerId) {
      // For local player, use store actions to update position/rotation
      // This will also broadcast to other players
      updateLocalPlayerPosition(position);
      updateLocalPlayerRotation(rotation);
    } else {
      // For remote players, update directly without broadcasting
      if (gameState.players[playerId]) {
        gameState.players[playerId].position.copy(position);
        gameState.players[playerId].rotation.copy(rotation);
      }
    }

    // Check if player is still in king zone
    // We do this every frame for all players
    checkKingZoneOccupancy(playerId, position);
  });

  // If there's a current king, add points
  const { currentKingId } = gameState;
  if (currentKingId) {
    // Add 1 point per second (scale by delta time)
    gameState.addPlayerScore(currentKingId, cappedDelta);
  }
}

// Check if a player is outside the map boundaries and reset if needed
function checkAndResetPlayerBoundary(body: CANNON.Body) {
  // Map boundaries - use slightly smaller than actual map to account for ball radius
  const mapSizeHalf = 14; // Half of MAP_SIZE from mapPhysics.ts (30/2 = 15, minus 1 for buffer)
  const minY = -5; // Minimum height (below this, player has fallen out of the map)
  const maxY = 15; // Maximum height (matches ceiling)

  let needsReset = false;
  const resetPosition = new CANNON.Vec3();

  // Check X boundary
  if (Math.abs(body.position.x) > mapSizeHalf) {
    needsReset = true;
    resetPosition.x = Math.sign(body.position.x) * (mapSizeHalf - 1);
  } else {
    resetPosition.x = body.position.x;
  }

  // Check Z boundary
  if (Math.abs(body.position.z) > mapSizeHalf) {
    needsReset = true;
    resetPosition.z = Math.sign(body.position.z) * (mapSizeHalf - 1);
  } else {
    resetPosition.z = body.position.z;
  }

  // Check Y boundary (falling out or too high)
  if (body.position.y < minY || body.position.y > maxY) {
    needsReset = true;
    resetPosition.y = 1; // Reset slightly above ground
  } else {
    resetPosition.y = body.position.y;
  }

  // If player is out of bounds, reset position and velocity
  if (needsReset) {
    body.position.copy(resetPosition);
    body.velocity.set(0, 0, 0);
    body.angularVelocity.set(0, 0, 0);
  }
}

// Check if a player is in the king zone
function checkKingZoneOccupancy(playerId: string, position: Vector3) {
  // No king zone physics when not set up yet
  if (!kingZoneTrigger) return;

  const gameStore = useGameStore.getState();

  // Check if player is within king zone radius
  // Since the king zone is at (0, 0.35, 0), we only need to check x and z
  const xzDistance = Math.sqrt(position.x * position.x + position.z * position.z);

  // If within radius, mark as in king zone
  if (xzDistance <= KING_ZONE_RADIUS) {
    // If player wasn't already in king zone, add them
    if (!gameStore.kingZoneOccupants.includes(playerId)) {
      gameStore.enterKingZone(playerId);
    }
  } else {
    // If player was in king zone, remove them
    if (gameStore.kingZoneOccupants.includes(playerId)) {
      gameStore.leaveKingZone(playerId);
    }
  }
}

// Apply the push ability effect
export function applyPushEffect(position: Vector3, direction: Vector3, excludePlayerId: string) {
  if (!world) return;

  // Normalize direction
  const normalizedDirection = direction.clone().normalize();

  // Iterate through all player bodies
  Object.entries(playerBodies).forEach(([playerId, body]) => {
    // Skip the player who used the push
    if (playerId === excludePlayerId) return;

    // Calculate distance from push origin
    const bodyPos = body.position;
    const distVector = new Vector3(bodyPos.x, bodyPos.y, bodyPos.z).sub(position);
    const distance = distVector.length();

    // If within push radius, apply force
    if (distance <= PUSH_RADIUS) {
      // Calculate force magnitude (stronger closer to center)
      const forceMagnitude = PUSH_FORCE * (1 - distance / PUSH_RADIUS);

      // Calculate force direction
      // This creates a cone-shaped push effect in the direction the player is facing
      const pushDirection = new Vector3();
      pushDirection.copy(normalizedDirection).multiplyScalar(0.7); // 70% in player's facing direction
      pushDirection.add(distVector.normalize().multiplyScalar(0.3)); // 30% away from player
      pushDirection.normalize().multiplyScalar(forceMagnitude);

      // Apply impulse to affected player
      body.applyImpulse(
        new CANNON.Vec3(pushDirection.x, pushDirection.y, pushDirection.z),
        new CANNON.Vec3(bodyPos.x, bodyPos.y, bodyPos.z)
      );
    }
  });
}

// Apply force to a player's body
export function applyForceToPlayer(playerId: string, force: Vector3) {
  const body = playerBodies[playerId];
  if (body) {
    body.applyForce(new CANNON.Vec3(force.x, force.y, force.z));
  }
}

// Apply impulse to a player's body
export function applyImpulseToPlayer(playerId: string, impulse: Vector3, worldPoint?: Vector3) {
  const body = playerBodies[playerId];
  if (body) {
    if (worldPoint) {
      body.applyImpulse(
        new CANNON.Vec3(impulse.x, impulse.y, impulse.z),
        new CANNON.Vec3(worldPoint.x, worldPoint.y, worldPoint.z)
      );
    } else {
      body.applyImpulse(new CANNON.Vec3(impulse.x, impulse.y, impulse.z));
    }
  }
}

// Set player body position directly
export function setPlayerBodyPosition(playerId: string, position: Vector3) {
  const body = playerBodies[playerId];
  if (body) {
    body.position.set(position.x, position.y, position.z);
    body.previousPosition.set(position.x, position.y, position.z);
    body.interpolatedPosition.set(position.x, position.y, position.z);
    body.initPosition.set(position.x, position.y, position.z);
  }
}

// Set player body velocity
export function setPlayerBodyVelocity(playerId: string, velocity: Vector3) {
  const body = playerBodies[playerId];
  if (body) {
    body.velocity.set(velocity.x, velocity.y, velocity.z);
    body.initVelocity.set(velocity.x, velocity.y, velocity.z);
  }
}

// Get player body position
export function getPlayerBodyPosition(playerId: string): Vector3 | null {
  const body = playerBodies[playerId];
  if (body) {
    return new Vector3(body.position.x, body.position.y, body.position.z);
  }
  return null;
}

// Get player body velocity
export function getPlayerBodyVelocity(playerId: string): Vector3 | null {
  const body = playerBodies[playerId];
  if (body) {
    return new Vector3(body.velocity.x, body.velocity.y, body.velocity.z);
  }
  return null;
}

// Get player body rotation
export function getPlayerBodyRotation(playerId: string): Quaternion | null {
  const body = playerBodies[playerId];
  if (body) {
    return new Quaternion(
      body.quaternion.x,
      body.quaternion.y,
      body.quaternion.z,
      body.quaternion.w
    );
  }
  return null;
}

// Clean up physics
export function cleanupPhysics() {
  if (world) {
    // Clean up map physics first
    import('./mapPhysics')
      .then(({ cleanupMapPhysics }) => {
        cleanupMapPhysics();
      })
      .catch((error) => {
        console.error('Failed to import mapPhysics for cleanup:', error);
      });

    // Clean up all players
    Object.keys(playerBodies).forEach((playerId) => {
      removePlayerBody(playerId);
    });

    // Remove the king zone trigger
    if (kingZoneTrigger) {
      world.removeBody(kingZoneTrigger);
      kingZoneTrigger = null;
    }

    // Remove ground
    if (groundBody) {
      world.removeBody(groundBody);
      groundBody = null;
    }

    // Clear the world
    world = null;
    console.log('Physics cleaned up');
  }
}
