import React from 'react';
import { render } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';
import type { ICardSummaryDto } from '@noema/api-client';

import { CardCollection } from './card-collection';

const buildCard = (id: string): ICardSummaryDto =>
  ({
    id,
    version: 1,
    cardType: 'atomic',
    state: 'active',
    difficulty: 0.4,
    tags: [],
    createdAt: '2026-05-10T00:00:00.000Z',
    updatedAt: '2026-05-10T00:00:00.000Z',
    nextReviewAt: null,
    source: 'manual',
  }) as ICardSummaryDto;

describe('CardCollection', () => {
  test('does not reset selection when parent rerenders with the same card ids', () => {
    const onSelectionChange = vi.fn();
    const cards = [buildCard('card-1'), buildCard('card-2')];

    const { rerender } = render(
      <CardCollection cards={cards} onSelectionChange={onSelectionChange} />
    );

    expect(onSelectionChange).toHaveBeenCalledTimes(1);

    rerender(<CardCollection cards={[...cards]} onSelectionChange={onSelectionChange} />);

    expect(onSelectionChange).toHaveBeenCalledTimes(1);
  });
});
