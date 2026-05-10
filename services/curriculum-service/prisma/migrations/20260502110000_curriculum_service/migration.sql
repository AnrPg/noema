-- Initial curriculum-service schema.

CREATE TYPE "curriculum_state" AS ENUM ('DRAFT', 'FINALIZED', 'ARCHIVED');
CREATE TYPE "curriculum_version_state" AS ENUM ('DRAFT', 'VALIDATED', 'ACTIVE', 'SUPERSEDED');
CREATE TYPE "curriculum_node_runtime_state" AS ENUM ('LOCKED', 'UNLOCKED', 'IN_PROGRESS', 'COMPLETED', 'BLOCKED', 'SKIPPED');
CREATE TYPE "curriculum_edge_type" AS ENUM ('PREREQUISITE', 'RECOMMENDED_BEFORE', 'REINFORCES');
CREATE TYPE "curriculum_origin_mode" AS ENUM ('AGENT_GENERATED', 'USER_AUTHORED', 'DOCUMENT_DERIVED');
CREATE TYPE "curriculum_revision_reason" AS ENUM ('PREREQUISITE_GAP', 'MISCONCEPTION', 'CONFUSION', 'STRUCTURAL_INVALIDATION', 'USER_EDIT', 'ZERO_RETENTION');
CREATE TYPE "revision_change_kind" AS ENUM ('INSERT_PREREQUISITE', 'REORDER', 'ADD_NODE', 'REMOVE_EDGE', 'RETARGET_EDGE', 'RELABEL_NODE', 'ADJUST_THRESHOLD', 'ADD_REMEDIATION_PATH', 'SPLIT_NODE', 'FLAG_FOR_SKIP');
CREATE TYPE "revision_change_state" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'APPLIED');

CREATE TABLE "curricula" (
    "id" VARCHAR(50) NOT NULL,
    "user_id" VARCHAR(50) NOT NULL,
    "title" VARCHAR(300) NOT NULL,
    "description" VARCHAR(2000),
    "goal" VARCHAR(2000),
    "domain" VARCHAR(200),
    "origin_mode" "curriculum_origin_mode" NOT NULL,
    "state" "curriculum_state" NOT NULL DEFAULT 'DRAFT',
    "active_version_id" VARCHAR(50),
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "curricula_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "curriculum_versions" (
    "id" VARCHAR(50) NOT NULL,
    "curriculum_id" VARCHAR(50) NOT NULL,
    "version_number" INTEGER NOT NULL,
    "state" "curriculum_version_state" NOT NULL DEFAULT 'DRAFT',
    "parent_version_id" VARCHAR(50),
    "agent_run_id" VARCHAR(100),
    "guardian_validation_id" VARCHAR(100),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finalized_at" TIMESTAMP(3),
    "superseded_at" TIMESTAMP(3),

    CONSTRAINT "curriculum_versions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "curriculum_nodes" (
    "id" VARCHAR(50) NOT NULL,
    "curriculum_version_id" VARCHAR(50) NOT NULL,
    "ckg_concept_id" VARCHAR(50),
    "proposed_concept" JSONB,
    "label" VARCHAR(300) NOT NULL,
    "learning_objective" VARCHAR(1000),
    "mastery_threshold" DOUBLE PRECISION NOT NULL,
    "estimated_sessions" INTEGER NOT NULL,
    "traversal_weight" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "stable_node_key" VARCHAR(200) NOT NULL,

    CONSTRAINT "curriculum_nodes_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "curriculum_edges" (
    "id" VARCHAR(50) NOT NULL,
    "curriculum_version_id" VARCHAR(50) NOT NULL,
    "from_node_id" VARCHAR(50) NOT NULL,
    "to_node_id" VARCHAR(50) NOT NULL,
    "type" "curriculum_edge_type" NOT NULL,
    "rationale" VARCHAR(2000),
    "ordering_weight" DOUBLE PRECISION NOT NULL DEFAULT 0,

    CONSTRAINT "curriculum_edges_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "curriculum_progress" (
    "id" VARCHAR(50) NOT NULL,
    "curriculum_id" VARCHAR(50) NOT NULL,
    "user_id" VARCHAR(50) NOT NULL,
    "stable_node_key" VARCHAR(200) NOT NULL,
    "runtime_state" "curriculum_node_runtime_state" NOT NULL,
    "first_touched_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "last_session_id" VARCHAR(50),
    "evaluation_count" INTEGER NOT NULL DEFAULT 0,
    "correct_streak" INTEGER NOT NULL DEFAULT 0,
    "stability_snapshot" DOUBLE PRECISION,

    CONSTRAINT "curriculum_progress_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "curriculum_revision_proposals" (
    "id" VARCHAR(50) NOT NULL,
    "curriculum_id" VARCHAR(50) NOT NULL,
    "proposed_from_version_id" VARCHAR(50) NOT NULL,
    "reason" "curriculum_revision_reason" NOT NULL,
    "evidence" JSONB NOT NULL,
    "rationale" VARCHAR(4000) NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "applied_version_id" VARCHAR(50),

    CONSTRAINT "curriculum_revision_proposals_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "revision_changes" (
    "id" VARCHAR(50) NOT NULL,
    "proposal_id" VARCHAR(50) NOT NULL,
    "kind" "revision_change_kind" NOT NULL,
    "payload" JSONB NOT NULL,
    "rationale" VARCHAR(2000),
    "state" "revision_change_state" NOT NULL DEFAULT 'PENDING',
    "decided_at" TIMESTAMP(3),
    "rejection_reason" VARCHAR(200),

    CONSTRAINT "revision_changes_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "realignment_evidence" (
    "id" VARCHAR(50) NOT NULL,
    "curriculum_id" VARCHAR(50) NOT NULL,
    "stable_node_key" VARCHAR(200) NOT NULL,
    "trigger_type" VARCHAR(100) NOT NULL,
    "session_ids" TEXT[],
    "accumulated_weight" DOUBLE PRECISION NOT NULL,
    "threshold" DOUBLE PRECISION NOT NULL,
    "first_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMP(3) NOT NULL,
    "consumed_by_proposal_id" VARCHAR(50),

    CONSTRAINT "realignment_evidence_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "curricula_active_version_id_key" ON "curricula"("active_version_id");
CREATE INDEX "curricula_user_id_state_idx" ON "curricula"("user_id", "state");
CREATE INDEX "curriculum_versions_curriculum_id_state_idx" ON "curriculum_versions"("curriculum_id", "state");
CREATE UNIQUE INDEX "curriculum_versions_curriculum_id_version_number_key" ON "curriculum_versions"("curriculum_id", "version_number");
CREATE INDEX "curriculum_nodes_curriculum_version_id_idx" ON "curriculum_nodes"("curriculum_version_id");
CREATE INDEX "curriculum_nodes_stable_node_key_idx" ON "curriculum_nodes"("stable_node_key");
CREATE INDEX "curriculum_edges_curriculum_version_id_idx" ON "curriculum_edges"("curriculum_version_id");
CREATE UNIQUE INDEX "curriculum_edges_curriculum_version_id_from_node_id_to_node_key" ON "curriculum_edges"("curriculum_version_id", "from_node_id", "to_node_id", "type");
CREATE INDEX "curriculum_progress_user_id_runtime_state_idx" ON "curriculum_progress"("user_id", "runtime_state");
CREATE UNIQUE INDEX "curriculum_progress_curriculum_id_user_id_stable_node_key_key" ON "curriculum_progress"("curriculum_id", "user_id", "stable_node_key");
CREATE INDEX "curriculum_revision_proposals_curriculum_id_idx" ON "curriculum_revision_proposals"("curriculum_id");
CREATE INDEX "revision_changes_proposal_id_idx" ON "revision_changes"("proposal_id");
CREATE UNIQUE INDEX "realignment_evidence_curriculum_id_stable_node_key_trigger__key" ON "realignment_evidence"("curriculum_id", "stable_node_key", "trigger_type");

ALTER TABLE "curriculum_versions" ADD CONSTRAINT "curriculum_versions_curriculum_id_fkey" FOREIGN KEY ("curriculum_id") REFERENCES "curricula"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "curriculum_nodes" ADD CONSTRAINT "curriculum_nodes_curriculum_version_id_fkey" FOREIGN KEY ("curriculum_version_id") REFERENCES "curriculum_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "curriculum_edges" ADD CONSTRAINT "curriculum_edges_curriculum_version_id_fkey" FOREIGN KEY ("curriculum_version_id") REFERENCES "curriculum_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "curriculum_progress" ADD CONSTRAINT "curriculum_progress_curriculum_id_fkey" FOREIGN KEY ("curriculum_id") REFERENCES "curricula"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "curriculum_revision_proposals" ADD CONSTRAINT "curriculum_revision_proposals_curriculum_id_fkey" FOREIGN KEY ("curriculum_id") REFERENCES "curricula"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "revision_changes" ADD CONSTRAINT "revision_changes_proposal_id_fkey" FOREIGN KEY ("proposal_id") REFERENCES "curriculum_revision_proposals"("id") ON DELETE CASCADE ON UPDATE CASCADE;
