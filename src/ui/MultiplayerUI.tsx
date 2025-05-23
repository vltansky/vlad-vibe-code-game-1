import { useState, ChangeEvent, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useGameStore } from '@/stores/gameStore';
import { Users, Gamepad2, AlertCircle, BookOpen, RefreshCw, Menu, X, Trophy } from 'lucide-react';
import { BombCooldownBar } from './BombCooldownBar';
import { useDeviceDetect } from '@/hooks/useDeviceDetect';
import { Scoreboard } from './Scoreboard';
import { PLAYER_SKINS } from '@/components/Player';
import { PlayerPreview } from './PlayerPreview';

// Use a fixed room code for all users
const DEFAULT_ROOM = 'MAIN';
const NICKNAME_STORAGE_KEY = 'player-nickname';
const PLAYER_COLOR_STORAGE_KEY = 'player-color';
const PLAYER_SKIN_STORAGE_KEY = 'player-skin';

export function MultiplayerUI() {
  const [nickname, setNickname] = useState('');
  const [playerColor, setPlayerColor] = useState('#FF5733'); // Default orange-red color
  const [playerSkin, setPlayerSkin] = useState('default');
  const [showControls, setShowControls] = useState(false);
  const [showGameRules, setShowGameRules] = useState(false);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [reconnectDots, setReconnectDots] = useState('');

  const { isMobile } = useDeviceDetect();

  const isConnected = useGameStore((state) => state.isConnected);
  const isConnecting = useGameStore((state) => state.isConnecting);
  const isReconnecting = useGameStore((state) => state.isReconnecting);
  const connectionError = useGameStore((state) => state.connectionError);
  const playerCount = useGameStore((state) => state.playerCount);
  const connect = useGameStore((state) => state.connect);
  const disconnect = useGameStore((state) => state.disconnect);
  const localPlayerNickname = useGameStore((state) => {
    const localPlayerId = state.localPlayerId;
    return localPlayerId ? state.players[localPlayerId]?.nickname || 'Player' : 'Player';
  });

  // Animate reconnection dots
  useEffect(() => {
    if (isReconnecting) {
      const interval = setInterval(() => {
        setReconnectDots((dots) => {
          if (dots.length >= 3) return '';
          return dots + '.';
        });
      }, 500);
      return () => clearInterval(interval);
    }
    return undefined;
  }, [isReconnecting]);

  // Show menu by default when not connected, especially on mobile
  useEffect(() => {
    if (!isConnected) {
      setShowMenu(true);
    }
  }, [isConnected]);

  // Load saved preferences from localStorage on mount
  useEffect(() => {
    const savedNickname = localStorage.getItem(NICKNAME_STORAGE_KEY);
    if (savedNickname) {
      setNickname(savedNickname);
    }

    const savedColor = localStorage.getItem(PLAYER_COLOR_STORAGE_KEY);
    if (savedColor) {
      setPlayerColor(savedColor);
    }

    const savedSkin = localStorage.getItem(PLAYER_SKIN_STORAGE_KEY);
    if (savedSkin) {
      setPlayerSkin(savedSkin);
    }
  }, []);

  const handleConnect = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const userNickname = nickname.trim() || 'Player';

    // Save preferences to localStorage
    localStorage.setItem(NICKNAME_STORAGE_KEY, userNickname);
    localStorage.setItem(PLAYER_COLOR_STORAGE_KEY, playerColor);
    localStorage.setItem(PLAYER_SKIN_STORAGE_KEY, playerSkin);

    // Connect with the customized options
    connect(DEFAULT_ROOM, userNickname, playerColor, playerSkin);

    // Auto-hide menu on mobile after connecting
    if (isMobile) {
      setShowMenu(false);
    }
  };

  const handleNicknameChange = (e: ChangeEvent<HTMLInputElement>) => {
    setNickname(e.target.value);
  };

  const handleColorChange = (e: ChangeEvent<HTMLInputElement>) => {
    setPlayerColor(e.target.value);
  };

  const handleSkinChange = (skinId: string) => {
    setPlayerSkin(skinId);
  };

  const handleRetry = () => {
    handleConnect();
  };

  const handleDisconnect = () => {
    disconnect();
  };

  const toggleControls = () => {
    setShowControls((prev) => !prev);
    if (!showControls && showGameRules) {
      setShowGameRules(false);
    }
    if (!showControls && showLeaderboard) {
      setShowLeaderboard(false);
    }
  };

  const toggleGameRules = () => {
    setShowGameRules((prev) => !prev);
    if (!showGameRules && showControls) {
      setShowControls(false);
    }
    if (!showGameRules && showLeaderboard) {
      setShowLeaderboard(false);
    }
  };

  const toggleLeaderboard = () => {
    setShowLeaderboard((prev) => !prev);
    if (!showLeaderboard && showControls) {
      setShowControls(false);
    }
    if (!showLeaderboard && showGameRules) {
      setShowGameRules(false);
    }
  };

  const toggleMenu = () => {
    setShowMenu((prev) => !prev);
  };

  return (
    <>
      {/* Player Preview - Show only when not connected */}
      {!isConnected && (
        <PlayerPreview playerColor={playerColor} playerSkinId={playerSkin} userName={nickname} />
      )}

      {/* Mobile menu toggle button */}
      {isMobile && isConnected && (
        <button
          onClick={toggleMenu}
          className="absolute top-4 right-4 z-20 rounded-full bg-gray-800/80 p-2 shadow-md"
        >
          {showMenu ? (
            <X className="h-6 w-6 text-white" />
          ) : (
            <Menu className="h-6 w-6 text-white" />
          )}
        </button>
      )}

      {/* Standalone Scoreboard - only shown when not in menu, connected, and not on mobile */}
      {isConnected && !showMenu && !showLeaderboard && !isMobile && <Scoreboard />}

      {/* Main UI panel - conditionally shown on mobile */}
      {(!isMobile || showMenu) && (
        <div className={`absolute ${isMobile ? 'inset-0 z-10' : 'top-4 right-4 z-10'} text-white`}>
          <div
            className={` ${isMobile ? 'h-full w-full rounded-none' : 'w-[360px] rounded-lg'} border border-gray-700/50 bg-gray-900/90 p-6 shadow-xl backdrop-blur-md ${isMobile ? 'flex flex-col' : ''} `}
          >
            <div className="mb-6 flex items-center gap-3">
              <Gamepad2 className="text-gray-400" size={24} />
              <h2 className="text-xl font-semibold tracking-tight text-gray-100">The King Ball</h2>
            </div>

            {connectionError && (
              <div
                className={`mb-5 flex items-center gap-2 rounded-md border ${isReconnecting ? 'border-yellow-600/60 bg-yellow-900/70 text-yellow-200' : 'border-red-700/60 bg-red-900/70 text-red-200'} p-3 text-sm font-medium`}
              >
                <AlertCircle size={16} />
                <span>
                  {isReconnecting ? <>Attempting to reconnect{reconnectDots}</> : connectionError}
                </span>
                {isReconnecting && <RefreshCw className="ml-auto h-4 w-4 animate-spin" />}
              </div>
            )}

            {isConnected ? (
              <div className="flex flex-col gap-4">
                <div className="flex items-center justify-between rounded-md bg-gray-800/60 px-4 py-3">
                  <span className="text-sm font-medium text-gray-300">
                    Name: <span className="font-semibold text-white">{localPlayerNickname}</span>
                  </span>
                  <div className="flex items-center gap-2 rounded-full bg-green-700/40 px-3 py-1 text-xs font-medium text-green-200">
                    <Users size={14} />
                    <span>
                      {playerCount} {playerCount === 1 ? 'Player' : 'Players'}
                    </span>
                  </div>
                </div>

                <Button
                  variant="destructive"
                  className="w-full rounded-md bg-red-600 py-2.5 text-sm font-medium shadow-sm transition-all hover:bg-red-700"
                  onClick={handleDisconnect}
                >
                  Disconnect
                </Button>
              </div>
            ) : (
              <form className="flex flex-col gap-4" onSubmit={handleConnect}>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-gray-400">Nickname</label>
                  <Input
                    type="text"
                    value={nickname}
                    onChange={handleNicknameChange}
                    autoFocus={!isMobile} // Disable autofocus on mobile to prevent keyboard popup
                    placeholder="Player"
                    className="rounded-md border-gray-600 bg-gray-800/70 px-3 py-2.5 text-sm text-white shadow-inner transition-colors placeholder:text-gray-500 focus:border-blue-500 focus:bg-gray-700/80 focus:ring-1 focus:ring-blue-500"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-gray-400">Player Color</label>
                  <div className="flex items-center gap-3">
                    <input
                      type="color"
                      value={playerColor}
                      onChange={handleColorChange}
                      className="h-8 w-12 cursor-pointer appearance-none overflow-hidden rounded-md border border-none border-gray-600 bg-transparent outline-none"
                    />
                    <span className="text-xs text-gray-300">{playerColor.toUpperCase()}</span>
                  </div>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-gray-400">Player Appearance</label>
                  <div className="grid grid-cols-2 gap-2">
                    {Object.entries(PLAYER_SKINS).map(([skinId, skinData]) => (
                      <button
                        key={skinId}
                        type="button"
                        className={`rounded-md border p-2 text-xs transition-colors ${
                          playerSkin === skinId
                            ? 'border-blue-500 bg-blue-900/40 text-blue-200'
                            : 'border-gray-700 bg-gray-800/60 text-gray-300 hover:bg-gray-700/60'
                        }`}
                        onClick={() => handleSkinChange(skinId)}
                      >
                        {skinData.name}
                      </button>
                    ))}
                  </div>
                </div>

                {connectionError ? (
                  <Button
                    variant="default"
                    className="w-full rounded-md bg-yellow-600 py-3 text-sm font-semibold text-white shadow-md transition-all hover:bg-yellow-500"
                    type="button"
                    onClick={handleRetry}
                    disabled={isReconnecting}
                  >
                    <RefreshCw className={`mr-2 h-4 w-4 ${isReconnecting ? 'animate-spin' : ''}`} />
                    {isReconnecting ? 'Reconnecting...' : 'Retry Connection'}
                  </Button>
                ) : (
                  <Button
                    variant="default"
                    className="w-full rounded-md bg-blue-600 py-3 text-sm font-semibold text-white shadow-md transition-all hover:bg-blue-500 disabled:opacity-60"
                    type="submit"
                    disabled={isConnecting}
                  >
                    {isConnecting ? 'Connecting...' : 'Join Game'}
                  </Button>
                )}
              </form>
            )}

            <div
              className={`mt-6 space-y-3 border-t border-gray-700/50 pt-5 ${isMobile ? 'flex-1 overflow-auto' : ''}`}
            >
              {/* Only show leaderboard button when connected */}
              {isConnected && (
                <div>
                  <Button
                    variant="outline"
                    className={`w-full rounded-md border-gray-600 ${showLeaderboard ? 'bg-gray-700/80 text-gray-200' : 'bg-gray-800/60 text-gray-400'} py-2 text-xs font-medium transition-colors hover:bg-gray-700/70 hover:text-gray-300`}
                    onClick={toggleLeaderboard}
                  >
                    <Trophy className="mr-2 h-4 w-4" />
                    {showLeaderboard ? 'Hide Leaderboard' : 'Show Leaderboard'}
                  </Button>

                  {showLeaderboard && (
                    <div className="mt-3 rounded-md border border-gray-700/70 bg-gray-800/50 p-4">
                      {/* Embedding the Scoreboard component inside the menu */}
                      <div className="scoreboard-container">
                        <Scoreboard inMenu={true} />
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div>
                <Button
                  variant="outline"
                  className={`w-full rounded-md border-gray-600 ${showControls ? 'bg-gray-700/80 text-gray-200' : 'bg-gray-800/60 text-gray-400'} py-2 text-xs font-medium transition-colors hover:bg-gray-700/70 hover:text-gray-300`}
                  onClick={toggleControls}
                >
                  {showControls ? 'Hide Controls' : 'Show Controls'}
                </Button>

                {showControls && (
                  <div className="mt-3 space-y-2.5 rounded-md border border-gray-700/70 bg-gray-800/50 p-4 text-xs text-gray-400">
                    {isMobile ? (
                      <>
                        <h3 className="mb-2 text-sm font-semibold text-gray-200">
                          Touch Controls:
                        </h3>
                        <p className="flex items-center gap-1.5">
                          <span className="key-indicator">Left Side</span> - Virtual Joystick
                        </p>
                        <p className="flex items-center gap-1.5">
                          <span className="key-indicator">🔼 Button</span> - Jump
                        </p>
                      </>
                    ) : (
                      <>
                        <h3 className="mb-2 text-sm font-semibold text-gray-200">
                          Keyboard Controls:
                        </h3>
                        <p className="flex items-center gap-1.5">
                          <span className="key-indicator">WASD</span> - Move
                        </p>
                        <p className="flex items-center gap-1.5">
                          <span className="key-indicator">Space</span> - Jump
                        </p>
                      </>
                    )}
                    <p className="flex items-center gap-1.5">
                      <span className="key-indicator">F</span> - Drop Bomb
                    </p>
                  </div>
                )}
              </div>

              <div>
                <Button
                  variant="outline"
                  className={`w-full rounded-md border-gray-600 ${showGameRules ? 'bg-gray-700/80 text-gray-200' : 'bg-gray-800/60 text-gray-400'} py-2 text-xs font-medium transition-colors hover:bg-gray-700/70 hover:text-gray-300`}
                  onClick={toggleGameRules}
                >
                  <BookOpen className="mr-2 h-4 w-4" />
                  {showGameRules ? 'Hide Game Rules' : 'Game Rules'}
                </Button>

                {showGameRules && (
                  <div className="mt-3 space-y-3 rounded-md border border-gray-700/70 bg-gray-800/50 p-4 text-xs text-gray-300">
                    <p>
                      <span className="font-semibold text-gray-200">Objective:</span> Score points
                      by knocking other players off the platform.
                    </p>
                    <p>
                      <span className="font-semibold text-gray-200">👑 King of the Hill:</span>{' '}
                      Standing on the center platform makes you the king, earning extra points over
                      time.
                    </p>
                    <p>
                      <span className="font-semibold text-gray-200">Abilities:</span>
                    </p>
                    <ul className="ml-4 list-disc space-y-1.5">
                      <li>
                        <span className="text-gray-200">Push Wave (E):</span> Push nearby players
                        away from you.
                      </li>
                      <li>
                        <span className="text-gray-200">Bomb (F):</span> Drop a bomb that explodes
                        after a short delay.
                      </li>
                    </ul>
                    <p>
                      <span className="font-semibold text-gray-200">Winning:</span> First player to
                      reach 60 points wins!
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Bomb cooldown UI - only shown when connected */}
      {isConnected && <BombCooldownBar />}

      <style>{`
        .key-indicator {
          display: inline-block;
          padding: 2px 6px;
          border-radius: 4px;
          border: 1px solid #4b5563;
          background-color: #374151;
          font-family: monospace;
          font-size: 0.7rem;
          color: #d1d5db;
          line-height: 1;
        }
        .key-indicator-inline {
           display: inline-block;
          padding: 1px 4px;
          border-radius: 3px;
          border: 1px solid #4b5563;
          background-color: #374151;
          font-family: monospace;
          font-size: 0.65rem;
          color: #d1d5db;
          line-height: 1;
          vertical-align: baseline;
        }
        .scoreboard-container {
          min-height: 100px;
        }
      `}</style>
    </>
  );
}
