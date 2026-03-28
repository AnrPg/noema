/**
 * Dashboard Page — Cognitive Vitals
 *
 * Codename: Thalamus
 * Composes all 5 dashboard sections with staggered entrance animation.
 * Each section is independently isolated via SectionErrorBoundary.
 */

'use client';

import { useAuth } from '@noema/auth';
import { getUserFirstName } from '@noema/auth/user-display';
import { SectionErrorBoundary } from '@/components/section-error-boundary';
import { CognitiveVitals } from '@/components/dashboard/cognitive-vitals';
import { CopilotSuggestions } from '@/components/dashboard/copilot-suggestions';
import { KnowledgePulse } from '@/components/dashboard/knowledge-pulse';
import { RecentSessions } from '@/components/dashboard/recent-sessions';
import { ReviewForecast } from '@/components/dashboard/review-forecast';
import { useActiveStudyMode } from '@/hooks/use-active-study-mode';

// ============================================================================
// Helpers
// ============================================================================

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

// ============================================================================
// Page
// ============================================================================

export default function DashboardPage(): React.JSX.Element | null {
  const { user } = useAuth();
  const activeStudyMode = useActiveStudyMode();

  // user is null during the brief window between mount and the auth store hydrating.
  // The authenticated layout handles the full loading skeleton; returning null here
  // avoids rendering dashboard content with an undefined userId.
  if (user === null) return null;

  const firstName = getUserFirstName(user);
  const userId = user.id;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="animate-fade-slide-in" style={{ animationDelay: '0ms' }}>
        <h1 className="text-3xl font-bold">
          {getGreeting()}, {firstName}
        </h1>
        <p className="text-muted-foreground mt-1">Here&apos;s your cognitive health at a glance.</p>
      </div>

      {/* Vitals row */}
      <div className="animate-fade-slide-in" style={{ animationDelay: '100ms' }}>
        <SectionErrorBoundary>
          <CognitiveVitals userId={userId} studyMode={activeStudyMode} />
        </SectionErrorBoundary>
      </div>

      {/* Review Forecast */}
      <div className="animate-fade-slide-in" style={{ animationDelay: '200ms' }}>
        <SectionErrorBoundary>
          <ReviewForecast userId={userId} studyMode={activeStudyMode} />
        </SectionErrorBoundary>
      </div>

      {/* Knowledge Pulse + Recent Sessions (side-by-side on desktop) */}
      <div
        className="grid gap-6 animate-fade-slide-in md:grid-cols-2"
        style={{ animationDelay: '300ms' }}
      >
        <SectionErrorBoundary>
          <KnowledgePulse userId={userId} studyMode={activeStudyMode} />
        </SectionErrorBoundary>
        <SectionErrorBoundary>
          <RecentSessions userId={userId} studyMode={activeStudyMode} />
        </SectionErrorBoundary>
      </div>

      {/* Copilot Suggestions */}
      <div className="animate-fade-slide-in" style={{ animationDelay: '400ms' }}>
        <SectionErrorBoundary>
          <CopilotSuggestions />
        </SectionErrorBoundary>
      </div>
    </div>
  );
}
