import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Mesh, Vector3, Quaternion, Group } from 'three';
import { PlayerState } from '@/stores/gameStore';

type PlayerProps = {
  player: PlayerState;
  isLocal: boolean;
};

export function Player({ player, isLocal }: PlayerProps) {
  const meshRef = useRef<Mesh>(null);
  const groupRef = useRef<Group>(null);
  const nicknameRef = useRef<Group>(null);

  // Update visual position from player state
  useFrame(() => {
    if (!meshRef.current || !nicknameRef.current) return;

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

    // Update nickname position to follow the ball
    if (nicknameRef.current) {
      nicknameRef.current.position.set(
        meshRef.current.position.x,
        meshRef.current.position.y + 1.5,
        meshRef.current.position.z
      );
    }
  });

  return (
    <group ref={groupRef}>
      {/* Player Ball */}
      <mesh ref={meshRef} position={player.position.toArray()} castShadow receiveShadow>
        <sphereGeometry args={[0.5, 32, 32]} />
        <meshStandardMaterial color={player.color} />
      </mesh>

      {/* Player Nickname */}
      <group
        ref={nicknameRef}
        position={[player.position.x, player.position.y + 1.5, player.position.z]}
      >
        <Billboard>
          <Text
            color="#ffffff"
            fontSize={0.3}
            outlineWidth={0.1}
            outlineColor="#000000"
            backgroundColor="#000000"
            backgroundOpacity={0.6}
          >
            {player.nickname}
          </Text>
        </Billboard>
      </group>
    </group>
  );
}

// Helper components
function Billboard({ children }: { children: React.ReactNode }) {
  const ref = useRef<Mesh>(null);

  useFrame(({ camera }) => {
    if (ref.current) {
      ref.current.quaternion.copy(camera.quaternion);
    }
  });

  return <mesh ref={ref}>{children}</mesh>;
}

function Text({
  children,
  fontSize = 0.1,
  color = '#ffffff',
  anchorX = 'center',
  anchorY = 'middle',
  outlineWidth = 0,
  outlineColor = '#000000',
  backgroundColor = 'transparent',
  backgroundOpacity = 0.8,
}: {
  children: React.ReactNode;
  fontSize?: number;
  color?: string;
  anchorX?: 'center' | 'left' | 'right';
  anchorY?: 'top' | 'middle' | 'bottom';
  outlineWidth?: number;
  outlineColor?: string;
  backgroundColor?: string;
  backgroundOpacity?: number;
}) {
  // Apply fontSize as a scale factor
  const scale = fontSize / 0.1; // 0.1 is the base fontSize

  return (
    <group scale={[scale * 0.1, scale * 0.1, scale * 0.1]}>
      {/* Background panel */}
      <mesh position={[0, 0, -0.01]}>
        <planeGeometry args={[4.5, 1.2]} />
        <meshBasicMaterial
          color={backgroundColor}
          transparent
          opacity={backgroundColor === 'transparent' ? 0 : backgroundOpacity}
        />
      </mesh>

      {/* Outline */}
      <mesh position={[0, 0, 0]}>
        <planeGeometry args={[4, 1]} />
        <meshBasicMaterial color={outlineColor} transparent opacity={outlineWidth > 0 ? 0.9 : 0} />
      </mesh>

      {/* Inner background */}
      <mesh position={[0, 0, 0.01]}>
        <planeGeometry args={[3.8, 0.8]} />
        <meshBasicMaterial transparent opacity={0.7} color="#000000" />
      </mesh>

      {/* Text Content */}
      <group position={[0, 0, 0.02]}>
        <mesh>
          <planeGeometry args={[3.6, 0.6]} />
          <meshBasicMaterial visible={false} />
          <group
            position={[
              anchorX === 'left' ? -1.7 : anchorX === 'right' ? 1.7 : 0,
              anchorY === 'top' ? 0.3 : anchorY === 'bottom' ? -0.3 : 0,
              0.01,
            ]}
          >
            {typeof children === 'string'
              ? children.split('').map((char, i) => (
                  <mesh key={i} position={[i * 0.35 - (children.length * 0.35) / 2 + 0.17, 0, 0]}>
                    <planeGeometry args={[0.3, 0.6]} />
                    <meshBasicMaterial color={color} transparent opacity={1} />
                  </mesh>
                ))
              : children}
          </group>
        </mesh>
      </group>
    </group>
  );
}
