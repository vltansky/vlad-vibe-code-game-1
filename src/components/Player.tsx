import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Mesh, Vector3, Quaternion, Group } from 'three';
import { PlayerState } from '@/stores/gameStore';
import { Billboard, Text } from '@react-three/drei';

type PlayerProps = {
  player: PlayerState;
  isLocal: boolean;
};

export function Player({ player, isLocal }: PlayerProps) {
  const meshRef = useRef<Mesh>(null);
  const groupRef = useRef<Group>(null);
  const nicknameGroupRef = useRef<Group>(null);

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
        <meshStandardMaterial color={player.color} />
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
