# Multiplayer Ball Physics Game Cheatsheet

## Overview

P2P multiplayer 3D game with physics-based ball movement using WebRTC.

## Tech Stack

- **Frontend**: React, Vite, TypeScript
- **Graphics**: Three.js, React Three Fiber
- **Physics**: Cannon.js
- **Networking**: WebRTC (PeerJS), Socket.io (signaling/fallback)
- **UI**: shadcn/ui

## Key Features

### Multiplayer

- Hybrid Networking: WebRTC P2P via PeerJS, with Socket.io for signaling and fallback.
- Managed by `GameNetworkManager`.
- Signaling server handles prod/local via `?local=true`.
- Player state sync: position, rotation, velocity, animation (throttled, interpolated).
- Client-side prediction and interpolation for smooth movement.
- Automatic fallback to Socket.IO if WebRTC fails.

### Controls

- WASD/Arrows: Move
- Space: Jump (1s cooldown)
- F: Bomb explosion effect (10s cooldown)
- P: Push ability (4s cooldown)
- Physics: Damping (0.4), friction, nickname

### Special Abilities

#### Bomb Effect

- Triggered by pressing F key
- Creates radial explosion that pushes nearby players away
- Stronger force than the push ability (60 vs 40)
- Larger radius of effect (5m vs 3m)
- Adds upward force component to make players "jump" from explosion
- 10-second cooldown between uses
- Visual feedback with expanding, fading sphere

#### Push Ability

- Triggered by pressing P key
- Directional force that pushes players in the direction the player is facing
- 4-second cooldown between uses

### Environment

- Surfaces: Grass (med friction), Ice (low), Sticky (high)
- Center platform, ramp, 5 circular obstacles
- Follow

## Physics

- Cannon.js: Collisions
- Custom materials: Ice, sticky, standard
- Damping (0.4 linear/angular)
- Explosion physics with radial force

### UI

- Room: "game-room"
- Nickname input, status

## Network Architecture

### Modes

- **HYBRID**: Uses WebRTC for game data with Socket.IO signaling (default)
- **WEBRTC_ONLY**: Pure peer-to-peer with no server after initial connection
- **SIGNALING_ONLY**: Traditional client-server via Socket.IO

### Data Flow

1. Socket.IO for initial signaling and room management
2. WebRTC for direct peer-to-peer communication
3. Automatic fallback to Socket.IO if WebRTC connection fails
4. Position/rotation updates sent via unreliable data channel for lower latency
5. Special abilities (bomb, push) synchronized across all clients

### Key Components

- **SignalingClient**: Handles server communication (`src/lib/networking/signaling.ts`)
- **WebRTCPeer**: Manages peer connections (`src/lib/networking/webrtc-peer.ts`)
- **GameNetworkManager**: Coordinates hybrid networking (`src/lib/networking/game-network-manager.ts`)

## Game States

1. **Disconnected**: Nickname, join room
2. **Connecting**: WebRTC setup
3. **Connected**: Gameplay

## Code Structure

- `src/components/`: Scene, GameObjects, GameMap, Player, BombEffect
- `src/hooks/`: usePlayerControls, useFollowCamera
- `src/systems/`: physics, mapPhysics
- `src/stores/`: gameStore (Zustand)
- `src/lib/networking/`:
  - `signaling.ts`: Socket.IO client for server communication
  - `webrtc-peer.ts`: PeerJS wrapper for WebRTC connections
  - `game-network-manager.ts`: Hybrid networking coordinator
  - `usage-example.ts`: Example code showing how to use the networking system
- `src/ui/`: MultiplayerUI
- `server/server.py`: Socket.IO signaling server

## Network Optimization

- Position/rotation updates throttled to configurable rate (default: 20 updates/sec)
- Client-side interpolation for smooth movement despite network jitter
- Buffer-based interpolation system with configurable delay (default: 100ms)
- SLERP quaternion interpolation for smooth rotations
- Unreliable data channels prioritize latest updates over guaranteed delivery
- Special abilities synchronized immediately for responsive gameplay
