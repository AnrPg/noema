-- Phase 4: Admin User Management
-- Creates UserStatusChange audit log, StatusChangeAction enum,
-- PasswordResetInitiator enum, and adds initiator tracking to password_reset_tokens.

-- CreateEnum: status_change_action
CREATE TYPE "status_change_action" AS ENUM ('STATUS_CHANGE', 'ROLE_CHANGE', 'PASSWORD_RESET', 'SESSION_REVOCATION');

-- CreateEnum: password_reset_initiator
CREATE TYPE "password_reset_initiator" AS ENUM ('USER', 'ADMIN');

-- CreateTable: user_status_changes (append-only audit log)
CREATE TABLE "user_status_changes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" VARCHAR(50) NOT NULL,
    "changed_by" VARCHAR(50) NOT NULL,
    "action" "status_change_action" NOT NULL,
    "previous_value" JSONB NOT NULL,
    "new_value" JSONB NOT NULL,
    "reason" VARCHAR(1000),
    "expires_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_status_changes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: user_status_changes indexes
CREATE INDEX "user_status_changes_user_id_idx" ON "user_status_changes"("user_id");
CREATE INDEX "user_status_changes_changed_by_idx" ON "user_status_changes"("changed_by");
CREATE INDEX "user_status_changes_action_idx" ON "user_status_changes"("action");
CREATE INDEX "user_status_changes_created_at_idx" ON "user_status_changes"("created_at");

-- AlterTable: password_reset_tokens — add initiator tracking
ALTER TABLE "password_reset_tokens" ADD COLUMN "initiator" "password_reset_initiator" NOT NULL DEFAULT 'USER';
ALTER TABLE "password_reset_tokens" ADD COLUMN "initiated_by" VARCHAR(50);
