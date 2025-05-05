import { useEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Vector3 } from 'three';
import { applyImpulseToPlayer, applyForceToPlayer, getPlayerBodyPosition } from '@/systems/physics';
import { useGameStore } from '@/stores/gameStore';

const MOVEMENT_IMPULSE = 45; // Further increased for faster movement
const JUMP_IMPULSE = 30; // Increased jump force
// const MAX_VELOCITY = 10; // Maximum velocity clamp (optional, unused for now)
const JUMP_COOLDOWN = 1000; // 1 second cooldown

export function usePlayerControls() {
  const localPlayerId = useGameStore((state) => state.localPlayerId);
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
          // F key for push ability
          if (gameState.canUsePush()) {
            // Execute push immediately
            gameState.usePushAbility();
          }
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

    const { forward, backward, left, right, jump } = controls.current;

    // Skip further processing if no movement input
    if (!forward && !backward && !left && !right && !jump) return;

    const impulse = new Vector3();

    if (forward) impulse.z -= MOVEMENT_IMPULSE * delta;
    if (backward) impulse.z += MOVEMENT_IMPULSE * delta;
    if (left) impulse.x -= MOVEMENT_IMPULSE * delta;
    if (right) impulse.x += MOVEMENT_IMPULSE * delta;

    // Apply movement impulse if there's any horizontal movement
    if (impulse.lengthSq() > 0) {
      // Apply continuous force instead of impulse for smoother movement
      applyForceToPlayer(localPlayerId, impulse.multiplyScalar(20)); // Doubled force multiplier
    }

    // Handle jump
    if (jump) {
      // Check if the player is on the ground (or close to it)
      const playerPos = getPlayerBodyPosition(localPlayerId);
      // Simple ground check - can be improved with raycasting
      if (playerPos && playerPos.y < 0.7) {
        applyImpulseToPlayer(localPlayerId, new Vector3(0, JUMP_IMPULSE, 0));
      }
      controls.current.jump = false; // Consume the jump action
    }
  });
}
