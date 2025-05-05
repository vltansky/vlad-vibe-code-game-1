import { useEffect, useRef, useState } from 'react';
import { Box3, Vector3 } from 'three';
import { Box, Cylinder } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useGameStore } from '@/stores/gameStore';

// Map dimensions
const MAP_SIZE = 30;
const WALL_HEIGHT = 2;
const WALL_THICKNESS = 1;
const KING_ZONE_RADIUS = 3;

// Define wall bounce effect
type WallBounceEffect = {
  id: string;
  position: Vector3;
  normal: Vector3;
  strength: number; // 0-1 value for intensity
  time: number; // timer for animation
};

export function GameMap() {
  const mapRef = useRef<Box3>(
    new Box3(
      new Vector3(-MAP_SIZE / 2, 0, -MAP_SIZE / 2),
      new Vector3(MAP_SIZE / 2, WALL_HEIGHT, MAP_SIZE / 2)
    )
  );

  // Track king zone visual effect states
  const [kingZoneColor, setKingZoneColor] = useState<string>('#ffdd00');
  const [kingZoneOpacity, setKingZoneOpacity] = useState<number>(0.6);
  const [kingZonePulse, setKingZonePulse] = useState<number>(0);

  // Track wall bounce effects
  const [bounceEffects, setBounceEffects] = useState<WallBounceEffect[]>([]);

  // Wall glow states for each wall
  const [wallGlows, setWallGlows] = useState({
    north: { intensity: 0, color: '#4a9eff' },
    south: { intensity: 0, color: '#4a9eff' },
    east: { intensity: 0, color: '#4a9eff' },
    west: { intensity: 0, color: '#4a9eff' },
  });

  // Get king state from store
  const currentKingId = useGameStore((state) => state.currentKingId);
  const kingZoneOccupants = useGameStore((state) => state.kingZoneOccupants);

  // Setup wall collision listener
  useEffect(() => {
    // Create a custom event for wall collisions
    const handleWallCollision = (event: CustomEvent) => {
      const { wallId, position, velocity } = event.detail;
      const normal = new Vector3();

      // Set normal based on wall
      switch (wallId as 'north' | 'south' | 'east' | 'west') {
        case 'north':
          normal.set(0, 0, 1);
          break;
        case 'south':
          normal.set(0, 0, -1);
          break;
        case 'east':
          normal.set(-1, 0, 0);
          break;
        case 'west':
          normal.set(1, 0, 0);
          break;
        default:
          return;
      }

      // Calculate bounce strength based on velocity impact
      const impactVector = new Vector3().copy(velocity);
      const strength = Math.min(impactVector.length() / 15, 1); // Normalize to 0-1

      // Add a bounce effect
      setBounceEffects((prev) => [
        ...prev,
        {
          id: `bounce-${Date.now()}-${wallId}`,
          position: new Vector3().copy(position),
          normal,
          strength,
          time: 0,
        },
      ]);

      // Set wall glow for the hit wall
      setWallGlows((prev) => ({
        ...prev,
        [wallId as keyof typeof wallGlows]: {
          ...prev[wallId as keyof typeof wallGlows],
          intensity: Math.min(prev[wallId as keyof typeof wallGlows].intensity + strength, 1),
        },
      }));
    };

    // Register the custom event listener
    window.addEventListener('wall-collision', handleWallCollision as EventListener);

    return () => {
      window.removeEventListener('wall-collision', handleWallCollision as EventListener);
    };
  }, []);

  // Animate effects
  useFrame((_, delta) => {
    // Pulse animation for king zone
    setKingZonePulse((prev) => (prev + delta) % 2);

    // Update color based on zone state
    if (currentKingId) {
      // Someone is king - gold color
      setKingZoneColor('#ffdd00');
      // Pulse opacity
      setKingZoneOpacity(0.6 + 0.2 * Math.sin(kingZonePulse * Math.PI));
    } else if (kingZoneOccupants.length > 1) {
      // Multiple players fighting - red color
      setKingZoneColor('#ff3300');
      // Fast pulse opacity
      setKingZoneOpacity(0.5 + 0.3 * Math.sin(kingZonePulse * Math.PI * 3));
    } else if (kingZoneOccupants.length === 1) {
      // One player but not yet king - yellow color
      setKingZoneColor('#ffaa00');
      // Slow pulse opacity
      setKingZoneOpacity(0.5 + 0.2 * Math.sin(kingZonePulse * Math.PI * 0.5));
    } else {
      // Nobody in zone - neutral color
      setKingZoneColor('#ffffff');
      setKingZoneOpacity(0.3);
    }

    // Update bounce effects
    setBounceEffects(
      (prev) =>
        prev
          .map((effect) => ({
            ...effect,
            time: effect.time + delta * 2, // Speed up the effect
            strength: effect.strength * (1 - delta * 3), // Fade out effect
          }))
          .filter((effect) => effect.strength > 0.05) // Remove faded effects
    );

    // Fade out wall glows
    setWallGlows((prev) => ({
      north: { ...prev.north, intensity: Math.max(prev.north.intensity - delta * 2, 0) },
      south: { ...prev.south, intensity: Math.max(prev.south.intensity - delta * 2, 0) },
      east: { ...prev.east, intensity: Math.max(prev.east.intensity - delta * 2, 0) },
      west: { ...prev.west, intensity: Math.max(prev.west.intensity - delta * 2, 0) },
    }));
  });

  // Initialize map physics
  useEffect(() => {
    // Dynamically import to avoid circular dependencies
    import('@/systems/mapPhysics')
      .then(({ createMapPhysics }) => {
        // Create all physics bodies for the map
        createMapPhysics(mapRef.current);
      })
      .catch((error) => {
        console.error('Failed to import mapPhysics:', error);
      });

    // Return cleanup function
    return () => {
      // Cleanup happens in physics.ts
    };
  }, []);

  return (
    <group>
      {/* Ground plane with different surfaces */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
        <planeGeometry args={[MAP_SIZE, MAP_SIZE]} />
        <meshStandardMaterial color="#1a6e1a" roughness={0.8} metalness={0.1} />
      </mesh>

      {/* Ice surface in the center */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]} receiveShadow>
        <planeGeometry args={[MAP_SIZE / 3, MAP_SIZE / 3]} />
        <meshStandardMaterial color="#a8d8f0" roughness={0.1} metalness={0.3} />
      </mesh>

      {/* Sticky surface on the sides */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[MAP_SIZE / 3, 0.01, 0]} receiveShadow>
        <planeGeometry args={[MAP_SIZE / 6, MAP_SIZE / 3]} />
        <meshStandardMaterial color="#8B4513" roughness={0.9} metalness={0.1} />
      </mesh>

      {/* Boundary Walls with bounce glow effects */}
      {/* North Wall */}
      <Box
        position={[0, WALL_HEIGHT / 2, -MAP_SIZE / 2 - WALL_THICKNESS / 2]}
        args={[MAP_SIZE + WALL_THICKNESS * 2, WALL_HEIGHT, WALL_THICKNESS]}
        castShadow
        receiveShadow
      >
        <meshStandardMaterial
          color="#555555"
          emissive={wallGlows.north.color}
          emissiveIntensity={wallGlows.north.intensity}
        />
      </Box>

      {/* South Wall */}
      <Box
        position={[0, WALL_HEIGHT / 2, MAP_SIZE / 2 + WALL_THICKNESS / 2]}
        args={[MAP_SIZE + WALL_THICKNESS * 2, WALL_HEIGHT, WALL_THICKNESS]}
        castShadow
        receiveShadow
      >
        <meshStandardMaterial
          color="#555555"
          emissive={wallGlows.south.color}
          emissiveIntensity={wallGlows.south.intensity}
        />
      </Box>

      {/* East Wall */}
      <Box
        position={[MAP_SIZE / 2 + WALL_THICKNESS / 2, WALL_HEIGHT / 2, 0]}
        args={[WALL_THICKNESS, WALL_HEIGHT, MAP_SIZE]}
        castShadow
        receiveShadow
      >
        <meshStandardMaterial
          color="#555555"
          emissive={wallGlows.east.color}
          emissiveIntensity={wallGlows.east.intensity}
        />
      </Box>

      {/* West Wall */}
      <Box
        position={[-MAP_SIZE / 2 - WALL_THICKNESS / 2, WALL_HEIGHT / 2, 0]}
        args={[WALL_THICKNESS, WALL_HEIGHT, MAP_SIZE]}
        castShadow
        receiveShadow
      >
        <meshStandardMaterial
          color="#555555"
          emissive={wallGlows.west.color}
          emissiveIntensity={wallGlows.west.intensity}
        />
      </Box>

      {/* Bounce effect particles */}
      {bounceEffects.map((effect) => (
        <group key={effect.id} position={effect.position}>
          {/* Pulse sphere at bounce point */}
          <mesh>
            <sphereGeometry args={[effect.strength * 1.5, 16, 16]} />
            <meshStandardMaterial
              color="#4a9eff"
              transparent
              opacity={0.7 * (1 - effect.time / 2)}
              emissive="#4a9eff"
              emissiveIntensity={0.8 * effect.strength}
            />
          </mesh>

          {/* Direction indicator for bounce */}
          <mesh position={effect.normal.clone().multiplyScalar(0.5)}>
            <coneGeometry args={[0.3 * effect.strength, 1 * effect.strength, 8]} />
            <meshStandardMaterial
              color="#4a9eff"
              transparent
              opacity={0.6 * (1 - effect.time / 2)}
              emissive="#4a9eff"
              emissiveIntensity={0.7 * effect.strength}
            />
          </mesh>
        </group>
      ))}

      {/* Corner Blockers - prevent players escaping at corners */}
      {[
        { x: MAP_SIZE / 2, z: MAP_SIZE / 2 }, // Northeast
        { x: -MAP_SIZE / 2, z: MAP_SIZE / 2 }, // Northwest
        { x: MAP_SIZE / 2, z: -MAP_SIZE / 2 }, // Southeast
        { x: -MAP_SIZE / 2, z: -MAP_SIZE / 2 }, // Southwest
      ].map((corner, i) => (
        <Box
          key={`corner-blocker-${i}`}
          position={[corner.x, 1.5, corner.z]}
          args={[3, 3, 3]}
          castShadow
          receiveShadow
        >
          <meshStandardMaterial color="#555555" transparent opacity={0.7} />
        </Box>
      ))}

      {/* Ramp */}
      <Box
        position={[-MAP_SIZE / 4, 0.5, MAP_SIZE / 4]}
        rotation={[Math.PI / 12, 0, 0]}
        args={[MAP_SIZE / 6, 0.2, MAP_SIZE / 6]}
        castShadow
        receiveShadow
      >
        <meshStandardMaterial color="#999999" />
      </Box>

      {/* Center platform */}
      <Cylinder position={[0, 0.3, 0]} args={[3, 3, 0.6, 32]} castShadow receiveShadow>
        <meshStandardMaterial color="#999999" />
      </Cylinder>

      {/* King Zone visual indicator */}
      <Cylinder
        position={[0, 0.35, 0]}
        args={[KING_ZONE_RADIUS, KING_ZONE_RADIUS, 0.05, 32]}
        castShadow
        receiveShadow
      >
        <meshStandardMaterial
          color={kingZoneColor}
          transparent
          opacity={kingZoneOpacity}
          emissive={kingZoneColor}
          emissiveIntensity={0.5}
        />
      </Cylinder>

      {/* King Zone crown marker */}
      {currentKingId && (
        <group position={[0, 1.5, 0]} rotation={[0, kingZonePulse * Math.PI, 0]}>
          <mesh position={[0, 0.5, 0]}>
            <cylinderGeometry args={[0.3, 0.6, 0.3, 5]} />
            <meshStandardMaterial color="#ffdd00" metalness={0.8} roughness={0.2} />
          </mesh>
          <mesh position={[0, 0.3, 0]}>
            <cylinderGeometry args={[0.7, 0.7, 0.3, 16]} />
            <meshStandardMaterial color="#ffdd00" metalness={0.8} roughness={0.2} />
          </mesh>
        </group>
      )}

      {/* Obstacles */}
      {[...Array(5)].map((_, i) => {
        const angle = (i / 5) * Math.PI * 2;
        const distance = MAP_SIZE / 3;
        const x = Math.cos(angle) * distance;
        const z = Math.sin(angle) * distance;

        return (
          <Box
            key={`obstacle-${i}`}
            position={[x, WALL_HEIGHT / 3, z]}
            args={[2, WALL_HEIGHT / 1.5, 2]}
            castShadow
            receiveShadow
          >
            <meshStandardMaterial color="#777777" />
          </Box>
        );
      })}
    </group>
  );
}
