import type { ICardDto } from '@noema/api-client';

export type SessionRevealMode = 'all_at_once' | 'one_then_more';

export interface ISessionPresentationPreferences {
  promptSide?: string;
  answerSide?: string;
  revealMode?: SessionRevealMode;
}

export interface ISessionCardSide {
  key: string;
  label: string;
  value: string;
}

type ContentRecord = Record<string, unknown>;

const EXCLUDED_GENERIC_KEYS = new Set([
  'imageUrl',
  'audioUrl',
  'videoUrl',
  'media',
  'mediaItems',
  'regions',
  'choices',
  'options',
]);

const NON_TEXTUAL_SESSION_CARD_TYPES = new Set([
  'audio',
  'case_based',
  'cloze',
  'concept_graph',
  'confidence_rated',
  'diagram',
  'image_occlusion',
  'matching',
  'multiple_choice',
  'ordering',
  'transfer',
  'true_false',
]);

function normalizeText(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

function normalizeStringList(values: unknown): string | null {
  if (!Array.isArray(values)) {
    return null;
  }

  const parts = values
    .map((value) => normalizeText(value))
    .filter((value): value is string => value !== null);

  return parts.length > 0 ? parts.map((value) => `• ${value}`).join('\n') : null;
}

function addSide(sides: ISessionCardSide[], key: string, label: string, value: unknown): void {
  const normalized = normalizeText(value);
  if (normalized === null || sides.some((side) => side.key === key)) {
    return;
  }

  sides.push({ key, label, value: normalized });
}

function addFormattedSide(
  sides: ISessionCardSide[],
  key: string,
  label: string,
  value: string | null
): void {
  if (value === null || sides.some((side) => side.key === key)) {
    return;
  }

  sides.push({ key, label, value });
}

function formatSteps(steps: unknown): string | null {
  if (!Array.isArray(steps) || steps.length === 0) {
    return null;
  }

  const rows = steps
    .map((step, index) => {
      if (typeof step !== 'object' || step === null) {
        return null;
      }

      const record = step as Record<string, unknown>;
      const order = typeof record['order'] === 'number' ? record['order'] : index + 1;
      const title = normalizeText(record['title']) ?? `Step ${String(order)}`;
      const description = normalizeText(record['description']);
      return `${String(order)}. ${title}${description !== null ? `\n${description}` : ''}`;
    })
    .filter((row): row is string => row !== null);

  return rows.length > 0 ? rows.join('\n\n') : null;
}

function formatExamples(examples: unknown): string | null {
  return normalizeStringList(examples);
}

function formatLayers(layers: unknown): string | null {
  if (!Array.isArray(layers) || layers.length === 0) {
    return null;
  }

  const rows = layers
    .map((layer, index) => {
      if (typeof layer !== 'object' || layer === null) {
        return null;
      }

      const record = layer as Record<string, unknown>;
      const order = typeof record['order'] === 'number' ? record['order'] : index + 1;
      const content = normalizeText(record['content']);
      if (content === null) {
        return null;
      }

      return `${String(order)}. ${content}`;
    })
    .filter((row): row is string => row !== null);

  return rows.length > 0 ? rows.join('\n\n') : null;
}

function formatComparisonItems(items: unknown): string | null {
  if (!Array.isArray(items) || items.length === 0) {
    return null;
  }

  const rows = items
    .map((item) => {
      if (typeof item !== 'object' || item === null) {
        return null;
      }

      const record = item as Record<string, unknown>;
      const label = normalizeText(record['label']) ?? 'Item';
      const attributes =
        typeof record['attributes'] === 'object' && record['attributes'] !== null
          ? Object.entries(record['attributes'] as Record<string, unknown>)
              .map(([attributeKey, attributeValue]) => {
                const normalized = normalizeText(attributeValue);
                return normalized === null ? null : `${humanizeKey(attributeKey)}: ${normalized}`;
              })
              .filter((row): row is string => row !== null)
          : [];

      return attributes.length > 0 ? `${label}\n${attributes.join('\n')}` : label;
    })
    .filter((row): row is string => row !== null);

  return rows.length > 0 ? rows.join('\n\n') : null;
}

function formatExceptionCases(exceptions: unknown): string | null {
  if (!Array.isArray(exceptions) || exceptions.length === 0) {
    return null;
  }

  const rows = exceptions
    .map((exception, index) => {
      if (typeof exception !== 'object' || exception === null) {
        return null;
      }

      const record = exception as Record<string, unknown>;
      const condition = normalizeText(record['condition']) ?? `Exception ${String(index + 1)}`;
      const explanation = normalizeText(record['explanation']);
      return explanation === null ? condition : `${condition}\n${explanation}`;
    })
    .filter((row): row is string => row !== null);

  return rows.length > 0 ? rows.join('\n\n') : null;
}

function formatTimelineEvents(events: unknown): string | null {
  if (!Array.isArray(events) || events.length === 0) {
    return null;
  }

  const rows = events
    .map((event, index) => {
      if (typeof event !== 'object' || event === null) {
        return null;
      }

      const record = event as Record<string, unknown>;
      const title =
        normalizeText(record['title']) ??
        normalizeText(record['label']) ??
        normalizeText(record['name']) ??
        `Event ${String(index + 1)}`;
      const date =
        normalizeText(record['date']) ??
        normalizeText(record['time']) ??
        normalizeText(record['period']) ??
        normalizeText(record['year']);
      const description = normalizeText(record['description']);
      const header = date !== null ? `${date} - ${title}` : title;
      return description === null ? header : `${header}\n${description}`;
    })
    .filter((row): row is string => row !== null);

  return rows.length > 0 ? rows.join('\n\n') : null;
}

function formatMediaText(items: unknown): string | null {
  if (!Array.isArray(items) || items.length === 0) {
    return null;
  }

  const rows = items
    .map((item) => {
      if (typeof item !== 'object' || item === null) {
        return null;
      }

      const record = item as Record<string, unknown>;
      if (record['type'] !== 'text') {
        return null;
      }

      return normalizeText(record['content']);
    })
    .filter((row): row is string => row !== null);

  return rows.length > 0 ? rows.join('\n\n') : null;
}

function humanizeKey(key: string): string {
  return key
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^./, (char) => char.toUpperCase());
}

function addGenericSides(sides: ISessionCardSide[], content: ContentRecord): void {
  Object.entries(content).forEach(([key, value]) => {
    if (EXCLUDED_GENERIC_KEYS.has(key) || sides.some((side) => side.key === key)) {
      return;
    }

    const direct = normalizeText(value);
    if (direct !== null) {
      sides.push({ key, label: humanizeKey(key), value: direct });
      return;
    }

    const list = normalizeStringList(value);
    if (list !== null) {
      sides.push({ key, label: humanizeKey(key), value: list });
    }
  });
}

export function deriveSessionCardSides(card: ICardDto): ISessionCardSide[] {
  const content = card.content as ContentRecord;
  const sides: ISessionCardSide[] = [];

  switch (card.cardType) {
    case 'atomic':
      addSide(sides, 'front', 'Front', content['front']);
      addSide(sides, 'back', 'Back', content['back']);
      addSide(sides, 'explanation', 'Explanation', content['explanation']);
      break;
    case 'definition':
      addSide(sides, 'term', 'Term', content['term']);
      addSide(sides, 'definition', 'Definition', content['definition']);
      addFormattedSide(sides, 'examples', 'Examples', formatExamples(content['examples']));
      addSide(sides, 'explanation', 'Explanation', content['explanation']);
      break;
    case 'process':
      addSide(sides, 'processName', 'Process', content['processName']);
      addFormattedSide(sides, 'steps', 'Steps', formatSteps(content['steps']));
      addSide(sides, 'explanation', 'Explanation', content['explanation']);
      break;
    case 'multimodal':
      addSide(sides, 'synthesisPrompt', 'Prompt', content['synthesisPrompt']);
      addSide(sides, 'front', 'Front', content['front']);
      addFormattedSide(sides, 'mediaText', 'Media Notes', formatMediaText(content['mediaItems']));
      addSide(sides, 'back', 'Back', content['back']);
      addSide(sides, 'explanation', 'Explanation', content['explanation']);
      break;
    case 'progressive_disclosure':
      addSide(sides, 'front', 'Front', content['front']);
      addFormattedSide(sides, 'layers', 'Layers', formatLayers(content['layers']));
      addSide(sides, 'back', 'Back', content['back']);
      addSide(sides, 'explanation', 'Explanation', content['explanation']);
      break;
    case 'comparison':
      addSide(sides, 'front', 'Prompt', content['front']);
      addFormattedSide(sides, 'items', 'Items', formatComparisonItems(content['items']));
      addFormattedSide(
        sides,
        'comparisonCriteria',
        'Criteria',
        normalizeStringList(content['comparisonCriteria'])
      );
      addSide(sides, 'back', 'Back', content['back']);
      addSide(sides, 'explanation', 'Explanation', content['explanation']);
      break;
    case 'exception':
      addSide(sides, 'rule', 'Rule', content['rule']);
      addSide(sides, 'generalPrinciple', 'General Principle', content['generalPrinciple']);
      addFormattedSide(
        sides,
        'exceptions',
        'Exceptions',
        formatExceptionCases(content['exceptions'])
      );
      addSide(sides, 'explanation', 'Explanation', content['explanation']);
      break;
    case 'error_spotting':
      addSide(sides, 'errorText', 'Original', content['errorText']);
      addSide(sides, 'correctedText', 'Correction', content['correctedText']);
      addSide(sides, 'errorExplanation', 'Why', content['errorExplanation']);
      addSide(sides, 'explanation', 'Explanation', content['explanation']);
      break;
    case 'timeline':
      addSide(sides, 'front', 'Prompt', content['front']);
      addFormattedSide(sides, 'events', 'Events', formatTimelineEvents(content['events']));
      addSide(sides, 'timelineScope', 'Scope', content['timelineScope']);
      addSide(sides, 'explanation', 'Explanation', content['explanation']);
      break;
    default:
      addGenericSides(sides, content);
      break;
  }

  addSide(sides, 'hint', 'Hint', content['hint']);
  addGenericSides(sides, content);

  return sides;
}

export function getDefaultPromptSide(sides: ISessionCardSide[]): string | undefined {
  return sides[0]?.key;
}

export function getPromptSide(
  sides: ISessionCardSide[],
  preferences?: ISessionPresentationPreferences
): ISessionCardSide | null {
  if (sides.length === 0) {
    return null;
  }

  if (preferences?.promptSide !== undefined) {
    const explicit = sides.find((side) => side.key === preferences.promptSide);
    if (explicit !== undefined) {
      return explicit;
    }
  }

  return sides[0] ?? null;
}

export function getAnswerSides(
  sides: ISessionCardSide[],
  preferences?: ISessionPresentationPreferences
): {
  primary: ISessionCardSide | null;
  others: ISessionCardSide[];
} {
  const prompt = getPromptSide(sides, preferences);
  const remaining = prompt === null ? [...sides] : sides.filter((side) => side.key !== prompt.key);

  if (remaining.length === 0) {
    return { primary: null, others: [] };
  }

  if (preferences?.answerSide !== undefined) {
    const explicit = remaining.find((side) => side.key === preferences.answerSide);
    if (explicit !== undefined) {
      return {
        primary: explicit,
        others: remaining.filter((side) => side.key !== explicit.key),
      };
    }
  }

  const [primary, ...others] = remaining;
  return { primary: primary ?? null, others };
}

export function supportsSessionSidePresentation(card: ICardDto): boolean {
  return (
    !NON_TEXTUAL_SESSION_CARD_TYPES.has(card.cardType) && deriveSessionCardSides(card).length >= 2
  );
}
