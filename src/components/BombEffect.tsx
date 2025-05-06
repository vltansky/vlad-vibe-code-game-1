import { useRef, useState, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { Vector3 } from 'three';

type BombEffectProps = {
  id: string; // Add id for logging
  position: Vector3;
  onComplete: () => void;
};

export function BombEffect({ id, position, onComplete }: BombEffectProps) {
  const [scale, setScale] = useState(0.1);
  const [opacity, setOpacity] = useState(1);
  const [intensity, setIntensity] = useState(1);
  const [color, setColor] = useState('#ff4500');
  const elapsedTime = useRef(0);
  const hasCompleted = useRef(false);

  // Constants for animation
  const EXPLOSION_DURATION = 0.75; // Slightly increased from 0.5 to 0.75 seconds
  const MAX_SCALE = 7.5; // 1/4 of map size (MAP_SIZE = 30)

  useEffect(() => {
    console.log(`[BombEffect ${id}] Mounted. Position:`, position);
    // Safety cleanup - ensure the effect is removed even if animation fails
    const timeoutId = setTimeout(
      () => {
        if (!hasCompleted.current) {
          console.log(`[BombEffect ${id}] Local safety timeout fired.`);
          hasCompleted.current = true;
          onComplete();
        }
      },
      EXPLOSION_DURATION * 1000 * 1.5
    ); // 1.5x the normal duration for safety
    console.log(`[BombEffect ${id}] Local safety timeout set for ${EXPLOSION_DURATION * 1.5}s.`);

    return () => {
      console.log(`[BombEffect ${id}] Unmounting, clearing local safety timeout.`);
      clearTimeout(timeoutId);
    };
  }, [id, onComplete, position]); // position added for completeness, though not strictly necessary for timeout

  // Animate the explosion
  useFrame((_, delta) => {
    if (hasCompleted.current) return;

    elapsedTime.current += delta;
    const progress = Math.min(elapsedTime.current / EXPLOSION_DURATION, 1);

    setScale(0.1 + MAX_SCALE * progress);
    setOpacity(1 - progress);
    setIntensity(1 - 0.5 * progress);

    const hue = 0.05 - 0.05 * progress; // Shift from orange-red to red
    setColor(`hsl(${hue * 360}, 100%, 50%)`);

    if (progress >= 1 && !hasCompleted.current) {
      console.log(`[BombEffect ${id}] Animation completed. Calling onComplete.`);
      hasCompleted.current = true;
      onComplete();
    }
  });

  return (
    <mesh position={position}>
      <sphereGeometry args={[scale, 32, 32]} />
      <meshStandardMaterial
        color={color}
        emissive={color}
        emissiveIntensity={intensity}
        transparent
        opacity={opacity}
      />
    </mesh>
  );
}
