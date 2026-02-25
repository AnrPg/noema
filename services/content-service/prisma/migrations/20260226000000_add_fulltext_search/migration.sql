-- Add a generated tsvector column for full-text search
-- We extract searchable text from the JSONB content column
ALTER TABLE "cards" ADD COLUMN "search_vector" tsvector;

-- Create a GIN index on the search vector
CREATE INDEX "cards_search_vector_idx" ON "cards" USING gin("search_vector");

-- Create a function to build the search vector from JSONB content
-- Weights: A=front (primary face), B=back/stem, C=explanation/context, D=hint
CREATE OR REPLACE FUNCTION content_search_vector(content jsonb) RETURNS tsvector AS $$
BEGIN
  RETURN
    setweight(to_tsvector('english', coalesce(content->>'front', '')), 'A') ||
    setweight(to_tsvector('english', coalesce(content->>'back', '')), 'B') ||
    setweight(to_tsvector('english', coalesce(content->>'explanation', '')), 'C') ||
    setweight(to_tsvector('english', coalesce(content->>'hint', '')), 'D') ||
    setweight(to_tsvector('english', coalesce(content->>'stem', '')), 'B') ||
    setweight(to_tsvector('english', coalesce(content->>'context', '')), 'C');
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Create a trigger to auto-update the search vector on INSERT/UPDATE
CREATE OR REPLACE FUNCTION update_card_search_vector() RETURNS trigger AS $$
BEGIN
  NEW.search_vector := content_search_vector(NEW.content);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER cards_search_vector_trigger
  BEFORE INSERT OR UPDATE OF content ON "cards"
  FOR EACH ROW
  EXECUTE FUNCTION update_card_search_vector();

-- Backfill existing rows
UPDATE "cards" SET search_vector = content_search_vector(content);
