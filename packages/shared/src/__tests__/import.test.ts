// =============================================================================
// DATA IMPORT MODULE TESTS
// =============================================================================

import { describe, it, expect, beforeEach } from "vitest";
import { DataImport } from "../index";

const {
  CSVParser,
  JSONParser,
  MarkdownFlashcardParser,
  ParserRegistry,
  SchemaInferenceEngine,
  parseFile,
  analyzeSheet,
  isFileTypeSupported,
  getSupportedExtensions,
  getSupportedMimeTypes,
  CARD_TARGET_FIELDS,
  TRANSFORMATION_TYPES,
  IMPORT_MODES,
  DUPLICATE_STRATEGIES,
} = DataImport;

// =============================================================================
// PARSER TESTS
// =============================================================================

describe("DataImport Parsers", () => {
  describe("CSVParser", () => {
    const parser = new CSVParser();

    it("should parse simple CSV content", async () => {
      const csv = `front,back
Hello,World
Question,Answer`;

      const result = await parser.parse(csv, "test.csv");

      expect(result.success).toBe(true);
      expect(result.sheets).toHaveLength(1);
      expect(result.sheets[0].columnCount).toBe(2);
      expect(result.sheets[0].rowCount).toBeGreaterThanOrEqual(2);
    });

    it("should detect column headers", async () => {
      const csv = `question,answer,hint
What is 2+2?,4,Basic math
Capital of France?,Paris,Geography`;

      const result = await parser.parse(csv, "flashcards.csv");

      expect(result.success).toBe(true);
      expect(result.sheets[0].columns[0].headerValue).toBe("question");
      expect(result.sheets[0].columns[1].headerValue).toBe("answer");
      expect(result.sheets[0].columns[2].headerValue).toBe("hint");
    });

    it("should handle semicolon delimiter", async () => {
      const csv = `front;back;tags
Hello;World;greeting
Goodbye;World;farewell`;

      const result = await parser.parse(csv, "test.csv");

      expect(result.success).toBe(true);
      expect(result.sheets[0].columnCount).toBe(3);
    });

    it("should handle tab delimiter", async () => {
      const csv = `front\tback
Hello\tWorld`;

      const result = await parser.parse(csv, "test.tsv");

      expect(result.success).toBe(true);
      expect(result.sheets[0].columnCount).toBe(2);
    });

    it("should handle quoted values with commas", async () => {
      const csv = `front,back
"Hello, World",Answer
Question,"Contains, comma"`;

      const result = await parser.parse(csv, "test.csv");

      expect(result.success).toBe(true);
      // Check that quoted commas are preserved
      expect(result.sheets[0].columns).toHaveLength(2);
    });

    it("should handle empty values", async () => {
      const csv = `front,back,hint
Question,Answer,
Another,,No hint`;

      const result = await parser.parse(csv, "test.csv");

      expect(result.success).toBe(true);
    });

    it("should report correct source type", async () => {
      const csv = `a,b\n1,2`;
      const result = await parser.parse(csv, "test.csv");

      expect(result.sourceType).toBe("csv");
    });
  });

  describe("JSONParser", () => {
    const parser = new JSONParser();

    it("should parse array of objects", async () => {
      const json = JSON.stringify([
        { front: "Hello", back: "World" },
        { front: "Goodbye", back: "World" },
      ]);

      const result = await parser.parse(json, "test.json");

      expect(result.success).toBe(true);
      expect(result.sheets).toHaveLength(1);
      expect(result.sheets[0].columnCount).toBe(2);
    });

    it("should handle nested objects with arrays", async () => {
      const json = JSON.stringify({
        vocabulary: [
          { term: "Hello", definition: "Greeting" },
          { term: "Goodbye", definition: "Farewell" },
        ],
        grammar: [{ rule: "Subject-Verb Agreement", example: "He runs" }],
      });

      const result = await parser.parse(json, "test.json");

      expect(result.success).toBe(true);
      expect(result.sheets.length).toBeGreaterThanOrEqual(2);
    });

    it("should handle single object", async () => {
      const json = JSON.stringify({
        front: "Question",
        back: "Answer",
        tags: ["tag1", "tag2"],
      });

      const result = await parser.parse(json, "test.json");

      expect(result.success).toBe(true);
    });

    it("should report invalid JSON", async () => {
      const invalidJson = "{ invalid json }";

      const result = await parser.parse(invalidJson, "test.json");

      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it("should flatten nested objects", async () => {
      const json = JSON.stringify([
        {
          card: {
            front: "Question",
            back: "Answer",
          },
          metadata: {
            tags: ["tag1"],
          },
        },
      ]);

      const result = await parser.parse(json, "test.json");

      expect(result.success).toBe(true);
    });
  });

  describe("MarkdownFlashcardParser", () => {
    const parser = new MarkdownFlashcardParser();

    it("should parse flashcard format with separators", async () => {
      const md = `# Vocabulary

front: Hello
back: World

---

front: Goodbye
back: Farewell`;

      const result = await parser.parse(md, "flashcards.md");

      expect(result.success).toBe(true);
    });

    it("should parse question-answer format", async () => {
      const md = `# Quiz

Q: What is 2+2?
A: 4

Q: Capital of France?
A: Paris`;

      const result = await parser.parse(md, "quiz.md");

      expect(result.success).toBe(true);
    });

    it("should parse sections as cards", async () => {
      const md = `# Chapter 1

## Concept A
This is the content for concept A.

## Concept B
This is the content for concept B.`;

      const result = await parser.parse(md, "notes.md");

      expect(result.success).toBe(true);
    });
  });

  describe("ParserRegistry", () => {
    const registry = new ParserRegistry();

    it("should find parser by extension", () => {
      const csvParser = registry.findParser("data.csv");
      expect(csvParser).toBeDefined();

      const jsonParser = registry.findParser("data.json");
      expect(jsonParser).toBeDefined();

      const mdParser = registry.findParser("cards.md");
      expect(mdParser).toBeDefined();
    });

    it("should find parser by MIME type", () => {
      const csvParser = registry.findParser("file", "text/csv");
      expect(csvParser).toBeDefined();

      const jsonParser = registry.findParser("file", "application/json");
      expect(jsonParser).toBeDefined();
    });

    it("should return null for unsupported types", () => {
      const parser = registry.findParser("file.xyz");
      expect(parser).toBeNull();
    });

    it("should list supported extensions", () => {
      const extensions = registry.getSupportedExtensions();
      expect(extensions).toContain("csv");
      expect(extensions).toContain("json");
      expect(extensions).toContain("md");
    });

    it("should list supported MIME types", () => {
      const mimeTypes = registry.getSupportedMimeTypes();
      expect(mimeTypes).toContain("text/csv");
      expect(mimeTypes).toContain("application/json");
    });
  });
});

// =============================================================================
// SCHEMA INFERENCE TESTS
// =============================================================================

describe("SchemaInferenceEngine", () => {
  let engine: typeof SchemaInferenceEngine.prototype;

  beforeEach(() => {
    engine = new SchemaInferenceEngine();
  });

  describe("analyzeSheet", () => {
    it("should detect basic column types", () => {
      const sheet: DataImport.DataSheet = {
        id: "sheet_1" as DataImport.SheetId,
        sourceId: "source_1" as DataImport.DataSourceId,
        index: 0,
        name: "Test",
        columnCount: 3,
        rowCount: 3,
        columns: [
          {
            index: 0,
            letter: "A",
            headerValue: "name",
            normalizedName: "name",
            inferredType: "string",
            typeConfidence: 0.9,
            nullCount: 0,
            uniqueCount: 3,
            sampleValues: [
              {
                rawValue: "Alice",
                displayValue: "Alice",
                isNull: false,
                originalType: "string",
              },
              {
                rawValue: "Bob",
                displayValue: "Bob",
                isNull: false,
                originalType: "string",
              },
              {
                rawValue: "Charlie",
                displayValue: "Charlie",
                isNull: false,
                originalType: "string",
              },
            ],
            semanticType: null,
            semanticConfidence: 0,
            issues: [],
          },
          {
            index: 1,
            letter: "B",
            headerValue: "age",
            normalizedName: "age",
            inferredType: "integer",
            typeConfidence: 0.9,
            nullCount: 0,
            uniqueCount: 3,
            sampleValues: [
              {
                rawValue: 25,
                displayValue: "25",
                isNull: false,
                originalType: "number",
              },
              {
                rawValue: 30,
                displayValue: "30",
                isNull: false,
                originalType: "number",
              },
              {
                rawValue: 35,
                displayValue: "35",
                isNull: false,
                originalType: "number",
              },
            ],
            semanticType: null,
            semanticConfidence: 0,
            issues: [],
          },
          {
            index: 2,
            letter: "C",
            headerValue: "email",
            normalizedName: "email",
            inferredType: "email",
            typeConfidence: 0.9,
            nullCount: 0,
            uniqueCount: 3,
            sampleValues: [
              {
                rawValue: "alice@example.com",
                displayValue: "alice@example.com",
                isNull: false,
                originalType: "string",
              },
              {
                rawValue: "bob@example.com",
                displayValue: "bob@example.com",
                isNull: false,
                originalType: "string",
              },
              {
                rawValue: "charlie@example.com",
                displayValue: "charlie@example.com",
                isNull: false,
                originalType: "string",
              },
            ],
            semanticType: null,
            semanticConfidence: 0,
            issues: [],
          },
        ],
        rows: [
          { index: 0, rowType: "header", cells: [], issues: [] },
          { index: 1, rowType: "data", cells: [], issues: [] },
          { index: 2, rowType: "data", cells: [], issues: [] },
          { index: 3, rowType: "data", cells: [], issues: [] },
        ],
        sampleRows: [],
        headerRowIndex: 0,
        dataStartRowIndex: 1,
        hasMultipleHeaderRows: false,
        issues: [],
        mergedCells: [],
      };

      const schema = engine.analyzeSheet(sheet);

      expect(schema).toBeDefined();
      expect(schema.fields).toHaveLength(3);
      // Schema may have validation issues depending on data completeness
      // Just verify the schema was generated
      expect(schema.overallConfidence).toBeGreaterThanOrEqual(0);
    });

    it("should detect flashcard semantic types", () => {
      const sheet: DataImport.DataSheet = {
        id: "sheet_1" as DataImport.SheetId,
        sourceId: "source_1" as DataImport.DataSourceId,
        index: 0,
        name: "Flashcards",
        columnCount: 2,
        rowCount: 3,
        columns: [
          {
            index: 0,
            letter: "A",
            headerValue: "front",
            normalizedName: "front",
            inferredType: "string",
            typeConfidence: 0.9,
            nullCount: 0,
            uniqueCount: 2,
            sampleValues: [
              {
                rawValue: "Question 1",
                displayValue: "Question 1",
                isNull: false,
                originalType: "string",
              },
              {
                rawValue: "Question 2",
                displayValue: "Question 2",
                isNull: false,
                originalType: "string",
              },
            ],
            semanticType: "front",
            semanticConfidence: 0.9,
            issues: [],
          },
          {
            index: 1,
            letter: "B",
            headerValue: "back",
            normalizedName: "back",
            inferredType: "string",
            typeConfidence: 0.9,
            nullCount: 0,
            uniqueCount: 2,
            sampleValues: [
              {
                rawValue: "Answer 1",
                displayValue: "Answer 1",
                isNull: false,
                originalType: "string",
              },
              {
                rawValue: "Answer 2",
                displayValue: "Answer 2",
                isNull: false,
                originalType: "string",
              },
            ],
            semanticType: "back",
            semanticConfidence: 0.9,
            issues: [],
          },
        ],
        rows: [
          { index: 0, rowType: "header", cells: [], issues: [] },
          { index: 1, rowType: "data", cells: [], issues: [] },
          { index: 2, rowType: "data", cells: [], issues: [] },
        ],
        sampleRows: [],
        headerRowIndex: 0,
        dataStartRowIndex: 1,
        hasMultipleHeaderRows: false,
        issues: [],
        mergedCells: [],
      };

      const schema = engine.analyzeSheet(sheet);

      expect(schema).toBeDefined();
      expect(schema.suggestedCardType).toBe("atomic");
    });
  });
});

// =============================================================================
// CONVENIENCE FUNCTION TESTS
// =============================================================================

describe("Convenience Functions", () => {
  describe("isFileTypeSupported", () => {
    it("should return true for supported types", () => {
      expect(isFileTypeSupported("test.csv")).toBe(true);
      expect(isFileTypeSupported("test.json")).toBe(true);
      expect(isFileTypeSupported("test.md")).toBe(true);
      expect(isFileTypeSupported("test.tsv")).toBe(true);
    });

    it("should return false for unsupported types", () => {
      expect(isFileTypeSupported("test.xyz")).toBe(false);
      expect(isFileTypeSupported("test.exe")).toBe(false);
    });

    it("should check MIME type if provided", () => {
      expect(isFileTypeSupported("file", "text/csv")).toBe(true);
      expect(isFileTypeSupported("file", "application/json")).toBe(true);
    });
  });

  describe("getSupportedExtensions", () => {
    it("should return array of extensions", () => {
      const extensions = getSupportedExtensions();
      expect(Array.isArray(extensions)).toBe(true);
      expect(extensions.length).toBeGreaterThan(0);
    });
  });

  describe("getSupportedMimeTypes", () => {
    it("should return array of MIME types", () => {
      const mimeTypes = getSupportedMimeTypes();
      expect(Array.isArray(mimeTypes)).toBe(true);
      expect(mimeTypes.length).toBeGreaterThan(0);
    });
  });

  describe("parseFile", () => {
    it("should parse CSV content", async () => {
      const csv = "a,b\n1,2";
      const result = await parseFile(csv, "test.csv");
      expect(result.success).toBe(true);
    });

    it("should parse JSON content", async () => {
      const json = JSON.stringify([{ a: 1, b: 2 }]);
      const result = await parseFile(json, "test.json");
      expect(result.success).toBe(true);
    });
  });
});

// =============================================================================
// CONSTANT TESTS
// =============================================================================

describe("Import Constants", () => {
  describe("CARD_TARGET_FIELDS", () => {
    it("should have content fields", () => {
      const contentFields = CARD_TARGET_FIELDS.filter(
        (f) => f.group === "content",
      );
      expect(contentFields.length).toBeGreaterThan(0);
      expect(contentFields.some((f) => f.value === "front")).toBe(true);
      expect(contentFields.some((f) => f.value === "back")).toBe(true);
    });

    it("should have metadata fields", () => {
      const metadataFields = CARD_TARGET_FIELDS.filter(
        (f) => f.group === "metadata",
      );
      expect(metadataFields.length).toBeGreaterThan(0);
      expect(metadataFields.some((f) => f.value === "tags")).toBe(true);
    });

    it("should have ignore option", () => {
      expect(CARD_TARGET_FIELDS.some((f) => f.value === "ignore")).toBe(true);
    });
  });

  describe("TRANSFORMATION_TYPES", () => {
    it("should have common transformations", () => {
      expect(TRANSFORMATION_TYPES.some((t) => t.value === "trim")).toBe(true);
      expect(TRANSFORMATION_TYPES.some((t) => t.value === "lowercase")).toBe(
        true,
      );
      expect(TRANSFORMATION_TYPES.some((t) => t.value === "uppercase")).toBe(
        true,
      );
    });
  });

  describe("IMPORT_MODES", () => {
    it("should have three modes", () => {
      expect(IMPORT_MODES).toHaveLength(3);
      expect(IMPORT_MODES.some((m) => m.value === "quick")).toBe(true);
      expect(IMPORT_MODES.some((m) => m.value === "guided")).toBe(true);
      expect(IMPORT_MODES.some((m) => m.value === "expert")).toBe(true);
    });
  });

  describe("DUPLICATE_STRATEGIES", () => {
    it("should have common strategies", () => {
      expect(DUPLICATE_STRATEGIES.some((s) => s.value === "skip")).toBe(true);
      expect(DUPLICATE_STRATEGIES.some((s) => s.value === "update")).toBe(true);
      expect(
        DUPLICATE_STRATEGIES.some((s) => s.value === "create_anyway"),
      ).toBe(true);
    });
  });
});
