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

// Wall bounce effect duration in seconds
const WALL_BOUNCE_EFFECT_DURATION = 0.5;

// Wall IDs - must match IDs in mapPhysics.ts
const WALL_IDS = ['north', 'south', 'east', 'west'];

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

  // Wall bounce visual effects
  const [wallBounceEffects, setWallBounceEffects] = useState<Record<string, number>>({
    north: 0,
    south: 0,
    east: 0,
    west: 0,
  });

  // Get king state from store
  const currentKingId = useGameStore((state) => state.currentKingId);
  const kingZoneOccupants = useGameStore((state) => state.kingZoneOccupants);

  // Subscribe to custom wall collision events
  useEffect(() => {
    // Custom event listener for wall collisions
    const handleWallCollision = (event: CustomEvent) => {
      const { wallId } = event.detail;
      if (WALL_IDS.includes(wallId)) {
        setWallBounceEffects((prev) => ({
          ...prev,
          [wallId]: WALL_BOUNCE_EFFECT_DURATION,
        }));
      }
    };

    // Add event listener
    window.addEventListener('wallCollision', handleWallCollision as EventListener);

    // Clean up
    return () => {
      window.removeEventListener('wallCollision', handleWallCollision as EventListener);
    };
  }, []);

  // Animate effects
  useFrame((state, delta) => {
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

    // Update wall bounce effects
    setWallBounceEffects((prev) => {
      const updated = { ...prev };
      let hasChanges = false;

      // Decay all active effects
      Object.keys(updated).forEach((wallId) => {
        if (updated[wallId] > 0) {
          updated[wallId] = Math.max(0, updated[wallId] - delta);
          hasChanges = true;
        }
      });

      return hasChanges ? updated : prev;
    });
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

  // Helper function to get wall effect parameters
  const getWallEffectParams = (wallId: string) => {
    const intensity = wallBounceEffects[wallId];
    const normalizedIntensity = intensity / WALL_BOUNCE_EFFECT_DURATION;

    // Base color with adjusted brightness based on bounce effect
    const color = intensity > 0 ? '#77bbff' : '#555555';
    const emissiveIntensity = normalizedIntensity * 2;

    return { color, emissiveIntensity };
  };

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

      {/* Boundary Walls with bounce effects */}
      {/* North Wall */}
      <Box
        position={[0, WALL_HEIGHT / 2, -MAP_SIZE / 2 - WALL_THICKNESS / 2]}
        args={[MAP_SIZE + WALL_THICKNESS * 2, WALL_HEIGHT, WALL_THICKNESS]}
        castShadow
        receiveShadow
      >
        <meshStandardMaterial
          color={getWallEffectParams('north').color}
          emissive="#4488ff"
          emissiveIntensity={getWallEffectParams('north').emissiveIntensity}
          roughness={0.3}
          metalness={0.7}
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
          color={getWallEffectParams('south').color}
          emissive="#4488ff"
          emissiveIntensity={getWallEffectParams('south').emissiveIntensity}
          roughness={0.3}
          metalness={0.7}
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
          color={getWallEffectParams('east').color}
          emissive="#4488ff"
          emissiveIntensity={getWallEffectParams('east').emissiveIntensity}
          roughness={0.3}
          metalness={0.7}
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
          color={getWallEffectParams('west').color}
          emissive="#4488ff"
          emissiveIntensity={getWallEffectParams('west').emissiveIntensity}
          roughness={0.3}
          metalness={0.7}
        />
      </Box>

      {/* Wall bounce guide labels - only show when a wall is active */}
      {WALL_IDS.map((wallId) => {
        if (wallBounceEffects[wallId] <= 0) return null;

        let position: [number, number, number];
        switch (wallId) {
          case 'north':
            position = [0, WALL_HEIGHT / 2, -MAP_SIZE / 2 - WALL_THICKNESS];
            break;
          case 'south':
            position = [0, WALL_HEIGHT / 2, MAP_SIZE / 2 + WALL_THICKNESS];
            break;
          case 'east':
            position = [MAP_SIZE / 2 + WALL_THICKNESS, WALL_HEIGHT / 2, 0];
            break;
          case 'west':
            position = [-MAP_SIZE / 2 - WALL_THICKNESS, WALL_HEIGHT / 2, 0];
            break;
          default:
            position = [0, 0, 0];
        }

        // Indicator sphere showing bounce
        return (
          <mesh key={`bounce-indicator-${wallId}`} position={position}>
            <sphereGeometry args={[0.3, 16, 16]} />
            <meshStandardMaterial
              color="#4488ff"
              emissive="#4488ff"
              emissiveIntensity={1}
              transparent
              opacity={wallBounceEffects[wallId] / WALL_BOUNCE_EFFECT_DURATION}
            />
          </mesh>
        );
      })}

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
          <meshStandardMaterial
            color="#555555"
            transparent
            opacity={0.7}
            roughness={0.3}
            metalness={0.7}
          />
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
