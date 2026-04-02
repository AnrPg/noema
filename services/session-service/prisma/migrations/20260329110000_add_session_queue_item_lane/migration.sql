CREATE TYPE "session_scheduler_lane" AS ENUM ('RETENTION', 'CALIBRATION');

ALTER TABLE "session_queue_items"
ADD COLUMN "lane" "session_scheduler_lane" NOT NULL DEFAULT 'RETENTION';
