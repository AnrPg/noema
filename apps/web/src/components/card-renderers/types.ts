/**
 * @noema/web - Card Renderers
 * Shared prop types for all card renderer components.
 */

import type { ICardDto } from '@noema/api-client';

export type CardRendererMode = 'preview' | 'interactive';

export interface ICardRendererProps {
  card: ICardDto;
  mode: CardRendererMode;
  isRevealed: boolean;
  onAnswer?: (answer: unknown) => void;
  onHintRequest?: () => void;
  onReveal?: () => void;
  className?: string;
}
