# Step-Focused Web Cutover

Batch 10 makes the learner app concept-oriented and Step-focused.

## Active Step Loop

`apps/web/src/app/(authenticated)/session/[sessionId]/page.tsx` renders the
runtime Step view. It loads the current Step from `useNextStep`, presents the
objective and primary activity prompt, captures the learner response, and
submits `useAnswerStep` with:

- response text
- `correct` as the expected-outcome checkbox result
- `selfRating` from the three-choice `SelfRatingControls`
- response time
- a seven-frame trace built from the current Step and learner input

`TraceBuilder` shows the same trace and evaluation preview before submission so
the learner-facing surface matches the closed-loop payload.

## Concept Payload Surfaces

Cards remain content-service payload records, but learner-visible labels use
concept payload vocabulary. The authenticated navigation, command palette,
payload list, detail page, creation wizard, batch import wizard, and session
setup copy now avoid card-first framing.

## Dashboard

The dashboard vitals include concept stability and reasoning trend from
`useStabilitySummary`. Session summaries also report mode-scoped stability
snapshots instead of mastery language.

## Tests And Validation

The focused session page test covers the Step view, three-choice self-rating,
trace builder, evaluation summary, and answer payload shape. The web package
does not currently define a real test runner script or Playwright config, so
Batch 10 validation is lint plus typecheck until that harness is added.
