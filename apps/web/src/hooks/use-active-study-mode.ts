'use client';

import * as React from 'react';
import { useAuthStore } from '@noema/auth';
import type { StudyMode } from '@noema/types';
import { DEFAULT_STUDY_MODE, isStudyMode, STUDY_MODE_STORAGE_KEY } from '@/lib/study-mode';

export function useActiveStudyMode(): StudyMode {
  const authSettings = useAuthStore((state) => state.settings);
  const [activeStudyMode, setActiveStudyMode] = React.useState<StudyMode>(DEFAULT_STUDY_MODE);

  const authSettingsStudyMode =
    typeof authSettings === 'object' &&
    authSettings !== null &&
    'activeStudyMode' in authSettings &&
    isStudyMode((authSettings as { activeStudyMode?: string }).activeStudyMode)
      ? (authSettings as { activeStudyMode: StudyMode }).activeStudyMode
      : undefined;

  React.useEffect(() => {
    const persistedStudyMode = globalThis.localStorage.getItem(STUDY_MODE_STORAGE_KEY);
    if (isStudyMode(persistedStudyMode)) {
      setActiveStudyMode(persistedStudyMode);
    }
  }, []);

  React.useEffect(() => {
    if (authSettingsStudyMode !== undefined && authSettingsStudyMode !== activeStudyMode) {
      setActiveStudyMode(authSettingsStudyMode);
      globalThis.localStorage.setItem(STUDY_MODE_STORAGE_KEY, authSettingsStudyMode);
    }
  }, [activeStudyMode, authSettingsStudyMode]);

  return activeStudyMode;
}
