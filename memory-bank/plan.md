# Implementation Plan: Last Ball Standing Mode

Based on `PRD.md` and `game.md`.

1.  **Player Push Ability (Physics & Networking):**

    - Modify `usePlayerControls.ts` to detect 'F' key/right-click input.
    - Implement a cooldown mechanism (4 seconds) in `usePlayerControls.ts` or a relevant state store.
    - In `physics.ts` or a new physics system file:
      - Add a function to apply a directional impulse to nearby physics bodies (`cannon-es`).
      - Define the range (3 meters) and force parameters.
    - In `peerManager.ts` or `gameStore.ts`:
      - Define a new message type for "push" actions.
      - When the local player triggers a push, send a message to peers containing the player's ID and facing direction/position.
      - On receiving a "push" message, trigger the impulse logic locally for the specified player.
    - Update `Player.tsx` or `GameObjects.tsx` to potentially handle receiving push impacts (e.g., applying force visually).

2.  **King Zone Implementation (Physics & Game Logic):**

    - Modify `GameMap.tsx` or create a new component for the King Zone platform:
      - Define its geometry (3-meter diameter cylinder/disk).
      - Assign a unique physics material or identifier.
    - In `physics.ts`:
      - Add collision detection logic specifically for the King Zone. Use collision groups/masks if necessary.
      - Maintain a list/set of players currently within the King Zone boundaries based on collision events (beginContact/endContact).
    - In `gameStore.ts` or a new dedicated game logic store/system:
      - Add state variables for `currentKing` (player ID or null) and `playerScores` (map of player ID to score).
      - Implement logic to determine the `currentKing`:
        - Check the list of players in the zone from the physics system.
        - If only one player is in the zone, set them as `currentKing`.
        - If zero or multiple players are in the zone, set `currentKing` to null.
      - Implement scoring logic:
        - Use a timer (`setInterval` or integrated into the game loop) to run every second.
        - If `currentKing` is not null, increment their score in `playerScores`.
        - Check for win condition (score >= 60).

3.  **King Status & Score Synchronization (Networking):**

    - Modify `peerManager.ts` and the state synchronization logic:
      - Include `currentKing` and `playerScores` in the state updates sent to peers.
      - Ensure received state updates correctly update the local `gameStore`.
    - Consider if specific events (king change, win condition met) need dedicated messages for immediate notification rather than relying solely on periodic state sync.

4.  **UI Updates (React & shadcn/ui):**

    - Create/modify UI components in `src/ui/`:
      - **Push Cooldown Indicator**: Add a visual element (e.g., radial progress, text timer) linked to the cooldown state in `usePlayerControls.ts` or `gameStore.ts`.
      - **Leaderboard**: Create a component that reads `playerScores` and `currentKing` from the store and displays player nicknames, scores, and a king icon next to the current king. Position it in the top-left corner.
      - **King Timer (for King)**: Conditionally render a timer display if the local player is the current king, showing their accumulated time/score.
      - **In-Game Notifications**: Use a notification system/toast component (potentially add one using `shadcn/ui` like `Sonner`) to display messages for king changes, score milestones, and game victory triggered by changes in the `gameStore`.
      - Update `MultiplayerUI.tsx` to include these new elements.

5.  **Visual Feedback:**

    - **Push Effect**: In `Player.tsx` or `GameObjects.tsx`, trigger a simple visual effect (e.g., expanding ring, particle burst) when a player initiates a push. This should be triggered locally for the pushing player and potentially replicated for others based on network messages.
    - **King Highlight**: In `Player.tsx`, conditionally apply a visual effect (e.g., change material color, add a crown model above the ball) to the player ball whose ID matches the `currentKing` state from the `gameStore`.
    - **Screen Shake**: Potentially add a subtle screen shake effect (e.g., using `react-use-shake` or a simple camera offset) when the local player is hit by a push.

6.  **Refinement & Testing:**
    - Tune push force and physics parameters for balanced gameplay.
    - Test network synchronization thoroughly under various conditions (latency, packet loss if possible).
    - Optimize physics and rendering for the added complexity.
    - Gather feedback on UI clarity and gameplay feel.
