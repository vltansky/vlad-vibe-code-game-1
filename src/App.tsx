import { Scene } from './components/Scene';
import { Gamepad2 } from 'lucide-react';
import { MultiplayerUI } from './ui/MultiplayerUI';
import { Scoreboard } from './ui/Scoreboard';
import { useGameStore } from './stores/gameStore';
import { MobileControls } from './ui/MobileControls';
import { useDeviceDetect } from './hooks/useDeviceDetect';

function App() {
  const isConnected = useGameStore((state) => state.isConnected);
  const { isMobile, isTouchDevice } = useDeviceDetect();

  return (
    <div className="h-screen w-full overflow-hidden bg-gray-900">
      {/* Header - Responsive for mobile */}
      <div className="absolute top-0 left-0 z-10 flex items-center gap-2 p-4 text-white">
        <Gamepad2 className="h-6 w-6" />
        <h1 className={`${isMobile ? 'text-lg' : 'text-2xl'} truncate font-bold`}>
          WebRTC Rolling Balls
        </h1>
      </div>

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
