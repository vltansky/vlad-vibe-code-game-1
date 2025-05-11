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
import { PeerData } from '@/lib/networking/peer';

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
  sourceTimestamp: number; // Added for debugging and timeout calculation
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
  
  // Add last cleanup timestamp to track when we last cleared all bomb effects
  const [lastGlobalCleanupTime, setLastGlobalCleanupTime] = useState<number>(Date.now());

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
    const bombId = `bomb-npc-${npcId}-${Date.now()}`;
    const newBombEffect: BombEffectData = {
      id: bombId,
      position: position.clone(),
      sourceTimestamp: Date.now(), // Store creation timestamp
    };
    console.log(
      `[GameObjects] Creating NPC bomb effect: ID ${bombId}, Timestamp ${newBombEffect.sourceTimestamp}`
    );
    setBombEffects((prev) => [...prev, newBombEffect]);
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
      Object.values(state.players).forEach((player) => {
        const prevPlayer = prevState.players[player.id];
        if (prevPlayer && player.lastBombTime > prevPlayer.lastBombTime) {
          const bombId = `bomb-local-${player.id}-${player.lastBombTime}`;
          const newBombEffect: BombEffectData = {
            id: bombId,
            position: player.position.clone(),
            sourceTimestamp: player.lastBombTime, // Use lastBombTime as the source for local
          };
          console.log(
            `[GameObjects] Creating local player bomb effect: ID ${bombId}, Timestamp ${newBombEffect.sourceTimestamp}`
          );
          setBombEffects((prev) => [...prev, newBombEffect]);
        }
      });
    });
    return () => unsubscribe();
  }, []);

  // Add a new effect to listen for remote bomb events from the peerManager
  useEffect(() => {
    if (!isConnected) return;
    const peerManager = useGameStore.getState().peerManager;
    if (!peerManager) return;

    const handleBombData = (peerId: string, data: PeerData) => {
      if (data.type === 'bomb_event' || data.type === 'bomb_ability_used') {
        const bombPayload = data.payload as BombEventPayload;
        if (
          bombPayload &&
          bombPayload.position &&
          typeof bombPayload.position.x === 'number' &&
          typeof bombPayload.position.y === 'number' &&
          typeof bombPayload.position.z === 'number'
        ) {
          const bombPosition = new Vector3(
            bombPayload.position.x,
            bombPayload.position.y,
            bombPayload.position.z
          );
          const currentTimestamp = Date.now(); // Use current time for remote bombs
          const bombId = `bomb-remote-${peerId}-${currentTimestamp}`;
          const newBombEffect: BombEffectData = {
            id: bombId,
            position: bombPosition,
            sourceTimestamp: currentTimestamp,
          };
          console.log(
            `[GameObjects] Creating remote player bomb effect: ID ${bombId}, Timestamp ${newBombEffect.sourceTimestamp} from peer ${peerId}`
          );
          setBombEffects((prev) => [...prev, newBombEffect]);
        } else {
          console.warn(
            '[GameObjects] Received remote bomb event with malformed payload from:',
            peerId,
            data.payload
          );
        }
      }
    };
    peerManager.on('data', handleBombData);

    return () => {
      if (peerManager) {
        peerManager.off('data', handleBombData);
      }
    };
  }, [isConnected]);

  // Update physics each frame
  useFrame((_, delta) => {
    // Skip on the first few frames to let scene initialize
    if (!isConnected) return;

    // Update physics world - cap delta to prevent large jumps
    const cappedDelta = Math.min(delta, 0.1);
    updatePhysics(cappedDelta);
    
    // Periodically clean up all bomb effects to prevent them from getting stuck
    const currentTime = Date.now();
    const timeSinceLastCleanup = currentTime - lastGlobalCleanupTime;
    
    // Clean up all bomb effects every 10 seconds (10000ms)
    if (timeSinceLastCleanup > 10000) {
      if (bombEffects.length > 0) {
        console.log(`[GameObjects] Performing global bomb effect cleanup. Clearing ${bombEffects.length} effects.`, 
          bombEffects.map(effect => effect.id));
        setBombEffects([]);
      }
      setLastGlobalCleanupTime(currentTime);
    }
  });

  // Add a useEffect to ensure bomb effects are cleaned up even if animation fails
  useEffect(() => {
    if (bombEffects.length > 0) {
      console.log(
        `[GameObjects Global Fallback] Effect RUN. Active effects (${bombEffects.length}):`,
        bombEffects.map((ef) => ef.id)
      );
      
      // Check for extremely old bomb effects (older than 10 seconds) and clear them immediately
      const currentTime = Date.now();
      const oldBombEffects = bombEffects.filter(
        effect => (currentTime - effect.sourceTimestamp) > 10000
      );
      
      if (oldBombEffects.length > 0) {
        console.log(
          `[GameObjects] Found ${oldBombEffects.length} bomb effects older than 10 seconds. Clearing immediately:`,
          oldBombEffects.map(e => e.id)
        );
        setBombEffects(prev => prev.filter(e => !oldBombEffects.some(oldE => oldE.id === e.id)));
        // If we cleared some effects, we can return early
        if (oldBombEffects.length === bombEffects.length) {
          return;
        }
      }
      
      const BOMB_MAX_LIFETIME = 3000; // 3 seconds max lifetime

      const timeouts = bombEffects.map((effect) => {
        const bombTimestamp = effect.sourceTimestamp; // Use stored sourceTimestamp
        const currentTime = Date.now();
        const timeElapsed = currentTime - bombTimestamp;
        const remainingTime = Math.max(0, BOMB_MAX_LIFETIME - timeElapsed);

        console.log(
          `[GameObjects Global Fallback] SETTING TIMEOUT for Bomb ID: ${effect.id}. SourceTS: ${bombTimestamp}, CurrentTS: ${currentTime}, Elapsed: ${timeElapsed}ms, Remaining: ${remainingTime}ms`
        );

        return setTimeout(() => {
          console.log(`[GameObjects Global Fallback] TIMEOUT FIRED for Bomb ID: ${effect.id}.`);
          setBombEffects((prev) => {
            // Check if the effect still exists, it might have been removed by onComplete normally
            const effectStillExists = prev.some((e) => e.id === effect.id);
            if (!effectStillExists) {
              console.log(
                `[GameObjects Global Fallback] Bomb ID: ${effect.id} was already removed (likely by onComplete). No action needed by this timeout. Prev state (IDs):`,
                prev.map((p) => p.id)
              );
              return prev; // No change needed
            }

            console.log(
              `[GameObjects Global Fallback] Attempting to remove Bomb ID: ${effect.id} via timeout. Prev state (IDs):`,
              prev.map((p) => p.id)
            );
            const newState = prev.filter((e) => e.id !== effect.id);
            console.log(
              `[GameObjects Global Fallback] Bomb ID: ${effect.id} removed by timeout. New state (IDs):`,
              newState.map((ns) => ns.id)
            );
            return newState;
          });
        }, remainingTime);
      });

      // Cleanup function for this effect
      return () => {
        console.log(
          '[GameObjects Global Fallback] Effect CLEANUP. Clearing timeouts for IDs:',
          bombEffects.map((ef) => ef.id)
        );
        timeouts.forEach(clearTimeout);
      };
    } else {
      // console.log('[GameObjects Global Fallback] No bomb effects, skipping timeout setup.');
    }
  }, [bombEffects]);

  // Remove completed bomb effects
  const handleBombEffectComplete = useCallback((bombId: string) => {
    console.log(`[GameObjects] handleBombEffectComplete CALLED for Bomb ID: ${bombId}`);
    setBombEffects((prev) => {
      const bombExists = prev.some((e) => e.id === bombId);
      if (!bombExists) {
        console.warn(
          `[GameObjects] handleBombEffectComplete: Bomb ID: ${bombId} was ALREADY REMOVED. Prev state (IDs):`,
          prev.map((p) => p.id)
        );
        return prev;
      }
      console.log(
        `[GameObjects] handleBombEffectComplete: Removing Bomb ID: ${bombId}. Prev state (IDs):`,
        prev.map((p) => p.id)
      );
      const newState = prev.filter((effect) => effect.id !== bombId);
      console.log(
        `[GameObjects] handleBombEffectComplete: Bomb ID: ${bombId} removed. New state (IDs):`,
        newState.map((ns) => ns.id)
      );
      return newState;
    });
  }, []);

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
          id={effect.id}
          position={effect.position}
          onComplete={() => handleBombEffectComplete(effect.id)}
        />
      ))}
    </>
  );
}
