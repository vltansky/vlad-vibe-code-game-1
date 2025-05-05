import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Vector3 } from 'three';
import { useGameStore } from '@/stores/gameStore';

const CAMERA_OFFSET = new Vector3(0, 8, 12); // Adjusted offset for better view
const SMOOTH_FACTOR = 0.2; // Further increased for even more responsive camera

export function useFollowCamera() {
  const { camera } = useThree();
  const localPlayerId = useGameStore((state) => state.localPlayerId);
  const players = useGameStore((state) => state.players);
  const currentPosition = useRef(camera.position.clone());
  const lookAtTarget = useRef(new Vector3());

  useEffect(() => {
    // Reset camera position when local player ID changes (e.g., on connect)
    if (localPlayerId && players[localPlayerId]) {
      const playerPos = players[localPlayerId].position;
      currentPosition.current.copy(playerPos).add(CAMERA_OFFSET);
      lookAtTarget.current.copy(playerPos);
      camera.position.copy(currentPosition.current);
      camera.lookAt(lookAtTarget.current);
    } else {
      // Default position if no local player
      currentPosition.current.set(0, 15, 25);
      lookAtTarget.current.set(0, 0, 0);
    }
  }, [localPlayerId, camera, players]);

  useFrame(() => {
    if (localPlayerId && players[localPlayerId]) {
      const playerPos = players[localPlayerId].position;
      const targetPosition = playerPos.clone().add(CAMERA_OFFSET);

      // Smoothly interpolate camera position
      currentPosition.current.lerp(targetPosition, SMOOTH_FACTOR);

      // Smoothly interpolate lookAt target
      lookAtTarget.current.lerp(playerPos, SMOOTH_FACTOR);

      camera.position.copy(currentPosition.current);
      camera.lookAt(lookAtTarget.current);
    }
  });
}
