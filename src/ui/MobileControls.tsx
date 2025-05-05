import { useEffect, useRef, useState } from 'react';
import { Vector3 } from 'three';
import { applyForceToPlayer, applyImpulseToPlayer, getPlayerBodyPosition } from '@/systems/physics';
import { useGameStore } from '@/stores/gameStore';
import { BoltIcon, ArrowUpIcon } from 'lucide-react';

type JoystickState = {
  active: boolean;
  position: { x: number; y: number };
  origin: { x: number; y: number };
  delta: { x: number; y: number };
};

export function MobileControls() {
  const localPlayerId = useGameStore((state) => state.localPlayerId);
  const canUseBomb = useGameStore((state) => state.canUseBomb);
  const canUsePush = useGameStore((state) => state.canUsePush);

  const [joystick, setJoystick] = useState<JoystickState>({
    active: false,
    position: { x: 0, y: 0 },
    origin: { x: 0, y: 0 },
    delta: { x: 0, y: 0 },
  });

  const controls = useRef<Record<string, boolean>>({
    forward: false,
    backward: false,
    left: false,
    right: false,
    jump: false,
  });

  const joystickRef = useRef<HTMLDivElement>(null);
  const jumpCooldown = useRef<boolean>(false);
  const requestRef = useRef<number>();
  const previousTimeRef = useRef<number>();

  // Setup joystick touch handling
  useEffect(() => {
    const handleTouchStart = (e: TouchEvent) => {
      if (!joystickRef.current) return;

      // Check if the touch is in the left half of the screen (for joystick)
      if (e.touches[0].clientX < window.innerWidth / 2) {
        const touch = e.touches[0];

        const originX = touch.clientX;
        const originY = touch.clientY;

        setJoystick({
          active: true,
          origin: { x: originX, y: originY },
          position: { x: originX, y: originY },
          delta: { x: 0, y: 0 },
        });
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!joystick.active) return;

      for (let i = 0; i < e.changedTouches.length; i++) {
        const touch = e.changedTouches[i];

        // Check if this is the joystick touch (left side)
        if (touch.clientX < window.innerWidth / 2) {
          const maxDistance = 50; // Max joystick distance

          const deltaX = touch.clientX - joystick.origin.x;
          const deltaY = touch.clientY - joystick.origin.y;

          // Calculate distance and normalize if needed
          const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
          const normalizedDeltaX =
            distance > maxDistance ? (deltaX / distance) * maxDistance : deltaX;
          const normalizedDeltaY =
            distance > maxDistance ? (deltaY / distance) * maxDistance : deltaY;

          // Update joystick position
          setJoystick((prev) => ({
            ...prev,
            position: {
              x: prev.origin.x + normalizedDeltaX,
              y: prev.origin.y + normalizedDeltaY,
            },
            delta: {
              x: normalizedDeltaX / maxDistance, // -1 to 1
              y: normalizedDeltaY / maxDistance, // -1 to 1
            },
          }));

          // Update movement controls
          controls.current.forward = normalizedDeltaY < -0.2;
          controls.current.backward = normalizedDeltaY > 0.2;
          controls.current.left = normalizedDeltaX < -0.2;
          controls.current.right = normalizedDeltaX > 0.2;
        }
      }
    };

    const handleTouchEnd = (e: TouchEvent) => {
      if (!joystick.active) return;

      let shouldResetJoystick = false;

      for (let i = 0; i < e.changedTouches.length; i++) {
        const touch = e.changedTouches[i];

        // Check if this is the joystick touch
        if (touch.clientX < window.innerWidth / 2) {
          shouldResetJoystick = true;
        }
      }

      if (shouldResetJoystick) {
        setJoystick({
          active: false,
          position: { x: 0, y: 0 },
          origin: { x: 0, y: 0 },
          delta: { x: 0, y: 0 },
        });

        // Reset movement controls
        controls.current.forward = false;
        controls.current.backward = false;
        controls.current.left = false;
        controls.current.right = false;
      }
    };

    // Add touch event listeners
    window.addEventListener('touchstart', handleTouchStart);
    window.addEventListener('touchmove', handleTouchMove);
    window.addEventListener('touchend', handleTouchEnd);
    window.addEventListener('touchcancel', handleTouchEnd);

    return () => {
      window.removeEventListener('touchstart', handleTouchStart);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleTouchEnd);
      window.removeEventListener('touchcancel', handleTouchEnd);
    };
  }, [joystick.active, joystick.origin]);

  // Handle jump button
  const handleJump = () => {
    if (jumpCooldown.current || !localPlayerId) return;

    jumpCooldown.current = true;

    // Check if player is grounded
    const playerPos = getPlayerBodyPosition(localPlayerId);
    if (playerPos && playerPos.y < 0.7) {
      applyImpulseToPlayer(localPlayerId, new Vector3(0, 30, 0));
    }

    // Reset cooldown after 1 second
    setTimeout(() => {
      jumpCooldown.current = false;
    }, 1000);
  };

  // Animation loop for continuous movement
  const animate = (time: number) => {
    if (previousTimeRef.current === undefined) {
      previousTimeRef.current = time;
    }

    const deltaTime = (time - previousTimeRef.current) / 1000;
    previousTimeRef.current = time;

    // Apply movement if player exists and joystick is active
    if (localPlayerId && joystick.active) {
      const { forward, backward, left, right } = controls.current;

      if (forward || backward || left || right) {
        const impulse = new Vector3();

        if (forward) impulse.z -= 75 * deltaTime;
        if (backward) impulse.z += 75 * deltaTime;
        if (left) impulse.x -= 75 * deltaTime;
        if (right) impulse.x += 75 * deltaTime;

        if (impulse.lengthSq() > 0) {
          applyForceToPlayer(localPlayerId, impulse.multiplyScalar(35));
        }
      }
    }

    requestRef.current = requestAnimationFrame(animate);
  };

  // Start/stop animation loop
  useEffect(() => {
    requestRef.current = requestAnimationFrame(animate);
    return () => {
      if (requestRef.current) {
        cancelAnimationFrame(requestRef.current);
      }
    };
  }, []);

  // Handler functions for abilities
  const handlePushAbility = () => {
    if (canUsePush()) {
      useGameStore.getState().usePushAbility();
    }
  };

  const handleBombAbility = () => {
    if (canUseBomb()) {
      useGameStore.getState().useBombAbility();
    }
  };

  return (
    <div className="pointer-events-none fixed right-0 bottom-0 left-0 z-10">
      <div className="grid h-36 grid-cols-2 p-4">
        {/* Joystick area (left side) */}
        <div
          className="pointer-events-auto relative flex items-center justify-center"
          ref={joystickRef}
        >
          {/* Static joystick indicator - always visible */}
          <div className="absolute bottom-4 left-4 flex h-20 w-20 items-center justify-center rounded-full border border-gray-500/50 bg-gray-800/60 shadow-lg">
            <div className="flex h-10 w-10 items-center justify-center rounded-full border border-gray-400/50 bg-gray-600/60 shadow-inner">
              <div className="h-4 w-4 rounded-full bg-blue-500/70 shadow-md"></div>
            </div>
          </div>

          {/* Dynamic joystick that appears when active */}
          {joystick.active && (
            <>
              {/* Outer joystick circle */}
              <div
                className="absolute h-24 w-24 rounded-full border border-gray-500/50 bg-gray-800/70 shadow-lg"
                style={{
                  left: joystick.origin.x - 48,
                  top: joystick.origin.y - 48,
                }}
              />
              {/* Inner joystick button */}
              <div
                className="absolute flex h-16 w-16 items-center justify-center rounded-full border border-gray-400/60 bg-gray-700/80 shadow-lg"
                style={{
                  left: joystick.position.x - 32,
                  top: joystick.position.y - 32,
                }}
              >
                <div className="h-6 w-6 rounded-full bg-blue-500/90 shadow-md"></div>
              </div>
            </>
          )}
        </div>

        {/* Action buttons (right side) */}
        <div className="flex flex-col items-end justify-end gap-3">
          {/* Jump button */}
          <button
            onTouchStart={handleJump}
            className="pointer-events-auto flex h-16 w-16 items-center justify-center rounded-full bg-yellow-600/80 shadow-lg"
            disabled={jumpCooldown.current}
          >
            <ArrowUpIcon className="text-white" size={24} />
          </button>

          {/* Abilities row */}
          <div className="flex gap-3">
            {/* Push ability */}
            <button
              onTouchStart={handlePushAbility}
              className={`pointer-events-auto flex h-12 w-12 items-center justify-center rounded-full shadow-lg ${canUsePush() ? 'bg-blue-600/80' : 'bg-blue-900/40'}`}
            >
              <BoltIcon className={`${canUsePush() ? 'text-white' : 'text-gray-400'}`} size={20} />
            </button>

            {/* Bomb ability */}
            <button
              onTouchStart={handleBombAbility}
              className={`pointer-events-auto flex h-12 w-12 items-center justify-center rounded-full shadow-lg ${canUseBomb() ? 'bg-red-600/80' : 'bg-red-900/40'}`}
            >
              <span
                className={`text-lg font-bold ${canUseBomb() ? 'text-white' : 'text-gray-400'}`}
              >
                B
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
