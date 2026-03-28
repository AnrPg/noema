'use client';

import * as React from 'react';
import { useAuthStore } from '@noema/auth';
import type { StudyMode } from '@noema/types';
import {
  DEFAULT_STUDY_MODE,
  getStudyModeFromSettings,
  persistStudyMode,
  readStoredStudyMode,
} from '@/lib/study-mode';

interface IStudyModeContextValue {
  activeStudyMode: StudyMode;
  setActiveStudyMode: (mode: StudyMode) => void;
}

const StudyModeContext = React.createContext<IStudyModeContextValue | null>(null);

export function StudyModeProvider(props: {
  value: IStudyModeContextValue;
  children: React.ReactNode;
}): React.ReactElement {
  return React.createElement(StudyModeContext.Provider, props);
}

export function useStudyModeController(): IStudyModeContextValue {
  const context = React.useContext(StudyModeContext);
  const authSettings = useAuthStore((state) => state.settings);

  if (context !== null) {
    return context;
  }

  const fallbackStudyMode =
    getStudyModeFromSettings(authSettings) ?? readStoredStudyMode() ?? DEFAULT_STUDY_MODE;

  return {
    activeStudyMode: fallbackStudyMode,
    setActiveStudyMode: (mode) => {
      persistStudyMode(mode);
    },
  };
}

export function useActiveStudyMode(): StudyMode {
  return useStudyModeController().activeStudyMode;
}
