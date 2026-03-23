# Misconception Center

## Purpose

The Misconception Center at `/knowledge/misconceptions` is the learner-facing
review surface for misconception detection, triage, and lifecycle management.

## Data Flow

- The page reads misconception records through `useMisconceptions(userId)`.
- It triggers new scans through `useDetectMisconceptions(userId)`.
- It updates lifecycle state through `useUpdateMisconceptionStatus(userId)`.
- The API client normalizes the KG service response into a richer DTO with
  family, severity, affected node IDs, descriptions, and full lifecycle states.

## UI Sections

- Status summary tiles for the active misconception lifecycle states.
- Family breakdown cards for quick triage by misconception family.
- Filter and sort controls for status, severity, confidence, and family review.
- Expandable misconception records with confidence, severity, pipeline, and
  affected graph scope.
- Detail panels with subgraph preview, evidence metadata, node IDs, and review
  actions for confirm, address, resolve, and recurring escalation.

## Boundaries

- Detection logic, severity assignment, and family classification stay in the
  Knowledge Graph service.
- The API client exposes a frontend-safe DTO and status normalization.
- The web page focuses on review workflow and lifecycle actions only.
