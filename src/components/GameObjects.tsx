import { useEffect, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Player } from './Player';
import { GameMap } from './GameMap';
import { BombEffect } from './BombEffect';
import { useGameStore } from '@/stores/gameStore';
import { usePlayerControls } from '@/hooks/usePlayerControls';
import { useFollowCamera } from '@/hooks/useFollowCamera';
import { initPhysics, updatePhysics, cleanupPhysics } from '@/systems/physics';
import { Vector3 } from 'three';

type BombEffectData = {
  id: string;
  position: Vector3;
};

export function GameObjects() {
  // Get game state
  const players = useGameStore((state) => state.players);
  const localPlayerId = useGameStore((state) => state.localPlayerId);

  // Track active bomb effects
  const [bombEffects, setBombEffects] = useState<BombEffectData[]>([]);

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

  // Listen for bomb events
  useEffect(() => {
    const unsubscribe = useGameStore.subscribe((state, prevState) => {
      // Check if a player used a bomb (by comparing lastBombTime)
      Object.values(state.players).forEach((player) => {
        const prevPlayer = prevState.players[player.id];
        if (prevPlayer && player.lastBombTime > prevPlayer.lastBombTime) {
          // Add a bomb effect at the player's position
          setBombEffects((prev) => [
            ...prev,
            {
              id: `bomb-${player.id}-${player.lastBombTime}`,
              position: player.position.clone(),
            },
          ]);
        }
      });
    });

    return () => unsubscribe();
  }, []);

  // Update physics each frame
  useFrame((_, delta) => {
    updatePhysics(delta);
  });

  // Remove completed bomb effects
  const handleBombEffectComplete = (bombId: string) => {
    setBombEffects((prev) => prev.filter((effect) => effect.id !== bombId));
  };

  return (
    <>
      {/* Game map with boundaries, surfaces and obstacles */}
      <GameMap />

      {/* Render all players */}
      {Object.values(players).map((player) => (
        <Player key={player.id} player={player} isLocal={player.id === localPlayerId} />
      ))}

      {/* Render all bomb effects */}
      {bombEffects.map((effect) => (
        <BombEffect
          key={effect.id}
          position={effect.position}
          onComplete={() => handleBombEffectComplete(effect.id)}
        />
      ))}
    </>
  );
}
