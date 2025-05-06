import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { Mesh, Vector3, Quaternion, Group } from 'three';
import { PlayerState } from '@/stores/gameStore';
import { Billboard, Text } from '@react-three/drei';

// Define available skins
export type SkinData = {
  name: string;
  material: 'standard' | 'phong' | 'normal' | 'toon';
  color?: string;
  emissive?: string;
  wireframe?: boolean;
  roughness?: number;
  metalness?: number;
};

// Available player skins
export const PLAYER_SKINS: Record<string, SkinData> = {
  default: { name: 'Default', material: 'standard', roughness: 0.7, metalness: 0 },
  metal: { name: 'Metal', material: 'standard', metalness: 0.9, roughness: 0.2 },
  glow: { name: 'Glow', material: 'standard', emissive: '#ff4400', roughness: 1, metalness: 0 },
  wireframe: {
    name: 'Wireframe',
    material: 'standard',
    wireframe: true,
    roughness: 0.5,
    metalness: 0,
  },
};

type PlayerProps = {
  player: PlayerState;
  isLocal: boolean;
};

export function Player({ player, isLocal }: PlayerProps) {
  const meshRef = useRef<Mesh>(null);
  const groupRef = useRef<Group>(null);
  const nicknameGroupRef = useRef<Group>(null);

  // Prepare skin-specific material properties
  const skinData = useMemo(() => {
    return PLAYER_SKINS[player.skin] || PLAYER_SKINS.default;
  }, [player.skin]);

  // Update visual position from player state
  useFrame(() => {
    if (!meshRef.current || !nicknameGroupRef.current) return;

    // Use lerp for remote players for smooth transitions
    if (!isLocal) {
      // Position
      meshRef.current.position.lerp(new Vector3().copy(player.position), 0.3);

      // Rotation
      meshRef.current.quaternion.slerp(new Quaternion().copy(player.rotation), 0.3);
    } else {
      // For local player, directly set position and rotation
      meshRef.current.position.copy(player.position);
      meshRef.current.quaternion.copy(player.rotation);
    }

    // Update nickname position to follow the ball but with a fixed offset
    nicknameGroupRef.current.position.x = meshRef.current.position.x;
    nicknameGroupRef.current.position.y = meshRef.current.position.y + 1.5;
    nicknameGroupRef.current.position.z = meshRef.current.position.z;
  });

  return (
    <group ref={groupRef}>
      {/* Player Ball */}
      <mesh ref={meshRef} position={player.position.toArray()} castShadow receiveShadow>
        <sphereGeometry args={[0.5, 32, 32]} />
        <meshStandardMaterial
          color={player.color}
          emissive={skinData.emissive || '#000000'}
          wireframe={skinData.wireframe || false}
          roughness={skinData.roughness !== undefined ? skinData.roughness : 0.7}
          metalness={skinData.metalness !== undefined ? skinData.metalness : 0}
        />
      </mesh>

      {/* Player Nickname - Fixed position above the ball */}
      <group
        ref={nicknameGroupRef}
        position={[player.position.x, player.position.y + 1.5, player.position.z]}
      >
        <Billboard>
          <Text
            color="#ffffff"
            fontSize={0.3}
            outlineWidth={0.02}
            outlineColor="#000000"
            anchorX="center"
            anchorY="middle"
          >
            {player.nickname}
          </Text>
        </Billboard>
      </group>
    </group>
  );
}
