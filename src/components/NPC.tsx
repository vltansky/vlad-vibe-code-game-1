import { useRef, useEffect, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Mesh, Vector3, Quaternion, Group } from 'three';
import { Billboard, Text } from '@react-three/drei';
import { useGameStore } from '@/stores/gameStore';
import { applyBombEffect } from '@/systems/physics';
import * as CANNON from 'cannon-es';

// Import constants and world getter
import { getPhysicsWorld, getPlayerMaterial } from '@/systems/physics';

// Time in ms between NPC bomb attacks
const ATTACK_COOLDOWN = 8000; // 8 seconds
// Distance at which NPC will use bomb ability
const ATTACK_DISTANCE = 2.5;
// Reaction delay in ms - how long before NPC reacts to player position changes
const REACTION_DELAY = 1500;
// NPC movement speed
const MOVEMENT_SPEED = 3; // Force multiplier - smaller than player movement force
// Distance at which NPC will stop approaching the player
const MIN_FOLLOW_DISTANCE = 1.8;

// NPC-specific collision group
const NPC_GROUP = 16; // New group, different from player group
const GROUND_GROUP = 2; // From physics.ts
const WALL_GROUP = 8; // From physics.ts

type NPCProps = {
  position: Vector3;
  id: string;
  nickname?: string;
};

export function NPC({ position, id, nickname = 'Enemy NPC' }: NPCProps) {
  const meshRef = useRef<Mesh>(null);
  const groupRef = useRef<Group>(null);
  const nicknameGroupRef = useRef<Group>(null);
  const npcPhysicsBody = useRef<CANNON.Body | null>(null); // Reference to NPC physics body
  const lastAttackTime = useRef<number>(0);
  const lastTargetUpdateTime = useRef<number>(0);
  const lastMoveTime = useRef<number>(0);

  // Set initial position
  const initialPosition = useRef(position.clone());

  // Track local state for the NPC
  const [npcState, setNpcState] = useState({
    position: position.clone(),
    rotation: new Quaternion(),
    lastBombTime: 0,
    targetPlayerPosition: null as Vector3 | null,
  });

  // Get players from game store
  const players = useGameStore((state) => state.players);

  // Initialize NPC physics
  useEffect(() => {
    // Create custom physics body for NPC instead of using createPlayerBody
    const world = getPhysicsWorld();
    const playerMaterial = getPlayerMaterial();

    if (!world || !playerMaterial) {
      console.error('[NPC] Physics world or materials not initialized');
      return;
    }

    // Create sphere shape for NPC
    const sphereShape = new CANNON.Sphere(0.5);
    const sphereBody = new CANNON.Body({
      mass: 0.1, // Very light mass
      shape: sphereShape,
      position: new CANNON.Vec3(position.x, position.y, position.z),
      material: playerMaterial,
      collisionFilterGroup: NPC_GROUP, // Use NPC group instead of PLAYER_GROUP
      collisionFilterMask: GROUND_GROUP | WALL_GROUP, // Only collide with ground and walls, not players
      fixedRotation: true,
      linearDamping: 0.9, // High damping to prevent excessive movement
    });

    // Store reference to the body
    npcPhysicsBody.current = sphereBody;
    world.addBody(sphereBody);

    // Clean up
    return () => {
      if (world && sphereBody) {
        world.removeBody(sphereBody);
      }
    };
  }, [id, position]);

  // Update visuals and AI behavior
  useFrame(() => {
    if (!meshRef.current || !nicknameGroupRef.current || !npcPhysicsBody.current) return;

    const body = npcPhysicsBody.current;
    const physicsPosition = new Vector3(body.position.x, body.position.y, body.position.z);
    const mesh = meshRef.current;
    const nicknameGroup = nicknameGroupRef.current;

    // Update our local state with the actual physics position
    setNpcState((prev) => ({
      ...prev,
      position: physicsPosition,
    }));

    const currentTime = Date.now();

    // Only update target player position after delay has passed
    if (currentTime - lastTargetUpdateTime.current > REACTION_DELAY) {
      // Get all player positions
      const playerPositions = Object.values(players).map((player) => player.position);

      if (playerPositions.length > 0) {
        // Find the closest player
        let closestDistance = Infinity;
        let closestPlayerIndex = -1;

        // Find index of closest player
        playerPositions.forEach((playerPos, index) => {
          const distance = physicsPosition.distanceTo(playerPos);
          if (distance < closestDistance) {
            closestDistance = distance;
            closestPlayerIndex = index;
          }
        });

        // If we found a closest player
        if (closestPlayerIndex >= 0) {
          const targetPosition = playerPositions[closestPlayerIndex].clone();
          setNpcState((prev) => ({
            ...prev,
            targetPlayerPosition: targetPosition,
          }));
          lastTargetUpdateTime.current = currentTime;
        }
      }
    }

    // If we have a player to target
    if (npcState.targetPlayerPosition) {
      // Calculate actual distance to player
      const actualDistance = physicsPosition.distanceTo(npcState.targetPlayerPosition);

      // Check if it's time to attack (use bomb)
      const canAttack = currentTime - lastAttackTime.current > ATTACK_COOLDOWN;

      if (canAttack && actualDistance < ATTACK_DISTANCE) {
        // Use bomb ability
        applyBombEffect(physicsPosition, id);
        lastAttackTime.current = currentTime;

        // Update state
        setNpcState((prev) => ({
          ...prev,
          lastBombTime: currentTime,
        }));
      }

      // Move towards target player if not too close
      // Add movement logic
      if (actualDistance > MIN_FOLLOW_DISTANCE && currentTime - lastMoveTime.current > 100) {
        // Calculate direction vector from NPC to player
        const direction = new Vector3()
          .subVectors(npcState.targetPlayerPosition, physicsPosition)
          .normalize();

        // Apply force to physics body in the direction of the player
        body.applyForce(
          new CANNON.Vec3(
            direction.x * MOVEMENT_SPEED,
            direction.y * MOVEMENT_SPEED,
            direction.z * MOVEMENT_SPEED
          )
        );

        lastMoveTime.current = currentTime;
      }

      // Update rotation to face player
      mesh.lookAt(npcState.targetPlayerPosition);
      const newRotation = mesh.quaternion.clone();
      setNpcState((prev) => ({
        ...prev,
        rotation: newRotation,
      }));
    }

    // Update mesh position and rotation
    mesh.position.copy(physicsPosition);
    mesh.quaternion.copy(npcState.rotation);

    // Update nickname position to follow above the NPC
    nicknameGroup.position.x = physicsPosition.x;
    nicknameGroup.position.y = physicsPosition.y + 1.5;
    nicknameGroup.position.z = physicsPosition.z;
  });

  return (
    <group ref={groupRef}>
      {/* NPC Mesh */}
      <mesh ref={meshRef} position={initialPosition.current.toArray()} castShadow receiveShadow>
        <sphereGeometry args={[0.5, 32, 32]} />
        <meshStandardMaterial color="red" />
      </mesh>

      {/* NPC Nickname */}
      <group
        ref={nicknameGroupRef}
        position={[
          initialPosition.current.x,
          initialPosition.current.y + 1.5,
          initialPosition.current.z,
        ]}
      >
        <Billboard>
          <Text
            color="#ff0000"
            fontSize={0.3}
            outlineWidth={0.02}
            outlineColor="#000000"
            anchorX="center"
            anchorY="middle"
          >
            {nickname}
          </Text>
        </Billboard>
      </group>
    </group>
  );
}
