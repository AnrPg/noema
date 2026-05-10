# Curricula

The learner web app exposes learner-facing curriculum vault surfaces:

- `/curricula` shows the real curriculum vault backed by the curriculum-service
  list API, and every curriculum card includes a static DAG preview of the
  active path.
- `/curricula/new` starts goal-to-draft creation and also supports creating a
  blank draft directly.
- `/curricula/[id]` shows the active curriculum as a static, interactable DAG;
  node selection drives the freeze controls, frontier context, revision
  workflow, and the deep-linked "start from this node" handoff instead of a flat
  node list.
- `/session/new?curriculumId=<id>` allows the vault to preselect the required
  curriculum for session start and `/session/new?curriculumId=<id>&nodeId=<id>`
  preselects the exact frontier node the learner wants to tackle.
- Session setup now expects the learner to choose a concrete frontier node for
  curriculum-bound sessions instead of silently inferring one from the whole
  frontier set.
- In Custom Build mode, if the chosen frontier node has no compatible payloads,
  the content-creation pipeline can generate and persist a requested number of
  cards and activity variants before the session begins.

Planner-generated curriculum drafts should hand off directly into the matching
curriculum detail page after import. Session-sized lesson plans are not drafted
from curriculum vault pages without a real session id; they are generated during
session setup after a session has been created and bound to a curriculum.

Vault visibility follows the curriculum-service list contract, which excludes
curricula marked with `metadata.hiddenFromVault = true`. That keeps
system-managed or maintenance-only paths out of the normal learner vault while
still allowing the session runtime to use dedicated maintenance identifiers
internally where legacy paths still exist.
