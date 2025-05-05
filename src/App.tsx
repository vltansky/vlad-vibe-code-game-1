import { Scene } from './components/Scene';
import { Gamepad2 } from 'lucide-react';
import { MultiplayerUI } from './ui/MultiplayerUI';
import { Scoreboard } from './ui/Scoreboard';
import { useGameStore } from './stores/gameStore';
import { MobileControls } from './ui/MobileControls';
import { useDeviceDetect } from './hooks/useDeviceDetect';

function App() {
  const isConnected = useGameStore((state) => state.isConnected);
  const { isTouchDevice } = useDeviceDetect();

  return (
    <div className="h-screen w-full overflow-hidden bg-gray-900">
      {/* Multiplayer UI - Responsive layout adjustments */}
      <MultiplayerUI />

      {/* Scoreboard - only show when connected, responsive for mobile */}
      {isConnected && <Scoreboard />}

      {/* 3D Scene */}
      <Scene />

      {/* Mobile Controls - only shown on touch devices */}
      {isTouchDevice && <MobileControls />}
    </div>
  );
}

export default App;
