import { useRef, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { Mesh, Vector3, Group } from 'three';
import { Billboard, Text } from '@react-three/drei';
import { useGameStore } from '@/stores/gameStore';
import { applyBombEffect } from '@/systems/physics';
import * as CANNON from 'cannon-es';

// Import constants and world getter
import { getPhysicsWorld, getPlayerMaterial, getCollisionMask } from '@/systems/physics';

// Time in ms between NPC bomb attacks
const ATTACK_COOLDOWN = 8000; // 8 seconds
// Distance at which NPC will use bomb ability
const ATTACK_DISTANCE = 2.5;
// Distance squared (avoid sqrt calculations)
const ATTACK_DISTANCE_SQ = ATTACK_DISTANCE * ATTACK_DISTANCE;
// Reaction delay in ms - how long before NPC reacts to player position changes
const REACTION_DELAY = 400; // Reduced for faster reaction
// NPC movement speed
const MOVEMENT_SPEED = 10; // Increased for faster movement
// Distance at which NPC will stop approaching the player
const MIN_FOLLOW_DISTANCE = 1.8;
const MIN_FOLLOW_DISTANCE_SQ = MIN_FOLLOW_DISTANCE * MIN_FOLLOW_DISTANCE;

// NPC-specific collision group
const NPC_GROUP = 16;

// Reusable objects to avoid garbage collection
const _tempVec3 = new Vector3();
const _direction = new Vector3();
const _physicsPosition = new Vector3();
const _cannonForce = new CANNON.Vec3();
const _cannonPoint = new CANNON.Vec3();

type NPCProps = {
  position: Vector3;
  id: string;
  nickname?: string;
};

export function NPC({ position, id, nickname = 'Enemy NPC' }: NPCProps) {
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
      mass: 1,
      shape: sphereShape,
      position: new CANNON.Vec3(position.x, position.y, position.z),
      material: playerMaterial,
      collisionFilterGroup: NPC_GROUP,
      collisionFilterMask: getCollisionMask('npc'),
      fixedRotation: true,
      linearDamping: 0.3, // Reduced damping for faster movement
    });

    npcPhysicsBody.current = sphereBody;
    world.addBody(sphereBody);

    return () => {
      if (world && sphereBody) {
        world.removeBody(sphereBody);
      }
    };
  }, [id, position]);

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
      }

      // Move towards target player if not too close
      if (distanceSq > MIN_FOLLOW_DISTANCE_SQ && currentTime - lastMoveTime.current > 30) {
        // Calculate direction vector from NPC to player (reuse _direction)
        _direction.subVectors(targetPlayerPosition.current, _physicsPosition).normalize();

        // Apply force to physics body
        _cannonForce.set(
          _direction.x * MOVEMENT_SPEED,
          0, // Keep y-force at 0 to prevent flying
          _direction.z * MOVEMENT_SPEED
        );

        _cannonPoint.copy(body.position);
        body.applyForce(_cannonForce, _cannonPoint);

        // Add direct velocity component for responsive movement
        body.velocity.x += _direction.x * 3;
        body.velocity.z += _direction.z * 3;

        // Cap maximum velocity for stability
        const speedSq = body.velocity.x * body.velocity.x + body.velocity.z * body.velocity.z;
        if (speedSq > 225) {
          // 15^2
          const scale = 15 / Math.sqrt(speedSq);
          body.velocity.x *= scale;
          body.velocity.z *= scale;
        }

        lastMoveTime.current = currentTime;
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
