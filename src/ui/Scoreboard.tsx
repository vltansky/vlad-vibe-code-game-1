import { useGameStore } from '@/stores/gameStore';
import { useState, useEffect } from 'react';
import { useDeviceDetect } from '@/hooks/useDeviceDetect';

type ScoreboardProps = {
  inMenu?: boolean;
};

export function Scoreboard({ inMenu = false }: ScoreboardProps) {
  const players = useGameStore((state) => state.players);
  const gameWinner = useGameStore((state) => state.gameWinner);
  const localPlayerId = useGameStore((state) => state.localPlayerId);
  const resetScores = useGameStore((state) => state.resetScores);
  const [showWinMessage, setShowWinMessage] = useState(false);
  const { isMobile } = useDeviceDetect();

  // Show win message when there's a winner
  useEffect(() => {
    if (gameWinner) {
      console.log(
        `[Scoreboard] Showing winner: ${gameWinner}, nickname: ${players[gameWinner]?.nickname}`
      );
      setShowWinMessage(true);

      // Hide the message after 20 seconds (increased from 10)
      const timeout = setTimeout(() => {
        setShowWinMessage(false);
      }, 20000);

      return () => clearTimeout(timeout);
    }
  }, [gameWinner, players]);

  // Get sorted players by score
  const sortedPlayers = Object.values(players).sort((a, b) => b.score - a.score);

  // Find local player rank
  const localPlayerRank = localPlayerId
    ? sortedPlayers.findIndex((player) => player.id === localPlayerId) + 1
    : 0;

  return (
    <>
      {/* Game winner message */}
      {showWinMessage && gameWinner && players[gameWinner] && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="flex flex-col items-center gap-4 rounded-xl border border-yellow-500/50 bg-black/90 p-8 text-center shadow-xl backdrop-blur-md">
            <div className="mb-2 text-5xl">🏆</div>
            <h2 className="text-4xl font-bold text-yellow-400">
              {players[gameWinner].nickname} Wins!
            </h2>
            <p className="mb-2 text-lg text-gray-300">First to reach 60 points</p>
            <button
              onClick={() => {
                resetScores();
                setShowWinMessage(false);
              }}
              className="rounded-lg bg-blue-600 px-6 py-3 font-medium text-white transition-colors hover:bg-blue-500"
            >
              New Game (Respawn All)
            </button>
          </div>
        </div>
      )}

      {/* Scoreboard - positioned differently based on inMenu and device type */}
      <div
        className={`${
          inMenu ? 'relative w-full' : 'absolute top-3 left-3 w-auto md:w-64'
        } z-10 rounded-xl ${
          inMenu ? 'bg-transparent p-0' : 'bg-gray-900/85 p-4 shadow-xl backdrop-blur-sm'
        }`}
      >
        {!inMenu && (
          <h2 className={`mb-3 ${isMobile ? 'text-lg' : 'text-xl'} font-bold text-white`}>
            Leaderboard
          </h2>
        )}

        {isMobile && !inMenu ? (
          // Mobile view - show only 1st place and player position
          <div className="space-y-3">
            {/* First place player */}
            {sortedPlayers.length > 0 && (
              <div className="flex items-center justify-between rounded-lg bg-yellow-800/40 p-2">
                <div className="flex items-center gap-1.5">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-yellow-500 text-xs font-bold">
                    1st
                  </span>
                  <span
                    className="h-3 w-3 rounded-full"
                    style={{ backgroundColor: sortedPlayers[0].color }}
                  />
                  <span className="max-w-[80px] truncate text-sm font-medium text-white">
                    {sortedPlayers[0].nickname}
                    {sortedPlayers[0].id === localPlayerId ? ' (You)' : ''}
                  </span>
                </div>
                <span className="font-mono font-bold text-white">
                  {Math.floor(sortedPlayers[0].score)}
                </span>
              </div>
            )}

            {/* Local player if not in first place */}
            {localPlayerId && localPlayerRank > 1 && (
              <div className="flex items-center justify-between rounded-lg bg-blue-800/40 p-2">
                <div className="flex items-center gap-1.5">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-500 text-xs font-bold">
                    {localPlayerRank}
                    {localPlayerRank === 2 ? 'nd' : localPlayerRank === 3 ? 'rd' : 'th'}
                  </span>
                  <span
                    className="h-3 w-3 rounded-full"
                    style={{ backgroundColor: players[localPlayerId]?.color }}
                  />
                  <span className="max-w-[80px] truncate text-sm font-medium text-white">
                    {players[localPlayerId]?.nickname} (You)
                  </span>
                </div>
                <span className="font-mono font-bold text-white">
                  {Math.floor(players[localPlayerId]?.score || 0)}
                </span>
              </div>
            )}
          </div>
        ) : (
          // Desktop view or menu view - show all players
          <div className={`${isMobile ? 'grid grid-cols-2 gap-2' : 'space-y-3'}`}>
            {sortedPlayers.map((player) => (
              <div
                key={player.id}
                className={`flex items-center justify-between rounded-lg ${isMobile ? 'p-1.5' : 'p-2'} ${
                  player.id === localPlayerId ? 'bg-blue-800/40' : 'bg-gray-800/40'
                }`}
              >
                <div className="flex items-center gap-1.5">
                  {player.isKing && (
                    <span
                      className={`flex items-center justify-center rounded-full bg-yellow-500 text-xs ${isMobile ? 'h-4 w-4' : 'h-5 w-5'}`}
                    >
                      👑
                    </span>
                  )}
                  <span
                    className="h-3 w-3 rounded-full"
                    style={{ backgroundColor: player.color }}
                  />
                  <span
                    className={`${isMobile ? 'text-xs' : 'text-sm'} max-w-[80px] truncate font-medium text-white`}
                  >
                    {player.nickname}
                    {player.id === localPlayerId ? ' (You)' : ''}
                  </span>
                </div>
                <span className="font-mono font-bold text-white">{Math.floor(player.score)}</span>
              </div>
            ))}
          </div>
        )}

        {/* Target score */}
        <div
          className={`${isMobile ? 'mt-2 pt-2' : 'mt-4 pt-3'} border-t border-gray-800 text-right text-xs text-gray-400`}
        >
          First to 60 points wins
        </div>
      </div>
    </>
  );
}
