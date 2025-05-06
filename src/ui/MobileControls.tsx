import { useEffect, useRef, useState } from 'react';
import { Vector3 } from 'three';
// Remove direct physics imports - no longer needed here
// import { applyForceToPlayer, applyImpulseToPlayer, getPlayerBodyPosition } from '@/systems/physics';
import { useGameStore } from '@/stores/gameStore';
import { ArrowUpIcon } from 'lucide-react'; // Keep ArrowUpIcon for jump

type JoystickState = {
  active: boolean;
  position: { x: number; y: number };
  origin: { x: number; y: number };
  delta: { x: number; y: number }; // Keep delta for UI rendering
  touchId: number | null;
};

export function MobileControls() {
  const localPlayerId = useGameStore((state) => state.localPlayerId);
  const canUseBomb = useGameStore((state) => state.canUseBomb);
  // Get the setter function from the store
  const setJoystickDelta = useGameStore((state) => state.setJoystickDelta);
  // Get last bomb time for cooldown indicator
  const lastBombTime = useGameStore((state) => {
    const localPlayer = state.localPlayerId;
    if (!localPlayer) return 0;
    return state.players[localPlayer]?.lastBombTime || 0;
  });
  // Add bomb cooldown progress state
  const [bombCooldownProgress, setBombCooldownProgress] = useState(100);

  const [joystick, setJoystick] = useState<JoystickState>({
    active: false,
    position: { x: 0, y: 0 },
    origin: { x: 0, y: 0 },
    delta: { x: 0, y: 0 }, // Initialize delta
    touchId: null,
  });

  // Remove the unused controls ref
  // const controls = useRef<Record<string, boolean>>({
  //   forward: false,
  //   backward: false,
  //   left: false,
  //   right: false,
  //   jump: false,
  // });

  const joystickAreaRef = useRef<HTMLDivElement>(null);
  const joystickOuterRef = useRef<HTMLDivElement>(null);
  const jumpCooldown = useRef<boolean>(false);
  // Remove animation frame refs - no longer needed
  // const requestRef = useRef<number>();
  // const previousTimeRef = useRef<number>();
  const maxJoystickDistance = useRef<number>(50);

  // Adjust joystick size based on screen size (keep this effect)
  useEffect(() => {
    const updateJoystickSize = () => {
      const screenWidth = window.innerWidth;
      maxJoystickDistance.current = Math.min(Math.max(screenWidth * 0.1, 40), 80);
    };
    updateJoystickSize();
    window.addEventListener('resize', updateJoystickSize);
    return () => {
      window.removeEventListener('resize', updateJoystickSize);
    };
  }, []);

  // Add effect to update bomb cooldown progress
  useEffect(() => {
    const BOMB_COOLDOWN = 500; // reasonable cooldown to prevent cheating but still allow aggressive bomb usage
    let animationFrameId: number;

    const updateProgress = () => {
      const now = Date.now();
      const timeSinceBomb = now - lastBombTime;
      const newProgress = Math.min((timeSinceBomb / BOMB_COOLDOWN) * 100, 100);

      setBombCooldownProgress(newProgress);

      if (newProgress < 100) {
        animationFrameId = requestAnimationFrame(updateProgress);
      }
    };

    updateProgress();
    return () => {
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
      }
    };
  }, [lastBombTime]);

  // Updated touch handling approach
  useEffect(() => {
    const handleJoystickStart = (e: TouchEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (!joystickAreaRef.current) return;
      const touch = e.touches[0];
      setJoystick({
        active: true,
        origin: { x: touch.clientX, y: touch.clientY },
        position: { x: touch.clientX, y: touch.clientY },
        delta: { x: 0, y: 0 }, // Reset delta on start
        touchId: touch.identifier,
      });
      // Update store on start (optional, but good practice)
      setJoystickDelta({ x: 0, y: 0 });
    };

    const handleJoystickMove = (e: TouchEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (!joystick.active) return;

      for (let i = 0; i < e.touches.length; i++) {
        const touch = e.touches[i];
        if (touch.identifier === joystick.touchId) {
          const maxDistance = maxJoystickDistance.current;

          const deltaX = touch.clientX - joystick.origin.x;
          const deltaY = touch.clientY - joystick.origin.y;
          const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
          const normalizedDeltaX =
            distance > maxDistance ? (deltaX / distance) * maxDistance : deltaX;
          const normalizedDeltaY =
            distance > maxDistance ? (deltaY / distance) * maxDistance : deltaY;
          const sensitivity = 1.5;

          // Calculate final delta for the store
          const storeDelta = {
            x: Math.min(Math.max((normalizedDeltaX / maxDistance) * sensitivity, -1), 1),
            y: -Math.min(Math.max((normalizedDeltaY / maxDistance) * sensitivity, -1), 1),
          };

          // Update local state for UI rendering
          setJoystick((prev) => ({
            ...prev,
            position: { x: prev.origin.x + normalizedDeltaX, y: prev.origin.y + normalizedDeltaY },
            delta: storeDelta, // Store the final delta locally too
          }));

          // Update the shared game store state
          setJoystickDelta(storeDelta);
          break;
        }
      }
    };

    const handleJoystickEnd = (e: TouchEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setJoystick({
        active: false,
        position: { x: 0, y: 0 },
        origin: { x: 0, y: 0 },
        delta: { x: 0, y: 0 }, // Reset local delta
        touchId: null,
      });
      // Reset the shared game store state
      setJoystickDelta({ x: 0, y: 0 });
    };

    const joystickEl = joystickOuterRef.current;
    if (joystickEl) {
      joystickEl.addEventListener('touchstart', handleJoystickStart, { passive: false });
      joystickEl.addEventListener('touchmove', handleJoystickMove, { passive: false });
      joystickEl.addEventListener('touchend', handleJoystickEnd, { passive: false });
      joystickEl.addEventListener('touchcancel', handleJoystickEnd, { passive: false });
    }
    return () => {
      if (joystickEl) {
        joystickEl.removeEventListener('touchstart', handleJoystickStart);
        joystickEl.removeEventListener('touchmove', handleJoystickMove);
        joystickEl.removeEventListener('touchend', handleJoystickEnd);
        joystickEl.removeEventListener('touchcancel', handleJoystickEnd);
      }
    };
    // Dependency array includes setJoystickDelta now
  }, [joystick.active, joystick.origin, joystick.touchId, setJoystickDelta]);

  // Handle jump button (keep this, but use correct physics import if needed)
  const handleJump = () => {
    if (jumpCooldown.current || !localPlayerId) return;
    jumpCooldown.current = true;

    // Use direct import for jump impulse
    import('@/systems/physics').then(({ getPlayerBodyPosition, applyImpulseToPlayer }) => {
      const playerPos = getPlayerBodyPosition(localPlayerId);
      if (playerPos && playerPos.y < 0.7) {
        applyImpulseToPlayer(localPlayerId, new Vector3(0, 30, 0)); // Use reasonable jump force
      }
    });

    setTimeout(() => {
      jumpCooldown.current = false;
    }, 1000);
  };

  // REMOVE the separate animate loop entirely
  // const animate = (time: number) => { ... };
  // useEffect(() => { ... animation loop setup ... }, []);

  // Handler for bomb ability (keep this)
  const handleBombAbility = () => {
    if (canUseBomb()) {
      useGameStore.getState().useBombAbility();
    }
  };

  // Get joystick and button sizes (keep this)
  const buttonSize = Math.min(Math.max(window.innerWidth * 0.12, 48), 64);
  const joystickSize = Math.min(Math.max(window.innerWidth * 0.15, 60), 80);
  const joystickInnerSize = joystickSize * 0.6;

  // Calculate the stroke dasharray and dashoffset for the circle progress
  const isReady = canUseBomb();
  const circleRadius = buttonSize / 2 - 3; // Slightly smaller than the button
  const circumference = 2 * Math.PI * circleRadius;
  const dashOffset = circumference * (1 - bombCooldownProgress / 100);

  return (
    <div className="pointer-events-none fixed inset-0 z-50">
      {/* Remove debug overlay */}
      <div className="absolute inset-x-0 bottom-0 grid h-36 grid-cols-2 p-4">
        {/* Joystick area (left side) - Keep this structure */}
        <div
          className="pointer-events-auto relative flex items-end justify-start"
          ref={joystickAreaRef}
          style={{ width: '100%', height: '100%' }}
        >
          <div
            ref={joystickOuterRef}
            className="absolute bottom-4 left-4 flex items-center justify-center"
            style={{
              width: `${joystickSize * 2}px`,
              height: `${joystickSize * 2}px`,
              touchAction: 'none',
            }}
          >
            {/* Visual joystick base */}
            <div
              className="absolute top-1/2 left-1/2 flex items-center justify-center rounded-full border border-gray-500/50 bg-gray-800/60 shadow-lg"
              style={{
                width: `${joystickSize}px`,
                height: `${joystickSize}px`,
                transform: 'translate(-50%, -50%)',
              }}
            >
              <div
                className="flex items-center justify-center rounded-full border border-gray-400/50 bg-gray-600/60 shadow-inner"
                style={{ width: `${joystickInnerSize}px`, height: `${joystickInnerSize}px` }}
              >
                <div
                  className="rounded-full bg-blue-500/70 shadow-md"
                  style={{
                    width: `${joystickInnerSize * 0.4}px`,
                    height: `${joystickInnerSize * 0.4}px`,
                  }}
                ></div>
              </div>
            </div>

            {/* Dynamic joystick handle */}
            {joystick.active && joystickAreaRef.current && (
              <div
                className="absolute flex items-center justify-center rounded-full border border-gray-400/60 bg-gray-700/80 shadow-lg"
                style={{
                  width: `${joystickSize * 0.8}px`,
                  height: `${joystickSize * 0.8}px`,
                  left: joystick.position.x - joystickAreaRef.current.getBoundingClientRect().left,
                  top: joystick.position.y - joystickAreaRef.current.getBoundingClientRect().top,
                  transform: 'translate(-50%, -50%)',
                }}
              >
                <div
                  className="rounded-full bg-blue-500/90 shadow-md"
                  style={{ width: `${joystickSize * 0.3}px`, height: `${joystickSize * 0.3}px` }}
                ></div>
              </div>
            )}
          </div>
        </div>

        {/* Action buttons (right side) - Keep this structure */}
        <div className="pointer-events-auto relative flex items-end justify-end">
          {/* Jump button */}
          <div
            className="absolute right-20 bottom-4 flex cursor-pointer items-center justify-center rounded-full border border-gray-500/50 bg-gray-800/60 shadow-md select-none hover:bg-gray-700/70 active:scale-95 active:bg-gray-600/70"
            style={{
              width: `${buttonSize}px`,
              height: `${buttonSize}px`,
              touchAction: 'none', // Add this to help with touch events
            }}
            ref={(el) => {
              // Add the event listener with passive: false directly on the element
              if (el) {
                const jumpHandler = (e: TouchEvent) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleJump();
                };

                el.addEventListener('touchstart', jumpHandler, { passive: false });

                // Clean up for React
                return () => {
                  el.removeEventListener('touchstart', jumpHandler);
                };
              }
            }}
          >
            <ArrowUpIcon className="text-white" size={Math.floor(buttonSize * 0.5)} />
          </div>

          {/* Bomb ability button with circular progress indicator */}
          <div
            className="absolute right-4 bottom-4 flex cursor-pointer items-center justify-center rounded-full border border-gray-500/50 bg-gray-800/60 shadow-md select-none hover:bg-gray-700/70 active:scale-95 active:bg-gray-600/70"
            style={{
              width: `${buttonSize}px`,
              height: `${buttonSize}px`,
              touchAction: 'none',
              position: 'relative',
            }}
            ref={(el) => {
              // Add the event listener with passive: false directly on the element
              if (el) {
                const bombHandler = (e: TouchEvent) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleBombAbility();
                };

                el.addEventListener('touchstart', bombHandler, { passive: false });

                // Clean up for React
                return () => {
                  el.removeEventListener('touchstart', bombHandler);
                };
              }
            }}
          >
            {/* Circular progress indicator */}
            <svg
              width={buttonSize}
              height={buttonSize}
              viewBox={`0 0 ${buttonSize} ${buttonSize}`}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                transform: 'rotate(-90deg)',
              }}
            >
              <circle
                cx={buttonSize / 2}
                cy={buttonSize / 2}
                r={circleRadius}
                fill="none"
                stroke={isReady ? 'rgba(34, 197, 94, 0.7)' : 'rgba(249, 115, 22, 0.7)'}
                strokeWidth="2"
                strokeDasharray={circumference}
                strokeDashoffset={dashOffset}
                strokeLinecap="round"
              />
            </svg>
            <span
              className={`text-center font-bold ${isReady ? 'text-white' : 'text-gray-400'}`}
              style={{ fontSize: `${buttonSize * 0.35}px`, position: 'relative', zIndex: 1 }}
            >
              B
            </span>
            {/* Optional: Ready indicator */}
            {isReady && (
              <div
                className="absolute -top-1 -right-1 flex h-3 w-3 items-center justify-center rounded-full bg-green-500"
                style={{ boxShadow: '0 0 5px rgba(34, 197, 94, 0.7)' }}
              ></div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
