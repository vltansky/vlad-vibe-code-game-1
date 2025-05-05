// import { OrbitControls } from '@react-three/drei'; // Removed
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Suspense, useRef, useEffect } from 'react';
import { GameObjects } from './GameObjects';
import { ACESFilmicToneMapping, PCFSoftShadowMap, Scene as ThreeScene } from 'three';
import { getPhysicsWorld } from '@/systems/physics';
import CannonDebugger from 'cannon-es-debugger';

// Helper component for the debugger
function Debugger() {
  const { scene } = useThree();
  const world = getPhysicsWorld();
  const cannonDebuggerRef = useRef<ReturnType<typeof CannonDebugger> | null>(null);

  useEffect(() => {
    if (world && scene) {
      cannonDebuggerRef.current = CannonDebugger(scene as ThreeScene, world);
    }
    // Cleanup function
    return () => {
      if (cannonDebuggerRef.current) {
        // How to properly cleanup cannon-es-debugger?
        // The library doesn't provide an explicit cleanup method.
        // We might need to manually remove the meshes it adds.
        // For now, we'll leave it as is, but this needs revisiting.
      }
    };
  }, [scene, world]);

  useFrame(() => {
    if (cannonDebuggerRef.current) {
      cannonDebuggerRef.current.update();
    }
  });

  return null; // This component doesn't render anything itself
}

export function Scene() {
  return (
    <Canvas
      camera={{ position: [0, 15, 25], fov: 60 }} // Adjusted camera for better map view
      style={{ background: '#111' }}
      shadows={{ type: PCFSoftShadowMap }}
      gl={{
        antialias: true,
        toneMapping: ACESFilmicToneMapping,
      }}
    >
      <Suspense fallback={null}>
        <fog attach="fog" args={['#111', 25, 60]} />
        <ambientLight intensity={0.6} />
        <directionalLight
          position={[15, 20, 10]}
          intensity={1.5}
          castShadow
          shadow-mapSize-width={2048}
          shadow-mapSize-height={2048}
          shadow-camera-far={70} // Increased shadow range
          shadow-camera-left={-20}
          shadow-camera-right={20}
          shadow-camera-top={20}
          shadow-camera-bottom={-20}
        />
        <GameObjects />
        {/* Conditionally render debugger for development */}
        {/* {import.meta.env.DEV && <Debugger />} */}
      </Suspense>
    </Canvas>
  );
}
