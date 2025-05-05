import { useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Vector3 } from 'three';

type BombEffectProps = {
  position: Vector3;
  onComplete: () => void;
};

export function BombEffect({ position, onComplete }: BombEffectProps) {
  const [scale, setScale] = useState(0.1);
  const [opacity, setOpacity] = useState(1);
  const [intensity, setIntensity] = useState(1);
  const [color, setColor] = useState('#ff4500');
  const elapsedTime = useRef(0);

  // Constants for animation
  const EXPLOSION_DURATION = 0.75; // Slightly increased from 0.5 to 0.75 seconds
  const MAX_SCALE = 7.5; // 1/4 of map size (MAP_SIZE = 30)

  // Animate the explosion
  useFrame((_, delta) => {
    // Update time
    elapsedTime.current += delta;
    const progress = Math.min(elapsedTime.current / EXPLOSION_DURATION, 1);

    // Update visual properties
    setScale(0.1 + MAX_SCALE * progress);
    setOpacity(1 - progress);
    setIntensity(1 - 0.5 * progress);

    // Change color based on progression
    const hue = 0.05 - 0.05 * progress; // Shift from orange-red to red
    setColor(`hsl(${hue * 360}, 100%, 50%)`);

    // When animation is complete, callback to remove from scene
    if (progress >= 1) {
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
