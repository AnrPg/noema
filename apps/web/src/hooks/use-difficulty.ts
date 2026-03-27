'use client';

import { useEffect, useState } from 'react';

export function useDifficulty(startTime: number | null, base = 1): number {
  const [now, setNow] = useState<number>(() => performance.now());

  useEffect(() => {
    if (startTime === null) {
      setNow(performance.now());
      return;
    }

    setNow(performance.now());

    const intervalId = window.setInterval(() => {
      setNow(performance.now());
    }, 120);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [startTime]);

  if (startTime === null) {
    return base;
  }

  const elapsedSeconds = Math.max(0, now - startTime) / 1000;
  return base + elapsedSeconds * 0.05;
}
