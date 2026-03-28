# Structural Health Dashboard

## Purpose

The Structural Health dashboard at `/knowledge/health` is the learner-facing
review surface for PKG quality, metacognitive stage, and cross-metric patterns.

## Data Flow

- The page reads the full structural health report through
  `useStructuralHealth(userId, { studyMode })`.
- It reads the stage assessment through
  `useMetacognitiveStage(userId, { studyMode })`.
- It reads historical score snapshots through
  `useMetricHistory(userId, { studyMode })`.
- All data flows through the Knowledge Graph API client; the page does not call
  service endpoints directly.

The page also reads the active study mode from the shared authenticated-shell
mode toggle and labels the report scope in the UI.

## UI Sections

- Hero score card with grade, trend, misconception count, and active issues.
- Four-step metacognitive stage bar showing the current scaffolding stage.
- Stage evidence and next-stage gap panels for review-oriented progression.
- Health-normalized radar chart for the 11 structural metrics.
- Metric drill-down with status, trend, hint, and overall health history.
- Cross-metric pattern cards with remediation guidance.

## Boundaries

- The KG service owns structural-health computation and stage assessment.
- The API client exposes DTOs and hooks for the frontend/application boundary.
- The web page focuses on review and interpretation, not metric computation.
- Structural health is mode-scoped by default; the page should not merge
  language and knowledge analytics into one unlabeled report.
