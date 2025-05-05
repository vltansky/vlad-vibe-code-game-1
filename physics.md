# Physics System (`src/systems/physics.ts`)

This file manages the physics simulation for the game using the `cannon-es` library. It handles world creation, player physics bodies, collision detection, and special ability effects like push and bomb.

## Key Components

### 1. Initialization (`initPhysics`)

- **World Creation:**
  - Creates a `CANNON.World` instance.
  - Sets gravity (`(0, -9.81, 0)`).
  - Enables `allowSleep` for performance.
  - Configures quaternion normalization (`quatNormalizeFast`, `quatNormalizeSkip`).
  - Sets the broadphase algorithm to `SAPBroadphase` for efficient collision detection.
  - Configures the solver (`iterations`, `tolerance`) for better collision resolution and stability.
- **Materials:**
  - `playerMaterial`: Defines physics properties (friction, restitution) for player bodies. Exported via `getPlayerMaterial()` for use in `mapPhysics`.
  - `groundMaterial`: Defines properties for the static ground plane.
- **Contact Materials:**
  - `playerToPlayerContact`: Defines interaction between two player bodies (e.g., bouncy collisions).
  - `groundPlayerContact`: Defines interaction between the ground and players (less bounce, higher stiffness to prevent tunneling). Wall-player contacts are added dynamically when player bodies are created, after importing `getWallMaterial` from `mapPhysics`.
- **Ground:**
  - Creates a static `CANNON.Plane` body (`groundBody`) using `groundMaterial`.
  - Rotates it to face upwards.
  - Adds it to the world.
- **King Zone Trigger:**
  - Calls `createKingZoneTrigger` to set up the trigger body.

### 2. King Zone (`createKingZoneTrigger`, `kingZoneTrigger`, `checkKingZoneOccupancy`)

- **Trigger Body:** A static `CANNON.Cylinder` shape (`kingZoneTrigger`) is created.
  - `collisionResponse: false`: It detects collisions but doesn't physically interact.
  - Positioned slightly above the center platform.
- **Detection:**
  - Collision events (`collide`) on player bodies check if the collision involves `kingZoneTrigger`. If so, `gameStore.enterKingZone` is called.
  - `checkKingZoneOccupancy` runs every `updatePhysics` frame, calculating the XZ distance of each player from the center. It calls `gameStore.enterKingZone` or `gameStore.leaveKingZone` based on whether the player is within `KING_ZONE_RADIUS`.

### 3. Player Bodies (`createPlayerBody`, `removePlayerBody`, `playerBodies`, `setupPlayerCollisionEvents`)

- **Creation (`createPlayerBody`):**
  - Takes `playerId`, `position`, and `radius`.
  - Creates a `CANNON.Body` with a `CANNON.Sphere` shape.
  - Assigns mass, linear/angular damping, and the shared `playerMaterial`.
  - Sets `allowSleep: false` to ensure players are always simulated.
  - Configures Continuous Collision Detection (CCD) properties (`ccdSpeedThreshold`, `ccdIterations`) to help prevent fast-moving players from tunneling through objects.
  - Adds the body to the world and stores it in the `playerBodies` map (keyed by `playerId`).
  - Sets up collision event listeners using `setupPlayerCollisionEvents`.
- **Removal (`removePlayerBody`):**
  - Removes the specified player's body from the world and the `playerBodies` map.
- **Storage:** The `playerBodies` object holds references to all active player physics bodies.
- **Collision Events (`setupPlayerCollisionEvents`):**
  - Attaches a `collide` event listener to each player body.
  - Primarily used to detect collisions with the `kingZoneTrigger`.

### 4. Physics Update Loop (`updatePhysics`)

- **Timing:**
  - Steps the physics world using `world.step()`.
  - Uses a `FIXED_TIMESTEP` (1/60s) for simulation stability.
  - Takes `deltaTime` (time since last frame) as input, capped at `0.1s` to prevent large jumps.
  - Uses `MAX_SUBSTEPS` to allow the simulation to catch up if frames are dropped.
- **State Synchronization:**
  - Iterates through `playerBodies`.
  - Reads the physics `position` and `quaternion` from each non-sleeping body.
  - Performs safety checks for `NaN` values in position/rotation, resetting if necessary.
  - Normalizes the `quaternion`.
  - Updates the `gameStore` for the `localPlayerId` using `updateLocalPlayerPosition` and `updateLocalPlayerRotation` (which also handles network broadcasting).
  - **Note:** Remote player positions are updated directly via network events handled elsewhere, likely using `setPlayerBodyPosition`.
- **Boundary Checks (`checkAndResetPlayerBoundary`):**
  - Checks if a player's `position` is outside predefined map boundaries (`mapSizeHalf`, `minY`, `maxY`).
  - Checks for `NaN` values in position or velocity.
  - If out of bounds or `NaN`, resets the player's `position` to a safe location (usually near center or slightly inside the boundary) and resets `velocity` and `angularVelocity` to zero.
  - Includes a check to dampen excessive negative Y velocity to prevent tunneling through the floor.
- **King Zone Logic:**
  - Calls `checkKingZoneOccupancy` for every player.
  - If a `currentKingId` exists in the `gameStore`, adds score based on `deltaTime`.

### 5. Abilities

- **Push (`applyPushEffect`):**
  - Takes the pusher's `position`, `direction`, and `excludePlayerId`.
  - Iterates through other players (`playerBodies`).
  - Calculates the distance to the target player.
  - If within `PUSH_RADIUS`, calculates a force magnitude (stronger closer to the center).
  - Calculates a push direction (combination of pusher's facing direction and radially outwards).
  - Applies the force as an `impulse` using `body.applyImpulse`.
  - Includes numerous safety checks for `NaN` values.
  - Caps the resulting velocity to prevent extreme speeds.
- **Bomb (`applyBombEffect`):**
  - Takes the bomb `position` and `excludePlayerId`.
  - Iterates through other players.
  - If within `BOMB_RADIUS`, calculates a force magnitude (stronger closer).
  - Calculates a force direction (radially outwards from the bomb + an upward bias).
  - Applies the force as an `impulse`.
  - Includes safety checks and velocity capping.

### 6. Utility Functions

- `applyForceToPlayer`: Applies a continuous force.
- `applyImpulseToPlayer`: Applies an instantaneous force (impulse).
- `setPlayerBodyPosition`: Directly sets a player's physics position (used for initialization/resetting).
- `setPlayerBodyVelocity`: Directly sets a player's physics velocity.
- `getPlayerBodyPosition`/`Velocity`/`Rotation`: Getters for player physics state.
- `getPhysicsWorld`: Exposes the `world` instance (used by `mapPhysics`).
- `getPlayerMaterial`: Exposes the `playerMaterial` (used by `mapPhysics`).

### 7. Cleanup (`cleanupPhysics`)

- Imports and calls `cleanupMapPhysics` from `./mapPhysics`.
- Removes all player bodies using `removePlayerBody`.
- Removes the `kingZoneTrigger`.
- Removes the `groundBody`.
- Sets the `world` reference to `null`.

## Constants

- `FIXED_TIMESTEP`: The interval for physics calculations (1/60s).
- `MAX_SUBSTEPS`: Maximum physics steps per frame if `deltaTime` is large.
- `PUSH_FORCE`, `PUSH_RADIUS`: Parameters for the push ability.
- `KING_ZONE_RADIUS`: Radius of the central scoring zone.
- `BOMB_FORCE`, `BOMB_RADIUS`: Parameters for the bomb ability.

## Interactions

- **`useGameStore`:** Reads state (`localPlayerId`, `currentKingId`, `kingZoneOccupants`) and calls actions (`updateLocalPlayerPosition`, `updateLocalPlayerRotation`, `enterKingZone`, `leaveKingZone`, `addPlayerScore`).
- **`mapPhysics.ts`:** Imports `getPhysicsWorld` and `getPlayerMaterial` to add map collision bodies and define contact materials between the map and players/other objects. `physics.ts` also imports `getWallMaterial` from `mapPhysics` to define wall-player interactions.
