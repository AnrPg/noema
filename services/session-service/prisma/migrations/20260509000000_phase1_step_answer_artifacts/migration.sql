CREATE TABLE "step_answer_artifacts" (
    "id" VARCHAR(50) NOT NULL,
    "step_id" VARCHAR(50) NOT NULL,
    "user_id" VARCHAR(50) NOT NULL,
    "response_shape" VARCHAR(100) NOT NULL,
    "learner_answer_summary_text" VARCHAR(2000) NOT NULL,
    "raw_response" JSONB,
    "raw_response_ref" VARCHAR(100) NOT NULL,
    "response_time_ms" INTEGER,
    "hint_request_count" INTEGER NOT NULL DEFAULT 0,
    "revision_count" INTEGER NOT NULL DEFAULT 0,
    "recorded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "step_answer_artifacts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "step_answer_artifacts_step_id_key" ON "step_answer_artifacts"("step_id");
CREATE INDEX "step_answer_artifacts_user_id_recorded_at_idx" ON "step_answer_artifacts"("user_id", "recorded_at");

ALTER TABLE "step_answer_artifacts"
ADD CONSTRAINT "step_answer_artifacts_step_id_fkey"
FOREIGN KEY ("step_id") REFERENCES "steps"("id") ON DELETE CASCADE ON UPDATE CASCADE;
