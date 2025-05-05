import { useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { Player } from './Player';
import { GameMap } from './GameMap';
import { useGameStore } from '@/stores/gameStore';
import { usePlayerControls } from '@/hooks/usePlayerControls';
import { useFollowCamera } from '@/hooks/useFollowCamera';
import { initPhysics, updatePhysics, cleanupPhysics } from '@/systems/physics';

export function GameObjects() {
  // Get game state
  const players = useGameStore((state) => state.players);
  const localPlayerId = useGameStore((state) => state.localPlayerId);

  // Initialize player controls
  usePlayerControls();

  // Initialize follow camera
  useFollowCamera();

  // Initialize physics
  useEffect(() => {
    // Initialize physics system
    initPhysics();

    // Clean up
    return () => {
      cleanupPhysics();
    };
  }, []);

  // Update physics each frame
  useFrame((_, delta) => {
    updatePhysics(delta);
  });

  return (
    <>
      {/* Game map with boundaries, surfaces and obstacles */}
      <GameMap />

      {/* Render all players */}
      {Object.values(players).map((player) => (
        <Player key={player.id} player={player} isLocal={player.id === localPlayerId} />
      ))}
    </>
  );
}
