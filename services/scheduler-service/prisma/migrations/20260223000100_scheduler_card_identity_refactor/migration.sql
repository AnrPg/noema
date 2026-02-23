-- Scheduler Service identity refactor migration
-- Date: 2026-02-23
-- Description:
-- 1) Introduce surrogate primary key on scheduler_cards
-- 2) Enforce unique (user_id, card_id)
-- 3) Rewire review/calibration foreign keys to composite identity

-- Legacy schema upgrade guard:
-- If scheduler_cards has only id (card identity) and no card_id column yet,
-- rename id -> card_id first.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'scheduler_cards'
      AND column_name = 'id'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'scheduler_cards'
      AND column_name = 'card_id'
  ) THEN
    EXECUTE 'ALTER TABLE "scheduler_cards" RENAME COLUMN "id" TO "card_id"';
  END IF;
END $$;

-- Add new surrogate id only if missing
ALTER TABLE "scheduler_cards" ADD COLUMN IF NOT EXISTS "id" VARCHAR(50);

-- Backfill deterministic surrogate IDs for existing rows
UPDATE "scheduler_cards"
SET "id" = CONCAT('sc_', SUBSTRING(MD5("user_id" || ':' || "card_id") FROM 1 FOR 47))
WHERE "id" IS NULL;

-- Enforce NOT NULL on surrogate id
ALTER TABLE "scheduler_cards" ALTER COLUMN "id" SET NOT NULL;

-- Ensure surrogate id is PK
DO $$
DECLARE
  current_pk_name text;
BEGIN
  SELECT con.conname
  INTO current_pk_name
  FROM pg_constraint con
  JOIN pg_class rel ON rel.oid = con.conrelid
  JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
  WHERE nsp.nspname = 'public'
    AND rel.relname = 'scheduler_cards'
    AND con.contype = 'p';

  IF current_pk_name IS NOT NULL AND current_pk_name <> 'scheduler_cards_pkey' THEN
    EXECUTE format('ALTER TABLE "scheduler_cards" DROP CONSTRAINT %I', current_pk_name);
  ELSIF current_pk_name = 'scheduler_cards_pkey' THEN
    EXECUTE 'ALTER TABLE "scheduler_cards" DROP CONSTRAINT "scheduler_cards_pkey"';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
    WHERE nsp.nspname = 'public'
      AND rel.relname = 'scheduler_cards'
      AND con.contype = 'p'
  ) THEN
    EXECUTE 'ALTER TABLE "scheduler_cards" ADD CONSTRAINT "scheduler_cards_pkey" PRIMARY KEY ("id")';
  END IF;
END $$;

-- Ensure composite unique identity exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
    WHERE nsp.nspname = 'public'
      AND rel.relname = 'scheduler_cards'
      AND con.conname = 'scheduler_cards_user_id_card_id_key'
  ) THEN
    EXECUTE 'ALTER TABLE "scheduler_cards" ADD CONSTRAINT "scheduler_cards_user_id_card_id_key" UNIQUE ("user_id", "card_id")';
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "scheduler_cards_card_id_idx" ON "scheduler_cards"("card_id");

-- Rewire foreign keys from single-column card_id -> composite (user_id, card_id)
ALTER TABLE "reviews" DROP CONSTRAINT IF EXISTS "reviews_card_id_fkey";
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
    WHERE nsp.nspname = 'public'
      AND rel.relname = 'reviews'
      AND con.conname = 'reviews_user_id_card_id_fkey'
  ) THEN
    EXECUTE '
      ALTER TABLE "reviews"
      ADD CONSTRAINT "reviews_user_id_card_id_fkey"
      FOREIGN KEY ("user_id", "card_id")
      REFERENCES "scheduler_cards"("user_id", "card_id")
      ON DELETE CASCADE ON UPDATE CASCADE
    ';
  END IF;
END $$;

ALTER TABLE "calibration_data" DROP CONSTRAINT IF EXISTS "calibration_data_card_id_fkey";
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
    WHERE nsp.nspname = 'public'
      AND rel.relname = 'calibration_data'
      AND con.conname = 'calibration_data_user_id_card_id_fkey'
  ) THEN
    EXECUTE '
      ALTER TABLE "calibration_data"
      ADD CONSTRAINT "calibration_data_user_id_card_id_fkey"
      FOREIGN KEY ("user_id", "card_id")
      REFERENCES "scheduler_cards"("user_id", "card_id")
      ON DELETE SET NULL ON UPDATE CASCADE
    ';
  END IF;
END $$;
