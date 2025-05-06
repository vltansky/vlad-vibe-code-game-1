import { Suspense, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { PerspectiveCamera, Environment } from '@react-three/drei';
import { PLAYER_SKINS } from '@/components/Player';
import { Mesh } from 'three';
import * as THREE from 'three';

// Player ball component with focus on material display
function PlayerBall({ playerColor, playerSkinId }: { playerColor: string; playerSkinId: string }) {
  const skinData = PLAYER_SKINS[playerSkinId] || PLAYER_SKINS.default;
  const meshRef = useRef<Mesh>(null);

  // Float and rotate animation for showcase
  useFrame(({ clock }) => {
    if (!meshRef.current) return;
    const t = clock.getElapsedTime();
    meshRef.current.position.y = Math.sin(t * 0.5) * 0.1;
    meshRef.current.rotation.y = t * 0.2;
  });

  return (
    <mesh ref={meshRef} position={[0, 0, 0]} castShadow receiveShadow>
      <sphereGeometry args={[0.5, 32, 32]} />
      <meshStandardMaterial
        color={playerColor}
        emissive={skinData.emissive || '#000000'}
        emissiveIntensity={skinData.emissive ? 0.5 : 0}
        wireframe={skinData.wireframe || false}
        roughness={skinData.roughness !== undefined ? skinData.roughness * 1.5 : 1}
        metalness={skinData.metalness !== undefined ? skinData.metalness * 0.6 : 0}
        envMapIntensity={0.5}
      />
    </mesh>
  );
}

// Camera controller that slowly circles the ball
function CameraController() {
  const cameraRef = useRef<THREE.PerspectiveCamera>(null);

  useFrame(({ clock }) => {
    if (!cameraRef.current) return;

    // Simple circular camera path focused on the ball
    const t = clock.getElapsedTime() * 0.2;
    const radius = 3;

    // Calculate camera position in a circle
    const camX = Math.sin(t) * radius;
    const camZ = Math.cos(t) * radius;
    const camY = 0.5 + Math.sin(t * 0.5) * 0.3;

    // Update camera position
    cameraRef.current.position.set(camX, camY, camZ);
    cameraRef.current.lookAt(0, 0, 0);
  });

  return <PerspectiveCamera ref={cameraRef} makeDefault position={[3, 0.5, 0]} fov={30} />;
}

type PlayerPreviewProps = {
  playerColor: string;
  playerSkinId: string;
};

export function PlayerPreview({ playerColor, playerSkinId }: PlayerPreviewProps) {
  return (
    <div className="pointer-events-none fixed top-1/2 left-1/2 z-30 hidden h-48 w-48 -translate-x-1/2 -translate-y-1/2 transform overflow-visible md:block">
      {/* Loading spinner shown while Canvas is initializing */}
      <div
        className="pointer-events-none absolute inset-0 z-40 flex items-center justify-center"
        id="canvas-loader"
      >
        <div className="bg-opacity-80 rounded-lg bg-gray-800 p-4 text-center shadow-lg">
          <div className="mx-auto mb-3 h-6 w-6 animate-spin rounded-full border-t-2 border-b-2 border-white"></div>
          <p className="text-xs text-white">Loading...</p>
        </div>
      </div>

      <Canvas
        shadows
        dpr={[1, 2]}
        style={{ background: 'transparent', pointerEvents: 'none' }}
        gl={{ alpha: true, antialias: true }}
        onCreated={({ gl }) => {
          gl.setClearColor(0x000000, 0); // Set clear color with alpha 0 (transparent)
          // Hide the loader when canvas is ready
          const loader = document.getElementById('canvas-loader');
          if (loader) loader.style.display = 'none';
        }}
      >
        <Suspense fallback={null}>
          {/* Scene lighting optimized for ball showcase - toned down to match game */}
          <ambientLight intensity={0.3} />

          {/* Key light - reduced intensity */}
          <spotLight position={[5, 5, 2]} intensity={1} castShadow />

          {/* Fill light - reduced intensity */}
          <pointLight position={[-5, 2, -2]} intensity={0.3} color="#aaccff" />

          {/* Rim light - reduced intensity */}
          <pointLight position={[0, -1, -5]} intensity={0.2} color="#ffaa99" />

          {/* Animated camera */}
          <CameraController />

          {/* Environment for better reflection on metallic materials - less intense */}
          <Environment preset="city" background={false} />

          {/* Player Ball - centered and focus of the scene */}
          <PlayerBall playerColor={playerColor} playerSkinId={playerSkinId} />
        </Suspense>
      </Canvas>

      {/* Label overlay to confirm the preview is visible */}
      <div className="bg-opacity-50 pointer-events-none absolute right-0 bottom-0 left-0 bg-black p-1 text-center text-xs text-white">
        Preview
      </div>
    </div>
  );
}
