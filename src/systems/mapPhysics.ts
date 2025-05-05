import * as CANNON from 'cannon-es';
import { Box3, Vector3 } from 'three';

// Define custom types for Cannon.js extensions
interface CannonBodyWithUserData extends CANNON.Body {
  userData?: {
    type: string;
    id: string;
  };
}

// Define contact event interface
interface BeginContactEvent {
  bodyA: CannonBodyWithUserData;
  bodyB: CannonBodyWithUserData;
  contact: CANNON.ContactEquation;
}

// Physics materials
let wallMaterial: CANNON.Material;
let groundMaterial: CANNON.Material;
let iceMaterial: CANNON.Material;
let stickyMaterial: CANNON.Material;
let rampMaterial: CANNON.Material;

// Map dimensions (match with GameMap.tsx)
const MAP_SIZE = 30;
const WALL_HEIGHT = 2;
const WALL_THICKNESS = 1;

// Wall bodies
const wallBodies: CANNON.Body[] = [];

// Corner blocker bodies
const cornerBlockerBodies: CANNON.Body[] = [];

// Ceiling body
let ceilingBody: CANNON.Body | null = null;

// Ground body
let groundBody: CANNON.Body | null = null;

// Center platform body
let centerPlatformBody: CANNON.Body | null = null;

// Ramp body
let rampBody: CANNON.Body | null = null;

// Obstacle bodies
const obstacleBodies: CANNON.Body[] = [];

// Reference to the world (will be set from physics.ts)
let world: CANNON.World | null = null;

// Initialize the map physics
export function createMapPhysics(mapBounds: Box3) {
  // Get the world from the main physics system
  import('./physics').then(({ getPhysicsWorld }) => {
    world = getPhysicsWorld();
    if (!world) {
      console.error('Physics world not initialized');
      return;
    }

    // Create materials
    createMaterials();

    // Create ground
    createGround();

    // Create walls
    createWalls(mapBounds);

    // Create corner blockers
    createCornerBlockers();

    // Create ceiling
    createCeiling();

    // Create center platform
    createCenterPlatform();

    // Create ramp
    createRamp();

    // Create obstacles
    createObstacles();

    // Add contact materials
    createContactMaterials();

    console.log('Map physics initialized');
  });
}

// Create physics materials
function createMaterials() {
  groundMaterial = new CANNON.Material('groundMaterial');
  groundMaterial.friction = 0.4;
  groundMaterial.restitution = 0.1;

  wallMaterial = new CANNON.Material('wallMaterial');
  wallMaterial.friction = 0.3;
  wallMaterial.restitution = 0.8;

  iceMaterial = new CANNON.Material('iceMaterial');
  iceMaterial.friction = 0.05;
  iceMaterial.restitution = 0.1;

  stickyMaterial = new CANNON.Material('stickyMaterial');
  stickyMaterial.friction = 0.8;
  stickyMaterial.restitution = 0.05;

  rampMaterial = new CANNON.Material('rampMaterial');
  rampMaterial.friction = 0.3;
  rampMaterial.restitution = 0.2;
}

// Create ground
function createGround() {
  if (!world) return;

  // Main ground
  const groundShape = new CANNON.Plane();
  groundBody = new CANNON.Body({
    mass: 0,
    type: CANNON.Body.STATIC,
    material: groundMaterial,
  });
  groundBody.addShape(groundShape);
  groundBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
  world.addBody(groundBody);

  // Ice area in center
  const iceShape = new CANNON.Box(new CANNON.Vec3(MAP_SIZE / 6, 0.01, MAP_SIZE / 6));
  const iceBody = new CANNON.Body({
    mass: 0,
    type: CANNON.Body.STATIC,
    material: iceMaterial,
    position: new CANNON.Vec3(0, 0.01, 0),
  });
  iceBody.addShape(iceShape);
  world.addBody(iceBody);

  // Sticky area
  const stickyShape = new CANNON.Box(new CANNON.Vec3(MAP_SIZE / 12, 0.01, MAP_SIZE / 6));
  const stickyBody = new CANNON.Body({
    mass: 0,
    type: CANNON.Body.STATIC,
    material: stickyMaterial,
    position: new CANNON.Vec3(MAP_SIZE / 3, 0.01, 0),
  });
  stickyBody.addShape(stickyShape);
  world.addBody(stickyBody);
}

// Create walls
function createWalls(mapBounds: Box3) {
  if (!world) return;

  const halfExtents = new Vector3().subVectors(mapBounds.max, mapBounds.min).multiplyScalar(0.5);

  // North wall
  const northWallShape = new CANNON.Box(
    new CANNON.Vec3(halfExtents.x + WALL_THICKNESS, WALL_HEIGHT / 2, WALL_THICKNESS / 2)
  );
  const northWallBody = new CANNON.Body({
    mass: 0,
    type: CANNON.Body.STATIC,
    material: wallMaterial,
    position: new CANNON.Vec3(0, WALL_HEIGHT / 2, -MAP_SIZE / 2 - WALL_THICKNESS / 2),
  }) as CannonBodyWithUserData;

  northWallBody.addShape(northWallShape);

  // Set user data for wall identification in collision events
  northWallBody.userData = { type: 'wall', id: 'north' };

  world.addBody(northWallBody);
  wallBodies.push(northWallBody);

  // South wall
  const southWallShape = new CANNON.Box(
    new CANNON.Vec3(halfExtents.x + WALL_THICKNESS, WALL_HEIGHT / 2, WALL_THICKNESS / 2)
  );
  const southWallBody = new CANNON.Body({
    mass: 0,
    type: CANNON.Body.STATIC,
    material: wallMaterial,
    position: new CANNON.Vec3(0, WALL_HEIGHT / 2, MAP_SIZE / 2 + WALL_THICKNESS / 2),
  }) as CannonBodyWithUserData;

  southWallBody.addShape(southWallShape);

  // Set user data for wall identification in collision events
  southWallBody.userData = { type: 'wall', id: 'south' };

  world.addBody(southWallBody);
  wallBodies.push(southWallBody);

  // East wall
  const eastWallShape = new CANNON.Box(
    new CANNON.Vec3(WALL_THICKNESS / 2, WALL_HEIGHT / 2, halfExtents.z)
  );
  const eastWallBody = new CANNON.Body({
    mass: 0,
    type: CANNON.Body.STATIC,
    material: wallMaterial,
    position: new CANNON.Vec3(MAP_SIZE / 2 + WALL_THICKNESS / 2, WALL_HEIGHT / 2, 0),
  }) as CannonBodyWithUserData;

  eastWallBody.addShape(eastWallShape);

  // Set user data for wall identification in collision events
  eastWallBody.userData = { type: 'wall', id: 'east' };

  world.addBody(eastWallBody);
  wallBodies.push(eastWallBody);

  // West wall
  const westWallShape = new CANNON.Box(
    new CANNON.Vec3(WALL_THICKNESS / 2, WALL_HEIGHT / 2, halfExtents.z)
  );
  const westWallBody = new CANNON.Body({
    mass: 0,
    type: CANNON.Body.STATIC,
    material: wallMaterial,
    position: new CANNON.Vec3(-MAP_SIZE / 2 - WALL_THICKNESS / 2, WALL_HEIGHT / 2, 0),
  }) as CannonBodyWithUserData;

  westWallBody.addShape(westWallShape);

  // Set user data for wall identification in collision events
  westWallBody.userData = { type: 'wall', id: 'west' };

  world.addBody(westWallBody);
  wallBodies.push(westWallBody);

  // Setup collision detection for all walls
  setupWallCollisionEvents();
}

// Add collision event handlers for walls
function setupWallCollisionEvents() {
  if (!world) return;

  // Add a global collision event listener for the world
  world.addEventListener('beginContact', (event: BeginContactEvent) => {
    const bodyA = event.bodyA;
    const bodyB = event.bodyB;

    // Check if this collision involves a wall
    const isWallA = bodyA.userData && bodyA.userData.type === 'wall';
    const isWallB = bodyB.userData && bodyB.userData.type === 'wall';

    if (isWallA || isWallB) {
      // Get the wall and the other body
      const wall = isWallA ? bodyA : bodyB;
      const otherBody = isWallA ? bodyB : bodyA;

      console.log('[DEBUG] Wall collision detected:', {
        wallId: wall.userData?.id,
        otherBodyType: otherBody.userData?.type,
        otherBodyVelocity: otherBody.velocity,
        otherBodyPosition: otherBody.position,
      });

      // Apply additional bounce force on impact
      if (otherBody.mass > 0) {
        // Make sure it's not another static body
        const bounceMultiplier = 1.3; // Extra bounce force
        const relativeVelocity = new CANNON.Vec3();

        // Calculate relative velocity
        if (isWallA) {
          relativeVelocity.copy(otherBody.velocity);
        } else {
          relativeVelocity.copy(otherBody.velocity).scale(-1);
        }

        console.log('[DEBUG] Pre-bounce state:', {
          wallId: wall.userData?.id,
          relativeVelocity,
          bounceMultiplier,
        });

        // Reflect the velocity based on wall normal
        const wallId = wall.userData?.id || '';
        const bounceForce = new CANNON.Vec3();

        switch (wallId) {
          case 'north':
            bounceForce.set(0, 0, Math.abs(relativeVelocity.z) * bounceMultiplier);
            break;
          case 'south':
            bounceForce.set(0, 0, -Math.abs(relativeVelocity.z) * bounceMultiplier);
            break;
          case 'east':
            bounceForce.set(-Math.abs(relativeVelocity.x) * bounceMultiplier, 0, 0);
            break;
          case 'west':
            bounceForce.set(Math.abs(relativeVelocity.x) * bounceMultiplier, 0, 0);
            break;
        }

        console.log('[DEBUG] Applying bounce force:', {
          wallId,
          bounceForce,
          upwardForce: new CANNON.Vec3(0, 2, 0),
        });

        // Apply the bounce force
        otherBody.applyImpulse(bounceForce);

        // Add a small upward force for more dynamic bounces
        otherBody.applyImpulse(new CANNON.Vec3(0, 2, 0));

        console.log('[DEBUG] Post-bounce state:', {
          position: otherBody.position,
          velocity: otherBody.velocity,
          angularVelocity: otherBody.angularVelocity,
        });
      }

      // Dispatch wall collision event for visual effects
      const collisionEvent = new CustomEvent('wall-collision', {
        detail: {
          wallId: wall.userData?.id,
          position: otherBody.position,
          velocity: otherBody.velocity,
        },
      });
      window.dispatchEvent(collisionEvent);
    }
  });
}

// Create corner blockers to prevent players from escaping at corners
function createCornerBlockers() {
  if (!world) return;

  // Size of the corner blockers
  const cornerSize = 3;
  const cornerHeight = 3;

  // Create blockers at each corner
  const corners = [
    { x: MAP_SIZE / 2, z: MAP_SIZE / 2 }, // Northeast
    { x: -MAP_SIZE / 2, z: MAP_SIZE / 2 }, // Northwest
    { x: MAP_SIZE / 2, z: -MAP_SIZE / 2 }, // Southeast
    { x: -MAP_SIZE / 2, z: -MAP_SIZE / 2 }, // Southwest
  ];

  corners.forEach((corner) => {
    // Create the corner blocker
    const cornerShape = new CANNON.Box(
      new CANNON.Vec3(cornerSize / 2, cornerHeight / 2, cornerSize / 2)
    );

    const cornerBody = new CANNON.Body({
      mass: 0,
      type: CANNON.Body.STATIC,
      material: wallMaterial,
      position: new CANNON.Vec3(corner.x, cornerHeight / 2, corner.z),
      collisionResponse: true,
    });

    cornerBody.addShape(cornerShape);
    world!.addBody(cornerBody);
    cornerBlockerBodies.push(cornerBody);
  });
}

// Create an invisible ceiling to prevent players from going too high
function createCeiling() {
  if (!world) return;

  // Create a ceiling plane at a reasonable height
  const ceilingHeight = 15; // Maximum jump height
  const ceilingShape = new CANNON.Plane();
  ceilingBody = new CANNON.Body({
    mass: 0,
    type: CANNON.Body.STATIC,
    material: wallMaterial,
    position: new CANNON.Vec3(0, ceilingHeight, 0),
    collisionResponse: true,
  });

  ceilingBody.addShape(ceilingShape);
  // Rotate the plane to face downward
  ceilingBody.quaternion.setFromEuler(Math.PI / 2, 0, 0);
  world.addBody(ceilingBody);
}

// Create center platform
function createCenterPlatform() {
  if (!world) return;

  const platformShape = new CANNON.Cylinder(3, 3, 0.6, 16);
  centerPlatformBody = new CANNON.Body({
    mass: 0,
    type: CANNON.Body.STATIC,
    material: groundMaterial,
    position: new CANNON.Vec3(0, 0.3, 0),
  });
  centerPlatformBody.addShape(platformShape);
  world.addBody(centerPlatformBody);
}

// Create ramp
function createRamp() {
  if (!world) return;

  const rampShape = new CANNON.Box(new CANNON.Vec3(MAP_SIZE / 12, 0.1, MAP_SIZE / 12));
  rampBody = new CANNON.Body({
    mass: 0,
    type: CANNON.Body.STATIC,
    material: rampMaterial,
    position: new CANNON.Vec3(-MAP_SIZE / 4, 0.5, MAP_SIZE / 4),
  });
  rampBody.addShape(rampShape);

  // Set rotation to match visual ramp
  const rampQuat = new CANNON.Quaternion();
  rampQuat.setFromEuler(Math.PI / 12, 0, 0);
  rampBody.quaternion = rampQuat;

  world.addBody(rampBody);
}

// Create obstacles
function createObstacles() {
  if (!world) return;

  for (let i = 0; i < 5; i++) {
    const angle = (i / 5) * Math.PI * 2;
    const distance = MAP_SIZE / 3;
    const x = Math.cos(angle) * distance;
    const z = Math.sin(angle) * distance;

    const obstacleShape = new CANNON.Box(new CANNON.Vec3(1, WALL_HEIGHT / 3, 1));
    const obstacleBody = new CANNON.Body({
      mass: 0,
      type: CANNON.Body.STATIC,
      material: wallMaterial,
      position: new CANNON.Vec3(x, WALL_HEIGHT / 3, z),
    });
    obstacleBody.addShape(obstacleShape);
    world.addBody(obstacleBody);
    obstacleBodies.push(obstacleBody);
  }
}

// Add contact materials for material interactions
function createContactMaterials() {
  if (!world) return;

  // Import the player material from physics.ts
  import('./physics').then(({ getPlayerMaterial }) => {
    const playerMaterial = getPlayerMaterial();
    if (!playerMaterial) {
      console.error('Player material not ready');
      return;
    }

    // Wall-Player contact - Bouncy collision
    const wallPlayerContact = new CANNON.ContactMaterial(wallMaterial, playerMaterial, {
      friction: 0.2,
      restitution: 1.2, // Increased from default for extra bouncy walls
      contactEquationStiffness: 1e8, // Higher stiffness for more immediate bounce
      contactEquationRelaxation: 3, // Lower relaxation for more responsive bounce
    });
    world!.addContactMaterial(wallPlayerContact);

    // Ground-Player contact - Normal movement
    const groundPlayerContact = new CANNON.ContactMaterial(groundMaterial, playerMaterial, {
      friction: 0.3,
      restitution: 0.1,
    });
    world!.addContactMaterial(groundPlayerContact);

    // Ice-Player contact - Slippery movement
    const icePlayerContact = new CANNON.ContactMaterial(iceMaterial, playerMaterial, {
      friction: 0.05,
      restitution: 0.2,
      contactEquationStiffness: 1e7,
      contactEquationRelaxation: 5,
    });
    world!.addContactMaterial(icePlayerContact);

    // Sticky-Player contact - Lots of friction
    const stickyPlayerContact = new CANNON.ContactMaterial(stickyMaterial, playerMaterial, {
      friction: 0.9,
      restitution: 0.05,
      contactEquationStiffness: 1e7,
      contactEquationRelaxation: 3,
    });
    world!.addContactMaterial(stickyPlayerContact);

    // Ramp-Player contact
    const rampPlayerContact = new CANNON.ContactMaterial(rampMaterial, playerMaterial, {
      friction: 0.4,
      restitution: 0.3,
    });
    world!.addContactMaterial(rampPlayerContact);

    console.log('Contact materials created');
  });
}

// Clean up map physics
export function cleanupMapPhysics() {
  if (!world) return;

  // Remove all wall bodies
  wallBodies.forEach((body) => {
    world!.removeBody(body);
  });
  wallBodies.length = 0;

  // Remove corner blockers
  cornerBlockerBodies.forEach((body) => {
    world!.removeBody(body);
  });
  cornerBlockerBodies.length = 0;

  // Remove ground
  if (groundBody) {
    world.removeBody(groundBody);
    groundBody = null;
  }

  // Remove center platform
  if (centerPlatformBody) {
    world.removeBody(centerPlatformBody);
    centerPlatformBody = null;
  }

  // Remove ramp
  if (rampBody) {
    world.removeBody(rampBody);
    rampBody = null;
  }

  // Remove obstacles
  obstacleBodies.forEach((body) => {
    world!.removeBody(body);
  });
  obstacleBodies.length = 0;

  // Remove ceiling
  if (ceilingBody) {
    world.removeBody(ceilingBody);
    ceilingBody = null;
  }
}

// Export wall material for use in other modules
export function getWallMaterial(): CANNON.Material | null {
  return wallMaterial || null;
}
