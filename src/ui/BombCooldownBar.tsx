import { useEffect, useState } from 'react';
import { useGameStore } from '@/stores/gameStore';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import { useDeviceDetect } from '@/hooks/useDeviceDetect';

export function BombCooldownBar() {
  const [progress, setProgress] = useState(100);
  const canUseBomb = useGameStore((state) => state.canUseBomb);
  const lastBombTime = useGameStore((state) => {
    const localPlayerId = state.localPlayerId;
    if (!localPlayerId) return 0;
    return state.players[localPlayerId]?.lastBombTime || 0;
  });
  const { isMobile, isTouchDevice } = useDeviceDetect();

  // Check for the hack=true query parameter
  const isHackMode = new URLSearchParams(window.location.search).get('hack') === 'true';

  useEffect(() => {
    // If hack mode is enabled, always show 100% progress
    if (isHackMode) {
      setProgress(100);
      return;
    }

    const BOMB_COOLDOWN = 10000; // 10 seconds, matching gameStore.ts
    let animationFrameId: number;

    const updateProgress = () => {
      const now = Date.now();
      const timeSinceBomb = now - lastBombTime;
      const newProgress = Math.min((timeSinceBomb / BOMB_COOLDOWN) * 100, 100);

      setProgress(newProgress);

      if (newProgress < 100) {
        animationFrameId = requestAnimationFrame(updateProgress);
      }
    };

    updateProgress();
    return () => {
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
      }
    };
  }, [lastBombTime, isHackMode]);

  // In hack mode, always show as ready
  const isReady = isHackMode ? true : canUseBomb();

  // On touch devices, we don't show this component as the mobile controls already have bomb button with state indication
  if (isTouchDevice) {
    return null;
  }

  return (
    <div
      className={`fixed ${isMobile ? 'bottom-4' : 'bottom-8'} left-1/2 z-50 flex -translate-x-1/2 flex-col items-center gap-2 ${isMobile ? 'min-w-[150px]' : 'min-w-[200px]'}`}
    >
      <div className="flex items-center gap-2">
        <span className="key-indicator">F</span>
        <span className={`${isMobile ? 'text-xs' : 'text-sm'} font-medium text-white`}>Bomb</span>
        {isReady && (
          <span className="rounded-full border border-green-500/30 bg-green-500/20 px-2 py-0.5 text-xs font-medium text-green-300">
            Ready!
          </span>
        )}
        {isHackMode && (
          <span className="rounded-full border border-purple-500/30 bg-purple-500/20 px-2 py-0.5 text-xs font-medium text-purple-300">
            Hack Mode
          </span>
        )}
      </div>
      <Progress
        value={progress}
        className={cn(
          `h-${isMobile ? '1.5' : '2'} w-full transition-colors`,
          isReady
            ? 'bg-gray-800/60 [&>[data-role=progress]]:bg-green-500'
            : 'bg-gray-800/60 [&>[data-role=progress]]:bg-orange-500'
        )}
      />
    </div>
  );
}
