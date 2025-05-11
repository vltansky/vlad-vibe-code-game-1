# Rolling Balls - WebRTC Multiplayer Physics Game

A physics-based multiplayer 3D game where players control colorful balls and compete in a King of the Hill style gameplay. Players roll around a dynamic environment, using special abilities to knock opponents off the central platform while trying to maintain control of the King Zone to accumulate points and win.

## 🎮 Game Overview

### Core Gameplay
- **King of the Hill**: Compete to control the center platform (King Zone)
- **Scoring**: 1 point per second while being the only player in the King Zone
- **Win Condition**: First player to reach 60 points (1 minute as king) wins
- **Physics-Based**: Realistic ball movement with friction, collisions, and momentum

### Player Controls

#### Desktop
- **Movement**: WASD/Arrow keys for directional rolling
- **Jump**: Spacebar (1-second cooldown)
- **Bomb Ability**: F key creates a radial explosion pushing nearby players (10-second cooldown)
- **Push Ability**: P key applies directional force to opponents (4-second cooldown)

#### Mobile
- **Movement**: Virtual joystick (left side of screen)
- **Jump**: Dedicated button with visual cooldown indicator
- **Bomb Ability**: Touch button with cooldown progress ring
- **Special Abilities**: Touch buttons for all player actions
- **Responsive Design**: Control sizes adapt to different screen dimensions

### Special Features
- **Multiplayer**: Real-time gameplay with WebRTC peer-to-peer connections
- **Cross-Platform**: Seamless play between mobile and desktop devices
- **Responsive Design**: Fully playable on smartphones and tablets with touch controls
- **Player Customization**: Various ball skins and colors
- **Dynamic Environment**: Different surface types (ice, grass, sticky) affecting ball physics
- **Visual Effects**: Explosion and push effects with particles and screen shake

## 🚀 Technical Implementation

### Tech Stack
- **Frontend**: React 18, TypeScript, Vite
- **3D Rendering**: Three.js via React Three Fiber
- **Physics Engine**: Cannon.js for realistic physics simulation
- **Networking**: Custom WebRTC implementation with PeerManager
- **State Management**: Zustand for global game state
- **UI Components**: shadcn/ui with Tailwind CSS
- **Development Tools**: ESLint, Prettier, TypeScript

### Core Systems

#### Multiplayer Architecture
- **WebRTC P2P**: Direct peer-to-peer connections between players
- **PeerManager**: Custom WebRTC connection management
- **Signaling Server**: Facilitates initial connections between peers
- **ICE Servers**: Multiple STUN/TURN fallbacks for NAT traversal
- **Network Optimization**: Partial state updates to minimize bandwidth

#### Physics System
- **Cannon.js Integration**: Handles all collision detection and physics calculations
- **Custom Materials**: Different friction coefficients for varied surfaces
- **Collision Groups**: Separate collision handling for players, ground, and triggers
- **Special Abilities**: Physics-based bomb effects and directional pushing

#### Game Mechanics
- **King Zone Logic**: Tracks player presence in the center zone
- **Scoring System**: Real-time score accumulation for the king
- **Cooldown Management**: Tracks and enforces ability cooldowns
- **Win Condition**: Monitors scores to determine game completion

## 📦 Project Structure

```
src/
├── components/     # Game components (Player, BombEffect, GameMap)
│   └── ui/         # UI components and primitives
├── hooks/          # Custom hooks (usePlayerControls, useFollowCamera)
├── systems/        # Physics and game loop logic
├── stores/         # Zustand game state management
├── lib/            # Core utilities and networking
│   └── networking/ # WebRTC connection handling
├── ui/             # Game UI (HUD, leaderboard, menus)
├── App.tsx         # Main app layout
└── main.tsx        # Vite entry point
memory-bank/        # Project documentation
├── PRD.md          # Product requirements
├── game.md         # Game mechanics documentation
└── plan.md         # Development roadmap
server/             # Signaling server for WebRTC connections
```

## 🛠️ Getting Started

### Prerequisites

- Node.js (v18+)
- yarn

### Installation

```bash
# Clone the repository
git clone https://github.com/vltansky/wow-vibe-coding.git
cd wow-vibe-coding

# Install dependencies
yarn
```

### Development

```bash
# Start the development server
yarn dev

# In a separate terminal, start the signaling server
cd server
yarn dev
```

### Build

```bash
# Build for production
yarn build

# Build the signaling server
cd server
yarn build
```

## 🎮 Playing the Game

### Desktop
1. Open the application in your browser
2. Enter your nickname and a room ID 
3. Share the room ID with friends to join the same game
4. Use WASD/Arrow keys to move your ball
5. Press Space to jump
6. Use F key for the bomb ability (10-second cooldown)
7. Use P key for the push ability (4-second cooldown)
8. Control the center King Zone to accumulate points
9. First to reach 60 points wins!

### Mobile
1. Open the application on your mobile browser
2. Enter your nickname and room ID (same as desktop)
3. Use the virtual joystick on the left side to control movement
4. Tap the Jump button to jump
5. Tap the Bomb button to use your bomb ability
6. Tap the Push button to use your push ability
7. The game automatically detects mobile devices and enables touch controls
8. Visual indicators show ability cooldowns with progress rings

## 🔄 Multiplayer Server with Redis

The project includes a WebRTC signaling server with Redis for session management and horizontal scaling.

### Setting Up Redis Connection

The server can use Redis to manage session state across multiple server instances. This enables features like:

- Persistent rooms across server restarts
- Load balancing across multiple server instances
- Real-time synchronization of user states

#### Redis Connection Configuration

1. **Local Development**:

   ```bash
   # Run Redis locally with Docker
   docker run -d --name redis-server -p 6379:6379 redis

   # Configure .env in server directory
   REDIS_URL=redis://localhost:6379
   ```

2. **Hosted Service (Railway.app)**:

   - Create a Redis service in Railway
   - Access the connection details in the Variables tab
   - Use the `REDIS_URL` environment variable format:

   ```
   REDIS_URL=redis://username:password@host:port
   ```

3. **Authentication**:

   - If your Redis instance requires authentication (most hosted services do), use:

   ```
   REDIS_URL=redis://default:yourpassword@host:port
   ```

4. **Verification**:
   - Check server logs for "Connected to Redis server" (success)
   - If connection fails, the server will automatically fall back to in-memory storage

### Code Formatting

The project uses Prettier for consistent code formatting. Formatting will automatically be applied when you save files if you're using VSCode with the recommended extensions.

```bash
# Format all files
yarn format

# Check if files are formatted correctly
yarn format:check
```

## 🔌 Cursor: Model Context Protocol (MCP)

The project leverages Model Context Protocol (MCP) for enhanced AI-assisted development. MCPs provide contextual understanding and specialized tools for different aspects of development:

- **Three.js MCP**: Provides AI-assisted access to Three.js documentation, examples, and best practices
- **Cannon-es MCP**: Offers physics-related documentation and implementation guidance
- **Context7**: Advanced code context analysis and documentation lookup
- **Playwright MCP**: Browser automation and testing capabilities

These MCPs enable:

- AI-powered documentation assistance
- Contextual code suggestions
- Automated testing and browser control
- Enhanced development workflows through AI understanding of specific domains

## 📚 Documentation

- [Three.js Documentation](https://threejs.org/docs/)
- [React Three Fiber](https://docs.pmnd.rs/react-three-fiber)
- [shadcn/ui Documentation](https://ui.shadcn.com)
- [Tailwind CSS Documentation](https://tailwindcss.com/docs)
- [Vite Documentation](https://vitejs.dev/guide/)

# **Three.js Game Asset Resources**

## **2D Assets**

- **OpenGameArt** (Free): Pixel art, sprites, tilesets (PNG). Best for indie prototyping. [opengameart.org](https://opengameart.org/)
- **Itch.io** (Free/Paid, $5-$20): Pixel art, UI, tilesets (PNG). Stylized indie look. [itch.io](https://itch.io/)
- **Kenney** (Free/Donation): Sprites, UI (PNG). Rapid prototyping. [kenney.nl](https://kenney.nl/)
- **FLUX.1 (Hugging Face)** (Free/Paid): AI-generated textures (PNG). Free tier; paid via fal.ai/Replicate. Custom prototyping. [huggingface.co](https://huggingface.co/)
- **CraftPix.net** (Free/Paid, $5-$50): UI kits, sprites, effects (PNG). Clean UI focus. [craftpix.net](https://craftpix.net/)
- **Lospec** (Free): Pixel art palettes, tools (PNG). Stylized palette design. [lospec.com](https://lospec.com/)

## **3D Assets**

- **Trellis (Hugging Face)** (Free): AI-generated models (GLB) from FLUX.1 images. Rapid prototyping. [huggingface.co/spaces/JeffreyXiang/TRELLIS](https://huggingface.co/spaces/JeffreyXiang/TRELLIS)
- **Sketchfab** (Free/Paid, $10-$100): Models (GLTF/GLB). High-poly, realistic. [sketchfab.com](https://sketchfab.com/)
- **Poly Pizza** (Free): Low-poly models (GLTF). Stylized indie look. [poly.pizza](https://poly.pizza/)
- **Clara.io** (Free): Models, materials (GLTF). Simple prototyping. [clara.io](https://clara.io/)
- **CGTrader** (Free/Paid, $5-$50): Models (FBX, convert to GLTF). Realistic assets. [cgtrader.com](https://cgtrader.com/)
- **Mixamo** (Free): Rigged characters, animations (FBX, convert to GLTF via Blender plugin/FBX2GLTF). Animated prototyping. [mixamo.com](https://mixamo.com/)
- **Hunyuan 3D** (Free/Paid): AI-generated models (GLTF). Custom prototyping. [3d-models.hunyuan.tencent.com](https://3d-models.hunyuan.tencent.com/)
- **MeshyAI** (Free/Paid, \~$10/mo): AI-generated models (GLTF). Stylized prototyping. [meshy.ai](https://meshy.ai/)
- **Quaternius** (Free): Low-poly packs (GLTF/FBX). Stylized indie look. [quaternius.com](https://quaternius.com/)
- **Turbosquid** (Free/Paid, $10-$200): Models (FBX/GLTF). High-poly, realistic. [turbosquid.com](https://turbosquid.com/)
- **Google Poly Archive** (Free): Mirrored low-poly models (OBJ/GLTF). Basic prototyping. [poly.google.com](https://poly.google.com/)

## **Sound Assets**

- **Freesound** (Free): Effects, loops (WAV/MP3, some need attribution). General prototyping. [freesound.org](https://freesound.org/)
- **Zapsplat** (Free/Paid, $20-$60/yr): Effects, music (MP3/WAV). Game soundscapes. [zapsplat.com](https://zapsplat.com/)
- **Itch.io** (Free/Paid, $5-$15): Chiptune, effects (WAV/MP3). Retro indie look. [itch.io](https://itch.io/)
- **Kenney Audio** (Free/Donation): Effects, loops (WAV). Rapid prototyping. [kenney.nl](https://kenney.nl/)
- **ElevenLabs** (Free/Paid, \~$5/mo): AI-generated SoundFX (WAV/MP3). Custom effects. [elevenlabs.io](https://elevenlabs.io/)
- **SunoMusic** (Free/Paid, \~$10/mo): AI-generated music (MP3/WAV). Vibe-coded soundtracks. [suno.com](https://suno.com/)
- **Bfxr** (Free): Procedural retro sound FX (WAV). Retro prototyping. [bfxr.net](https://bfxr.net/)

## **Skybox Assets**

- **Blockade Labs** (Free/Paid, \~$10/mo): AI-generated 360° skyboxes (cube maps, PNG). Stylized environments. [skybox.blockadelabs.com](https://skybox.blockadelabs.com/)

## **Animation/Sprite Helpers**

- **Rive** (Free/Paid, \~$15/mo): Realtime 2D animations (SVG/canvas). Dynamic UI/prototyping. [rive.app](https://rive.app/)
- **Aseprite** (Paid, $20): Sprite sheets, pixel art animations (PNG). Stylized indie look. [aseprite.org](https://aseprite.org/)

## **Optimization & Conversion Tools**

- **Blender** (Free): Convert FBX/OBJ to GLTF, decimate models. Asset optimization. [blender.org](https://blender.org/)
- **glTF-Transform** (Free CLI): Compress/optimize GLTF files. Performance tuning. [gltf-transform.donmccurdy.com](https://gltf-transform.donmccurdy.com/)

## **Workflow Helpers**

- **Three.js Editor** (Free): Online scene editor. Rapid prototyping. [threejs.org/editor](https://threejs.org/editor)
- **Spline** (Free/Paid, \~$7/mo): 3D design with Three.js export (GLTF). Intuitive prototyping. [spline.design](https://spline.design/)

## **Notes**

- **Formats**: GLTF/GLB for 3D, WAV/MP3 for audio, PNG/SVG for 2D. Convert FBX/OBJ to GLTF via Blender/FBX2GLTF.
- **Vibe Coding**: Trellis, FLUX.1, MeshyAI, ElevenLabs, Suno, Blockade Labs enable AI-driven workflows.
- **Licensing**: Verify commercial use. Free tiers have limits; paid tiers offer quality/volume.
- **Community**: Three.js Discord, r/threejs for integration tips.
