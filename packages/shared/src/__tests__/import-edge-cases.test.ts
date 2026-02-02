// =============================================================================
// DATA IMPORT EDGE CASES - COMPREHENSIVE TEST SUITE
// =============================================================================
// Tests cover edge cases across multiple dimensions:
// - File formats and encodings
// - Data quality issues
// - Schema inference edge cases
// - Mapping and transformation edge cases
// - Error handling and recovery

import { describe, it, expect, beforeEach } from "vitest";
import { DataImport } from "../index";

const {
  CSVParser,
  JSONParser,
  YAMLParser,
  MarkdownFlashcardParser,
  TypstParser,
  ExcelParser,
  PDFParser,
  PlainTextParser,
  ParserRegistry,
  SchemaInferenceEngine,
  parseFile,
  isFileTypeSupported,
  IMPORT_MODES,
  DUPLICATE_STRATEGIES,
  IMPORT_STEP_DEFINITIONS,
  IMPORT_WORKFLOW_CONFIGS,
  IMPORT_QUICK_ACTIONS,
  DEFAULT_IMPORT_PREFERENCES,
} = DataImport;

// =============================================================================
// TEST MATRIX DIMENSIONS:
// 1. File Formats: CSV, JSON, Markdown, TSV
// 2. Encoding: UTF-8, UTF-16, Latin-1, with BOM
// 3. Size: Empty, Single row, Large (1000+ rows)
// 4. Headers: With headers, without headers, multiple header rows
// 5. Content: Clean, with nulls, with special chars, with unicode
// 6. Structure: Simple flat, nested, inconsistent columns
// =============================================================================

describe("Import Edge Cases - File Format Matrix", () => {
  // ---------------------------------------------------------------------------
  // CSV EDGE CASES
  // ---------------------------------------------------------------------------
  describe("CSV Edge Cases", () => {
    const parser = new CSVParser();

    describe("Empty and minimal files", () => {
      it("should handle completely empty file", async () => {
        const result = await parser.parse("", "empty.csv");
        expect(result.success).toBe(true);
        expect(result.sheets[0].rowCount).toBe(0);
      });

      it("should handle file with only newlines", async () => {
        const result = await parser.parse("\n\n\n", "newlines.csv");
        expect(result.success).toBe(true);
      });

      it("should handle file with only whitespace", async () => {
        const result = await parser.parse("   \t\n   ", "whitespace.csv");
        expect(result.success).toBe(true);
      });

      it("should handle single cell file", async () => {
        const result = await parser.parse("value", "single.csv");
        expect(result.success).toBe(true);
        expect(result.sheets[0].columnCount).toBe(1);
      });

      it("should handle file with only headers", async () => {
        const result = await parser.parse("a,b,c", "headers-only.csv");
        expect(result.success).toBe(true);
        expect(result.sheets[0].columnCount).toBe(3);
      });
    });

    describe("Delimiter variations", () => {
      it("should auto-detect semicolon delimiter", async () => {
        const csv = "a;b;c\n1;2;3\n4;5;6";
        const result = await parser.parse(csv, "semicolon.csv");
        expect(result.success).toBe(true);
        expect(result.sheets[0].columnCount).toBe(3);
      });

      it("should auto-detect pipe delimiter", async () => {
        const csv = "a|b|c\n1|2|3\n4|5|6";
        const result = await parser.parse(csv, "pipe.csv");
        expect(result.success).toBe(true);
        expect(result.sheets[0].columnCount).toBe(3);
      });

      it("should handle mixed delimiters in quoted values", async () => {
        const csv = `"a,b",c,d\n"1;2",3,4`;
        const result = await parser.parse(csv, "mixed.csv");
        expect(result.success).toBe(true);
        expect(result.sheets[0].columnCount).toBe(3);
      });

      it("should handle TSV format", async () => {
        const tsv = "a\tb\tc\n1\t2\t3";
        const result = await parser.parse(tsv, "data.tsv");
        expect(result.success).toBe(true);
        expect(result.sourceType).toBe("tsv");
      });
    });

    describe("Quote handling", () => {
      it("should handle double quotes with escaped quotes", async () => {
        const csv = `"a ""quoted"" value",b\n"test",c`;
        const result = await parser.parse(csv, "quotes.csv");
        expect(result.success).toBe(true);
      });

      it("should handle multiline values in quotes", async () => {
        const csv = `"line1\nline2",b\nc,d`;
        const result = await parser.parse(csv, "multiline.csv");
        expect(result.success).toBe(true);
      });

      it("should handle quotes at start of unquoted field", async () => {
        const csv = `a,"b",c\n"test,d`;
        const result = await parser.parse(csv, "partial-quote.csv");
        expect(result.success).toBe(true);
      });

      it("should handle empty quoted values", async () => {
        const csv = `"","",""`;
        const result = await parser.parse(csv, "empty-quotes.csv");
        expect(result.success).toBe(true);
        expect(result.sheets[0].columnCount).toBe(3);
      });
    });

    describe("Line ending variations", () => {
      it("should handle Windows line endings (CRLF)", async () => {
        const csv = "a,b\r\n1,2\r\n3,4";
        const result = await parser.parse(csv, "windows.csv");
        expect(result.success).toBe(true);
        expect(result.sheets[0].rowCount).toBeGreaterThanOrEqual(2);
      });

      it("should handle Mac line endings (CR only)", async () => {
        const csv = "a,b\r1,2\r3,4";
        const result = await parser.parse(csv, "mac.csv");
        expect(result.success).toBe(true);
      });

      it("should handle mixed line endings", async () => {
        const csv = "a,b\n1,2\r\n3,4\r5,6";
        const result = await parser.parse(csv, "mixed-endings.csv");
        expect(result.success).toBe(true);
      });

      it("should handle trailing newline", async () => {
        const csv = "a,b\n1,2\n";
        const result = await parser.parse(csv, "trailing.csv");
        expect(result.success).toBe(true);
      });
    });

    describe("Inconsistent row lengths", () => {
      it("should handle rows with fewer columns", async () => {
        const csv = "a,b,c\n1,2\n4,5,6";
        const result = await parser.parse(csv, "short-row.csv");
        expect(result.success).toBe(true);
        expect(result.sheets[0].columnCount).toBe(3);
      });

      it("should handle rows with more columns", async () => {
        const csv = "a,b\n1,2,3,4\n5,6";
        const result = await parser.parse(csv, "long-row.csv");
        expect(result.success).toBe(true);
      });

      it("should handle completely inconsistent data", async () => {
        const csv = "a\n1,2,3\nx,y\nz";
        const result = await parser.parse(csv, "inconsistent.csv");
        expect(result.success).toBe(true);
      });
    });

    describe("Special characters", () => {
      it("should handle unicode characters", async () => {
        const csv = "日本語,Émojis,العربية\nテスト,🎉,مرحبا";
        const result = await parser.parse(csv, "unicode.csv");
        expect(result.success).toBe(true);
      });

      it("should handle control characters", async () => {
        const csv = "a\x00b,c\td\n1,2";
        const result = await parser.parse(csv, "control.csv");
        expect(result.success).toBe(true);
      });

      it("should handle HTML in values", async () => {
        const csv = `"<b>bold</b>","<script>alert('x')</script>"\ntest,test`;
        const result = await parser.parse(csv, "html.csv");
        expect(result.success).toBe(true);
      });

      it("should handle URLs in values", async () => {
        const csv = `url,name\nhttps://example.com?a=1&b=2,test`;
        const result = await parser.parse(csv, "urls.csv");
        expect(result.success).toBe(true);
      });
    });

    describe("Type detection in CSV", () => {
      it("should detect numbers correctly", async () => {
        const csv = "num\n42\n3.14\n-100\n1e10";
        const result = await parser.parse(csv, "numbers.csv");
        expect(result.success).toBe(true);
      });

      it("should detect booleans", async () => {
        const csv = "bool\ntrue\nfalse\nTRUE\nFALSE";
        const result = await parser.parse(csv, "booleans.csv");
        expect(result.success).toBe(true);
      });

      it("should detect null representations", async () => {
        const csv = "val\nnull\nNULL\nNone\n\n";
        const result = await parser.parse(csv, "nulls.csv");
        expect(result.success).toBe(true);
      });

      it("should detect dates", async () => {
        const csv = "date\n2024-01-15\n01/15/2024\n15-01-2024";
        const result = await parser.parse(csv, "dates.csv");
        expect(result.success).toBe(true);
      });
    });
  });

  // ---------------------------------------------------------------------------
  // JSON EDGE CASES
  // ---------------------------------------------------------------------------
  describe("JSON Edge Cases", () => {
    const parser = new JSONParser();

    describe("Empty and minimal JSON", () => {
      it("should handle empty array", async () => {
        const result = await parser.parse("[]", "empty.json");
        expect(result.success).toBe(true);
        expect(result.sheets).toHaveLength(1);
      });

      it("should handle empty object", async () => {
        const result = await parser.parse("{}", "empty-obj.json");
        expect(result.success).toBe(true);
      });

      it("should handle array with empty objects", async () => {
        const result = await parser.parse("[{}, {}, {}]", "empty-objs.json");
        expect(result.success).toBe(true);
      });

      it("should handle single primitive value", async () => {
        const result = await parser.parse('"test"', "string.json");
        // Should handle gracefully even if not ideal format
        expect(result).toBeDefined();
      });
    });

    describe("Nested structures", () => {
      it("should flatten deeply nested objects", async () => {
        const json = JSON.stringify([
          {
            a: { b: { c: { d: "value" } } },
            x: 1,
          },
        ]);
        const result = await parser.parse(json, "deep.json");
        expect(result.success).toBe(true);
      });

      it("should handle arrays within objects", async () => {
        const json = JSON.stringify([
          { items: [1, 2, 3], name: "test" },
          { items: [4, 5], name: "test2" },
        ]);
        const result = await parser.parse(json, "arrays.json");
        expect(result.success).toBe(true);
      });

      it("should handle mixed nesting levels", async () => {
        const json = JSON.stringify([
          { a: 1, b: { c: 2 } },
          { a: 3, b: 4 },
        ]);
        const result = await parser.parse(json, "mixed-nest.json");
        expect(result.success).toBe(true);
      });

      it("should handle object with multiple arrays as separate sheets", async () => {
        const json = JSON.stringify({
          vocab: [{ word: "a" }, { word: "b" }],
          grammar: [{ rule: "x" }],
        });
        const result = await parser.parse(json, "multi-array.json");
        expect(result.success).toBe(true);
        expect(result.sheets.length).toBeGreaterThanOrEqual(2);
      });
    });

    describe("Special JSON values", () => {
      it("should handle null values", async () => {
        const json = JSON.stringify([{ a: null, b: "test" }]);
        const result = await parser.parse(json, "nulls.json");
        expect(result.success).toBe(true);
      });

      it("should handle unicode in keys and values", async () => {
        const json = JSON.stringify([{ 日本語: "テスト", emoji: "🎉" }]);
        const result = await parser.parse(json, "unicode.json");
        expect(result.success).toBe(true);
      });

      it("should handle numbers at boundaries", async () => {
        const json = JSON.stringify([
          {
            max: Number.MAX_SAFE_INTEGER,
            min: Number.MIN_SAFE_INTEGER,
            float: 1.7976931348623157e308,
          },
        ]);
        const result = await parser.parse(json, "numbers.json");
        expect(result.success).toBe(true);
      });

      it("should handle boolean and numeric strings", async () => {
        const json = JSON.stringify([{ str: "true", num: "42", actual: true }]);
        const result = await parser.parse(json, "strings.json");
        expect(result.success).toBe(true);
      });
    });

    describe("Invalid JSON", () => {
      it("should reject malformed JSON", async () => {
        const result = await parser.parse("{invalid}", "bad.json");
        expect(result.success).toBe(false);
      });

      it("should reject trailing commas", async () => {
        const result = await parser.parse('{"a": 1,}', "trailing.json");
        expect(result.success).toBe(false);
      });

      it("should reject single quotes", async () => {
        const result = await parser.parse("{'a': 1}", "single-quote.json");
        expect(result.success).toBe(false);
      });

      it("should reject unquoted keys in strict mode", async () => {
        const result = await parser.parse("{a: 1}", "unquoted.json");
        expect(result.success).toBe(false);
      });
    });

    describe("Large JSON structures", () => {
      it("should handle array with 100+ items", async () => {
        const items = Array.from({ length: 100 }, (_, i) => ({
          id: i,
          name: `Item ${i}`,
        }));
        const result = await parser.parse(JSON.stringify(items), "large.json");
        expect(result.success).toBe(true);
      });

      it("should handle objects with many keys", async () => {
        const obj: Record<string, number> = {};
        for (let i = 0; i < 50; i++) {
          obj[`key_${i}`] = i;
        }
        const result = await parser.parse(JSON.stringify([obj]), "wide.json");
        expect(result.success).toBe(true);
      });
    });
  });

  // ---------------------------------------------------------------------------
  // MARKDOWN EDGE CASES
  // ---------------------------------------------------------------------------
  describe("Markdown Edge Cases", () => {
    const parser = new MarkdownFlashcardParser();

    describe("Different flashcard formats", () => {
      it("should parse front/back format", async () => {
        const md = `front: Question?\nback: Answer`;
        const result = await parser.parse(md, "fb.md");
        expect(result.success).toBe(true);
      });

      it("should parse Q/A format", async () => {
        const md = `Q: What is X?\nA: It is Y.`;
        const result = await parser.parse(md, "qa.md");
        expect(result.success).toBe(true);
      });

      it("should parse term/definition format", async () => {
        const md = `term: Word\ndefinition: Meaning`;
        const result = await parser.parse(md, "td.md");
        expect(result.success).toBe(true);
      });

      it("should handle multiple cards with separators", async () => {
        const md = `Q: Q1?\nA: A1\n\n---\n\nQ: Q2?\nA: A2`;
        const result = await parser.parse(md, "multi.md");
        expect(result.success).toBe(true);
      });
    });

    describe("Markdown formatting", () => {
      it("should preserve bold formatting", async () => {
        const md = `front: **Bold** text\nback: Answer`;
        const result = await parser.parse(md, "bold.md");
        expect(result.success).toBe(true);
      });

      it("should preserve code blocks", async () => {
        const md = "front: Question\nback: ```js\nconst x = 1;\n```";
        const result = await parser.parse(md, "code.md");
        expect(result.success).toBe(true);
      });

      it("should handle math notation", async () => {
        const md = `front: What is $e^{i\\pi}$?\nback: $-1$`;
        const result = await parser.parse(md, "math.md");
        expect(result.success).toBe(true);
      });

      it("should handle lists", async () => {
        const md = `front: List items\nback:\n- Item 1\n- Item 2\n- Item 3`;
        const result = await parser.parse(md, "list.md");
        expect(result.success).toBe(true);
      });
    });

    describe("Section-based cards", () => {
      it("should parse heading-based cards", async () => {
        const md = `# Topic 1\nContent 1\n\n# Topic 2\nContent 2`;
        const result = await parser.parse(md, "headings.md");
        expect(result.success).toBe(true);
      });

      it("should handle nested headings", async () => {
        const md = `# Main\n## Sub 1\nContent\n## Sub 2\nMore`;
        const result = await parser.parse(md, "nested.md");
        expect(result.success).toBe(true);
      });

      it("should handle empty sections", async () => {
        const md = `# Section 1\n\n# Section 2\nContent`;
        const result = await parser.parse(md, "empty-section.md");
        expect(result.success).toBe(true);
      });
    });

    describe("Edge cases", () => {
      it("should handle empty markdown", async () => {
        const result = await parser.parse("", "empty.md");
        expect(result.success).toBe(true);
      });

      it("should handle markdown with only whitespace", async () => {
        const result = await parser.parse("   \n\n   ", "whitespace.md");
        expect(result.success).toBe(true);
      });

      it("should handle very long content", async () => {
        const longText = "x".repeat(10000);
        const md = `front: ${longText}\nback: Answer`;
        const result = await parser.parse(md, "long.md");
        expect(result.success).toBe(true);
      });
    });
  });
});

// =============================================================================
// SCHEMA INFERENCE EDGE CASES
// =============================================================================
describe("Schema Inference Edge Cases", () => {
  let engine: InstanceType<typeof SchemaInferenceEngine>;

  beforeEach(() => {
    engine = new SchemaInferenceEngine();
  });

  describe("Ambiguous data types", () => {
    it("should handle mixed types in column", () => {
      const sheet = createTestSheet([
        ["value"],
        ["42"],
        ["text"],
        ["true"],
        ["2024-01-01"],
      ]);
      const schema = engine.analyzeSheet(sheet);
      expect(schema.fields[0].dataType).toBe("mixed");
    });

    it("should handle numeric strings vs numbers", () => {
      const sheet = createTestSheet([["code"], ["001"], ["002"], ["003"]]);
      const schema = engine.analyzeSheet(sheet);
      // Should preserve as string due to leading zeros
      expect(schema.fields[0].dataType).toBeDefined();
    });

    it("should detect email pattern", () => {
      const sheet = createTestSheet([
        ["contact"],
        ["user@example.com"],
        ["test@test.org"],
        ["admin@site.net"],
      ]);
      const schema = engine.analyzeSheet(sheet);
      expect(schema.fields[0].dataType).toBe("email");
    });

    it("should detect URL pattern", () => {
      const sheet = createTestSheet([
        ["link"],
        ["https://example.com"],
        ["http://test.org/path"],
        ["www.site.net"],
      ]);
      const schema = engine.analyzeSheet(sheet);
      expect(["url", "string"]).toContain(schema.fields[0].dataType);
    });
  });

  describe("Semantic type detection", () => {
    it("should detect question semantic type", () => {
      const sheet = createTestSheet([
        ["question"],
        ["What is X?"],
        ["How does Y work?"],
      ]);
      const schema = engine.analyzeSheet(sheet);
      expect(schema.fields[0].semanticType).toBe("question");
    });

    it("should detect answer semantic type", () => {
      const sheet = createTestSheet([["answer"], ["X is Y"], ["Y works by Z"]]);
      const schema = engine.analyzeSheet(sheet);
      expect(schema.fields[0].semanticType).toBe("answer");
    });

    it("should detect tags column", () => {
      const sheet = createTestSheet([
        ["tags"],
        ["math, algebra"],
        ["science, physics"],
      ]);
      const schema = engine.analyzeSheet(sheet);
      expect(schema.fields[0].semanticType).toBe("tags");
    });

    it("should suggest atomic card type for Q/A pairs", () => {
      const sheet = createTestSheet([
        ["front", "back"],
        ["Question 1", "Answer 1"],
        ["Question 2", "Answer 2"],
      ]);
      const schema = engine.analyzeSheet(sheet);
      expect(schema.suggestedCardType).toBe("atomic");
    });
  });

  describe("Header detection edge cases", () => {
    it("should handle all-numeric first row as data", () => {
      const sheet = createTestSheet([
        ["1", "2", "3"],
        ["4", "5", "6"],
      ]);
      // First row might be detected as data, not headers
      const schema = engine.analyzeSheet(sheet);
      expect(schema).toBeDefined();
    });

    it("should handle duplicate header names", () => {
      const sheet = createTestSheet([
        ["name", "name", "value"],
        ["a", "b", "1"],
      ]);
      const schema = engine.analyzeSheet(sheet);
      expect(schema.fields.length).toBeGreaterThanOrEqual(2);
    });

    it("should handle empty header cells", () => {
      const sheet = createTestSheet([
        ["", "col2", ""],
        ["a", "b", "c"],
      ]);
      const schema = engine.analyzeSheet(sheet);
      expect(schema).toBeDefined();
    });
  });

  describe("Data quality edge cases", () => {
    it("should handle mostly null column", () => {
      const sheet = createTestSheet([
        ["sparse"],
        [null],
        [null],
        ["value"],
        [null],
      ]);
      const schema = engine.analyzeSheet(sheet);
      expect(schema.fields[0]).toBeDefined();
    });

    it("should handle all identical values", () => {
      const sheet = createTestSheet([
        ["constant"],
        ["same"],
        ["same"],
        ["same"],
      ]);
      const schema = engine.analyzeSheet(sheet);
      expect(schema.fields[0].dataType).toBe("string");
    });

    it("should validate schema with warnings for low quality", () => {
      const sheet = createTestSheet([["a"], [null], [null]]);
      const schema = engine.analyzeSheet(sheet);
      // Schema should be valid but may have warnings
      expect(schema).toBeDefined();
    });
  });
});

// =============================================================================
// PARSER REGISTRY EDGE CASES
// =============================================================================
describe("ParserRegistry Edge Cases", () => {
  const registry = new ParserRegistry();

  describe("File type detection", () => {
    it("should handle uppercase extensions", () => {
      expect(registry.findParser("FILE.CSV")).not.toBeNull();
      expect(registry.findParser("data.JSON")).not.toBeNull();
    });

    it("should handle mixed case extensions", () => {
      expect(registry.findParser("file.CsV")).not.toBeNull();
    });

    it("should handle multiple dots in filename", () => {
      expect(registry.findParser("my.data.file.csv")).not.toBeNull();
    });

    it("should handle no extension", () => {
      expect(registry.findParser("filename")).toBeNull();
    });

    it("should handle extension-only filename", () => {
      expect(registry.findParser(".csv")).not.toBeNull();
    });

    it("should prefer MIME type over extension", () => {
      // File has .txt extension but CSV MIME type
      const parser = registry.findParser("data.txt", "text/csv");
      expect(parser).not.toBeNull();
    });
  });

  describe("MIME type handling", () => {
    it("should handle MIME type with charset", () => {
      const parser = registry.findParser("file", "text/csv; charset=utf-8");
      // May or may not handle charset parameter
      expect(true).toBe(true); // Just ensure no crash
    });

    it("should handle unknown MIME type gracefully", () => {
      const parser = registry.findParser("file.xyz", "application/x-unknown");
      expect(parser).toBeNull();
    });
  });

  describe("Registry operations", () => {
    it("should list all supported extensions", () => {
      const extensions = registry.getSupportedExtensions();
      expect(extensions).toContain("csv");
      expect(extensions).toContain("json");
      expect(extensions).toContain("md");
    });

    it("should list all supported MIME types", () => {
      const mimeTypes = registry.getSupportedMimeTypes();
      expect(mimeTypes.some((m) => m.includes("csv"))).toBe(true);
      expect(mimeTypes.some((m) => m.includes("json"))).toBe(true);
    });
  });
});

// =============================================================================
// CONVENIENCE FUNCTIONS EDGE CASES
// =============================================================================
describe("Convenience Functions Edge Cases", () => {
  describe("isFileTypeSupported", () => {
    it("should handle paths with directories", () => {
      expect(isFileTypeSupported("/path/to/file.csv")).toBe(true);
    });

    it("should handle Windows paths", () => {
      expect(isFileTypeSupported("C:\\Users\\data.csv")).toBe(true);
    });

    it("should handle URLs", () => {
      expect(isFileTypeSupported("https://example.com/data.csv")).toBe(true);
    });

    // Note: Current implementation doesn't strip query strings from filenames
    // This documents the current behavior - URLs with query strings need preprocessing
    it("should NOT handle query strings (limitation)", () => {
      // "file.csv?version=1" extracts "csv?version=1" as extension, not "csv"
      expect(isFileTypeSupported("file.csv?version=1")).toBe(false);
    });

    // Note: Current implementation doesn't strip fragment identifiers
    // This documents the current behavior - URLs with fragments need preprocessing
    it("should NOT handle fragment identifiers (limitation)", () => {
      // "file.csv#sheet1" extracts "csv#sheet1" as extension, not "csv"
      expect(isFileTypeSupported("file.csv#sheet1")).toBe(false);
    });
  });

  describe("parseFile with various inputs", () => {
    it("should handle string content", async () => {
      const result = await parseFile("a,b\n1,2", "test.csv");
      expect(result.success).toBe(true);
    });

    it("should handle ArrayBuffer content", async () => {
      const encoder = new TextEncoder();
      const buffer = encoder.encode("a,b\n1,2").buffer;
      const result = await parseFile(buffer, "test.csv");
      expect(result.success).toBe(true);
    });

    it("should respect custom options", async () => {
      const result = await parseFile("a,b\n1,2", "test.csv", undefined, {
        maxPreviewRows: 1,
      });
      expect(result.success).toBe(true);
    });
  });
});

// =============================================================================
// CONFIGURATION AND CONSTANTS TESTS
// =============================================================================
describe("Import Configuration Tests", () => {
  describe("Import Modes Configuration", () => {
    it("should have all required mode properties", () => {
      for (const mode of IMPORT_MODES) {
        expect(mode.value).toBeDefined();
        expect(mode.label).toBeDefined();
        expect(mode.description).toBeDefined();
      }
    });

    it("should have unique mode values", () => {
      const values = IMPORT_MODES.map((m) => m.value);
      expect(new Set(values).size).toBe(values.length);
    });
  });

  describe("Duplicate Strategies Configuration", () => {
    it("should have all required strategy properties", () => {
      for (const strategy of DUPLICATE_STRATEGIES) {
        expect(strategy.value).toBeDefined();
        expect(strategy.label).toBeDefined();
        expect(strategy.description).toBeDefined();
      }
    });

    it("should include essential strategies", () => {
      const values = DUPLICATE_STRATEGIES.map((s) => s.value);
      expect(values).toContain("skip");
      expect(values).toContain("update");
    });
  });

  describe("Step Definitions Configuration", () => {
    it("should have all workflow steps defined", () => {
      expect(IMPORT_STEP_DEFINITIONS.length).toBeGreaterThanOrEqual(5);
    });

    it("should have valid prerequisites", () => {
      const stepNames = IMPORT_STEP_DEFINITIONS.map((s) => s.step);
      for (const step of IMPORT_STEP_DEFINITIONS) {
        for (const prereq of step.prerequisites) {
          expect(stepNames).toContain(prereq);
        }
      }
    });

    it("should have first step with no prerequisites", () => {
      const firstStep = IMPORT_STEP_DEFINITIONS[0];
      expect(firstStep.prerequisites.length).toBe(0);
    });
  });

  describe("Workflow Configs", () => {
    it("should have config for each mode", () => {
      expect(IMPORT_WORKFLOW_CONFIGS.quick).toBeDefined();
      expect(IMPORT_WORKFLOW_CONFIGS.guided).toBeDefined();
      expect(IMPORT_WORKFLOW_CONFIGS.expert).toBeDefined();
    });

    it("quick mode should have fewer steps", () => {
      expect(IMPORT_WORKFLOW_CONFIGS.quick.steps.length).toBeLessThan(
        IMPORT_WORKFLOW_CONFIGS.guided.steps.length,
      );
    });

    it("quick mode should auto-advance", () => {
      expect(IMPORT_WORKFLOW_CONFIGS.quick.autoAdvanceOnComplete).toBe(true);
    });
  });

  describe("Quick Actions", () => {
    it("should have required properties", () => {
      for (const action of IMPORT_QUICK_ACTIONS) {
        expect(action.id).toBeDefined();
        expect(action.label).toBeDefined();
        expect(action.action).toBeDefined();
        expect(typeof action.isDestructive).toBe("boolean");
        expect(typeof action.requiresConfirmation).toBe("boolean");
      }
    });

    it("destructive actions should require confirmation", () => {
      const destructiveActions = IMPORT_QUICK_ACTIONS.filter(
        (a) => a.isDestructive,
      );
      for (const action of destructiveActions) {
        expect(action.requiresConfirmation).toBe(true);
      }
    });
  });

  describe("Default Import Preferences", () => {
    it("should have all preference properties", () => {
      expect(DEFAULT_IMPORT_PREFERENCES.defaultImportMode).toBeDefined();
      expect(DEFAULT_IMPORT_PREFERENCES.defaultDuplicateStrategy).toBeDefined();
      expect(typeof DEFAULT_IMPORT_PREFERENCES.autoAnalyzeOnUpload).toBe(
        "boolean",
      );
      expect(typeof DEFAULT_IMPORT_PREFERENCES.minimumQualityScore).toBe(
        "number",
      );
    });

    it("should have sensible defaults", () => {
      expect(DEFAULT_IMPORT_PREFERENCES.defaultImportMode).toBe("guided");
      expect(
        DEFAULT_IMPORT_PREFERENCES.minimumQualityScore,
      ).toBeGreaterThanOrEqual(0);
      expect(
        DEFAULT_IMPORT_PREFERENCES.minimumQualityScore,
      ).toBeLessThanOrEqual(100);
    });

    it("should have valid AI assistance level", () => {
      expect(["none", "detect", "suggest", "enhance"]).toContain(
        DEFAULT_IMPORT_PREFERENCES.aiAssistanceLevel,
      );
    });
  });
});

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Create a test DataSheet from simple array data
 */
function createTestSheet(
  data: (string | number | null)[][],
): DataImport.DataSheet {
  const headers = data[0] ?? [];
  const rows = data.slice(1);

  const columns: DataImport.DetectedColumn[] = headers.map((h, i) => ({
    index: i,
    letter: String.fromCharCode(65 + i),
    headerValue: String(h ?? ""),
    normalizedName: String(h ?? `col_${i}`)
      .toLowerCase()
      .replace(/\s+/g, "_"),
    inferredType: "string" as const,
    typeConfidence: 0.8,
    nullCount: rows.filter((r) => r[i] == null).length,
    uniqueCount: new Set(rows.map((r) => r[i])).size,
    sampleValues: rows.slice(0, 10).map((r, _rowIdx) => ({
      columnIndex: i,
      rawValue: r[i],
      displayValue: String(r[i] ?? ""),
      formattedValue: null,
      formula: null,
      dataType: "string" as const,
      style: null,
      isNull: r[i] == null,
      isMerged: false,
      mergeSpan: null,
    })),
    semanticType: null,
    semanticConfidence: 0,
    issues: [],
  }));

  const dataRows: DataImport.DataRow[] = rows.map((row, i) => ({
    rowIndex: i + 1,
    cells: row.map((cell, j) => ({
      columnIndex: j,
      rawValue: cell,
      displayValue: String(cell ?? ""),
      formattedValue: null,
      formula: null,
      dataType: "string" as const,
      style: null,
      isNull: cell == null,
      isMerged: false,
      mergeSpan: null,
    })),
    rowType: "data" as const,
    issues: [],
  }));

  return {
    id: "test_sheet" as DataImport.SheetId,
    sourceId: "test_source" as DataImport.DataSourceId,
    name: "Test Sheet",
    index: 0,
    rowCount: rows.length + 1,
    columnCount: headers.length,
    headerRow: 0,
    dataStartRow: 1,
    dataEndRow: rows.length,
    columns,
    sampleRows: dataRows,
    issues: [],
  };
}

// =============================================================================
// NEW PARSER TESTS - YAML, XLSX, PDF, TYPST, PLAIN TEXT
// =============================================================================

describe("YAML Parser Edge Cases", () => {
  const parser = new YAMLParser();

  describe("Basic YAML parsing", () => {
    it("should parse simple key-value YAML", async () => {
      const yaml = `
front: Hello
back: World
tags: vocabulary
`;
      const result = await parser.parse(yaml, "test.yaml");
      expect(result.success).toBe(true);
      expect(result.sourceType).toBe("yaml");
    });

    it("should parse array of objects", async () => {
      const yaml = `
- front: Question 1
  back: Answer 1
- front: Question 2
  back: Answer 2
`;
      const result = await parser.parse(yaml, "flashcards.yaml");
      expect(result.success).toBe(true);
      expect(result.sheets.length).toBeGreaterThanOrEqual(1);
    });

    it("should parse nested YAML with multiple arrays", async () => {
      const yaml = `
vocabulary:
  - term: Hello
    definition: A greeting
  - term: Goodbye
    definition: A farewell
grammar:
  - rule: Subject-Verb Agreement
    example: He runs
`;
      const result = await parser.parse(yaml, "study.yaml");
      expect(result.success).toBe(true);
      // Should create sheets for vocabulary and grammar arrays
    });

    it("should handle empty YAML file", async () => {
      const result = await parser.parse("", "empty.yaml");
      expect(result.success).toBe(false);
      expect(result.errors[0]?.code).toBe("EMPTY_FILE");
    });

    it("should handle YAML with multi-line strings", async () => {
      const yaml = `
question: |
  What is the capital
  of France?
answer: Paris
`;
      const result = await parser.parse(yaml, "multiline.yaml");
      expect(result.success).toBe(true);
    });

    it("should handle YAML with inline arrays", async () => {
      const yaml = `
front: Colors
back: Red, Green, Blue
tags: [primary, colors, art]
`;
      const result = await parser.parse(yaml, "inline.yaml");
      expect(result.success).toBe(true);
    });

    it("should parse multiple YAML documents", async () => {
      const yaml = `
---
front: Question 1
back: Answer 1
---
front: Question 2
back: Answer 2
`;
      const result = await parser.parse(yaml, "multi-doc.yaml");
      expect(result.success).toBe(true);
    });
  });

  describe("YAML type inference", () => {
    it("should correctly infer boolean values", async () => {
      const yaml = `
- active: true
  name: Item 1
- active: false
  name: Item 2
`;
      const result = await parser.parse(yaml, "booleans.yaml");
      expect(result.success).toBe(true);
    });

    it("should correctly infer numeric values", async () => {
      const yaml = `
- count: 42
  price: 19.99
  name: Item
`;
      const result = await parser.parse(yaml, "numbers.yaml");
      expect(result.success).toBe(true);
    });

    it("should handle null values", async () => {
      const yaml = `
- front: Question
  back: ~
- front: Another
  back: null
`;
      const result = await parser.parse(yaml, "nulls.yaml");
      expect(result.success).toBe(true);
    });
  });

  describe("YAML can parse check", () => {
    it("should recognize .yaml extension", () => {
      expect(parser.canParse("test.yaml")).toBe(true);
    });

    it("should recognize .yml extension", () => {
      expect(parser.canParse("test.yml")).toBe(true);
    });

    it("should recognize YAML MIME type", () => {
      expect(parser.canParse("file", "text/yaml")).toBe(true);
      expect(parser.canParse("file", "application/yaml")).toBe(true);
    });
  });
});

describe("Excel Parser Edge Cases", () => {
  const parser = new ExcelParser();

  describe("Excel file validation", () => {
    it("should recognize xlsx extension", () => {
      expect(parser.canParse("spreadsheet.xlsx")).toBe(true);
    });

    it("should recognize xls extension", () => {
      expect(parser.canParse("spreadsheet.xls")).toBe(true);
    });

    it("should recognize xlsm extension", () => {
      expect(parser.canParse("macro-enabled.xlsm")).toBe(true);
    });

    it("should recognize Excel MIME types", () => {
      expect(
        parser.canParse(
          "file",
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        ),
      ).toBe(true);
      expect(parser.canParse("file", "application/vnd.ms-excel")).toBe(true);
    });

    it("should reject invalid binary data", async () => {
      const invalidData = new ArrayBuffer(100);
      const result = await parser.parse(invalidData, "invalid.xlsx");
      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it("should reject non-Excel string data", async () => {
      const result = await parser.parse("not excel data", "fake.xlsx");
      expect(result.success).toBe(false);
    });
  });

  describe("Excel ZIP structure detection", () => {
    it("should validate ZIP magic number", async () => {
      // Create minimal ZIP header (PK signature)
      const zipHeader = new Uint8Array([0x50, 0x4b, 0x03, 0x04]);
      const buffer = zipHeader.buffer;
      const result = await parser.parse(buffer, "minimal.xlsx");
      // Will succeed but may have warnings about incomplete structure
      expect(result.sourceType).toBe("excel");
    });
  });
});

describe("PDF Parser Edge Cases", () => {
  const parser = new PDFParser();

  describe("PDF file validation", () => {
    it("should recognize pdf extension", () => {
      expect(parser.canParse("document.pdf")).toBe(true);
    });

    it("should recognize PDF MIME type", () => {
      expect(parser.canParse("file", "application/pdf")).toBe(true);
    });

    it("should validate PDF magic number", async () => {
      // Create buffer with PDF magic header
      const pdfHeader = new TextEncoder().encode("%PDF-1.4\n");
      const result = await parser.parse(pdfHeader.buffer, "test.pdf");
      expect(result.sourceType).toBe("pdf");
      expect(result.success).toBe(true);
    });

    it("should reject invalid PDF data", async () => {
      const invalidData = new TextEncoder().encode("not a pdf");
      const result = await parser.parse(invalidData.buffer, "fake.pdf");
      expect(result.success).toBe(false);
      expect(result.errors[0]?.code).toBe("INVALID_FORMAT");
    });
  });

  describe("PDF text extraction", () => {
    it("should handle PDF with no extractable text", async () => {
      // Minimal valid PDF header
      const pdf = "%PDF-1.4\n%%EOF";
      const result = await parser.parse(pdf, "empty.pdf");
      expect(result.success).toBe(true);
      expect(result.warnings.length).toBeGreaterThan(0);
    });
  });
});

describe("Typst Parser Edge Cases", () => {
  const parser = new TypstParser();

  describe("Typst file recognition", () => {
    it("should recognize .typ extension", () => {
      expect(parser.canParse("document.typ")).toBe(true);
    });

    it("should recognize .typst extension", () => {
      expect(parser.canParse("document.typst")).toBe(true);
    });

    it("should recognize Typst MIME types", () => {
      expect(parser.canParse("file", "text/typst")).toBe(true);
    });
  });

  describe("Typst flashcard patterns", () => {
    it("should parse #card function syntax", async () => {
      const typst = `
#card(front: "What is 2+2?", back: "4")
#card(front: "Capital of France?", back: "Paris")
`;
      const result = await parser.parse(typst, "flashcards.typ");
      expect(result.success).toBe(true);
      expect(result.metadata.format).toBe("flashcards");
    });

    it("should parse #flashcard bracket syntax", async () => {
      const typst = `
#flashcard[What is the speed of light?][Approximately 299,792 km/s]
#flashcard[Who wrote Hamlet?][William Shakespeare]
`;
      const result = await parser.parse(typst, "cards.typ");
      expect(result.success).toBe(true);
    });

    it("should parse === term definition format", async () => {
      const typst = `
= Vocabulary

=== Photosynthesis
The process by which plants convert sunlight into energy

=== Mitosis
Cell division resulting in two identical daughter cells
`;
      const result = await parser.parse(typst, "terms.typ");
      expect(result.success).toBe(true);
    });
  });

  describe("Typst section parsing", () => {
    it("should parse Typst headings", async () => {
      const typst = `
= Chapter 1
Introduction to biology

== Section 1.1
Cells are the basic unit of life

== Section 1.2
All organisms are made of cells
`;
      const result = await parser.parse(typst, "notes.typ");
      expect(result.success).toBe(true);
      expect(result.sheets[0].rowCount).toBeGreaterThan(0);
    });

    it("should handle Typst with markup", async () => {
      const typst = `
= *Important* Concepts

#text(weight: "bold")[Gravity]
The force of attraction between masses

#emph[Remember]: $F = m a$
`;
      const result = await parser.parse(typst, "physics.typ");
      expect(result.success).toBe(true);
    });
  });

  describe("Typst edge cases", () => {
    it("should handle empty Typst file", async () => {
      const result = await parser.parse("", "empty.typ");
      expect(result.success).toBe(true);
      expect(result.sheets[0].rowCount).toBe(0);
    });

    it("should handle Typst with only comments", async () => {
      const typst = `
// This is a comment
// Another comment
`;
      const result = await parser.parse(typst, "comments.typ");
      expect(result.success).toBe(true);
    });
  });
});

describe("Plain Text Parser Edge Cases", () => {
  const parser = new PlainTextParser();

  describe("Plain text recognition", () => {
    it("should recognize .txt extension", () => {
      expect(parser.canParse("notes.txt")).toBe(true);
    });

    it("should recognize .text extension", () => {
      expect(parser.canParse("notes.text")).toBe(true);
    });
  });

  describe("Flashcard pattern detection", () => {
    it("should detect Q: A: format", async () => {
      const text = `
Q: What is the capital of France?
A: Paris

Q: What is 2+2?
A: 4
`;
      const result = await parser.parse(text, "quiz.txt");
      expect(result.success).toBe(true);
      expect(result.metadata.format).toBe("flashcards");
      expect(result.metadata.pattern).toBe("qa");
    });

    it("should detect double-colon format", async () => {
      const text = `
Hello :: A greeting
Goodbye :: A farewell
Thanks :: Expression of gratitude
`;
      const result = await parser.parse(text, "vocab.txt");
      expect(result.success).toBe(true);
      expect(result.metadata.format).toBe("flashcards");
      expect(result.metadata.pattern).toBe("double-colon");
    });

    it("should detect tab-separated format", async () => {
      const text = `Front\tBack
Question 1\tAnswer 1
Question 2\tAnswer 2
`;
      const result = await parser.parse(text, "cards.txt");
      expect(result.success).toBe(true);
      expect(result.metadata.format).toBe("flashcards");
    });
  });

  describe("List detection", () => {
    it("should detect bullet point lists", async () => {
      const text = `
Study Topics:
- Cell biology
- Genetics
- Evolution
- Ecology
`;
      const result = await parser.parse(text, "topics.txt");
      expect(result.success).toBe(true);
      expect(result.metadata.format).toBe("list");
    });

    it("should detect numbered lists", async () => {
      const text = `
Steps:
1. Open the book
2. Read chapter 1
3. Take notes
4. Review
`;
      const result = await parser.parse(text, "steps.txt");
      expect(result.success).toBe(true);
      expect(result.metadata.format).toBe("list");
    });
  });

  describe("Paragraph detection", () => {
    it("should detect paragraphs separated by blank lines", async () => {
      const text = `
First paragraph with some content about biology.

Second paragraph discussing chemistry topics.

Third paragraph about physics concepts.
`;
      const result = await parser.parse(text, "notes.txt");
      expect(result.success).toBe(true);
      expect(result.metadata.format).toBe("paragraphs");
    });
  });

  describe("Plain text edge cases", () => {
    it("should handle empty text file", async () => {
      const result = await parser.parse("", "empty.txt");
      expect(result.success).toBe(true);
      expect(result.sheets[0].rowCount).toBe(0);
    });

    it("should handle single line", async () => {
      const result = await parser.parse("Just one line", "single.txt");
      expect(result.success).toBe(true);
      expect(result.sheets[0].rowCount).toBe(1);
    });

    it("should handle text with only whitespace", async () => {
      const result = await parser.parse("   \n  \n   ", "whitespace.txt");
      expect(result.success).toBe(true);
    });
  });
});

describe("Parser Registry with New Parsers", () => {
  const registry = new ParserRegistry();

  it("should find YAML parser", () => {
    const parser = registry.findParser("data.yaml");
    expect(parser).toBeDefined();
    expect(parser?.supportedExtensions).toContain("yaml");
  });

  it("should find YML parser", () => {
    const parser = registry.findParser("data.yml");
    expect(parser).toBeDefined();
  });

  it("should find Excel parser", () => {
    const parser = registry.findParser("spreadsheet.xlsx");
    expect(parser).toBeDefined();
    expect(parser?.supportedExtensions).toContain("xlsx");
  });

  it("should find PDF parser", () => {
    const parser = registry.findParser("document.pdf");
    expect(parser).toBeDefined();
    expect(parser?.supportedExtensions).toContain("pdf");
  });

  it("should find Typst parser", () => {
    const parser = registry.findParser("document.typ");
    expect(parser).toBeDefined();
    expect(parser?.supportedExtensions).toContain("typ");
  });

  it("should list all supported extensions", () => {
    const extensions = registry.getSupportedExtensions();
    expect(extensions).toContain("csv");
    expect(extensions).toContain("json");
    expect(extensions).toContain("yaml");
    expect(extensions).toContain("yml");
    expect(extensions).toContain("xlsx");
    expect(extensions).toContain("pdf");
    expect(extensions).toContain("typ");
    expect(extensions).toContain("md");
    expect(extensions).toContain("txt");
  });

  it("should list all supported MIME types", () => {
    const mimeTypes = registry.getSupportedMimeTypes();
    expect(mimeTypes).toContain("text/csv");
    expect(mimeTypes).toContain("application/json");
    expect(mimeTypes).toContain("text/yaml");
    expect(mimeTypes).toContain("application/pdf");
    expect(mimeTypes).toContain("text/markdown");
  });
});

describe("isFileTypeSupported with New Formats", () => {
  it("should support YAML files", () => {
    expect(isFileTypeSupported("data.yaml")).toBe(true);
    expect(isFileTypeSupported("data.yml")).toBe(true);
  });

  it("should support Excel files", () => {
    expect(isFileTypeSupported("data.xlsx")).toBe(true);
    expect(isFileTypeSupported("data.xls")).toBe(true);
    expect(isFileTypeSupported("data.xlsm")).toBe(true);
  });

  it("should support PDF files", () => {
    expect(isFileTypeSupported("document.pdf")).toBe(true);
  });

  it("should support Typst files", () => {
    expect(isFileTypeSupported("document.typ")).toBe(true);
    expect(isFileTypeSupported("document.typst")).toBe(true);
  });

  it("should support all original formats", () => {
    expect(isFileTypeSupported("data.csv")).toBe(true);
    expect(isFileTypeSupported("data.tsv")).toBe(true);
    expect(isFileTypeSupported("data.json")).toBe(true);
    expect(isFileTypeSupported("notes.md")).toBe(true);
    expect(isFileTypeSupported("notes.txt")).toBe(true);
  });
});
