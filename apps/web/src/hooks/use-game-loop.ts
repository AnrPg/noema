'use client';

import { useEffect, useRef } from 'react';

interface IGameLoopFrame {
  now: number;
  deltaMs: number;
}

export function useGameLoop(callback: (frame: IGameLoopFrame) => void, enabled = true): void {
  const callbackRef = useRef(callback);

  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    let frameId = 0;
    let lastNow = performance.now();

    const tick = (now: number): void => {
      const deltaMs = Math.min(64, now - lastNow);
      lastNow = now;
      callbackRef.current({ now, deltaMs });
      frameId = window.requestAnimationFrame(tick);
    };

    frameId = window.requestAnimationFrame(tick);

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [enabled]);
}
