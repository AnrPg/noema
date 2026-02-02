// =============================================================================
// MARKDOWN PARSER - Parse Obsidian-Compatible Markdown Files
// =============================================================================
// Parses Markdown files with YAML frontmatter and extracts:
// - Frontmatter fields
// - Body content
// - Wikilinks [[target]] and [[target|alias]]
//
// NO UI. NO AI. NO SCHEDULING.
// =============================================================================

import type { NodeId, Timestamp } from "../../types/lkgc/foundation";
import type {
  ParsedMarkdownFile,
  MarkdownFrontmatter,
  ParsedWikilink,
  MarkdownParseError,
  ContentHash,
  MarkdownFileId,
  WikilinkResolution,
} from "./markdown-types";
import { now } from "../id-generator";

// =============================================================================
// CONTENT HASHING
// =============================================================================

/**
 * Generate a content hash for change detection
 * Uses a simple but effective hash algorithm
 */
export function generateContentHash(content: string): ContentHash {
  // Simple djb2 hash - sufficient for change detection
  let hash = 5381;
  for (let i = 0; i < content.length; i++) {
    hash = (hash * 33) ^ content.charCodeAt(i);
  }
  return `hash_${(hash >>> 0).toString(16)}` as ContentHash;
}

/**
 * Generate a file ID from path
 */
export function generateFileId(relativePath: string): MarkdownFileId {
  const normalized = relativePath.replace(/\\/g, "/").toLowerCase();
  const hash = generateContentHash(normalized);
  return `file_${hash}` as MarkdownFileId;
}

// =============================================================================
// FRONTMATTER PARSING
// =============================================================================

/**
 * YAML frontmatter delimiters
 */
const FRONTMATTER_START = "---";
const FRONTMATTER_END = "---";

/**
 * Extract frontmatter from Markdown content
 */
export function extractFrontmatter(content: string): {
  frontmatter: string;
  body: string;
  hasFrontmatter: boolean;
} {
  const trimmed = content.trimStart();

  if (!trimmed.startsWith(FRONTMATTER_START)) {
    return { frontmatter: "", body: content, hasFrontmatter: false };
  }

  const afterStart = trimmed.slice(FRONTMATTER_START.length);
  const endIndex = afterStart.indexOf(`\n${FRONTMATTER_END}`);

  if (endIndex === -1) {
    // No closing delimiter found
    return { frontmatter: "", body: content, hasFrontmatter: false };
  }

  const frontmatter = afterStart.slice(0, endIndex).trim();
  const body = afterStart
    .slice(endIndex + FRONTMATTER_END.length + 1)
    .trimStart();

  return { frontmatter, body, hasFrontmatter: true };
}

/**
 * Parse YAML frontmatter into object
 * Simple parser - doesn't handle all YAML edge cases
 */
export function parseFrontmatterYaml(yaml: string): {
  data: Record<string, unknown>;
  errors: MarkdownParseError[];
} {
  const errors: MarkdownParseError[] = [];
  const data: Record<string, unknown> = {};

  if (!yaml.trim()) {
    return { data, errors };
  }

  const lines = yaml.split("\n");
  let currentKey: string | null = null;
  let inArray = false;
  let arrayItems: unknown[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNumber = i + 1;

    // Skip empty lines
    if (!line.trim()) continue;

    // Check for array item
    if (line.match(/^\s+-\s+/)) {
      if (!inArray) {
        errors.push({
          code: "UNEXPECTED_ARRAY_ITEM",
          message: `Unexpected array item without array key`,
          lineNumber,
          severity: "warning",
        });
        continue;
      }
      const itemValue = line.replace(/^\s+-\s+/, "").trim();
      arrayItems.push(parseYamlValue(itemValue));
      continue;
    }

    // Check for key-value pair
    const kvMatch = line.match(/^(\w[\w_]*)\s*:\s*(.*)$/);
    if (kvMatch) {
      // Save previous key if it was an array
      if (currentKey && inArray) {
        data[currentKey] = arrayItems;
        arrayItems = [];
        inArray = false;
      }

      currentKey = kvMatch[1];
      const rawValue = kvMatch[2].trim();

      if (rawValue === "") {
        // Could be start of array or multi-line value
        inArray = true;
        arrayItems = [];
      } else {
        data[currentKey] = parseYamlValue(rawValue);
        currentKey = null;
      }
      continue;
    }

    // Unrecognized line
    errors.push({
      code: "INVALID_YAML_LINE",
      message: `Could not parse YAML line: ${line}`,
      lineNumber,
      severity: "warning",
    });
  }

  // Save final array if pending
  if (currentKey && inArray) {
    data[currentKey] = arrayItems;
  }

  return { data, errors };
}

/**
 * Parse a single YAML value
 */
function parseYamlValue(value: string): unknown {
  // Remove quotes if present
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }

  // Boolean
  if (value === "true") return true;
  if (value === "false") return false;

  // Null
  if (value === "null" || value === "~") return null;

  // Number
  const num = Number(value);
  if (!isNaN(num) && value !== "") return num;

  // String
  return value;
}

/**
 * Validate and coerce frontmatter to typed structure
 */
export function validateFrontmatter(data: Record<string, unknown>): {
  frontmatter: MarkdownFrontmatter | null;
  errors: MarkdownParseError[];
} {
  const errors: MarkdownParseError[] = [];

  // Check required fields
  const requiredFields = [
    "lkgc_id",
    "node_type",
    "schema_version",
    "rev",
    "source",
  ];
  for (const field of requiredFields) {
    if (!(field in data)) {
      errors.push({
        code: "MISSING_REQUIRED_FIELD",
        message: `Missing required frontmatter field: ${field}`,
        severity: "error",
      });
    }
  }

  if (errors.some((e) => e.severity === "error")) {
    return { frontmatter: null, errors };
  }

  // Coerce types
  const frontmatter: MarkdownFrontmatter = {
    lkgc_id: String(data.lkgc_id) as NodeId,
    node_type: String(data.node_type) as MarkdownFrontmatter["node_type"],
    schema_version: Number(data.schema_version) || 1,
    rev: Number(data.rev) as MarkdownFrontmatter["rev"],
    source: String(data.source) as "lkgc_mirror",
    privacy_level:
      (data.privacy_level as MarkdownFrontmatter["privacy_level"]) || "private",
    created_at: (data.created_at as Timestamp) || now(),
    updated_at: (data.updated_at as Timestamp) || now(),
    // Optional fields
    mastery_summary:
      data.mastery_summary as MarkdownFrontmatter["mastery_summary"],
    last_reviewed: data.last_reviewed as Timestamp | undefined,
    strategy_tags: Array.isArray(data.strategy_tags)
      ? (data.strategy_tags as readonly string[])
      : undefined,
    aliases: Array.isArray(data.aliases)
      ? (data.aliases as readonly string[])
      : undefined,
    tags: Array.isArray(data.tags)
      ? (data.tags as readonly string[])
      : undefined,
    domain: data.domain as string | undefined,
    archived: data.archived as boolean | undefined,
  };

  return { frontmatter, errors };
}

// =============================================================================
// WIKILINK PARSING
// =============================================================================

/**
 * Regex for parsing wikilinks
 * Matches: [[target]] or [[target|display]]
 */
const WIKILINK_REGEX = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;

/**
 * Extract wikilinks from Markdown body content
 */
export function extractWikilinks(
  body: string,
  nodeResolver?: (target: string) => NodeId | undefined,
): ParsedWikilink[] {
  const wikilinks: ParsedWikilink[] = [];
  const lines = body.split("\n");

  let charOffset = 0;
  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const line = lines[lineIdx];
    const lineNumber = lineIdx + 1;

    let match: RegExpExecArray | null;
    WIKILINK_REGEX.lastIndex = 0;

    while ((match = WIKILINK_REGEX.exec(line)) !== null) {
      const target = match[1].trim();
      const displayAlias = match[2]?.trim();
      const position = charOffset + match.index;

      // Get surrounding context (up to 50 chars each side)
      const contextStart = Math.max(0, match.index - 50);
      const contextEnd = Math.min(
        line.length,
        match.index + match[0].length + 50,
      );
      const context = line.slice(contextStart, contextEnd);

      // Try to resolve the target
      const resolvedNodeId = nodeResolver?.(target);
      const resolution: WikilinkResolution = resolvedNodeId
        ? "resolved"
        : "unresolved";

      wikilinks.push({
        originalText: match[0],
        target,
        displayAlias,
        position,
        lineNumber,
        context,
        resolvedNodeId,
        resolution,
      });
    }

    charOffset += line.length + 1; // +1 for newline
  }

  return wikilinks;
}

// =============================================================================
// MARKDOWN PARSER CLASS
// =============================================================================

/**
 * Node resolver function type
 */
export type NodeResolver = (targetTitle: string) => NodeId | undefined;

/**
 * Parser configuration
 */
export interface MarkdownParserConfig {
  /** Function to resolve wikilink targets to node IDs */
  readonly nodeResolver?: NodeResolver;

  /** Whether to validate frontmatter strictly */
  readonly strictFrontmatter: boolean;

  /** Whether to extract wikilinks */
  readonly extractWikilinks: boolean;
}

/**
 * Default parser configuration
 */
export const DEFAULT_PARSER_CONFIG: MarkdownParserConfig = {
  strictFrontmatter: true,
  extractWikilinks: true,
};

/**
 * Markdown parser for LKGC-compatible files
 */
export class MarkdownParser {
  private readonly config: MarkdownParserConfig;

  constructor(config: Partial<MarkdownParserConfig> = {}) {
    this.config = { ...DEFAULT_PARSER_CONFIG, ...config };
  }

  /**
   * Parse a Markdown file content
   */
  parse(
    content: string,
    relativePath: string,
    absolutePath: string,
    modifiedAt: Timestamp,
    createdAt?: Timestamp,
  ): ParsedMarkdownFile {
    const allErrors: MarkdownParseError[] = [];

    // Generate file ID
    const fileId = generateFileId(relativePath);

    // Extract file name
    const fileName =
      relativePath.split("/").pop()?.replace(/\.md$/i, "") || relativePath;

    // Extract frontmatter
    const {
      frontmatter: rawFrontmatter,
      body,
      hasFrontmatter,
    } = extractFrontmatter(content);

    // Parse frontmatter YAML
    let frontmatter: MarkdownFrontmatter | null = null;
    if (hasFrontmatter) {
      const { data, errors: yamlErrors } = parseFrontmatterYaml(rawFrontmatter);
      allErrors.push(...yamlErrors);

      if (this.config.strictFrontmatter) {
        const { frontmatter: validated, errors: validationErrors } =
          validateFrontmatter(data);
        allErrors.push(...validationErrors);
        frontmatter = validated;
      } else {
        // Non-strict: create partial frontmatter
        frontmatter = data as unknown as MarkdownFrontmatter;
      }
    }

    // Extract wikilinks
    const wikilinks = this.config.extractWikilinks
      ? extractWikilinks(body, this.config.nodeResolver)
      : [];

    // Generate content hash
    const contentHash = generateContentHash(content);

    return {
      fileId,
      relativePath,
      absolutePath,
      fileName,
      frontmatter,
      rawFrontmatter,
      body,
      wikilinks,
      contentHash,
      modifiedAt,
      createdAt,
      parseErrors: allErrors,
    };
  }

  /**
   * Parse content for sync operations (minimal args)
   * Returns MarkdownFile (simplified version for sync)
   */
  parseForSync(
    content: string,
    relativePath: string,
  ): import("./markdown-types").MarkdownFile {
    const timestamp = now();
    const parsed = this.parse(content, relativePath, relativePath, timestamp);

    return {
      relativePath,
      frontmatter: parsed.frontmatter,
      body: parsed.body,
      bodyHash: generateContentHash(parsed.body),
      parsedWikilinks: parsed.wikilinks,
      lastModified: timestamp,
      exists: true,
    };
  }

  /**
   * Parse with a custom node resolver (for resolving wikilinks)
   */
  parseWithResolver(
    content: string,
    relativePath: string,
    absolutePath: string,
    modifiedAt: Timestamp,
    nodeResolver: NodeResolver,
    createdAt?: Timestamp,
  ): ParsedMarkdownFile {
    const parser = new MarkdownParser({
      ...this.config,
      nodeResolver,
    });
    return parser.parse(
      content,
      relativePath,
      absolutePath,
      modifiedAt,
      createdAt,
    );
  }

  /**
   * Update the node resolver
   */
  withNodeResolver(nodeResolver: NodeResolver): MarkdownParser {
    return new MarkdownParser({
      ...this.config,
      nodeResolver,
    });
  }
}

// =============================================================================
// FACTORY FUNCTION
// =============================================================================

/**
 * Create a Markdown parser with default configuration
 */
export function createMarkdownParser(
  config: Partial<MarkdownParserConfig> = {},
): MarkdownParser {
  return new MarkdownParser(config);
}
