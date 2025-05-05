import * as CANNON from 'cannon-es';
import { Box3, Vector3 } from 'three';

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
  wallMaterial.restitution = 0.4;

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
  });
  northWallBody.addShape(northWallShape);
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
  });
  southWallBody.addShape(southWallShape);
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
  });
  eastWallBody.addShape(eastWallShape);
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
  });
  westWallBody.addShape(westWallShape);
  world.addBody(westWallBody);
  wallBodies.push(westWallBody);
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

// Create contact materials between different surfaces
function createContactMaterials() {
  if (!world) return;

  // Import the player material from physics system
  import('./physics').then(({ getPlayerMaterial }) => {
    const playerMaterial = getPlayerMaterial();
    if (!playerMaterial) return;

    // Player-Ground contact
    const playerGroundContact = new CANNON.ContactMaterial(playerMaterial, groundMaterial, {
      friction: 0.4,
      restitution: 0.3,
    });
    world!.addContactMaterial(playerGroundContact);

    // Player-Ice contact
    const playerIceContact = new CANNON.ContactMaterial(playerMaterial, iceMaterial, {
      friction: 0.05,
      restitution: 0.1,
    });
    world!.addContactMaterial(playerIceContact);

    // Player-Sticky contact
    const playerStickyContact = new CANNON.ContactMaterial(playerMaterial, stickyMaterial, {
      friction: 0.8,
      restitution: 0.05,
    });
    world!.addContactMaterial(playerStickyContact);

    // Player-Wall contact
    const playerWallContact = new CANNON.ContactMaterial(playerMaterial, wallMaterial, {
      friction: 0.3,
      restitution: 0.6,
    });
    world!.addContactMaterial(playerWallContact);

    // Player-Ramp contact
    const playerRampContact = new CANNON.ContactMaterial(playerMaterial, rampMaterial, {
      friction: 0.3,
      restitution: 0.2,
    });
    world!.addContactMaterial(playerRampContact);
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
