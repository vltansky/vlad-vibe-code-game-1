import { useGameStore } from '@/stores/gameStore';
import { useState, useEffect } from 'react';

export function Scoreboard() {
  const players = useGameStore((state) => state.players);
  const gameWinner = useGameStore((state) => state.gameWinner);
  const localPlayerId = useGameStore((state) => state.localPlayerId);
  const resetScores = useGameStore((state) => state.resetScores);
  const [showWinMessage, setShowWinMessage] = useState(false);

  // Show win message when there's a winner
  useEffect(() => {
    if (gameWinner) {
      setShowWinMessage(true);

      // Hide the message after 10 seconds
      const timeout = setTimeout(() => {
        setShowWinMessage(false);
      }, 10000);

      return () => clearTimeout(timeout);
    }
  }, [gameWinner]);

  // Get sorted players by score
  const sortedPlayers = Object.values(players).sort((a, b) => b.score - a.score);

  return (
    <>
      {/* Game winner message */}
      {showWinMessage && gameWinner && (
        <div className="fixed inset-0 z-20 flex items-center justify-center">
          <div className="flex flex-col items-center gap-4 rounded-xl bg-black/80 p-8 text-center backdrop-blur-md">
            <h2 className="text-3xl font-bold text-white">{players[gameWinner].nickname} Wins!</h2>
            <p className="mb-2 text-lg text-gray-300">First to reach 60 points</p>
            <button
              onClick={() => {
                resetScores();
                setShowWinMessage(false);
              }}
              className="rounded-lg bg-blue-600 px-6 py-3 font-medium text-white transition-colors hover:bg-blue-500"
            >
              New Game
            </button>
          </div>
        </div>
      )}

      {/* Scoreboard */}
      <div className="absolute top-3 left-3 z-10 w-64 rounded-xl bg-gray-900/85 p-6 shadow-xl backdrop-blur-sm">
        <h2 className="mb-4 text-xl font-bold text-white">Leaderboard</h2>

        <div className="space-y-3">
          {sortedPlayers.map((player) => (
            <div
              key={player.id}
              className={`flex items-center justify-between rounded-lg p-2 ${
                player.id === localPlayerId ? 'bg-blue-800/40' : 'bg-gray-800/40'
              }`}
            >
              <div className="flex items-center gap-2">
                {player.isKing && (
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-yellow-500 text-xs">
                    👑
                  </span>
                )}
                <span className="h-3 w-3 rounded-full" style={{ backgroundColor: player.color }} />
                <span className="text-sm font-medium text-white">
                  {player.nickname}
                  {player.id === localPlayerId ? ' (You)' : ''}
                </span>
              </div>
              <span className="font-mono font-bold text-white">{Math.floor(player.score)}</span>
            </div>
          ))}
        </div>

        {/* Target score */}
        <div className="mt-4 border-t border-gray-800 pt-3 text-right text-xs text-gray-400">
          First to 60 points wins
        </div>
      </div>
    </>
  );
}
