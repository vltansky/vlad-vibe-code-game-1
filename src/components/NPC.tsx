import { useRef, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { Mesh, Vector3, Group } from 'three';
import { Billboard, Text } from '@react-three/drei';
import { useGameStore } from '@/stores/gameStore';
import { applyBombEffect } from '@/systems/physics';
import * as CANNON from 'cannon-es';

// Import constants and world getter
import { getPhysicsWorld, getPlayerMaterial } from '@/systems/physics';

// Time in ms between NPC bomb attacks
const ATTACK_COOLDOWN = 1500; // Reasonable cooldown to prevent cheating but still allow aggressive NPC behavior
// Distance at which NPC will use bomb ability
const ATTACK_DISTANCE = 2.5;
// Distance squared (avoid sqrt calculations)
const ATTACK_DISTANCE_SQ = ATTACK_DISTANCE * ATTACK_DISTANCE;
// Reaction delay in ms - how long before NPC reacts to player position changes
const REACTION_DELAY = 200; // Reduced for faster reaction
// NPC movement speed
const MOVEMENT_SPEED = 15; // Increased for faster movement
// Distance at which NPC will stop approaching the player
const MIN_FOLLOW_DISTANCE = 1.8;
const MIN_FOLLOW_DISTANCE_SQ = MIN_FOLLOW_DISTANCE * MIN_FOLLOW_DISTANCE;

// NPC-specific collision group
const NPC_GROUP = 16;
// For collision filtering
const PLAYER_GROUP = 1;
const GROUND_GROUP = 2;
const WALL_GROUP = 8;

// Bomb effect constants
const BOMB_RADIUS = 5; // Should match the same value in applyBombEffect
const BOMB_FORCE = 35; // Should match the same value in applyBombEffect
const UPWARD_BIAS = 0.3; // Should match the same value in applyBombEffect

// Reusable objects to avoid garbage collection
const _tempVec3 = new Vector3();
const _direction = new Vector3();
const _physicsPosition = new Vector3();
const _cannonForce = new CANNON.Vec3();
const _distVector = new Vector3();

type NPCProps = {
  position: Vector3;
  id: string;
  nickname?: string;
  onBombUsed?: (position: Vector3, npcId: string) => void;
};

export function NPC({ position, id, nickname = 'Enemy NPC', onBombUsed }: NPCProps) {
  const meshRef = useRef<Mesh>(null);
  const groupRef = useRef<Group>(null);
  const nicknameGroupRef = useRef<Group>(null);
  const npcPhysicsBody = useRef<CANNON.Body | null>(null);

  // Use refs for frequently changing values that don't need to trigger re-renders
  const lastAttackTime = useRef<number>(0);
  const lastTargetUpdateTime = useRef<number>(0);
  const lastMoveTime = useRef<number>(0);
  const initialPosition = useRef(position.clone());
  const targetPlayerPosition = useRef<Vector3 | null>(null);
  const isMoving = useRef<boolean>(false);

  // Initialize NPC physics
  useEffect(() => {
    const world = getPhysicsWorld();
    const playerMaterial = getPlayerMaterial();

    if (!world || !playerMaterial) {
      console.error('[NPC] Physics world or materials not initialized');
      return;
    }

    // Create sphere shape for NPC
    const sphereShape = new CANNON.Sphere(0.5);
    const sphereBody = new CANNON.Body({
      mass: 2, // Increased mass to ensure forces have more impact
      shape: sphereShape,
      position: new CANNON.Vec3(position.x, position.y, position.z),
      material: playerMaterial,
      collisionFilterGroup: NPC_GROUP,
      // Include PLAYER_GROUP in collision mask to detect player presence
      collisionFilterMask: GROUND_GROUP | WALL_GROUP | PLAYER_GROUP,
      fixedRotation: true,
      linearDamping: 0.2, // Reduced damping for smoother movement
    });

    // Keep collisionResponse true for proper physics with the environment
    sphereBody.collisionResponse = true;

    // Ensure the body can move freely
    sphereBody.allowSleep = false;

    npcPhysicsBody.current = sphereBody;
    world.addBody(sphereBody);

    // Debug logging to verify initialization
    console.log(`[NPC] ${id} initialized at position:`, position);

    return () => {
      if (world && sphereBody) {
        world.removeBody(sphereBody);
      }
    };
  }, [id, position]);

  // Listen for player bomb events and react when within range
  useEffect(() => {
    // Unsubscribe from previous store
    const unsubscribe = useGameStore.subscribe((state, prevState) => {
      // Check if a player used a bomb by comparing lastBombTime
      Object.values(state.players).forEach((player) => {
        const prevPlayer = prevState.players[player.id];
        if (prevPlayer && player.lastBombTime > prevPlayer.lastBombTime) {
          // Player used a bomb, check if NPC is within range
          const body = npcPhysicsBody.current;
          if (!body) return;

          // Get NPC position
          _physicsPosition.set(body.position.x, body.position.y, body.position.z);

          // Get bomb position (player position)
          const bombPosition = player.position;

          // Calculate distance from bomb
          _distVector.subVectors(_physicsPosition, bombPosition);
          const distance = _distVector.length();

          // If within bomb radius, apply impulse
          if (distance <= BOMB_RADIUS) {
            // Calculate force magnitude with falloff
            const forceMagnitude = BOMB_FORCE * Math.sqrt(1 - distance / BOMB_RADIUS);

            // Calculate force direction
            let forceDirection;
            if (distance < 0.1) {
              // If very close, use random direction with upward bias
              forceDirection = new Vector3(
                Math.random() * 2 - 1,
                Math.random() * 0.5 + 0.5,
                Math.random() * 2 - 1
              ).normalize();
            } else {
              // Direction away from explosion
              forceDirection = _distVector.clone().normalize();
            }

            // Add upward bias
            forceDirection.y += UPWARD_BIAS;

            // Normalize again
            forceDirection.normalize().multiplyScalar(forceMagnitude);

            // Apply impulse to NPC body
            body.applyImpulse(
              new CANNON.Vec3(forceDirection.x, forceDirection.y, forceDirection.z),
              body.position
            );

            console.log(
              `[NPC] ${id} hit by bomb from player ${player.id}, applying impulse:`,
              forceDirection
            );
          }
        }
      });
    });

    return () => unsubscribe();
  }, [id]);

  // Update visuals and AI behavior
  useFrame(() => {
    const mesh = meshRef.current;
    const nicknameGroup = nicknameGroupRef.current;
    const body = npcPhysicsBody.current;

    if (!mesh || !nicknameGroup || !body) return;

    // Update position from physics body without creating new Vector3
    _physicsPosition.set(body.position.x, body.position.y, body.position.z);

    const currentTime = Date.now();

    // Only update target player position after delay has passed
    if (currentTime - lastTargetUpdateTime.current > REACTION_DELAY) {
      // Get all player positions
      const playerEntries = Object.entries(useGameStore.getState().players);

      if (playerEntries.length > 0) {
        // Find the closest player using squared distance
        let closestDistanceSq = Infinity;
        let closestPlayer = null;

        for (const [, player] of playerEntries) {
          // Calculate squared distance (faster than using distanceTo which does sqrt)
          const dx = _physicsPosition.x - player.position.x;
          const dy = _physicsPosition.y - player.position.y;
          const dz = _physicsPosition.z - player.position.z;
          const distSq = dx * dx + dy * dy + dz * dz;

          if (distSq < closestDistanceSq) {
            closestDistanceSq = distSq;
            closestPlayer = player;
          }
        }

        if (closestPlayer) {
          // Only create a new Vector3 when target actually changes
          if (!targetPlayerPosition.current) {
            targetPlayerPosition.current = new Vector3();
          }
          targetPlayerPosition.current.copy(closestPlayer.position);
          lastTargetUpdateTime.current = currentTime;

          // Debug log player tracking
          console.log(`[NPC] ${id} tracking player at:`, targetPlayerPosition.current);
        }
      }
    }

    // If we have a player to target
    if (targetPlayerPosition.current) {
      // Calculate squared distance to player (avoid sqrt)
      const dx = _physicsPosition.x - targetPlayerPosition.current.x;
      const dy = _physicsPosition.y - targetPlayerPosition.current.y;
      const dz = _physicsPosition.z - targetPlayerPosition.current.z;
      const distanceSq = dx * dx + dy * dy + dz * dz;

      // Check if it's time to attack (use bomb)
      if (
        currentTime - lastAttackTime.current > ATTACK_COOLDOWN &&
        distanceSq < ATTACK_DISTANCE_SQ
      ) {
        applyBombEffect(_physicsPosition, id);
        lastAttackTime.current = currentTime;

        // Call the callback to create visual effect
        if (onBombUsed) {
          onBombUsed(_physicsPosition, id);
        }
      }

      // Move towards target player if not too close
      if (distanceSq > MIN_FOLLOW_DISTANCE_SQ && currentTime - lastMoveTime.current > 16) {
        // Calculate direction vector from NPC to player (reuse _direction)
        _direction.subVectors(targetPlayerPosition.current, _physicsPosition).normalize();

        // Apply direct velocity control for better responsiveness
        const targetVelocity = {
          x: _direction.x * MOVEMENT_SPEED,
          z: _direction.z * MOVEMENT_SPEED,
        };

        // Blend current velocity with target for smooth control
        body.velocity.x = body.velocity.x * 0.5 + targetVelocity.x * 0.5;
        body.velocity.z = body.velocity.z * 0.5 + targetVelocity.z * 0.5;

        // Add impulse for immediate movement
        _cannonForce.set(_direction.x * 20, 0, _direction.z * 20);
        body.applyImpulse(_cannonForce, body.position);

        // Ensure Y velocity isn't causing the NPC to fly
        if (Math.abs(body.position.y - initialPosition.current.y) > 0.5 && body.velocity.y > 0) {
          body.velocity.y = 0;
        }

        // Cap maximum velocity for stability
        const speedSq = body.velocity.x * body.velocity.x + body.velocity.z * body.velocity.z;
        if (speedSq > 400) {
          // 20^2
          const scale = 20 / Math.sqrt(speedSq);
          body.velocity.x *= scale;
          body.velocity.z *= scale;
        }

        lastMoveTime.current = currentTime;
        isMoving.current = true;
      } else {
        isMoving.current = false;
      }

      // Update rotation to face player - reuse existing object
      _tempVec3.copy(targetPlayerPosition.current);
      mesh.lookAt(_tempVec3);
    }

    // Update mesh position and rotation
    mesh.position.copy(_physicsPosition);

    // Update nickname position
    nicknameGroup.position.x = _physicsPosition.x;
    nicknameGroup.position.y = _physicsPosition.y + 1.5;
    nicknameGroup.position.z = _physicsPosition.z;
  });

  return (
    <group ref={groupRef}>
      {/* NPC Mesh */}
      <mesh ref={meshRef} position={initialPosition.current.toArray()} castShadow receiveShadow>
        <sphereGeometry args={[0.5, 16, 16]} /> {/* Reduced segments for better performance */}
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
