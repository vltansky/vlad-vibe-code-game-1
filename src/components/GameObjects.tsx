import { useEffect, useState, useCallback } from 'react';
import { useFrame } from '@react-three/fiber';
import { Player } from './Player';
import { GameMap } from './GameMap';
import { BombEffect } from './BombEffect';
import { NPC } from './NPC';
import { useGameStore } from '@/stores/gameStore';
import { usePlayerControls } from '@/hooks/usePlayerControls';
import { useFollowCamera } from '@/hooks/useFollowCamera';
import { initPhysics, updatePhysics, cleanupPhysics } from '@/systems/physics';
import { Vector3 } from 'three';

// Define a type for the bomb payload received from other players
interface BombEventPayload {
  position: {
    x: number;
    y: number;
    z: number;
  };
  playerId: string;
}

type BombEffectData = {
  id: string;
  position: Vector3;
};

// NPC configuration
const NPC_COUNT = 1; // Number of NPCs to spawn
// No longer needed as we'll use getRandomCornerPosition
// const NPC_SPAWN_POSITIONS = [
//   new Vector3(10, 1, 10), // Position for first NPC
// ];

export function GameObjects() {
  // Get game state
  const players = useGameStore((state) => state.players);
  const localPlayerId = useGameStore((state) => state.localPlayerId);
  const isConnected = useGameStore((state) => state.isConnected);

  // Track active bomb effects
  const [bombEffects, setBombEffects] = useState<BombEffectData[]>([]);

  // Track NPCs
  const [npcs, setNpcs] = useState<{ id: string; position: Vector3; nickname: string }[]>([]);

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

  // Initialize NPCs when player connects
  useEffect(() => {
    if (isConnected) {
      // Create NPCs only when the player is connected
      const newNpcs = Array.from({ length: NPC_COUNT }).map((_, index) => ({
        id: `npc-${index}`,
        position: getRandomCornerPosition(), // Use random corner position for NPCs
        nickname: `Enemy ${index + 1}`,
      }));

      setNpcs(newNpcs);
    } else {
      // Clear NPCs when disconnected
      setNpcs([]);
    }
  }, [isConnected]);

  // Add NPC bomb handler
  const handleNPCBomb = useCallback((position: Vector3, npcId: string) => {
    setBombEffects((prev) => [
      ...prev,
      {
        id: `bomb-${npcId}-${Date.now()}`,
        position: position.clone(),
      },
    ]);
  }, []);

  // Helper function to get a random corner position (same as in gameStore.ts)
  function getRandomCornerPosition(): Vector3 {
    // Map boundaries from mapPhysics.ts (MAP_SIZE = 30)
    const mapSizeHalf = 14; // Half of MAP_SIZE minus a little buffer
    const margin = 3; // Add margin from the exact corners

    // Define the four corners (x, z coordinates)
    const corners = [
      [-mapSizeHalf + margin, -mapSizeHalf + margin], // Northwest corner
      [mapSizeHalf - margin, -mapSizeHalf + margin], // Northeast corner
      [-mapSizeHalf + margin, mapSizeHalf - margin], // Southwest corner
      [mapSizeHalf - margin, mapSizeHalf - margin], // Southeast corner
    ];

    // Select a random corner
    const randomCorner = corners[Math.floor(Math.random() * corners.length)];

    // Return the position with y = 1 (slightly above ground)
    return new Vector3(randomCorner[0], 1, randomCorner[1]);
  }

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

          console.log(
            `[GameObjects] Adding bomb effect for player ${player.id} at position:`,
            player.position
          );
        }
      });
    });

    return () => unsubscribe();
  }, []);

  // Add a new effect to listen for remote bomb events from the peerManager
  useEffect(() => {
    if (!isConnected) return;

    const handleRemoteBombEvent = () => {
      // Get our peerManager
      const peerManager = useGameStore.getState().peerManager;

      if (!peerManager) return;

      // Set up data event listener to receive bomb events
      peerManager.on('data', (peerId, data) => {
        // Listen for both event types for compatibility
        if (data.type === 'bomb_event' || data.type === 'bomb_ability_used') {
          // We received a bomb event from another player
          console.log(`[GameObjects] Received bomb event from ${peerId}:`, data.payload);

          const bombPayload = data.payload as BombEventPayload;
          const bombPosition = new Vector3(
            bombPayload.position.x,
            bombPayload.position.y,
            bombPayload.position.z
          );

          // Add bomb effect for the remote player
          setBombEffects((prev) => [
            ...prev,
            {
              id: `bomb-remote-${peerId}-${Date.now()}`,
              position: bombPosition,
            },
          ]);
        }
      });
    };

    // Initialize handling remote bomb events
    handleRemoteBombEvent();

    // Return cleanup function
    return () => {
      const peerManager = useGameStore.getState().peerManager;
      if (peerManager) {
        // Clean up the data event listener
        peerManager.off('data');
      }
    };
  }, [isConnected]);

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

      {/* Render all NPCs */}
      {npcs.map((npc) => (
        <NPC
          key={npc.id}
          id={npc.id}
          position={npc.position}
          nickname={npc.nickname}
          onBombUsed={handleNPCBomb}
        />
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
