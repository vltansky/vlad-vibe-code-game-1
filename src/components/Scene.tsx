// import { OrbitControls } from '@react-three/drei'; // Removed
import { Canvas } from '@react-three/fiber';
import { Suspense } from 'react';
import { GameObjects } from './GameObjects';
import { ACESFilmicToneMapping, PCFSoftShadowMap } from 'three';
import { useGameStore } from '@/stores/gameStore';

export function Scene() {
  // Get the connection state to determine if game has started
  const isConnected = useGameStore((state) => state.isConnected);

  return (
    <Canvas
      camera={{ position: [0, 15, 25], fov: 60 }} // Adjusted camera for better map view
      style={{
        background: '#111',
        opacity: isConnected ? 1 : 0.5,
        transition: 'opacity 0.5s ease',
      }}
      shadows={{ type: PCFSoftShadowMap }}
      gl={{
        antialias: true,
        toneMapping: ACESFilmicToneMapping,
        alpha: false, // Disable alpha for performance
        stencil: false, // Disable stencil for performance
        depth: true, // Keep depth testing
        powerPreference: 'high-performance',
      }}
      dpr={[1, 1.5]} // Limit pixel ratio for better performance
      performance={{ min: 0.5 }} // Allow dynamic performance scaling
    >
      <Suspense fallback={null}>
        <fog attach="fog" args={['#111', 25, 60]} />
        <ambientLight intensity={0.6} />
        <directionalLight
          position={[15, 20, 10]}
          intensity={1.5}
          castShadow
          shadow-mapSize-width={1024}
          shadow-mapSize-height={1024}
          shadow-camera-far={70} // Increased shadow range
          shadow-camera-left={-20}
          shadow-camera-right={20}
          shadow-camera-top={20}
          shadow-camera-bottom={-20}
        />
        <GameObjects />
      </Suspense>
    </Canvas>
  );
}
