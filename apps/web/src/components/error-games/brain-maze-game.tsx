'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Button, cn } from '@noema/ui';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp } from 'lucide-react';
import { useDifficulty } from '@/hooks/use-difficulty';
import { useGameLoop } from '@/hooks/use-game-loop';

interface IBrainMazeGameProps {
  sessionKey: number;
  onBack: () => void;
}

interface ICanvasSize {
  width: number;
  height: number;
}

interface IPoint {
  x: number;
  y: number;
}

interface IMemoryGap {
  id: number;
  position: IPoint;
  visualPosition: IPoint;
  direction: IPoint;
  hue: string;
}

interface ILamp {
  key: string;
  position: IPoint;
  color: string;
}

interface IDisplayState {
  insightsCollected: number;
  insightsRemaining: number;
  memoryGapCount: number;
}

interface ITrailPoint {
  x: number;
  y: number;
  age: number;
}

const MAZE_LAYOUTS = [
  [
    '###############',
    '#.....#...#...#',
    '#.###.#.#.#.#.#',
    '#.#...#.#...#.#',
    '#.#.###.###.#.#',
    '#...#.....#...#',
    '###.#.###.#.###',
    '#...#.#.#.#...#',
    '#.###.#.#.###.#',
    '#.....#...#...#',
    '###############',
  ],
  [
    '###############',
    '#...#.....#...#',
    '#.#.#.###.#.#.#',
    '#.#...#.#...#.#',
    '#.###.#.#.###.#',
    '#.....#.#.....#',
    '###.###.###.###',
    '#.....#.#.....#',
    '#.###.#.#.###.#',
    '#...#.....#...#',
    '###############',
  ],
  [
    '###############',
    '#.............#',
    '#.###.###.###.#',
    '#...#...#...#.#',
    '###.#.#.#.#.#.#',
    '#...#.#...#...#',
    '#.###.#####.###',
    '#...#...#...#.#',
    '#.#.###.#.###.#',
    '#.............#',
    '###############',
  ],
] as const;

const DIRECTIONS: IPoint[] = [
  { x: 1, y: 0 },
  { x: -1, y: 0 },
  { x: 0, y: 1 },
  { x: 0, y: -1 },
];

const LAMP_COLORS = ['#38BDF8', '#A78BFA', '#F472B6', '#FBBF24', '#4ADE80'] as const;

function pointKey(point: IPoint): string {
  return `${String(point.x)},${String(point.y)}`;
}

function randomFromArray<T>(items: readonly T[]): T {
  const item = items[Math.floor(Math.random() * items.length)];
  if (item === undefined) {
    throw new Error('Expected at least one item.');
  }
  return item;
}

function isSamePoint(a: IPoint, b: IPoint): boolean {
  return a.x === b.x && a.y === b.y;
}

function addPoints(a: IPoint, b: IPoint): IPoint {
  return { x: a.x + b.x, y: a.y + b.y };
}

function lerpPoint(current: IPoint, target: IPoint, amount: number): IPoint {
  return {
    x: current.x + (target.x - current.x) * amount,
    y: current.y + (target.y - current.y) * amount,
  };
}

function createBrainPath(x: number, y: number, width: number, height: number): Path2D {
  const path = new Path2D();
  const left = x;
  const top = y;
  const right = x + width;
  const bottom = y + height;
  const middleX = x + width / 2;

  path.moveTo(left + width * 0.16, bottom - height * 0.14);
  path.bezierCurveTo(
    left - width * 0.02,
    bottom - height * 0.18,
    left - width * 0.03,
    top + height * 0.58,
    left + width * 0.1,
    top + height * 0.42
  );
  path.bezierCurveTo(
    left - width * 0.01,
    top + height * 0.2,
    left + width * 0.16,
    top + height * 0.02,
    left + width * 0.39,
    top + height * 0.06
  );
  path.bezierCurveTo(
    middleX - width * 0.08,
    top - height * 0.04,
    middleX + width * 0.02,
    top + height * 0.01,
    middleX + width * 0.06,
    top + height * 0.06
  );
  path.bezierCurveTo(
    right - width * 0.08,
    top,
    right + width * 0.02,
    top + height * 0.2,
    right - width * 0.03,
    top + height * 0.44
  );
  path.bezierCurveTo(
    right + width * 0.03,
    top + height * 0.62,
    right - width * 0.01,
    bottom - height * 0.16,
    right - width * 0.18,
    bottom - height * 0.08
  );
  path.bezierCurveTo(
    right - width * 0.26,
    bottom + height * 0.02,
    middleX + width * 0.12,
    bottom - height * 0.04,
    middleX + width * 0.03,
    bottom
  );
  path.bezierCurveTo(
    middleX - width * 0.02,
    bottom + height * 0.12,
    left + width * 0.3,
    bottom + height * 0.02,
    left + width * 0.2,
    bottom - height * 0.02
  );
  path.closePath();

  return path;
}

function cellCenter(point: IPoint, tileSize: number, offsetX: number, offsetY: number): IPoint {
  return {
    x: offsetX + point.x * tileSize + tileSize / 2,
    y: offsetY + point.y * tileSize + tileSize / 2,
  };
}

function drawLamp(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  color: string
): void {
  const bulbRadius = size * 0.18;
  const stemHeight = size * 0.12;
  const baseWidth = size * 0.18;

  context.save();

  context.beginPath();
  context.fillStyle = color;
  context.shadowBlur = 16;
  context.shadowColor = color;
  context.arc(x, y - size * 0.06, bulbRadius, 0, Math.PI * 2);
  context.fill();

  context.beginPath();
  context.fillStyle = 'rgba(255,255,255,0.3)';
  context.arc(x - bulbRadius * 0.35, y - size * 0.12, bulbRadius * 0.36, 0, Math.PI * 2);
  context.fill();

  context.beginPath();
  context.strokeStyle = 'rgba(255,255,255,0.55)';
  context.lineWidth = Math.max(1, size * 0.04);
  context.moveTo(x, y + bulbRadius * 0.15);
  context.lineTo(x, y + bulbRadius * 0.15 + stemHeight);
  context.stroke();

  context.beginPath();
  context.fillStyle = 'rgba(255, 246, 214, 0.92)';
  context.roundRect(
    x - baseWidth / 2,
    y + bulbRadius * 0.15 + stemHeight - size * 0.02,
    baseWidth,
    size * 0.1,
    size * 0.03
  );
  context.fill();

  context.beginPath();
  context.strokeStyle = 'rgba(255,255,255,0.35)';
  context.lineWidth = Math.max(0.9, size * 0.03);
  context.moveTo(x, y - bulbRadius - size * 0.02);
  context.lineTo(x, y - bulbRadius - size * 0.11);
  context.moveTo(x - size * 0.08, y - bulbRadius - size * 0.06);
  context.lineTo(x - size * 0.14, y - bulbRadius - size * 0.11);
  context.moveTo(x + size * 0.08, y - bulbRadius - size * 0.06);
  context.lineTo(x + size * 0.14, y - bulbRadius - size * 0.11);
  context.stroke();

  context.restore();
}

export function BrainMazeGame({ sessionKey, onBack }: IBrainMazeGameProps): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const sizeRef = useRef<ICanvasSize>({ width: 320, height: 320 });
  const [runNonce, setRunNonce] = useState(0);
  const [hasStarted, setHasStarted] = useState(false);
  const [startTime, setStartTime] = useState<number | null>(null);
  const [isGameOver, setIsGameOver] = useState(false);
  const [displayState, setDisplayState] = useState<IDisplayState>({
    insightsCollected: 0,
    insightsRemaining: 0,
    memoryGapCount: 2,
  });

  const layout = useMemo(() => randomFromArray(MAZE_LAYOUTS), [runNonce, sessionKey]);
  const rows = layout.length;
  const columns = layout[0].length;

  const openCells = useMemo<IPoint[]>(() => {
    const cells: IPoint[] = [];

    for (let y = 0; y < rows; y += 1) {
      for (let x = 0; x < columns; x += 1) {
        if (layout[y]?.[x] !== '#') {
          cells.push({ x, y });
        }
      }
    }

    return cells;
  }, [columns, layout, rows]);

  const playerRef = useRef<IPoint>({ x: 1, y: 1 });
  const playerVisualRef = useRef<IPoint>({ x: 1, y: 1 });
  const directionRef = useRef<IPoint>({ x: 1, y: 0 });
  const queuedDirectionRef = useRef<IPoint>({ x: 1, y: 0 });
  const memoryGapsRef = useRef<IMemoryGap[]>([]);
  const lampsRef = useRef<Map<string, ILamp>>(new Map());
  const lastPlayerStepAtRef = useRef(0);
  const lastMemoryGapStepAtRef = useRef(0);
  const nextMemoryGapIdRef = useRef(1);
  const playingRef = useRef(false);
  const insightsCollectedRef = useRef(0);
  const trailRef = useRef<ITrailPoint[]>([]);

  const difficulty = useDifficulty(startTime, 1.1);

  const syncDisplay = (): void => {
    setDisplayState({
      insightsCollected: insightsCollectedRef.current,
      insightsRemaining: lampsRef.current.size,
      memoryGapCount: memoryGapsRef.current.length,
    });
  };

  const isWall = (point: IPoint): boolean => layout[point.y]?.[point.x] === '#';

  const randomOpenCell = (blockedKeys: Set<string>): IPoint => {
    const candidates = openCells.filter((cell) => !blockedKeys.has(pointKey(cell)));
    return randomFromArray(candidates);
  };

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (container === null || canvas === null) {
      return;
    }

    const updateCanvasSize = (): void => {
      const rect = container.getBoundingClientRect();
      const width = Math.max(260, Math.floor(rect.width));
      const height = Math.max(260, Math.floor(rect.height));
      const devicePixelRatio = Math.max(window.devicePixelRatio, 1);

      canvas.width = Math.floor(width * devicePixelRatio);
      canvas.height = Math.floor(height * devicePixelRatio);
      canvas.style.width = `${String(width)}px`;
      canvas.style.height = `${String(height)}px`;
      sizeRef.current = { width, height };
    };

    updateCanvasSize();

    const observer = new ResizeObserver(() => {
      updateCanvasSize();
    });

    observer.observe(container);

    return () => {
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    const playerStart = openCells[0] ?? { x: 1, y: 1 };

    playerRef.current = playerStart;
    playerVisualRef.current = playerStart;
    directionRef.current = { x: 1, y: 0 };
    queuedDirectionRef.current = { x: 1, y: 0 };
    memoryGapsRef.current = [];
    lampsRef.current = new Map();
    lastPlayerStepAtRef.current = 0;
    lastMemoryGapStepAtRef.current = 0;
    nextMemoryGapIdRef.current = 1;
    playingRef.current = false;
    insightsCollectedRef.current = 0;
    trailRef.current = [{ x: playerStart.x, y: playerStart.y, age: 0 }];
    setIsGameOver(false);
    setHasStarted(false);
    setStartTime(null);

    const blocked = new Set<string>([pointKey(playerStart)]);

    for (const cell of openCells) {
      if (isSamePoint(cell, playerStart)) {
        continue;
      }

      lampsRef.current.set(pointKey(cell), {
        key: pointKey(cell),
        position: cell,
        color: randomFromArray(LAMP_COLORS),
      });
    }

    for (let index = 0; index < 2; index += 1) {
      const spawn = randomOpenCell(blocked);
      blocked.add(pointKey(spawn));
      memoryGapsRef.current.push({
        id: nextMemoryGapIdRef.current,
        position: spawn,
        visualPosition: spawn,
        direction: randomFromArray(DIRECTIONS),
        hue: randomFromArray(['#F87171', '#C084FC', '#60A5FA', '#FBBF24']),
      });
      nextMemoryGapIdRef.current += 1;
    }

    syncDisplay();
  }, [openCells, runNonce, sessionKey]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      const shouldPreventDefault = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(
        event.key
      );

      if (shouldPreventDefault) {
        event.preventDefault();
      }

      switch (event.key) {
        case 'ArrowUp':
        case 'w':
        case 'W':
          queuedDirectionRef.current = { x: 0, y: -1 };
          break;
        case 'ArrowDown':
        case 's':
        case 'S':
          queuedDirectionRef.current = { x: 0, y: 1 };
          break;
        case 'ArrowLeft':
        case 'a':
        case 'A':
          queuedDirectionRef.current = { x: -1, y: 0 };
          break;
        case 'ArrowRight':
        case 'd':
        case 'D':
          queuedDirectionRef.current = { x: 1, y: 0 };
          break;
        default:
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const movePlayer = (): void => {
    const desiredPosition = addPoints(playerRef.current, queuedDirectionRef.current);
    const fallbackPosition = addPoints(playerRef.current, directionRef.current);

    if (!isWall(desiredPosition)) {
      directionRef.current = queuedDirectionRef.current;
      playerRef.current = desiredPosition;
    } else if (!isWall(fallbackPosition)) {
      playerRef.current = fallbackPosition;
    }

    trailRef.current.push({
      x: playerRef.current.x,
      y: playerRef.current.y,
      age: 0,
    });
    trailRef.current = trailRef.current.slice(-18);

    const lampKey = pointKey(playerRef.current);
    if (lampsRef.current.has(lampKey)) {
      lampsRef.current.delete(lampKey);
      insightsCollectedRef.current += 1;
      syncDisplay();
    }
  };

  const startGame = (): void => {
    const now = performance.now();
    lastPlayerStepAtRef.current = now;
    lastMemoryGapStepAtRef.current = now;
    playingRef.current = true;
    setIsGameOver(false);
    setHasStarted(true);
    setStartTime(now);
  };

  const replayGame = (): void => {
    setRunNonce((current) => current + 1);
  };

  const chooseMemoryGapDirection = (memoryGap: IMemoryGap): IPoint => {
    const options = DIRECTIONS.filter(
      (direction) => !isWall(addPoints(memoryGap.position, direction))
    );

    if (options.length === 0) {
      return { x: 0, y: 0 };
    }

    if (Math.random() < 0.55) {
      const sorted = [...options].sort((a, b) => {
        const distanceA =
          Math.abs(playerRef.current.x - (memoryGap.position.x + a.x)) +
          Math.abs(playerRef.current.y - (memoryGap.position.y + a.y));
        const distanceB =
          Math.abs(playerRef.current.x - (memoryGap.position.x + b.x)) +
          Math.abs(playerRef.current.y - (memoryGap.position.y + b.y));

        return distanceA - distanceB;
      });

      const preferred = sorted[0];
      if (preferred !== undefined) {
        return preferred;
      }

      return randomFromArray(options);
    }

    return randomFromArray(options);
  };

  const spawnMemoryGapIfNeeded = (): void => {
    const desiredMemoryGapCount = Math.min(5, 2 + Math.floor((difficulty - 1.1) / 0.45));
    if (memoryGapsRef.current.length >= desiredMemoryGapCount) {
      return;
    }

    const blocked = new Set<string>([
      pointKey(playerRef.current),
      ...memoryGapsRef.current.map((memoryGap) => pointKey(memoryGap.position)),
    ]);
    const spawn = randomOpenCell(blocked);

    memoryGapsRef.current.push({
      id: nextMemoryGapIdRef.current,
      position: spawn,
      visualPosition: spawn,
      direction: randomFromArray(DIRECTIONS),
      hue: randomFromArray(['#F87171', '#C084FC', '#60A5FA', '#FBBF24']),
    });
    nextMemoryGapIdRef.current += 1;
    syncDisplay();
  };

  const handleLoss = (): void => {
    playingRef.current = false;
    setIsGameOver(true);
    syncDisplay();
  };

  const hasMemoryGapCollision = (): boolean =>
    memoryGapsRef.current.some((memoryGap) => isSamePoint(memoryGap.position, playerRef.current));

  useGameLoop(
    ({ now }) => {
      if (!hasStarted || startTime === null) {
        return;
      }

      const canvas = canvasRef.current;
      if (canvas === null) {
        return;
      }

      const context = canvas.getContext('2d');
      if (context === null) {
        return;
      }

      if (playingRef.current) {
        const playerStepMs = 150;
        const memoryGapStepMs = Math.max(110, 320 - difficulty * 32);

        if (now - lastPlayerStepAtRef.current >= playerStepMs) {
          movePlayer();
          lastPlayerStepAtRef.current = now;

          if (hasMemoryGapCollision()) {
            handleLoss();
          }
        }

        if (now - lastMemoryGapStepAtRef.current >= memoryGapStepMs) {
          spawnMemoryGapIfNeeded();

          memoryGapsRef.current = memoryGapsRef.current.map((memoryGap) => {
            const direction = chooseMemoryGapDirection(memoryGap);
            const nextPosition = addPoints(memoryGap.position, direction);

            return {
              ...memoryGap,
              direction,
              position: isWall(nextPosition) ? memoryGap.position : nextPosition,
            };
          });
          lastMemoryGapStepAtRef.current = now;

          if (hasMemoryGapCollision()) {
            handleLoss();
          }

          syncDisplay();
        }
      }

      playerVisualRef.current = lerpPoint(playerVisualRef.current, playerRef.current, 0.22);
      memoryGapsRef.current = memoryGapsRef.current.map((memoryGap) => ({
        ...memoryGap,
        visualPosition: lerpPoint(memoryGap.visualPosition, memoryGap.position, 0.2),
      }));

      const { width, height } = sizeRef.current;
      const devicePixelRatio = Math.max(window.devicePixelRatio, 1);
      context.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
      context.clearRect(0, 0, width, height);

      const padding = 12;
      const tileSize = Math.min((width - padding * 2) / columns, (height - padding * 2) / rows);
      const mazeWidth = tileSize * columns;
      const mazeHeight = tileSize * rows;
      const offsetX = (width - mazeWidth) / 2;
      const offsetY = (height - mazeHeight) / 2;
      const brainPath = createBrainPath(
        offsetX - tileSize * 1.1,
        offsetY - tileSize * 1.2,
        mazeWidth + tileSize * 2.2,
        mazeHeight + tileSize * 2.35
      );

      context.save();
      context.fillStyle = 'rgba(7, 18, 46, 0.72)';
      context.shadowBlur = 32;
      context.shadowColor = 'rgba(37, 99, 235, 0.18)';
      context.fill(brainPath);
      context.restore();

      context.save();
      context.clip(brainPath);

      const panelGradient = context.createRadialGradient(
        offsetX + mazeWidth * 0.42,
        offsetY + mazeHeight * 0.4,
        tileSize,
        offsetX + mazeWidth * 0.5,
        offsetY + mazeHeight * 0.5,
        mazeWidth * 0.8
      );
      panelGradient.addColorStop(0, 'rgba(30, 64, 175, 0.16)');
      panelGradient.addColorStop(0.5, 'rgba(15, 23, 42, 0.06)');
      panelGradient.addColorStop(1, 'rgba(2, 6, 23, 0.02)');
      context.fillStyle = panelGradient;
      context.fillRect(0, 0, width, height);

      for (let index = 0; index < 24; index += 1) {
        const dotX = offsetX - tileSize * 0.6 + ((index * 37) % Math.floor(mazeWidth + tileSize));
        const dotY =
          offsetY -
          tileSize * 0.7 +
          (((index * 59 + Math.floor(now / 24)) % 1000) / 1000) * (mazeHeight + tileSize * 1.4);
        context.beginPath();
        context.fillStyle = 'rgba(96, 165, 250, 0.06)';
        context.arc(dotX, dotY, 1.6 + (index % 3), 0, Math.PI * 2);
        context.fill();
      }

      context.lineCap = 'round';
      context.lineJoin = 'round';

      for (let y = 0; y < rows; y += 1) {
        for (let x = 0; x < columns; x += 1) {
          if (layout[y]?.[x] !== '#') {
            continue;
          }

          const drawX = offsetX + x * tileSize;
          const drawY = offsetY + y * tileSize;
          const centerX = drawX + tileSize / 2;
          const centerY = drawY + tileSize / 2;

          context.strokeStyle = 'rgba(37, 99, 235, 0.34)';
          context.shadowBlur = 14;
          context.shadowColor = 'rgba(59, 130, 246, 0.2)';
          context.lineWidth = Math.max(2, tileSize * 0.18);

          if (layout[y - 1]?.[x] !== '#') {
            context.beginPath();
            context.moveTo(drawX + tileSize * 0.1, drawY);
            context.lineTo(drawX + tileSize * 0.9, drawY);
            context.stroke();
          }
          if (layout[y + 1]?.[x] !== '#') {
            context.beginPath();
            context.moveTo(drawX + tileSize * 0.1, drawY + tileSize);
            context.lineTo(drawX + tileSize * 0.9, drawY + tileSize);
            context.stroke();
          }
          if (layout[y]?.[x - 1] !== '#') {
            context.beginPath();
            context.moveTo(drawX, drawY + tileSize * 0.1);
            context.lineTo(drawX, drawY + tileSize * 0.9);
            context.stroke();
          }
          if (layout[y]?.[x + 1] !== '#') {
            context.beginPath();
            context.moveTo(drawX + tileSize, drawY + tileSize * 0.1);
            context.lineTo(drawX + tileSize, drawY + tileSize * 0.9);
            context.stroke();
          }

          context.beginPath();
          context.fillStyle = 'rgba(59, 130, 246, 0.04)';
          context.arc(centerX, centerY, tileSize * 0.08, 0, Math.PI * 2);
          context.fill();
        }
      }

      for (const lamp of lampsRef.current.values()) {
        const { x: lampX, y: lampY } = cellCenter(lamp.position, tileSize, offsetX, offsetY);
        const pulse = 0.88 + Math.sin(now / 240 + lamp.position.x + lamp.position.y) * 0.12;
        const lampSize = Math.max(14, tileSize * 0.62 * pulse);
        drawLamp(context, lampX, lampY, lampSize, lamp.color);
      }

      trailRef.current = trailRef.current
        .map((point) => ({ ...point, age: point.age + 1 }))
        .filter((point) => point.age < 20);

      const trailPoints = trailRef.current.map((point) =>
        cellCenter(point, tileSize, offsetX, offsetY)
      );

      if (trailPoints.length > 1) {
        context.beginPath();
        context.moveTo(trailPoints[0]?.x ?? 0, trailPoints[0]?.y ?? 0);

        for (let index = 1; index < trailPoints.length; index += 1) {
          const previous = trailPoints[index - 1];
          const current = trailPoints[index];
          if (previous === undefined || current === undefined) {
            continue;
          }

          const midX = (previous.x + current.x) / 2;
          const midY = (previous.y + current.y) / 2;
          context.quadraticCurveTo(previous.x, previous.y, midX, midY);
        }

        const startPoint = trailPoints[0];
        const endPoint = trailPoints[trailPoints.length - 1];
        if (startPoint !== undefined && endPoint !== undefined) {
          const trailGradient = context.createLinearGradient(
            startPoint.x,
            startPoint.y,
            endPoint.x,
            endPoint.y
          );
          trailGradient.addColorStop(0, 'rgba(34, 211, 238, 0)');
          trailGradient.addColorStop(0.35, 'rgba(56, 189, 248, 0.18)');
          trailGradient.addColorStop(1, 'rgba(34, 211, 238, 0.92)');

          context.strokeStyle = trailGradient;
          context.shadowBlur = 18;
          context.shadowColor = 'rgba(34, 211, 238, 0.38)';
          context.lineWidth = Math.max(3, tileSize * 0.22);
          context.stroke();
        }
      }

      const { x: playerX, y: playerY } = cellCenter(
        playerVisualRef.current,
        tileSize,
        offsetX,
        offsetY
      );
      context.beginPath();
      context.strokeStyle = 'rgba(186, 230, 253, 0.4)';
      context.lineWidth = Math.max(1.5, tileSize * 0.08);
      context.arc(playerX, playerY, tileSize * 0.42, 0, Math.PI * 2);
      context.stroke();
      context.beginPath();
      context.fillStyle = 'rgba(34, 211, 238, 0.96)';
      context.shadowBlur = 26;
      context.shadowColor = 'rgba(34, 211, 238, 0.52)';
      context.arc(playerX, playerY, tileSize * 0.26, 0, Math.PI * 2);
      context.fill();

      for (const memoryGap of memoryGapsRef.current) {
        const { x: memoryGapX, y: memoryGapY } = cellCenter(
          memoryGap.visualPosition,
          tileSize,
          offsetX,
          offsetY
        );
        const memoryGapRadius = tileSize * 0.24;

        context.beginPath();
        context.fillStyle = memoryGap.hue;
        context.shadowBlur = 18;
        context.shadowColor = memoryGap.hue;
        context.arc(memoryGapX, memoryGapY, memoryGapRadius, 0, Math.PI * 2);
        context.fill();

        context.beginPath();
        context.strokeStyle = 'rgba(255,255,255,0.45)';
        context.lineWidth = Math.max(1.5, tileSize * 0.08);
        context.moveTo(memoryGapX - memoryGapRadius * 0.35, memoryGapY - memoryGapRadius * 0.35);
        context.lineTo(memoryGapX + memoryGapRadius * 0.35, memoryGapY + memoryGapRadius * 0.35);
        context.moveTo(memoryGapX + memoryGapRadius * 0.35, memoryGapY - memoryGapRadius * 0.35);
        context.lineTo(memoryGapX - memoryGapRadius * 0.35, memoryGapY + memoryGapRadius * 0.35);
        context.stroke();

        context.beginPath();
        context.strokeStyle = 'rgba(255,255,255,0.18)';
        context.lineWidth = Math.max(1.2, tileSize * 0.06);
        context.arc(memoryGapX, memoryGapY, memoryGapRadius * 1.45, 0, Math.PI * 2);
        context.stroke();
      }

      context.restore();

      context.beginPath();
      context.strokeStyle = 'rgba(37, 99, 235, 0.42)';
      context.lineWidth = Math.max(4, tileSize * 0.22);
      context.shadowBlur = 20;
      context.shadowColor = 'rgba(59, 130, 246, 0.18)';
      context.stroke(brainPath);

      if (isGameOver) {
        context.fillStyle = 'rgba(4, 9, 20, 0.66)';
        context.fillRect(0, 0, width, height);
      }
    },
    hasStarted && startTime !== null
  );

  const handleDirection = (direction: IPoint): void => {
    queuedDirectionRef.current = direction;
  };

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
          <p className="text-[10px] uppercase tracking-[0.22em] text-white/45">insights</p>
          <p className="mt-1 font-mono text-lg text-neuron-100">{displayState.insightsCollected}</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
          <p className="text-[10px] uppercase tracking-[0.22em] text-white/45">remaining</p>
          <p className="mt-1 font-mono text-lg text-myelin-100">{displayState.insightsRemaining}</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
          <p className="text-[10px] uppercase tracking-[0.22em] text-white/45">memory gaps</p>
          <p className="mt-1 font-mono text-lg text-cortex-100">{displayState.memoryGapCount}</p>
        </div>
      </div>

      <div
        ref={containerRef}
        className="relative h-[320px] overflow-hidden rounded-[28px] border border-white/10 bg-[radial-gradient(circle_at_top,hsl(var(--dendrite-900)/0.8),hsl(var(--background)/0.96)_55%,hsl(var(--axon-900))_100%)] shadow-[inset_0_0_40px_rgba(167,139,250,0.08)]"
      >
        <div
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_15%,hsl(var(--dendrite-400)/0.18),transparent_26%),radial-gradient(circle_at_80%_18%,hsl(var(--cortex-400)/0.16),transparent_30%)]"
          aria-hidden="true"
        />
        <canvas
          ref={canvasRef}
          className={cn('relative z-10 h-full w-full', isGameOver && 'opacity-80')}
        />

        <div className="pointer-events-none absolute bottom-3 left-3 rounded-full border border-white/10 bg-black/30 px-3 py-1 text-xs text-white/68 backdrop-blur-md">
          Arrow keys or the control pad move the signal.
        </div>

        {!hasStarted && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-[rgba(4,9,20,0.64)] p-6 backdrop-blur-sm">
            <div className="max-w-sm rounded-3xl border border-white/10 bg-black/35 px-6 py-5 text-center shadow-[0_0_35px_rgba(96,165,250,0.16)]">
              <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-synapse-100/78">
                Instructions
              </p>
              <p className="mt-3 text-lg font-semibold text-white">
                Guide the signal through the recovering cortex.
              </p>
              <p className="mt-2 text-sm leading-6 text-white/70">
                Collect glowing lamp insights, avoid drifting memory gaps, and use the arrow keys or
                control pad to steer. Each replay remaps the maze and increases the pressure over
                time.
              </p>
              <Button
                type="button"
                className="mt-5 rounded-2xl px-5 shadow-[0_0_24px_hsl(var(--synapse-400)/0.22)]"
                onClick={startGame}
              >
                OK
              </Button>
            </div>
          </div>
        )}

        {isGameOver && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-[rgba(4,9,20,0.58)] p-6 backdrop-blur-sm">
            <div className="rounded-3xl border border-cortex-400/35 bg-black/35 px-6 py-5 text-center shadow-[0_0_35px_rgba(248,113,113,0.16)]">
              <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-cortex-100/78">
                GAME OVER
              </p>
              <p className="text-lg font-semibold text-cortex-100">
                Distracted by irrelevant thoughts.
              </p>
              <p className="mt-2 text-sm text-white/70">
                You secured {displayState.insightsCollected} insights before the distractions won.
              </p>
              <div className="mt-5 flex justify-center gap-3">
                <Button
                  type="button"
                  variant="outline"
                  className="rounded-2xl border-white/10 bg-black/25 text-white hover:bg-white/10"
                  onClick={replayGame}
                >
                  Replay
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="rounded-2xl border-white/10 bg-black/25 text-white hover:bg-white/10"
                  onClick={onBack}
                >
                  Back
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="mx-auto grid w-full max-w-[220px] grid-cols-3 gap-2">
        <div />
        <Button
          type="button"
          variant="outline"
          className="border-white/10 bg-black/20 text-white hover:bg-white/10"
          onClick={() => {
            handleDirection({ x: 0, y: -1 });
          }}
        >
          <ArrowUp className="h-4 w-4" />
        </Button>
        <div />
        <Button
          type="button"
          variant="outline"
          className="border-white/10 bg-black/20 text-white hover:bg-white/10"
          onClick={() => {
            handleDirection({ x: -1, y: 0 });
          }}
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="outline"
          className="border-white/10 bg-black/20 text-white hover:bg-white/10"
          onClick={() => {
            handleDirection({ x: 0, y: 1 });
          }}
        >
          <ArrowDown className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="outline"
          className="border-white/10 bg-black/20 text-white hover:bg-white/10"
          onClick={() => {
            handleDirection({ x: 1, y: 0 });
          }}
        >
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex justify-end">
        <Button
          type="button"
          variant="outline"
          className="rounded-2xl border-white/10 bg-black/20 text-white hover:bg-white/10"
          onClick={onBack}
        >
          Back
        </Button>
      </div>

      <div className="text-xs text-white/62">
        Difficulty rises over time with more memory gaps, faster pursuit, randomized lamp density,
        and a fresh maze layout each run.
      </div>
    </div>
  );
}
