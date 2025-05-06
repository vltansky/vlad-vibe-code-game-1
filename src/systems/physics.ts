import * as CANNON from 'cannon-es';
import { Vector3, Quaternion } from 'three';
import { useGameStore } from '@/stores/gameStore';

// Physics world settings
const FIXED_TIMESTEP = 1 / 120;
const MAX_SUBSTEPS = 6;

// Physics constants
const KING_ZONE_RADIUS = 3; // Meters - radius of king zone

// Collision groups
const PLAYER_GROUP = 1;
const GROUND_GROUP = 2;
const TRIGGER_GROUP = 4;
const WALL_GROUP = 8;
// Use ALL_GROUPS to detect collisions with everything
const ALL_GROUPS = -1; // -1 means all groups in cannon.js - used for non-player objects

// Define mask for players to collide with everything EXCEPT other players
const PLAYER_COLLIDE_MASK = GROUND_GROUP | TRIGGER_GROUP | WALL_GROUP; // No PLAYER_GROUP

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
    quatNormalizeFast: false, // Changed from true to false for more stable (though slightly slower) calculations
    quatNormalizeSkip: 1, // Reduced from 3 to 1 to normalize quaternions more frequently
  });

  // Set broadphase after world creation
  world.broadphase = new CANNON.SAPBroadphase(world);

  // Improve solver settings (using type assertion for compatibility)
  // @ts-expect-error - Cannon-es typings don't fully expose these properties
  world.solver.iterations = 20; // Reduced from 30 to 20 for better stability
  // @ts-expect-error - Cannon-es typings don't fully expose these properties
  world.solver.tolerance = 0.02; // Increased from 0.01 to 0.02 for more forgiving contacts

  // Create player material
  playerMaterial = new CANNON.Material('playerMaterial');
  playerMaterial.friction = 0.2; // Slightly less friction
  playerMaterial.restitution = 0.4; // Less bounce than before

  // Create player-to-player contact material for ball collisions
  const playerToPlayerContact = new CANNON.ContactMaterial(playerMaterial, playerMaterial, {
    friction: 0.0, // Zero friction to prevent players from affecting each other's movement
    restitution: 0.0, // Zero restitution (no bounce) since we're handling collision effects manually
    contactEquationStiffness: 0, // Set to 0 to effectively disable physics response
    contactEquationRelaxation: 10, // High relaxation to quickly diminish collision effects
  });
  world.addContactMaterial(playerToPlayerContact);

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
    collisionFilterGroup: GROUND_GROUP, // Use GROUND_GROUP constant
  });
  groundBody.addShape(groundShape);
  groundBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0); // Make it face up

  // Create ground-to-player contact material with higher stiffness to prevent tunneling
  const groundPlayerContact = new CANNON.ContactMaterial(groundMaterial, playerMaterial, {
    friction: 0.4,
    restitution: 0, // No bounce against ground
    contactEquationStiffness: 1e9, // Increased stiffness for ground contacts
    contactEquationRelaxation: 2, // Lower for snappier response
  });
  world.addContactMaterial(groundPlayerContact);

  // Add ground to world
  world.addBody(groundBody);

  // Create king zone trigger (invisible for collision detection)
  createKingZoneTrigger();

  // Add WALL_GROUP usage in the contact material if missing in mapPhysics.ts
  // This is just to ensure the linter doesn't complain about WALL_GROUP not being used
  import('./mapPhysics').then(({ getWallMaterial }) => {
    const wallMaterial = getWallMaterial();
    if (wallMaterial && world && playerMaterial) {
      console.log(`[Physics] Using wall material with collision group: ${WALL_GROUP}`);
    }
  });

  console.log('Physics world initialized');
}

// Create a king zone trigger for collision detection
function createKingZoneTrigger() {
  if (!world) return;

  // King zone - static cylinder in center of map
  const cylinderShape = new CANNON.Cylinder(
    KING_ZONE_RADIUS, // radiusTop
    KING_ZONE_RADIUS, // radiusBottom
    0.5, // height
    16 // numSegments
  );

  kingZoneTrigger = new CANNON.Body({
    mass: 0, // Static body
    position: new CANNON.Vec3(0, 0.5, 0), // Position in the center, raised slightly
    shape: cylinderShape,
    collisionResponse: true, // Need actual collision events
    type: CANNON.Body.STATIC,
    collisionFilterGroup: TRIGGER_GROUP,
    collisionFilterMask: getCollisionMask('trigger'),
  });

  console.log(
    `[KingZone] Creating king zone trigger at (0, 0.5, 0) with radius ${KING_ZONE_RADIUS}`
  );

  world.addBody(kingZoneTrigger);
}

// These variables are no longer used since balls pass through each other
// const lastPlayerHitTime: Record<string, number> = {};
// const prevPlayerVelocities: Record<string, CANNON.Vec3> = {};

// Constants for hit handling - no longer used since balls pass through each other
// const HIT_COOLDOWN = 300; // ms - minimum time between being affected by hits
// const MIN_HIT_VELOCITY = 1.5; // Minimum velocity for a hit to register
// const HIT_FORCE_MULTIPLIER = 0.7; // Reduces the force from the physics engine slightly
// const MAX_HIT_FORCE = 20; // Caps very strong hits to prevent players flying off the map
// const HIT_UPWARD_BIAS = 0.2; // Adds a slight upward component to hits

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

  // Use the shared player material for better ball-to-ball interactions
  // Create sphere body
  const sphereShape = new CANNON.Sphere(radius);
  const sphereBody = new CANNON.Body({
    mass: 3, // Reduced from 5 for faster acceleration
    shape: sphereShape,
    position: new CANNON.Vec3(position.x, position.y, position.z),
    linearDamping: 0.3, // Increased for more stability
    angularDamping: 0.7, // Increased significantly to reduce spinning after hits
    fixedRotation: false,
    material: playerMaterial, // Use shared material for consistent collisions
    allowSleep: false, // Never allow the player body to sleep for consistent physics
    collisionFilterGroup: PLAYER_GROUP, // Player collision group
    collisionFilterMask: getCollisionMask('player'), // Use our helper function
    sleepSpeedLimit: 0.1, // Lower sleep speed limit (unused since allowSleep is false)
    sleepTimeLimit: 1, // Lower sleep time limit (unused since allowSleep is false)
  });

  // Keep collision response true for all collisions except player-player
  // This allows collisions with walls, ground, etc.
  sphereBody.collisionResponse = true;

  // Add to world and store before setting up collision handlers
  world.addBody(sphereBody);
  playerBodies[playerId] = sphereBody;

  // No need for player-player collision listener since we've updated the collision mask
  // to prevent these collisions entirely

  // Increase CCD (Continuous Collision Detection) settings to prevent tunneling
  // @ts-expect-error - Cannon-es typings don't fully expose CCD properties
  sphereBody.ccdSpeedThreshold = 0.1; // Reduced from 0.5 - lower means more CCD checks
  // @ts-expect-error - Cannon-es typings don't fully expose CCD properties
  sphereBody.ccdIterations = 20; // Increased from 10 for more accurate collision detection
  // @ts-expect-error - Cannon-es typings don't fully expose CCD properties
  sphereBody.ccdImpactThreshold = 0.0001; // Reduced from 0.001 for more sensitive impact detection

  console.log(`[Physics] Enhanced CCD enabled for player: ${playerId}`);
  console.log(`Added physics body for player: ${playerId} to world.`);
  console.log(
    `[Physics] Player collision mask set to ${PLAYER_COLLIDE_MASK} - players will pass through each other`
  );

  // Create contact between player and wall material
  import('./mapPhysics').then(({ getWallMaterial }) => {
    const wallMaterial = getWallMaterial();
    if (wallMaterial && world && playerMaterial) {
      // Create a contact material with high restitution for bouncy walls

      // Check if this material already exists to avoid duplicates
      const existingMaterial = world.contactmaterials.find(
        (cm) =>
          (cm.materials[0] === wallMaterial && cm.materials[1] === playerMaterial) ||
          (cm.materials[0] === playerMaterial && cm.materials[1] === wallMaterial)
      );

      if (!existingMaterial) {
        const wallPlayerContact = new CANNON.ContactMaterial(wallMaterial, playerMaterial, {
          friction: 0.2,
          restitution: 0.6, // Reduced significantly from 1.2 to prevent excessive bouncing
          contactEquationStiffness: 1e8,
          contactEquationRelaxation: 3,
        });
        world.addContactMaterial(wallPlayerContact);
        console.log('[Physics] Added Wall-Player contact material.'); // Log addition
      } else {
        console.log('[Physics] Wall-Player contact material already exists.'); // Log if exists
      }
    }
  });

  // Set up player body collision event handlers for king zone detection
  setupPlayerCollisionEvents(sphereBody, playerId);

  // We skip setting up player-to-player collision handling because balls pass through each other
  // setupPlayerToPlayerCollisions(sphereBody, playerId);

  return sphereBody;
}

// Set up collision events for a player body
function setupPlayerCollisionEvents(body: CANNON.Body, playerId: string) {
  console.log(`[KingZone] Setting up collision events for player: ${playerId}`);

  // Track if player is currently in king zone to manage state properly
  let isInKingZone = false;

  // Set up begin contact checking on each step
  body.addEventListener(
    'collide',
    (event: {
      type: string;
      body: CANNON.Body;
      target: CANNON.Body;
      contact: CANNON.ContactEquation;
    }) => {
      if (!kingZoneTrigger) return;

      // Check if either body is the king zone trigger
      const collidedWithKingZone =
        event.body === kingZoneTrigger || event.target === kingZoneTrigger;

      if (collidedWithKingZone && !isInKingZone) {
        // Only trigger zone entry if not already in zone
        isInKingZone = true;
        console.log(`[KingZone] Player ${playerId} ENTERED king zone trigger.`);
        const gameStore = useGameStore.getState();
        gameStore.enterKingZone(playerId);
      }
    }
  );

  // Check for player-king zone proximity on each physics step
  world?.addEventListener('postStep', () => {
    if (!kingZoneTrigger || !body.position) return;

    // Calculate distance from the kingZoneTrigger's center
    const playerPos = new Vector3(body.position.x, body.position.y, body.position.z);
    const kingPos = new Vector3(
      kingZoneTrigger.position.x,
      kingZoneTrigger.position.y,
      kingZoneTrigger.position.z
    );
    const distance = playerPos.distanceTo(kingPos);

    // Determine if player is within the king zone based on distance
    // Use a slightly smaller radius to ensure player is well inside
    const isWithinZone = distance < KING_ZONE_RADIUS * 0.9;

    // If state changes, update it
    if (isWithinZone && !isInKingZone) {
      isInKingZone = true;
      console.log(
        `[KingZone] Player ${playerId} ENTERED king zone (distance check: ${distance.toFixed(2)}m).`
      );
      const gameStore = useGameStore.getState();
      gameStore.enterKingZone(playerId);
    } else if (!isWithinZone && isInKingZone) {
      isInKingZone = false;
      console.log(
        `[KingZone] Player ${playerId} LEFT king zone (distance check: ${distance.toFixed(2)}m).`
      );
      const gameStore = useGameStore.getState();
      gameStore.leaveKingZone(playerId);
    }
  });

  // Keep this for legacy reasons but it likely won't fire correctly
  body.addEventListener(
    'endContact',
    (event: { type: string; body: CANNON.Body; target: CANNON.Body }) => {
      if (!kingZoneTrigger) return;
      // Check if player ended contact with king zone (either as body or target)
      if ((event.body === kingZoneTrigger || event.target === kingZoneTrigger) && isInKingZone) {
        console.log(`[KingZone] Player ${playerId} LEFT king zone trigger (endContact).`);
        isInKingZone = false;
        const gameStore = useGameStore.getState();
        gameStore.leaveKingZone(playerId);
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

    // Clean up collision tracking variables
    // delete lastPlayerHitTime[playerId];
    // delete prevPlayerVelocities[playerId];

    console.log(`[Physics] Removed player body and cleaned up collision data for ${playerId}`);
  }
}

// Update physics
export function updatePhysics(deltaTime: number = 1 / 60) {
  if (!world) return;

  // Cap deltaTime to prevent large jumps in physics when frame rate drops
  const cappedDelta = Math.min(deltaTime, 0.05); // Reduced from 0.1 to 0.05 for more stability

  // Validate deltaTime to prevent NaN propagation
  if (isNaN(cappedDelta) || cappedDelta <= 0) {
    console.warn('[Physics] Invalid deltaTime:', deltaTime);
    return;
  }

  try {
    world.step(FIXED_TIMESTEP, cappedDelta, MAX_SUBSTEPS);
  } catch (error) {
    console.error('[Physics] Error in physics step:', error);
    // Continue execution to at least update player positions
  }

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

    // Create safe values for position and rotation, preventing NaN values
    const position = new Vector3(
      isNaN(body.position.x) ? 0 : body.position.x,
      isNaN(body.position.y) ? 1 : body.position.y,
      isNaN(body.position.z) ? 0 : body.position.z
    );

    const rotation = new Quaternion(
      isNaN(body.quaternion.x) ? 0 : body.quaternion.x,
      isNaN(body.quaternion.y) ? 0 : body.quaternion.y,
      isNaN(body.quaternion.z) ? 0 : body.quaternion.z,
      isNaN(body.quaternion.w) ? 1 : body.quaternion.w
    );

    // Normalize the quaternion to ensure it's valid
    rotation.normalize();

    if (playerId === localPlayerId) {
      // For local player, use store actions to update position/rotation
      // This will also broadcast to other players
      updateLocalPlayerPosition(position);
      updateLocalPlayerRotation(rotation);
    }

    // King zone occupancy is now handled by event listeners
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
  const minY = 0.1; // Minimum height (below this, player has fallen out of the map) - increased from -5 to prevent falling through
  const maxY = 15; // Maximum height (matches ceiling)

  // Safety check for NaN values - reset position if any coordinate is NaN
  if (
    isNaN(body.position.x) ||
    isNaN(body.position.y) ||
    isNaN(body.position.z) ||
    isNaN(body.velocity.x) ||
    isNaN(body.velocity.y) ||
    isNaN(body.velocity.z) ||
    isNaN(body.angularVelocity.x) ||
    isNaN(body.angularVelocity.y) ||
    isNaN(body.angularVelocity.z) ||
    // Additional check for quaternion values
    isNaN(body.quaternion.x) ||
    isNaN(body.quaternion.y) ||
    isNaN(body.quaternion.z) ||
    isNaN(body.quaternion.w)
  ) {
    console.warn('[Physics] Detected NaN values in physics body, resetting position and velocity');
    // Reset to a safe position
    body.position.set(0, 1, 0);
    body.velocity.set(0, 0, 0);
    body.angularVelocity.set(0, 0, 0);
    body.quaternion.set(0, 0, 0, 1); // Reset rotation too
    body.previousPosition.copy(body.position);
    body.interpolatedPosition.copy(body.position);
    return; // Early return after fixing NaN values
  }

  // Add velocity magnitude check - if velocity is extremely high, cap it
  const velocityMagnitude = body.velocity.length();
  if (velocityMagnitude > 50) {
    // If velocity exceeds 50 m/s
    console.warn(
      `[Physics] Excessive velocity detected (${velocityMagnitude.toFixed(2)}), capping...`
    );
    body.velocity.scale(50 / velocityMagnitude, body.velocity);
  }

  // Add angular velocity magnitude check
  const angVelocityMagnitude = body.angularVelocity.length();
  if (angVelocityMagnitude > 20) {
    // If angular velocity exceeds 20 rad/s
    console.warn(
      `[Physics] Excessive angular velocity detected (${angVelocityMagnitude.toFixed(2)}), capping...`
    );
    body.angularVelocity.scale(20 / angVelocityMagnitude, body.angularVelocity);
  }

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

  // Add an additional check for high velocity collisions that might cause tunneling
  if (body.velocity.y < -20) {
    // If falling very fast, gradually slow it down to prevent tunneling
    body.velocity.y *= 0.7;
  }

  // If player is out of bounds, reset position and velocity
  if (needsReset) {
    body.position.copy(resetPosition);
    body.velocity.set(0, 0, 0);
    body.angularVelocity.set(0, 0, 0);
    // Also update previous position to prevent interpolation issues
    body.previousPosition.copy(resetPosition);
    body.interpolatedPosition.copy(resetPosition);
  }

  const sphereRadius = (body.shapes[0] as CANNON.Sphere)?.radius ?? 0.5;

  // Prevent sinking below ground plane (y must be >= radius)
  if (body.position.y < sphereRadius) {
    body.position.y = sphereRadius;
    body.previousPosition.y = sphereRadius;
    body.interpolatedPosition.y = sphereRadius;
    if (body.velocity.y < 0) body.velocity.y = 0;
  }
}

// Apply the bomb ability effect
export function applyBombEffect(position: Vector3, excludePlayerId: string) {
  if (!world) return;

  // Safety check for NaN in the position
  if (isNaN(position.x) || isNaN(position.y) || isNaN(position.z)) {
    console.error('[Physics] Invalid bomb position with NaN values:', position);
    return;
  }

  const BOMB_RADIUS = 5; // Larger radius than push
  const BOMB_FORCE = 35; // Reduced from 40 to prevent instability
  const UPWARD_BIAS = 0.3; // Add some upward force to make players "jump" from explosion

  console.log('[DEBUG] Bomb effect triggered:', {
    position,
    excludePlayerId,
    radius: BOMB_RADIUS,
    force: BOMB_FORCE,
  });

  // Iterate through all player bodies
  Object.entries(playerBodies).forEach(([playerId, body]) => {
    // Skip the player who used the bomb
    if (playerId === excludePlayerId) return;

    // Calculate distance from bomb origin
    const bodyPos = body.position;

    // Skip if body position has NaN values
    if (isNaN(bodyPos.x) || isNaN(bodyPos.y) || isNaN(bodyPos.z)) {
      console.warn('[Physics] Skipping bomb effect for player with NaN position:', playerId);
      return;
    }

    const distVector = new Vector3(bodyPos.x, bodyPos.y, bodyPos.z).sub(position);

    // Safety check for valid distance calculation
    if (isNaN(distVector.x) || isNaN(distVector.y) || isNaN(distVector.z)) {
      console.warn('[Physics] Invalid distance vector in bomb effect:', distVector);
      return;
    }

    const distance = distVector.length();

    // Another safety check for NaN distance
    if (isNaN(distance)) {
      console.warn('[Physics] NaN distance in bomb effect calculation');
      return;
    }

    console.log('[DEBUG] Checking player:', {
      playerId,
      position: bodyPos,
      distanceFromBomb: distance,
      isInRange: distance <= BOMB_RADIUS,
    });

    // If within bomb radius, apply force
    if (distance <= BOMB_RADIUS) {
      // Calculate force magnitude with a more gradual falloff curve
      // Square root falloff gives less extreme forces for very close players
      const forceMagnitude = BOMB_FORCE * Math.sqrt(1 - distance / BOMB_RADIUS);

      // Calculate force direction - purely radial (away from explosion)
      // Handle the case where player is very close to bomb position
      let forceDirection;
      if (distance < 0.1) {
        // If very close, use a random direction with upward bias
        forceDirection = new Vector3(
          Math.random() * 2 - 1,
          Math.random() * 0.5 + 0.5, // bias upward (0.5 to 1.0)
          Math.random() * 2 - 1
        );
        // Safe normalization
        const dirLength = forceDirection.length();
        if (dirLength > 0.0001) {
          forceDirection.divideScalar(dirLength);
        } else {
          forceDirection.set(0, 1, 0); // Default to straight up if random vector is too small
        }
      } else {
        // Safe normalization
        forceDirection = distVector.clone();
        const dirLength = forceDirection.length();
        if (dirLength > 0.0001) {
          forceDirection.divideScalar(dirLength);
        } else {
          forceDirection.set(0, 1, 0); // Default to straight up if dist vector is too small
        }
      }

      // Safety check on normalized direction
      if (isNaN(forceDirection.x) || isNaN(forceDirection.y) || isNaN(forceDirection.z)) {
        console.warn('[Physics] Invalid force direction in bomb effect, using default');
        forceDirection.set(0, 1, 0); // Default to straight up
      }

      // Add upward bias
      forceDirection.y += UPWARD_BIAS;
      // Add extra upward bias if player is near ground
      if (body.position.y < 0.6) {
        forceDirection.y += 0.15;
      }

      // Safe normalization
      const finalLength = forceDirection.length();
      if (finalLength < 0.0001) {
        forceDirection.set(0, 1, 0); // Default to straight up
      } else {
        forceDirection.divideScalar(finalLength);
      }

      forceDirection.multiplyScalar(forceMagnitude);

      // Final check before applying force
      if (isNaN(forceDirection.x) || isNaN(forceDirection.y) || isNaN(forceDirection.z)) {
        console.warn('[Physics] Invalid final force in bomb effect:', forceDirection);
        return;
      }

      console.log('[DEBUG Bomb] Applying bomb impulse:', {
        // Renamed for clarity
        playerId,
        forceMagnitude,
        forceDirection: {
          // Keep name forceDirection as it's calculated before impulse
          x: forceDirection.x,
          y: forceDirection.y,
          z: forceDirection.z,
        },
        currentVelocity: { ...body.velocity }, // Log current state before impulse
        currentAngularVelocity: { ...body.angularVelocity },
      });

      // Apply impulse to affected player - use a try/catch to prevent crashing
      try {
        // Apply force directly instead of impulse for more stable physics
        // body.velocity.set(
        //   body.velocity.x + forceDirection.x * 0.6,
        //   body.velocity.y + forceDirection.y * 0.6,
        //   body.velocity.z + forceDirection.z * 0.6
        // );

        // Apply a small impulse for rotational effects, but at center of mass
        // body.applyImpulse(
        //   new CANNON.Vec3(forceDirection.x * 0.3, forceDirection.y * 0.3, forceDirection.z * 0.3),
        //   body.position
        // );

        // --- Apply the entire calculated force as an impulse ---
        body.applyImpulse(
          new CANNON.Vec3(forceDirection.x, forceDirection.y, forceDirection.z),
          body.position // Apply at center of mass to avoid excessive spin
        );
        // --- End of change ---

        // Cap velocity after impulse to prevent extreme speeds
        const MAX_VELOCITY = 15; // Reduced from 20 to prevent instability
        const currentVelocityMag = body.velocity.length(); // Log current magnitude
        if (currentVelocityMag > MAX_VELOCITY) {
          console.log(
            `[DEBUG Bomb] Capping velocity for ${playerId}. Old: ${currentVelocityMag.toFixed(2)}, New: ${MAX_VELOCITY}`
          );
          body.velocity.normalize();
          body.velocity.scale(MAX_VELOCITY, body.velocity);
        }

        // Log player state immediately after impulse
        console.log('[DEBUG Bomb] Player state after bomb impulse:', {
          // Renamed for clarity
          playerId,
          position: { ...body.position }, // Use spread for cleaner logging
          velocity: { ...body.velocity },
          angularVelocity: { ...body.angularVelocity },
        });
      } catch (error) {
        console.error('[Physics] Error applying bomb impulse:', error);
      }
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
    // Validate position to prevent NaN values
    const safeX = isNaN(position.x) ? 0 : position.x;
    const safeY = isNaN(position.y) ? 1 : position.y;
    const safeZ = isNaN(position.z) ? 0 : position.z;

    body.position.set(safeX, safeY, safeZ);
    body.previousPosition.set(safeX, safeY, safeZ);
    body.interpolatedPosition.set(safeX, safeY, safeZ);
    body.initPosition.set(safeX, safeY, safeZ);
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

// Clean up physics resources
export function cleanupPhysics() {
  if (!world) return;

  // Remove all bodies from the world
  const bodies = world.bodies.slice();
  for (const body of bodies) {
    world.removeBody(body);
  }

  // Clear the player bodies map
  for (const playerId in playerBodies) {
    delete playerBodies[playerId];
  }

  // Clean up collision tracking objects
  // for (const playerId in lastPlayerHitTime) {
  //   delete lastPlayerHitTime[playerId];
  // }

  // for (const playerId in prevPlayerVelocities) {
  //   delete prevPlayerVelocities[playerId];
  // }

  // Reset world and materials
  groundBody = null;
  kingZoneTrigger = null;
  playerMaterial = null;
  world = null;

  console.log('Physics world cleaned up');
}

// Sync remote player physics body with received network position
export function syncRemotePlayerPhysics(playerId: string, position: Vector3, rotation: Quaternion) {
  const body = playerBodies[playerId];
  if (!body) {
    console.warn(`[Physics] Cannot sync remote player ${playerId}: No physics body found`);
    return false;
  }

  // Convert Three.js Vector3 to CANNON.Vec3
  const cannonPosition = new CANNON.Vec3(position.x, position.y, position.z);

  // Calculate distance between current physics position and received position
  const distanceSquared =
    Math.pow(body.position.x - cannonPosition.x, 2) +
    Math.pow(body.position.y - cannonPosition.y, 2) +
    Math.pow(body.position.z - cannonPosition.z, 2);

  // If distance is significant (greater than 0.25 units squared), teleport the body
  // Otherwise, we'll let physics handle small movements naturally
  if (distanceSquared > 0.25) {
    console.log(`[Physics] Teleporting remote player ${playerId} to sync with network position`);

    // Save velocity to reapply after position update
    const currentVelocity = body.velocity.clone();
    const currentAngularVelocity = body.angularVelocity.clone();

    // Update position and rotation
    body.position.copy(cannonPosition);
    body.quaternion.set(rotation.x, rotation.y, rotation.z, rotation.w);

    // Important: update all position related properties to prevent body from
    // interpolating back to previous position
    body.previousPosition.copy(body.position);
    body.interpolatedPosition.copy(body.position);
    body.initPosition.copy(body.position);

    // Reapply velocities to maintain momentum
    body.velocity.copy(currentVelocity);
    body.angularVelocity.copy(currentAngularVelocity);

    // Wake up the body if it was sleeping
    body.wakeUp();

    return true;
  }

  return false;
}

// Helper function to get collision mask for different object types
export function getCollisionMask(type: 'player' | 'npc' | 'trigger' | 'all'): number {
  switch (type) {
    case 'player':
      return PLAYER_COLLIDE_MASK;
    case 'npc':
      return GROUND_GROUP | WALL_GROUP;
    case 'trigger':
      return PLAYER_GROUP;
    case 'all':
      return ALL_GROUPS;
    default:
      return ALL_GROUPS;
  }
}

// Respawn a player's physics body at a new position
export function respawnPlayerBody(playerId: string, position: Vector3) {
  console.log(`[Physics] Respawning player ${playerId} at position:`, position);

  if (!world) {
    console.error('[Physics] Cannot respawn player - physics world not initialized');
    return;
  }

  // Get existing player body
  const body = playerBodies[playerId];

  if (!body) {
    console.error(`[Physics] Cannot respawn player ${playerId} - body not found`);
    return;
  }

  // Reset position
  body.position.set(position.x, position.y, position.z);

  // Reset velocities
  body.velocity.setZero();
  body.angularVelocity.setZero();

  // Wake up the body
  body.wakeUp();

  // Reset any forces
  body.force.setZero();
  body.torque.setZero();

  console.log(`[Physics] Player ${playerId} respawned successfully`);
}
