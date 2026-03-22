# Admin Data States

- Template and CKG mutation screens now show plain-language failure states
  instead of backend-oriented wording.
- Error handling now distinguishes between offline/network failures, timeouts,
  permissions, missing data, rate limits, invalid requests, conflicts, and
  server-side failures.
- Local-development hints remain available without exposing backend jargon in
  the main user-facing message.
- Both screens expose an inline retry action and disable React Query retries to
  avoid noisy repeated failures.
- The CKG admin screens now show the real workflow state (`pending_review`,
  `revision_requested`, `committing`, etc.) instead of collapsing everything
  into legacy `pending/approved/rejected` labels.
- The dashboard and graph overlay now count only mutations that truly need human
  review, which keeps the admin queue aligned with the backend pipeline.
