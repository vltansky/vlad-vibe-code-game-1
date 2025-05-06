import { useEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Vector3 } from 'three';
import {
  applyImpulseToPlayer,
  applyForceToPlayer,
  getPlayerBodyPosition,
  setPlayerBodyPosition,
  setPlayerBodyVelocity,
  getPlayerBodyVelocity,
} from '@/systems/physics';
import { useGameStore } from '@/stores/gameStore';

const MOVEMENT_IMPULSE = 75; // Increased from 45 for faster movement
const JUMP_IMPULSE = 30; // Increased jump force
// const MAX_VELOCITY = 10; // Maximum velocity clamp (optional, unused for now)
const JUMP_COOLDOWN = 1000; // 1 second cooldown
const OUT_OF_BOUNDS_Y = -5; // Increased threshold to catch falls sooner
const SAFE_SPAWN_HEIGHT = 2; // Height to spawn above ground
const STUCK_TIMEOUT = 10000; // Time in ms to consider player stuck if not moving
const MIN_MOVEMENT_THRESHOLD = 0.01; // Minimum movement to consider player not stuck
const MAP_SIZE_HALF = 14; // Map boundary size (half width/length)
const WALL_BOUNCE_MULTIPLIER = 0.8; // Bounce force multiplier (0.8 = 80% of incoming velocity)

// Define a fallback implementation of getRandomCornerPosition
function getRandomCornerPositionFallback(): Vector3 {
  const margin = 3; // Add margin from the exact corners

  const corners = [
    [-MAP_SIZE_HALF + margin, -MAP_SIZE_HALF + margin], // Northwest corner
    [MAP_SIZE_HALF - margin, -MAP_SIZE_HALF + margin], // Northeast corner
    [-MAP_SIZE_HALF + margin, MAP_SIZE_HALF - margin], // Southwest corner
    [MAP_SIZE_HALF - margin, MAP_SIZE_HALF - margin], // Southeast corner
  ];
  const randomCorner = corners[Math.floor(Math.random() * corners.length)];
  return new Vector3(randomCorner[0], SAFE_SPAWN_HEIGHT, randomCorner[1]);
}

export function usePlayerControls() {
  const localPlayerId = useGameStore((state) => state.localPlayerId);
  const joystickDelta = useGameStore((state) => state.joystickDelta);

  const controls = useRef<Record<string, boolean>>({
    forward: false,
    backward: false,
    left: false,
    right: false,
    jump: false,
    push: false,
  });
  const canJump = useRef(true);
  const jumpTimeout = useRef<NodeJS.Timeout | null>(null);

  // For detecting stuck state
  const lastPosition = useRef<Vector3 | null>(null);
  const stuckTime = useRef<number | null>(null);
  const lastRespawnTime = useRef<number>(0);
  const lastBounceTime = useRef<number>(0);

  // Function to check if player is out of map boundaries
  const isOutOfBounds = (position: Vector3): { isOut: boolean; direction: Vector3 } => {
    const direction = new Vector3(0, 0, 0);
    let isOut = false;

    // Check X boundaries
    if (position.x < -MAP_SIZE_HALF) {
      direction.x = 1; // Bounce right
      isOut = true;
    } else if (position.x > MAP_SIZE_HALF) {
      direction.x = -1; // Bounce left
      isOut = true;
    }

    // Check Z boundaries
    if (position.z < -MAP_SIZE_HALF) {
      direction.z = 1; // Bounce forward
      isOut = true;
    } else if (position.z > MAP_SIZE_HALF) {
      direction.z = -1; // Bounce backward
      isOut = true;
    }

    return { isOut, direction };
  };

  // Function to bounce player off walls
  const bouncePlayerOffWall = (playerId: string, bounceDirection: Vector3) => {
    const currentTime = Date.now();

    // Prevent multiple bounces in quick succession (100ms cooldown)
    if (currentTime - lastBounceTime.current < 100) {
      return;
    }

    lastBounceTime.current = currentTime;

    const playerVel = getPlayerBodyVelocity(playerId);
    if (!playerVel) return;

    // Get current velocity magnitude
    const currentVelocity = playerVel.clone();

    // Create bounce impulse
    const bounceImpulse = new Vector3();

    // Calculate bounce force based on incoming velocity
    if (bounceDirection.x !== 0) {
      bounceImpulse.x = -currentVelocity.x * WALL_BOUNCE_MULTIPLIER + bounceDirection.x * 10;
    }

    if (bounceDirection.z !== 0) {
      bounceImpulse.z = -currentVelocity.z * WALL_BOUNCE_MULTIPLIER + bounceDirection.z * 10;
    }

    // Apply a slight upward force to prevent getting stuck
    bounceImpulse.y = 5;

    // Apply the bounce impulse
    applyImpulseToPlayer(playerId, bounceImpulse);

    // Provide a small nudge away from the wall to prevent sticking
    const playerPos = getPlayerBodyPosition(playerId);
    if (playerPos) {
      const nudgePosition = playerPos.clone();

      if (bounceDirection.x !== 0) {
        nudgePosition.x += bounceDirection.x * 0.5;
      }

      if (bounceDirection.z !== 0) {
        nudgePosition.z += bounceDirection.z * 0.5;
      }

      setPlayerBodyPosition(playerId, nudgePosition);
    }
  };

  // Function to respawn player at a random corner
  const respawnPlayer = (useCurrentPosition = false) => {
    if (!localPlayerId) return;

    const currentTime = Date.now();

    // Prevent respawning too frequently (every 3 seconds max)
    if (currentTime - lastRespawnTime.current < 3000) {
      return;
    }

    // Update last respawn time
    lastRespawnTime.current = currentTime;

    let respawnPosition: Vector3;

    if (useCurrentPosition && lastPosition.current) {
      // Get current position but ensure it's within map boundaries
      const currentPos = lastPosition.current;
      const margin = 3;

      // Clamp X and Z to map boundaries
      const x = Math.max(-MAP_SIZE_HALF + margin, Math.min(MAP_SIZE_HALF - margin, currentPos.x));
      const z = Math.max(-MAP_SIZE_HALF + margin, Math.min(MAP_SIZE_HALF - margin, currentPos.z));

      // Create new position at the current X,Z but at a safe height
      respawnPosition = new Vector3(x, SAFE_SPAWN_HEIGHT, z);

      console.log('Respawning player at same position (adjusted):', respawnPosition);
    } else {
      // Get a respawn position using the fallback function
      respawnPosition = getRandomCornerPositionFallback();
      console.log('Respawning player at random corner:', respawnPosition);
    }

    // Reset player position and velocity
    setPlayerBodyPosition(localPlayerId, respawnPosition);
    setPlayerBodyVelocity(localPlayerId, new Vector3(0, 0, 0));

    // Also update the position in the game store
    useGameStore.getState().updateLocalPlayerPosition(respawnPosition);

    // Apply a small upward impulse to prevent immediate falling
    applyImpulseToPlayer(localPlayerId, new Vector3(0, 5, 0));

    // Reset stuck detection
    lastPosition.current = respawnPosition.clone();
    stuckTime.current = null;
  };

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const gameState = useGameStore.getState();

      switch (event.code) {
        case 'KeyW':
        case 'ArrowUp':
          controls.current.forward = true;
          break;
        case 'KeyS':
        case 'ArrowDown':
          controls.current.backward = true;
          break;
        case 'KeyA':
        case 'ArrowLeft':
          controls.current.left = true;
          break;
        case 'KeyD':
        case 'ArrowRight':
          controls.current.right = true;
          break;
        case 'Space':
          if (canJump.current) {
            controls.current.jump = true;
            canJump.current = false;
            // Reset jump ability after cooldown
            if (jumpTimeout.current) clearTimeout(jumpTimeout.current);
            jumpTimeout.current = setTimeout(() => {
              canJump.current = true;
            }, JUMP_COOLDOWN);
          }
          break;
        case 'KeyF':
          // F key for bomb ability
          if (gameState.canUseBomb()) {
            // Execute bomb immediately
            gameState.useBombAbility();
          }
          break;
        case 'KeyR':
          // Manual respawn for testing
          respawnPlayer();
          break;
      }
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      switch (event.code) {
        case 'KeyW':
        case 'ArrowUp':
          controls.current.forward = false;
          break;
        case 'KeyS':
        case 'ArrowDown':
          controls.current.backward = false;
          break;
        case 'KeyA':
        case 'ArrowLeft':
          controls.current.left = false;
          break;
        case 'KeyD':
        case 'ArrowRight':
          controls.current.right = false;
          break;
        // No need to handle space key up for impulse
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      if (jumpTimeout.current) clearTimeout(jumpTimeout.current);
    };
  }, []);

  useFrame((state, delta) => {
    if (!localPlayerId) return;

    // Make sure delta is valid to prevent physics issues
    if (isNaN(delta) || delta <= 0 || delta > 0.5) {
      delta = 1 / 60; // Use a safe default
    }

    // Check if player is out of bounds or in an invalid position
    const playerPos = getPlayerBodyPosition(localPlayerId);
    const playerVel = getPlayerBodyVelocity(localPlayerId);

    if (!playerPos) return;

    // Check for wall boundaries and bounce player
    const { isOut, direction } = isOutOfBounds(playerPos);
    if (isOut) {
      bouncePlayerOffWall(localPlayerId, direction);
    }

    // Check for out of bounds (falling below the level)
    if (playerPos.y < OUT_OF_BOUNDS_Y) {
      respawnPlayer();
      return;
    }

    // Check for NaN positions or velocities which indicates a physics error
    if (
      isNaN(playerPos.x) ||
      isNaN(playerPos.y) ||
      isNaN(playerPos.z) ||
      (playerVel && (isNaN(playerVel.x) || isNaN(playerVel.y) || isNaN(playerVel.z)))
    ) {
      respawnPlayer();
      return;
    }

    // Check for stuck state (not moving for a while)
    if (lastPosition.current) {
      // Use a safe distance calculation that handles potential NaN values
      let movementDistance = 0;
      try {
        movementDistance = playerPos.distanceTo(lastPosition.current);
      } catch {
        movementDistance = 0;
      }

      // Calculate velocity squared safely
      let velocitySquared = 0;
      if (playerVel) {
        try {
          velocitySquared = playerVel.lengthSq();
        } catch {
          velocitySquared = 0;
        }
      }

      // If player isn't moving and velocity is near zero
      if (movementDistance < MIN_MOVEMENT_THRESHOLD && velocitySquared < 0.1) {
        // Start counting stuck time if not already
        if (stuckTime.current === null) {
          stuckTime.current = Date.now();
        }
        // Check if stuck for too long
        else if (Date.now() - stuckTime.current > STUCK_TIMEOUT) {
          respawnPlayer(true); // Pass true to use current position
          return;
        }
      } else {
        // Reset stuck timer if moving
        if (stuckTime.current !== null) {
          stuckTime.current = null;
        }
      }
    }

    // Update last position for next frame - make a deep copy to prevent reference issues
    lastPosition.current = new Vector3(playerPos.x, playerPos.y, playerPos.z);

    const { forward, backward, left, right, jump } = controls.current;

    // Skip further processing if no movement input from either source
    if (!forward && !backward && !left && !right && !jump && !joystickDelta.x && !joystickDelta.y)
      return;

    const impulse = new Vector3();

    // Handle keyboard input - invert Z axis for both forward/backward
    if (forward) impulse.z -= MOVEMENT_IMPULSE * delta; // Reverted back to -=
    if (backward) impulse.z += MOVEMENT_IMPULSE * delta; // Reverted back to +=
    if (left) impulse.x -= MOVEMENT_IMPULSE * delta;
    if (right) impulse.x += MOVEMENT_IMPULSE * delta;

    // Add joystick input - invert Z axis for joystick
    if (joystickDelta.x || joystickDelta.y) {
      impulse.x += joystickDelta.x * MOVEMENT_IMPULSE * delta;
      impulse.z -= joystickDelta.y * MOVEMENT_IMPULSE * delta; // Keep mobile controls as they are
    }

    // Apply movement impulse if there's any horizontal movement
    if (impulse.lengthSq() > 0) {
      // Apply continuous force instead of impulse for smoother movement
      applyForceToPlayer(localPlayerId, impulse.multiplyScalar(35));
    }

    // Handle jump
    if (jump) {
      // Check if the player is on the ground (or close to it)
      if (playerPos && playerPos.y < 0.7) {
        applyImpulseToPlayer(localPlayerId, new Vector3(0, JUMP_IMPULSE, 0));
      }
      controls.current.jump = false; // Consume the jump action
    }
  });
}
