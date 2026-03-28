import type { StudyMode } from '@noema/types';

export const STUDY_MODE_STORAGE_KEY = 'noema-study-mode';

export const DEFAULT_STUDY_MODE: StudyMode = 'knowledge_gaining';

export function isStudyMode(value: string | null | undefined): value is StudyMode {
  return value === 'language_learning' || value === 'knowledge_gaining';
}

export function readStoredStudyMode(): StudyMode | undefined {
  if (typeof globalThis.localStorage === 'undefined') {
    return undefined;
  }
  const value = globalThis.localStorage.getItem(STUDY_MODE_STORAGE_KEY);
  return isStudyMode(value) ? value : undefined;
}

export function persistStudyMode(mode: StudyMode): void {
  if (typeof globalThis.localStorage === 'undefined') {
    return;
  }
  globalThis.localStorage.setItem(STUDY_MODE_STORAGE_KEY, mode);
}

export function getStudyModeFromSettings(settings: unknown): StudyMode | undefined {
  return typeof settings === 'object' &&
    settings !== null &&
    'activeStudyMode' in settings &&
    isStudyMode((settings as { activeStudyMode?: string }).activeStudyMode ?? null)
    ? (settings as { activeStudyMode: StudyMode }).activeStudyMode
    : undefined;
}

export function getStudyModeLabel(mode: StudyMode): string {
  return mode === 'language_learning' ? 'Language Learning' : 'Knowledge Gaining';
}

export function getStudyModeShortLabel(mode: StudyMode): string {
  return mode === 'language_learning' ? 'Language' : 'Knowledge';
}

export function getStudyModeDescription(mode: StudyMode): string {
  return mode === 'language_learning'
    ? 'Language mode favors vocabulary, grammar, contrastive drills, and lexical graph links.'
    : 'Knowledge mode favors concepts, procedures, explanations, and prerequisite-aware graph links.';
}
