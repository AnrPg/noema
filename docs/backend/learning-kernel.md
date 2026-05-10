# Learning Kernel

`@noema/learning-kernel` is the canonical closed-loop contract package. It owns:

- branded learning ID schemas and input types
- mode, Step, LessonPlan, Evaluation, Trigger, Scheduler, KG, Curriculum,
  Content, and Gamification payload schemas
- event schemas and the event topology registry
- envelope builders, runtime validators, and golden closed-loop fixtures

Shared packages can import and re-export kernel-owned schemas, but must not
redefine closed-loop semantics locally. In particular:

- `ConceptId` is only a canonical CKG concept identifier
- `CurriculumNodeId` is never valid in `conceptRefs`
- Step events carry explicit `conceptRefs`, `selectedNodeIds`, and `studyMode`
- session slices and LessonPlans require non-empty `selectedNodeIds`
- `session.curriculum_slice.selected` carries `sessionId` so its aggregate id is
  the Session, not the Curriculum
- content activity selection uses `anchoredCkgNodeIds`
- learning-state events require `studyMode`
