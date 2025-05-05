import { Scene } from './components/Scene';
import { Gamepad2 } from 'lucide-react';
import { MultiplayerUI } from './ui/MultiplayerUI';
import { Scoreboard } from './ui/Scoreboard';
import { useGameStore } from './stores/gameStore';

function App() {
  const isConnected = useGameStore((state) => state.isConnected);

  return (
    <div className="h-screen w-full bg-gray-900">
      <div className="absolute top-0 left-0 z-10 flex items-center gap-2 p-4 text-white">
        <Gamepad2 className="h-6 w-6" />
        <h1 className="text-2xl font-bold">WebRTC Rolling Balls</h1>
      </div>

      {/* Multiplayer UI */}
      <MultiplayerUI />

      {/* Scoreboard - only show when connected */}
      {isConnected && <Scoreboard />}

      {/* 3D Scene */}
      <Scene />
    </div>
  );
}

export default App;
