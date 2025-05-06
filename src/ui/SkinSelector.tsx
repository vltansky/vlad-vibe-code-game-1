import { useState } from 'react';
import { useGameStore } from '@/stores/gameStore';
import { PLAYER_SKINS } from '@/components/Player';
import { Button } from '@/components/ui/button';

export function SkinSelector() {
  const localPlayerId = useGameStore((state) => state.localPlayerId);
  const players = useGameStore((state) => state.players);
  const changeSkin = useGameStore((state) => state.changeSkin);

  const currentSkin = localPlayerId ? players[localPlayerId]?.skin || 'default' : 'default';
  const [selectedSkin, setSelectedSkin] = useState(currentSkin);

  // Apply the selected skin
  const applySkin = () => {
    if (selectedSkin) {
      changeSkin(selectedSkin);
    }
  };

  return (
    <div className="flex flex-col gap-3 rounded-md border border-gray-700/70 bg-gray-800/50 p-4">
      <h3 className="text-sm font-semibold text-gray-200">Player Skin</h3>

      <div className="grid grid-cols-2 gap-2">
        {Object.entries(PLAYER_SKINS).map(([skinId, skinData]) => (
          <button
            key={skinId}
            className={`rounded-md border border-gray-700 p-2 text-xs transition-colors ${
              selectedSkin === skinId
                ? 'border-blue-500 bg-blue-900/40 text-blue-200'
                : 'bg-gray-800/60 text-gray-300 hover:bg-gray-700/60'
            }`}
            onClick={() => setSelectedSkin(skinId)}
          >
            {skinData.name}
          </button>
        ))}
      </div>

      <Button
        variant="default"
        onClick={applySkin}
        disabled={selectedSkin === currentSkin}
        className="mt-2"
      >
        Apply Skin
      </Button>
    </div>
  );
}
