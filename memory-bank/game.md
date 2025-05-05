# Multiplayer Ball Physics Game Cheatsheet

## Overview

P2P multiplayer 3D game with physics-based ball movement using WebRTC, featuring King of the Hill gameplay mechanics.

## Tech Stack

- **Frontend**: React, Vite, TypeScript
- **Graphics**: Three.js, React Three Fiber
- **Physics**: Cannon.js
- **Networking**: WebRTC (custom PeerManager), ICE/STUN/TURN servers for NAT traversal
- **State Management**: Zustand
- **UI**: shadcn/ui

## Key Features

### Multiplayer

- Custom WebRTC P2P implementation using PeerManager
- ICE Servers configuration with multiple STUN/TURN fallbacks
- Player state synchronization: position, rotation, score, king status
- Client-side prediction and interpolation for smooth movement
- Spawn points in random corners to prevent player collisions

### Controls

- WASD/Arrows: Move
- Space: Jump (1s cooldown)
- F: Bomb explosion effect (10s cooldown)
- P: Push ability (4s cooldown)
- Physics: Damping (0.4), friction, nickname

### King of the Hill Mechanics

- Center zone designates the "hill"
- Player who solely occupies the hill becomes the king
- Kings accumulate points (1 per second)
- First player to reach 60 points (1 minute as king) wins
- King status is visually indicated and synced across the network
- Multiple players in the hill zone prevents anyone from being king

### Special Abilities

#### Bomb Effect

- Triggered by pressing F key
- Creates radial explosion that pushes nearby players away
- Stronger force than the push ability
- Larger radius of effect
- Adds upward force component to make players "jump" from explosion
- 10-second cooldown between uses
- Visual feedback with expanding, fading sphere
- Can be used to knock other players off the hill

#### Push Ability

- Triggered by pressing P key
- Directional force that pushes players in the direction the player is facing
- 4-second cooldown between uses
- Tactical use for knocking opponents off the platform or hill

### Environment

- Surfaces: Grass (med friction), Ice (low), Sticky (high)
- Center platform (king zone), ramp, obstacles
- Players spawn in random corners

## Physics

- Cannon.js: Collisions
- Custom materials: Ice, sticky, standard
- Damping (0.4 linear/angular)
- Explosion physics with radial force
- Player physics bodies created and synced with visual representation

## Network Architecture

### Components

- **PeerManager**: Core WebRTC connection management
- **ICE Servers**: Multiple fallback servers including:
  - Google STUN servers
  - Twilio STUN server
  - Metered TURN/STUN servers for NAT traversal

### Data Flow

1. PeerManager connects to signaling server
2. Players join rooms using room IDs
3. WebRTC direct peer connections established
4. Player state continuously synchronized
5. Special abilities (bomb, push) synchronized across all clients
6. King status and scores shared across the network

### State Synchronization

- Optimized partial updates to minimize bandwidth usage
- Only changed properties are transmitted
- Position and rotation updates
- King status and score synchronization
- Special ability usage broadcasts

## Game States

1. **Disconnected**: Initial state, can enter nickname and room ID
2. **Connecting**: Establishing WebRTC connections (15s timeout)
3. **Connected**: Gameplay active
4. **Game Over**: Player reached winning score (60 points)

## Code Structure

- `src/components/`: Scene, GameObjects, GameMap, Player, BombEffect
- `src/hooks/`: usePlayerControls, useFollowCamera
- `src/systems/`: physics, mapPhysics
- `src/stores/`: gameStore (Zustand)
- `src/lib/networking/`:
  - `peerManager.ts`: WebRTC connection management
  - `peer.ts`: Individual peer connection handling
- `src/ui/`: Game UI components, HUD, scores display
- `server/`: Signaling server

## Performance Optimization

- Broadcasts only changed properties to reduce network traffic
- Physics synchronization only when necessary
- Timeout handling for connections
- Dynamic host assignment (first player in room)
- Player cleanup on disconnect
