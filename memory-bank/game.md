# Multiplayer Ball Physics Game

## Overview

A peer-to-peer multiplayer 3D game where players control colorful balls in a physics-based environment. Players connect directly using WebRTC technology and can move around, jump, and interact with the environment and each other.

## Technical Stack

- **Frontend**: React, Vite, TypeScript
- **3D Graphics**: Three.js, React Three Fiber
- **Physics**: Cannon.js
- **Networking**: WebRTC via simple-peer
- **Signaling**: Socket.io (for initial connection only)
  - Local development mode via `?local=true` URL parameter
- **UI Components**: shadcn/ui

## Key Features

### Multiplayer System

- WebRTC peer-to-peer connections for low-latency direct communication
- Socket.io backend for initial signaling and peer discovery
  - Support for both production server and local development server
  - Toggle between servers with `?local=true` URL parameter
- Player state synchronization (position, velocity, nickname)
- Network optimization with throttled updates (100ms interval)
- Change detection to reduce bandwidth usage
- Proper player count tracking with nickname display

### Player Controls

- Keyboard WASD/Arrow keys movement with directional impulses
- Spacebar for jumping with 1-second cooldown
- Physics-based movement with optimized damping and friction values
- Customizable player nickname display
- Smooth movement response with appropriate force application

### Graphics and Environment

- 3D environment with dynamic lighting and shadows
- Mixed terrain with different friction surfaces:
  - Regular grass ground (medium friction)
  - Ice surface in the center (low friction)
  - Sticky surface on the sides (high friction)
- Center platform for tactical positioning
- Ramp for vertical movement opportunities
- Five obstacle blocks arranged in a circular pattern
- Smooth camera system that follows the local player
- Player ball color assignment based on connection ID

### Physics

- Full Cannon.js physics integration for realistic interactions
- Custom physics materials for varied friction and contact behavior
- Surface-specific materials (ice, sticky, standard)
- Linear damping (0.4) and angular damping (0.4) for smooth control
- Appropriate restitution values (bounciness) for player balls
- Proper collision detection between players and environment

### User Interface

- Room-based connection system ("game-room" as default)
- Nickname input and display
- Connection status indicators
- Player count display
- Control information toggle
- Clean, minimal design using shadcn/ui components

## Game States

1. **Disconnected**: Initial state, player can enter nickname and join/create room
2. **Connecting**: Establishing WebRTC connection via signaling server
3. **Connected**: Active gameplay with physics and multiplayer synchronization

## Code Structure

- `src/components/`: 3D scene components and player objects
  - `Scene.tsx`: Main canvas setup with lighting and rendering options
  - `GameObjects.tsx`: Manages all game entities and physics initialization
  - `GameMap.tsx`: Defines the environment with different surfaces
  - `Player.tsx`: Player ball with nickname display
- `src/hooks/`: Custom logic hooks
  - `usePlayerControls.ts`: Handles keyboard input and player movement
  - `useFollowCamera.ts`: Camera that smoothly follows the local player
- `src/systems/`: Global systems
  - `physics.ts`: Core physics integration with Cannon.js
  - `mapPhysics.ts`: Environment-specific physics setup
- `src/stores/`: Global state management
  - `gameStore.ts`: Zustand store for game state and multiplayer
- `src/lib/networking/`: WebRTC and Socket.io connection logic
  - `peerManager.ts`: Manages WebRTC connections
  - `signaling.ts`: Socket.io client for initial connections
  - `peer.ts`: Wrapper for simple-peer WebRTC implementation
- `src/ui/`: User interface components
  - `MultiplayerUI.tsx`: Connection UI and controls display

## QA Results

### Core Functionality

- ✅ Connection system works correctly with nickname customization
- ✅ Player movement and physics respond appropriately
- ✅ Camera follows player smoothly
- ✅ Multiplayer synchronization shows correct player count
- ✅ Different surfaces affect movement as expected
- ✅ Obstacle collision works properly
- ✅ UI correctly displays connection status and player information

### Performance

- The physics implementation is well-optimized with:
  - Appropriate use of sleep states for inactive objects
  - Efficient SAPBroadphase for collision detection
  - Optimized network updates with change detection
  - Separated physics update loop from rendering cycle

### Visual Polish

- Environment has good contrast between different surfaces
- Dynamic lighting creates appropriate shadows
- Player ball color provides visual distinction
- Nickname display is clearly visible above players

## Future Enhancements

- Game objectives and scoring system (e.g., timed challenges, collection points)
- Additional physics objects and interactive obstacles
- Power-ups and special abilities (speed boost, jump height)
- Improved physics optimization for larger player counts
- Chat system between connected players
- Custom player appearance options
- Mobile touch controls support
- Sound effects and background music
- Advanced game modes (races, capture the flag, etc.)
