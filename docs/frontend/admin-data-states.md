# Admin Data States

- Template and CKG mutation screens now show contextual recovery guidance instead of generic failure text.
- Local-development failures distinguish between missing routes, permission issues, and upstream service outages.
- Both screens expose an inline retry action and disable React Query retries to avoid noisy repeated failures.
- The CKG admin screens now show the real workflow state (`pending_review`, `revision_requested`, `committing`, etc.) instead of collapsing everything into legacy `pending/approved/rejected` labels.
- The dashboard and graph overlay now count only mutations that truly need human review, which keeps the admin queue aligned with the backend pipeline.
