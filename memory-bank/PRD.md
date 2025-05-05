# WebRTC Rolling Balls - Competitive Multiplayer PRD

## Product Overview

A physics-based multiplayer 3D game where players control colorful balls and compete to become the "Last Ball Standing" in a king-of-the-hill style gameplay.

## Core Game Mechanics

### Base Movement

- **Controls**: WASD/Arrow keys for directional movement
- **Jump**: Spacebar with 1-second cooldown
- **Physics**: Realistic physics using Cannon.js with appropriate friction, restitution, and mass

### New Push Ability

- **Controls**: F key or right-click for "push" action
- **Cooldown**: 4 seconds between uses
- **Mechanics**: Applies a strong directional impulse in the player's facing direction
- **Range**: Affects balls within a 3-meter radius in front of the player
- **Force**: Strong enough to displace other players from the center zone
- **Visual Feedback**:
  - Brief shockwave/pulse effect from the player
  - Subtle screen shake when hit by a push
  - Visual cooldown indicator in the UI

## Competitive Mode: Last Ball Standing

### King Zone

- **Location**: Center of the map, slightly elevated platform
- **Size**: 3-meter diameter circle, large enough for one player
- **Visual Design**: Distinct colored area with crown symbol
- **Scoring**: Only one player can be "king" at a time
  - 1 point per second while in the zone as king
  - Target score: 60 points (1 minute total as king) to win

### King Status

- **Visual Indicator**: Crown or highlight effect on the current king
- **Takeover Mechanic**:
  - Player becomes king by being the only one in the zone
  - If multiple players are in the zone, no points are awarded until only one remains

### Leaderboard

- **Display**: Shows all players, their scores, and current king status
- **Location**: Top left corner of the screen
- **Updates**: Real-time score updates

## UI Requirements

### HUD Elements

- **Leaderboard**: Player names, scores, current king indicator
- **Push Cooldown**: Visual indicator showing remaining cooldown time
- **Control Hints**: Small indicator showing available controls
- **King Timer**: For the current king, shows time spent as king

### In-Game Notifications

- **King Status Changes**: "Player X is now king!"
- **Scoring Milestones**: "Player X has reached 30 points!"
- **Game Victory**: "Player X wins the game!"

## Technical Requirements

### Physics Enhancements

- Update physics system to incorporate directional push mechanic
- Add collision detection for king zone
- Implement scoring based on zone occupation

### Networking Enhancements

- Synchronize king status across all clients
- Ensure consistent scoring across the network
- Transmit push events reliably between players

### Performance Considerations

- Optimize physics calculations for multiple simultaneous players
- Minimize network overhead for push mechanics and king zone detection

## Future Enhancements (Post-MVP)

- Multiple zones with different point values
- Power-ups that spawn periodically (stronger push, temporary speed boost)
- Team mode: two teams compete for control of multiple zones
- Match timer with sudden death overtime
- Environmental hazards that affect the king zone periodically

## Success Metrics

- Average match duration: 3-5 minutes
- Player engagement: 3+ matches per session
- Competitive balance: No single strategy dominates gameplay
