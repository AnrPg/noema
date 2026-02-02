// =============================================================================
// MARKDOWN RECONCILER - Conflict Resolution for Bidirectional Sync
// =============================================================================
// Implements the reconciliation policy specified by the user:
// - Option D: Merge non-conflicting changes, create conflict markers for overlaps
// - LKGC-controlled fields ALWAYS win (mastery, rev, privacy, etc.)
// - Three-way merge for body text where possible
// - Explicit conflict markers when merge fails
//
// NO UI. NO AI. NO SCHEDULING.
// =============================================================================

import type { NodeId } from "../../types/lkgc/foundation";
import type {
  MarkdownFile,
  MarkdownFrontmatter,
  ConflictMarker,
  ReconciliationResult,
  ReconciliationStatus,
} from "./markdown-types";
import { generateContentHash } from "./markdown-parser";
import { now } from "../id-generator";

// =============================================================================
// CONFLICT DETECTION
// =============================================================================

/**
 * Fields controlled by LKGC - user edits to these are IGNORED
 * @internal Used by reconciliation logic to identify read-only fields
 */
const _LKGC_CONTROLLED_FIELDS: readonly string[] = [
  "lkgc_id",
  "node_type",
  "schema_version",
  "rev",
  "source",
  "privacy_level",
  "created_at",
  "updated_at",
  "mastery_summary",
  "last_reviewed",
  "archived",
];

/**
 * Fields that users can edit in Obsidian
 */
const USER_EDITABLE_FIELDS: readonly string[] = [
  "aliases",
  "tags",
  "strategy_tags",
  "domain",
];

/**
 * Result of comparing two versions
 */
export interface ComparisonResult {
  /** Fields changed only in LKGC */
  readonly lkgcOnlyChanges: readonly string[];
  /** Fields changed only in Obsidian */
  readonly obsidianOnlyChanges: readonly string[];
  /** Fields changed in both (potential conflicts) */
  readonly bothChanged: readonly string[];
  /** Whether body content differs */
  readonly bodyDiffers: boolean;
  /** Whether there are any true conflicts */
  readonly hasConflicts: boolean;
}

/**
 * Compare base, LKGC, and Obsidian versions
 */
export function compareVersions(
  base: MarkdownFile | undefined,
  lkgc: MarkdownFile,
  obsidian: MarkdownFile,
): ComparisonResult {
  const lkgcOnlyChanges: string[] = [];
  const obsidianOnlyChanges: string[] = [];
  const bothChanged: string[] = [];

  // Compare frontmatter fields
  for (const field of USER_EDITABLE_FIELDS) {
    const baseVal = base
      ? getFrontmatterField(base.frontmatter, field)
      : undefined;
    const lkgcVal = getFrontmatterField(lkgc.frontmatter, field);
    const obsidianVal = getFrontmatterField(obsidian.frontmatter, field);

    const lkgcChanged = !deepEqual(baseVal, lkgcVal);
    const obsidianChanged = !deepEqual(baseVal, obsidianVal);

    if (lkgcChanged && obsidianChanged) {
      // Both changed - check if to same value
      if (!deepEqual(lkgcVal, obsidianVal)) {
        bothChanged.push(field);
      }
    } else if (lkgcChanged) {
      lkgcOnlyChanges.push(field);
    } else if (obsidianChanged) {
      obsidianOnlyChanges.push(field);
    }
  }

  // Compare body content
  const _baseBody = base?.body ?? ""; // Reserved for future diff algorithms
  const bodyDiffers = lkgc.bodyHash !== obsidian.bodyHash;
  const lkgcBodyChanged = base ? lkgc.bodyHash !== base.bodyHash : false;
  const obsidianBodyChanged = base
    ? obsidian.bodyHash !== base.bodyHash
    : false;

  const hasConflicts =
    bothChanged.length > 0 ||
    (lkgcBodyChanged && obsidianBodyChanged && bodyDiffers);

  return {
    lkgcOnlyChanges,
    obsidianOnlyChanges,
    bothChanged,
    bodyDiffers,
    hasConflicts,
  };
}

/**
 * Get a field from frontmatter safely
 */
function getFrontmatterField(
  frontmatter: MarkdownFrontmatter | undefined | null,
  field: string,
): unknown {
  if (!frontmatter) return undefined;
  return (frontmatter as unknown as Record<string, unknown>)[field];
}

/**
 * Simple deep equality check
 */
function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (a === null || b === null) return a === b;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((v, i) => deepEqual(v, b[i]));
  }
  if (typeof a === "object" && typeof b === "object") {
    const aKeys = Object.keys(a as object);
    const bKeys = Object.keys(b as object);
    if (aKeys.length !== bKeys.length) return false;
    return aKeys.every((k) =>
      deepEqual(
        (a as Record<string, unknown>)[k],
        (b as Record<string, unknown>)[k],
      ),
    );
  }
  return false;
}

// =============================================================================
// THREE-WAY MERGE
// =============================================================================

/**
 * Line-based three-way merge result
 */
export interface MergeResult {
  readonly success: boolean;
  readonly mergedContent: string;
  readonly conflicts: readonly ConflictMarker[];
}

/**
 * Perform three-way merge on text content
 */
export function threeWayMerge(
  base: string,
  lkgc: string,
  obsidian: string,
): MergeResult {
  const baseLines = base.split("\n");
  const lkgcLines = lkgc.split("\n");
  const obsidianLines = obsidian.split("\n");

  const result: string[] = [];
  const conflicts: ConflictMarker[] = [];

  // Simple line-by-line merge
  // In production, use a proper diff3 algorithm
  const maxLen = Math.max(
    baseLines.length,
    lkgcLines.length,
    obsidianLines.length,
  );

  let i = 0;
  while (i < maxLen) {
    const baseLine = i < baseLines.length ? baseLines[i] : undefined;
    const lkgcLine = i < lkgcLines.length ? lkgcLines[i] : undefined;
    const obsidianLine =
      i < obsidianLines.length ? obsidianLines[i] : undefined;

    // If all same, keep it
    if (baseLine === lkgcLine && lkgcLine === obsidianLine) {
      if (baseLine !== undefined) result.push(baseLine);
      i++;
      continue;
    }

    // If only one changed from base, take that change
    if (baseLine === lkgcLine && obsidianLine !== undefined) {
      result.push(obsidianLine);
      i++;
      continue;
    }

    if (baseLine === obsidianLine && lkgcLine !== undefined) {
      result.push(lkgcLine);
      i++;
      continue;
    }

    // If both changed to the same thing, take it
    if (lkgcLine === obsidianLine && lkgcLine !== undefined) {
      result.push(lkgcLine);
      i++;
      continue;
    }

    // Conflict - both changed to different values
    const _conflictStart = result.length; // Reserved for conflict line tracking
    result.push("<<<<<<< LKGC");
    if (lkgcLine !== undefined) result.push(lkgcLine);
    result.push("=======");
    if (obsidianLine !== undefined) result.push(obsidianLine);
    result.push(">>>>>>> Obsidian");

    conflicts.push({
      id: `conflict-${conflicts.length + 1}`,
      nodeId: "" as NodeId, // Will be filled in by reconciler
      field: `body:line${i + 1}`,
      lkgcValue: lkgcLine ?? "(deleted)",
      obsidianValue: obsidianLine ?? "(deleted)",
      baseValue: baseLine ?? "(new)",
      severity: "warning",
      suggestedResolution: "manual",
      createdAt: now(),
    });

    i++;
  }

  return {
    success: conflicts.length === 0,
    mergedContent: result.join("\n"),
    conflicts,
  };
}

// =============================================================================
// FRONTMATTER RECONCILIATION
// =============================================================================

/**
 * Reconcile frontmatter between versions
 */
export function reconcileFrontmatter(
  baseFrontmatter: MarkdownFrontmatter | undefined | null,
  lkgcFrontmatter: MarkdownFrontmatter,
  obsidianFrontmatter: MarkdownFrontmatter,
  comparison: ComparisonResult,
): {
  merged: MarkdownFrontmatter;
  conflicts: ConflictMarker[];
} {
  const conflicts: ConflictMarker[] = [];

  // Start with LKGC version - it controls most fields
  const merged: Record<string, unknown> = { ...lkgcFrontmatter };

  // For user-editable fields with non-conflicting changes, take Obsidian's version
  for (const field of comparison.obsidianOnlyChanges) {
    const obsidianVal = getFrontmatterField(obsidianFrontmatter, field);
    merged[field] = obsidianVal;
  }

  // For conflicting fields, create conflict markers
  for (const field of comparison.bothChanged) {
    const lkgcVal = getFrontmatterField(lkgcFrontmatter, field);
    const obsidianVal = getFrontmatterField(obsidianFrontmatter, field);
    const baseVal = baseFrontmatter
      ? getFrontmatterField(baseFrontmatter, field)
      : undefined;

    conflicts.push({
      id: `conflict-frontmatter-${field}`,
      nodeId: lkgcFrontmatter.lkgc_id,
      field: `frontmatter:${field}`,
      lkgcValue: JSON.stringify(lkgcVal),
      obsidianValue: JSON.stringify(obsidianVal),
      baseValue: baseVal !== undefined ? JSON.stringify(baseVal) : undefined,
      severity: "warning",
      suggestedResolution: "manual",
      createdAt: now(),
    });

    // For now, keep LKGC value - conflict needs manual resolution
    merged[field] = lkgcVal;
  }

  return {
    merged: merged as unknown as MarkdownFrontmatter,
    conflicts,
  };
}

// =============================================================================
// RECONCILER CLASS
// =============================================================================

/**
 * Configuration for reconciliation
 */
export interface ReconcilerConfig {
  /** Whether to automatically resolve non-conflicting changes */
  readonly autoMergeNonConflicting: boolean;

  /** Maximum conflict count before requiring full manual review */
  readonly maxAutoMergeConflicts: number;

  /** Whether to preserve LKGC-generated sections */
  readonly preserveLkgcGeneratedSections: boolean;
}

/**
 * Default reconciler configuration
 */
export const DEFAULT_RECONCILER_CONFIG: ReconcilerConfig = {
  autoMergeNonConflicting: true,
  maxAutoMergeConflicts: 5,
  preserveLkgcGeneratedSections: true,
};

/**
 * Reconciler for bidirectional sync
 */
export class MarkdownReconciler {
  private readonly config: ReconcilerConfig;

  constructor(config: Partial<ReconcilerConfig> = {}) {
    this.config = { ...DEFAULT_RECONCILER_CONFIG, ...config };
  }

  /**
   * Reconcile three versions of a Markdown file
   */
  reconcile(
    nodeId: NodeId,
    base: MarkdownFile | undefined,
    lkgc: MarkdownFile,
    obsidian: MarkdownFile,
  ): ReconciliationResult {
    const comparison = compareVersions(base, lkgc, obsidian);
    const allConflicts: ConflictMarker[] = [];

    // Reconcile frontmatter
    const { merged: mergedFrontmatter, conflicts: frontmatterConflicts } =
      reconcileFrontmatter(
        base?.frontmatter,
        lkgc.frontmatter!,
        obsidian.frontmatter!,
        comparison,
      );

    allConflicts.push(...frontmatterConflicts.map((c) => ({ ...c, nodeId })));

    // Reconcile body
    let mergedBody: string;
    if (!comparison.bodyDiffers) {
      // No body conflict - use LKGC version
      mergedBody = lkgc.body;
    } else if (base && this.config.autoMergeNonConflicting) {
      // Try three-way merge
      const mergeResult = threeWayMerge(base.body, lkgc.body, obsidian.body);
      mergedBody = mergeResult.mergedContent;
      allConflicts.push(
        ...mergeResult.conflicts.map((c) => ({ ...c, nodeId })),
      );
    } else {
      // No base - can't do three-way merge, create conflict for entire body
      allConflicts.push({
        id: `conflict-body`,
        nodeId,
        field: "body",
        lkgcValue:
          lkgc.body.slice(0, 500) + (lkgc.body.length > 500 ? "..." : ""),
        obsidianValue:
          obsidian.body.slice(0, 500) +
          (obsidian.body.length > 500 ? "..." : ""),
        baseValue: undefined,
        severity: "critical",
        suggestedResolution: "manual",
        createdAt: now(),
      });

      // Keep LKGC version for now
      mergedBody = lkgc.body;
    }

    // Handle LKGC-generated sections
    if (this.config.preserveLkgcGeneratedSections) {
      mergedBody = preserveGeneratedSections(mergedBody, lkgc.body);
    }

    // Determine final status
    let status: ReconciliationStatus;
    if (allConflicts.length === 0) {
      status = "clean";
    } else if (allConflicts.length <= this.config.maxAutoMergeConflicts) {
      status = "merged_with_conflicts";
    } else {
      status = "requires_manual_review";
    }

    // Generate merged file (useful for debugging/logging)
    const _mergedContent = serializeMarkdownFile(mergedFrontmatter, mergedBody);

    const mergedFile: MarkdownFile = {
      relativePath: lkgc.relativePath,
      frontmatter: mergedFrontmatter,
      body: mergedBody,
      bodyHash: generateContentHash(mergedBody),
      parsedWikilinks: lkgc.parsedWikilinks, // Re-parse would be better
      lastModified: now(),
      exists: true,
    };

    return {
      status,
      mergedFile,
      conflicts: allConflicts,
      appliedOperations: [], // Filled in by sync engine
      warnings: generateWarnings(comparison, allConflicts),
      needsUserInput: status !== "clean",
      timestamp: now(),
    };
  }

  /**
   * Apply a user's resolution to a conflict
   */
  resolveConflict(
    conflict: ConflictMarker,
    resolution: "accept_lkgc" | "accept_obsidian" | "accept_base" | "custom",
    customValue?: string,
  ): { field: string; value: unknown } {
    let value: unknown;

    switch (resolution) {
      case "accept_lkgc":
        value = conflict.lkgcValue;
        break;
      case "accept_obsidian":
        value = conflict.obsidianValue;
        break;
      case "accept_base":
        value = conflict.baseValue;
        break;
      case "custom":
        value = customValue;
        break;
    }

    return { field: conflict.field, value };
  }
}

/**
 * Preserve LKGC-generated sections in merged body
 */
function preserveGeneratedSections(
  mergedBody: string,
  lkgcBody: string,
): string {
  // Find LKGC-generated sections
  const generatedPattern =
    /<!-- LKGC-GENERATED:[\s\S]*?<!-- END LKGC-GENERATED -->/g;

  // Get generated sections from LKGC
  const lkgcGeneratedSections = lkgcBody.match(generatedPattern) || [];

  if (lkgcGeneratedSections.length === 0) {
    return mergedBody;
  }

  // Remove any existing generated sections from merged body
  let result = mergedBody.replace(generatedPattern, "").trim();

  // Append fresh LKGC-generated sections
  result += "\n\n" + lkgcGeneratedSections.join("\n\n");

  return result;
}

/**
 * Serialize frontmatter and body back to Markdown
 */
function serializeMarkdownFile(
  frontmatter: MarkdownFrontmatter,
  body: string,
): string {
  // Import from exporter would create circular dependency
  // So we have a local implementation
  const lines: string[] = ["---"];

  lines.push(`lkgc_id: "${frontmatter.lkgc_id}"`);
  lines.push(`node_type: ${frontmatter.node_type}`);
  lines.push(`schema_version: ${frontmatter.schema_version}`);
  lines.push(`rev: ${frontmatter.rev}`);
  lines.push(`source: ${frontmatter.source}`);
  lines.push(`privacy_level: ${frontmatter.privacy_level}`);
  lines.push(`created_at: ${frontmatter.created_at}`);
  lines.push(`updated_at: ${frontmatter.updated_at}`);

  if (frontmatter.mastery_summary) {
    lines.push(`mastery_summary:`);
    lines.push(`  state: ${frontmatter.mastery_summary.state}`);
    lines.push(`  trend: ${frontmatter.mastery_summary.trend}`);
  }

  if (frontmatter.aliases && frontmatter.aliases.length > 0) {
    lines.push(`aliases:`);
    for (const alias of frontmatter.aliases) {
      lines.push(`  - "${alias}"`);
    }
  }

  if (frontmatter.tags && frontmatter.tags.length > 0) {
    lines.push(`tags:`);
    for (const tag of frontmatter.tags) {
      lines.push(`  - "${tag}"`);
    }
  }

  lines.push("---");
  lines.push("");
  lines.push(body);

  return lines.join("\n");
}

/**
 * Generate warnings from comparison and conflicts
 */
function generateWarnings(
  comparison: ComparisonResult,
  conflicts: readonly ConflictMarker[],
): readonly string[] {
  const warnings: string[] = [];

  if (comparison.bothChanged.length > 0) {
    warnings.push(
      `Conflicting changes in fields: ${comparison.bothChanged.join(", ")}`,
    );
  }

  if (
    comparison.bodyDiffers &&
    conflicts.some((c) => c.field.startsWith("body"))
  ) {
    warnings.push(
      "Body content has conflicting changes - manual review recommended",
    );
  }

  const criticalConflicts = conflicts.filter((c) => c.severity === "critical");
  if (criticalConflicts.length > 0) {
    warnings.push(
      `${criticalConflicts.length} critical conflict(s) require immediate attention`,
    );
  }

  return warnings;
}

// =============================================================================
// FACTORY FUNCTION
// =============================================================================

/**
 * Create a markdown reconciler
 */
export function createMarkdownReconciler(
  config?: Partial<ReconcilerConfig>,
): MarkdownReconciler {
  return new MarkdownReconciler(config);
}
