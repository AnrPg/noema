// =============================================================================
// MARKDOWN EXPORTER - Export LKGC Nodes to Obsidian-Compatible Markdown
// =============================================================================
// Generates Markdown files from LKGC nodes with:
// - YAML frontmatter (required + optional fields)
// - Wikilinks for graph edges
// - Qualitative mastery summaries (not raw MasteryState)
//
// Core principles:
// - Never delete files silently
// - Mark generated sections clearly
// - Preserve existing user content where possible
//
// NO UI. NO AI. NO SCHEDULING.
// =============================================================================

import type { NodeId } from "../../types/lkgc/foundation";
import type { LKGCNode } from "../../types/lkgc/nodes";
import type { LKGCEdge, EdgeType } from "../../types/lkgc/edges";
import type { MasteryState } from "../../types/lkgc/mastery";
import type {
  MarkdownFrontmatter,
  MasterySummary,
  ExportableNodeType,
  MarkdownMirrorConfig,
  ContentHash,
} from "./markdown-types";
import { isExportableNodeType, DEFAULT_MIRROR_CONFIG } from "./markdown-types";
import { generateContentHash } from "./markdown-parser";

// =============================================================================
// MASTERY SUMMARY GENERATION
// =============================================================================

/**
 * Convert MasteryState to qualitative summary
 * This is what gets exported - NOT the raw parameters
 */
export function generateMasterySummary(
  masteryState: MasteryState | undefined,
): MasterySummary | undefined {
  if (!masteryState) {
    return undefined;
  }

  const memory = masteryState.memory;
  const evidence = masteryState.evidence;

  // Determine categorical state based on stability and learning state
  let state: MasterySummary["state"];
  const stability = memory.stability;
  const retrievability = memory.retrievability as number;
  const learningState = memory.learningState;

  if (learningState === "new") {
    state = "new";
  } else if (stability < 5 || retrievability < 0.5) {
    state = "fragile";
  } else if (stability < 20 || retrievability < 0.7) {
    state = "developing";
  } else if (stability < 60) {
    state = "stable";
  } else {
    state = "strong";
  }

  // Determine trend based on evidence
  let trend: MasterySummary["trend"] = "unknown";
  if (evidence && evidence.totalReviews > 3) {
    const recentAccuracy = evidence.reviewsByOutcome
      ? calculateRecentAccuracy(evidence.reviewsByOutcome)
      : undefined;

    if (recentAccuracy !== undefined) {
      if (recentAccuracy > 0.85) {
        trend = "improving";
      } else if (recentAccuracy < 0.5) {
        trend = "declining";
      } else {
        trend = "stable";
      }
    }
  }

  // Generate explanation
  let explanation: string | undefined;
  if (state === "fragile") {
    explanation =
      "This knowledge is still being consolidated. Review more frequently.";
  } else if (state === "strong") {
    explanation = "Well-established in memory. Long intervals are safe.";
  } else if (trend === "declining") {
    explanation =
      "Recent reviews show some difficulty. Consider additional practice.";
  }

  return { state, trend, explanation };
}

/**
 * Calculate recent accuracy from outcome counts
 */
function calculateRecentAccuracy(outcomeCounts: {
  readonly again: number;
  readonly hard: number;
  readonly good: number;
  readonly easy: number;
}): number | undefined {
  const correct = outcomeCounts.good + outcomeCounts.easy;
  const incorrect = outcomeCounts.again + outcomeCounts.hard;
  const total = correct + incorrect;

  if (total === 0) return undefined;
  return correct / total;
}

// =============================================================================
// FRONTMATTER GENERATION
// =============================================================================

/**
 * Generate frontmatter for a node
 */
export function generateFrontmatter(
  node: LKGCNode,
  masteryState?: MasteryState,
): MarkdownFrontmatter {
  const nodeType = node.nodeType as ExportableNodeType;

  const frontmatter: MarkdownFrontmatter = {
    // Required fields
    lkgc_id: node.id,
    node_type: nodeType,
    schema_version: node.provenance.schemaVersion,
    rev: node.sync.rev,
    source: "lkgc_mirror",
    privacy_level: node.privacy.privacyLevel,
    created_at: node.provenance.createdAt,
    updated_at: node.provenance.updatedAt,

    // Optional fields
    mastery_summary: generateMasterySummary(masteryState),
    last_reviewed: masteryState?.memory?.lastReview,
    aliases: node.aliases,
    tags: node.tags,
    domain: extractDomain(node),
    archived: node.archivedAt !== undefined,
  };

  return frontmatter;
}

/**
 * Extract domain from node if available
 */
function extractDomain(node: LKGCNode): string | undefined {
  if ("domain" in node && typeof node.domain === "string") {
    return node.domain;
  }
  return undefined;
}

/**
 * Serialize frontmatter to YAML string
 */
export function serializeFrontmatter(frontmatter: MarkdownFrontmatter): string {
  const lines: string[] = ["---"];

  // Required fields first
  lines.push(`lkgc_id: "${frontmatter.lkgc_id}"`);
  lines.push(`node_type: ${frontmatter.node_type}`);
  lines.push(`schema_version: ${frontmatter.schema_version}`);
  lines.push(`rev: ${frontmatter.rev}`);
  lines.push(`source: ${frontmatter.source}`);
  lines.push(`privacy_level: ${frontmatter.privacy_level}`);
  lines.push(`created_at: ${frontmatter.created_at}`);
  lines.push(`updated_at: ${frontmatter.updated_at}`);

  // Optional fields
  if (frontmatter.mastery_summary) {
    lines.push(`mastery_summary:`);
    lines.push(`  state: ${frontmatter.mastery_summary.state}`);
    lines.push(`  trend: ${frontmatter.mastery_summary.trend}`);
    if (frontmatter.mastery_summary.explanation) {
      lines.push(
        `  explanation: "${escapeYamlString(frontmatter.mastery_summary.explanation)}"`,
      );
    }
  }

  if (frontmatter.last_reviewed !== undefined) {
    lines.push(`last_reviewed: ${frontmatter.last_reviewed}`);
  }

  if (frontmatter.aliases && frontmatter.aliases.length > 0) {
    lines.push(`aliases:`);
    for (const alias of frontmatter.aliases) {
      lines.push(`  - "${escapeYamlString(alias)}"`);
    }
  }

  if (frontmatter.tags && frontmatter.tags.length > 0) {
    lines.push(`tags:`);
    for (const tag of frontmatter.tags) {
      lines.push(`  - "${escapeYamlString(tag)}"`);
    }
  }

  if (frontmatter.strategy_tags && frontmatter.strategy_tags.length > 0) {
    lines.push(`strategy_tags:`);
    for (const tag of frontmatter.strategy_tags) {
      lines.push(`  - "${escapeYamlString(tag)}"`);
    }
  }

  if (frontmatter.domain) {
    lines.push(`domain: "${escapeYamlString(frontmatter.domain)}"`);
  }

  if (frontmatter.archived) {
    lines.push(`archived: true`);
  }

  lines.push("---");
  return lines.join("\n");
}

/**
 * Escape special characters in YAML strings
 */
function escapeYamlString(str: string): string {
  return str.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n");
}

// =============================================================================
// BODY CONTENT GENERATION
// =============================================================================

/**
 * Edge types that should generate wikilinks
 */
const WIKILINK_EDGE_TYPES: readonly EdgeType[] = [
  "mentions",
  "part_of",
  "explains",
  "example_of",
  "counterexample_of",
  "uses",
  "defines",
  "analogous_to",
  "contrasts_with",
  "prerequisite_of", // Export as reference, not editable
];

/**
 * Generate body content for a node
 */
export function generateBodyContent(
  node: LKGCNode,
  outgoingEdges: readonly LKGCEdge[],
  nodeResolver: (nodeId: NodeId) => LKGCNode | undefined,
): string {
  const sections: string[] = [];

  // Title as H1
  sections.push(`# ${node.title}\n`);

  // Description if present
  if (node.description) {
    sections.push(`${node.description}\n`);
  }

  // Node-type specific content
  const typeContent = generateNodeTypeContent(node);
  if (typeContent) {
    sections.push(typeContent);
  }

  // Related links section (generated from edges)
  const relatedLinks = generateRelatedLinksSection(outgoingEdges, nodeResolver);
  if (relatedLinks) {
    sections.push(relatedLinks);
  }

  return sections.join("\n");
}

/**
 * Generate content specific to node type
 */
function generateNodeTypeContent(node: LKGCNode): string | undefined {
  switch (node.nodeType) {
    case "note":
      return (node as { content?: string }).content || "";

    case "concept":
      return generateConceptContent(node);

    case "term":
      return generateTermContent(node);

    case "fact":
      return generateFactContent(node);

    case "formula":
      return generateFormulaContent(node);

    case "procedure":
      return generateProcedureContent(node);

    case "example":
    case "counterexample":
      return generateExampleContent(node);

    case "question":
      return generateQuestionContent(node);

    case "strategy":
      return generateStrategyContent(node);

    case "goal":
    case "learning_path":
      return generateGoalContent(node);

    default:
      return undefined;
  }
}

/**
 * Generate content for concept nodes
 */
function generateConceptContent(node: LKGCNode): string {
  const concept = node as {
    definition?: string;
    intuition?: string;
    domain?: string;
    abstractionLevel?: number;
  };

  const parts: string[] = [];

  if (concept.definition) {
    parts.push(`## Definition\n\n${concept.definition}\n`);
  }

  if (concept.intuition) {
    parts.push(`## Intuition\n\n${concept.intuition}\n`);
  }

  return parts.join("\n");
}

/**
 * Generate content for term nodes
 */
function generateTermContent(node: LKGCNode): string {
  const term = node as {
    term?: string;
    definitions?: readonly string[];
    pronunciation?: string;
    examples?: readonly string[];
    etymology?: string;
  };

  const parts: string[] = [];

  if (term.definitions && term.definitions.length > 0) {
    parts.push(`## Definitions\n`);
    for (const def of term.definitions) {
      parts.push(`- ${def}`);
    }
    parts.push("");
  }

  if (term.pronunciation) {
    parts.push(`**Pronunciation:** ${term.pronunciation}\n`);
  }

  if (term.examples && term.examples.length > 0) {
    parts.push(`## Examples\n`);
    for (const ex of term.examples) {
      parts.push(`- ${ex}`);
    }
    parts.push("");
  }

  if (term.etymology) {
    parts.push(`## Etymology\n\n${term.etymology}\n`);
  }

  return parts.join("\n");
}

/**
 * Generate content for fact nodes
 */
function generateFactContent(node: LKGCNode): string {
  const fact = node as {
    claim?: string;
    evidence?: string;
    citation?: string;
  };

  const parts: string[] = [];

  if (fact.claim) {
    parts.push(`## Claim\n\n${fact.claim}\n`);
  }

  if (fact.evidence) {
    parts.push(`## Evidence\n\n${fact.evidence}\n`);
  }

  if (fact.citation) {
    parts.push(`> Source: ${fact.citation}\n`);
  }

  return parts.join("\n");
}

/**
 * Generate content for formula nodes
 */
function generateFormulaContent(node: LKGCNode): string {
  const formula = node as {
    latex?: string;
    plainText?: string;
    variables?: readonly { symbol: string; meaning: string; unit?: string }[];
    derivation?: string;
  };

  const parts: string[] = [];

  if (formula.latex) {
    parts.push(`## Formula\n\n$$${formula.latex}$$\n`);
  }

  if (formula.plainText) {
    parts.push(`**Plain text:** ${formula.plainText}\n`);
  }

  if (formula.variables && formula.variables.length > 0) {
    parts.push(`## Variables\n`);
    for (const v of formula.variables) {
      let varLine = `- **${v.symbol}**: ${v.meaning}`;
      if (v.unit) varLine += ` (${v.unit})`;
      parts.push(varLine);
    }
    parts.push("");
  }

  if (formula.derivation) {
    parts.push(`## Derivation\n\n${formula.derivation}\n`);
  }

  return parts.join("\n");
}

/**
 * Generate content for procedure nodes
 */
function generateProcedureContent(node: LKGCNode): string {
  const procedure = node as {
    steps?: readonly {
      order: number;
      instruction: string;
      explanation?: string;
    }[];
    prerequisites?: readonly string[];
    outcome?: string;
    commonMistakes?: readonly string[];
  };

  const parts: string[] = [];

  if (procedure.prerequisites && procedure.prerequisites.length > 0) {
    parts.push(`## Prerequisites\n`);
    for (const prereq of procedure.prerequisites) {
      parts.push(`- ${prereq}`);
    }
    parts.push("");
  }

  if (procedure.steps && procedure.steps.length > 0) {
    parts.push(`## Steps\n`);
    const sortedSteps = [...procedure.steps].sort((a, b) => a.order - b.order);
    for (const step of sortedSteps) {
      parts.push(`${step.order}. ${step.instruction}`);
      if (step.explanation) {
        parts.push(`   - ${step.explanation}`);
      }
    }
    parts.push("");
  }

  if (procedure.outcome) {
    parts.push(`## Expected Outcome\n\n${procedure.outcome}\n`);
  }

  if (procedure.commonMistakes && procedure.commonMistakes.length > 0) {
    parts.push(`## Common Mistakes\n`);
    for (const mistake of procedure.commonMistakes) {
      parts.push(`- ⚠️ ${mistake}`);
    }
    parts.push("");
  }

  return parts.join("\n");
}

/**
 * Generate content for example/counterexample nodes
 */
function generateExampleContent(node: LKGCNode): string {
  const example = node as {
    content?: string;
    illustrates?: string;
    counters?: string;
    explanation?: string;
  };

  const parts: string[] = [];

  const label = node.nodeType === "counterexample" ? "Counters" : "Illustrates";
  const target = example.illustrates || example.counters;

  if (target) {
    parts.push(`**${label}:** ${target}\n`);
  }

  if (example.content) {
    parts.push(`## Content\n\n${example.content}\n`);
  }

  if (example.explanation) {
    parts.push(`## Explanation\n\n${example.explanation}\n`);
  }

  return parts.join("\n");
}

/**
 * Generate content for question nodes
 */
function generateQuestionContent(node: LKGCNode): string {
  // Questions may have various structures - export what's available
  const question = node as {
    question?: string;
    answer?: string;
    hints?: readonly string[];
  };

  const parts: string[] = [];

  if (question.question) {
    parts.push(`## Question\n\n${question.question}\n`);
  }

  if (question.hints && question.hints.length > 0) {
    parts.push(`## Hints\n`);
    for (let i = 0; i < question.hints.length; i++) {
      parts.push(`${i + 1}. ${question.hints[i]}`);
    }
    parts.push("");
  }

  if (question.answer) {
    parts.push(`## Answer\n\n${question.answer}\n`);
  }

  return parts.join("\n");
}

/**
 * Generate content for strategy nodes
 */
function generateStrategyContent(node: LKGCNode): string {
  const strategy = node as {
    strategyType?: string;
    technique?: string;
    applicability?: string;
    effectiveness?: number;
  };

  const parts: string[] = [];

  if (strategy.strategyType) {
    parts.push(`**Type:** ${strategy.strategyType}\n`);
  }

  if (strategy.technique) {
    parts.push(`## Technique\n\n${strategy.technique}\n`);
  }

  if (strategy.applicability) {
    parts.push(`## When to Use\n\n${strategy.applicability}\n`);
  }

  return parts.join("\n");
}

/**
 * Generate content for goal/learning_path nodes
 */
function generateGoalContent(node: LKGCNode): string {
  const goal = node as {
    targetMastery?: number;
    deadline?: number;
    progress?: number;
    milestones?: readonly string[];
  };

  const parts: string[] = [];

  if (goal.targetMastery !== undefined) {
    parts.push(
      `**Target Mastery:** ${Math.round(goal.targetMastery * 100)}%\n`,
    );
  }

  if (goal.deadline) {
    parts.push(
      `**Deadline:** ${new Date(goal.deadline).toISOString().split("T")[0]}\n`,
    );
  }

  if (goal.progress !== undefined) {
    parts.push(`**Progress:** ${Math.round(goal.progress * 100)}%\n`);
  }

  if (goal.milestones && goal.milestones.length > 0) {
    parts.push(`## Milestones\n`);
    for (const milestone of goal.milestones) {
      parts.push(`- [ ] ${milestone}`);
    }
    parts.push("");
  }

  return parts.join("\n");
}

/**
 * Generate related links section from edges
 */
function generateRelatedLinksSection(
  edges: readonly LKGCEdge[],
  nodeResolver: (nodeId: NodeId) => LKGCNode | undefined,
): string | undefined {
  const linkableEdges = edges.filter((e) =>
    WIKILINK_EDGE_TYPES.includes(e.edgeType),
  );

  if (linkableEdges.length === 0) {
    return undefined;
  }

  const parts: string[] = [
    "",
    "---",
    "",
    "## Related",
    "",
    "<!-- LKGC-GENERATED: The following links are generated from the knowledge graph -->",
    "",
  ];

  // Group by edge type
  const byType = new Map<EdgeType, LKGCEdge[]>();
  for (const edge of linkableEdges) {
    const existing = byType.get(edge.edgeType) || [];
    existing.push(edge);
    byType.set(edge.edgeType, existing);
  }

  for (const [edgeType, typeEdges] of byType) {
    const label = formatEdgeTypeLabel(edgeType);
    parts.push(`### ${label}`);
    parts.push("");

    for (const edge of typeEdges) {
      const targetNode = nodeResolver(edge.targetId);
      if (targetNode) {
        const wikilink = `[[${targetNode.title}]]`;
        parts.push(`- ${wikilink}`);
      }
    }
    parts.push("");
  }

  parts.push("<!-- END LKGC-GENERATED -->");

  return parts.join("\n");
}

/**
 * Format edge type as human-readable label
 */
function formatEdgeTypeLabel(edgeType: EdgeType): string {
  const labels: Partial<Record<EdgeType, string>> = {
    mentions: "Mentions",
    part_of: "Part Of",
    explains: "Explains",
    example_of: "Examples",
    counterexample_of: "Counterexamples",
    uses: "Uses",
    defines: "Defines",
    analogous_to: "Analogous To",
    contrasts_with: "Contrasts With",
    prerequisite_of: "Prerequisites For",
  };

  return (
    labels[edgeType] ||
    edgeType.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
  );
}

// =============================================================================
// FILE PATH GENERATION
// =============================================================================

/**
 * Generate file path for a node based on naming strategy
 */
export function generateFilePath(
  node: LKGCNode,
  config: MarkdownMirrorConfig,
): string {
  const sanitizedTitle = sanitizeFileName(node.title);

  let fileName: string;
  switch (config.fileNamingStrategy) {
    case "title_with_id":
      fileName = `${sanitizedTitle} (${node.id}).md`;
      break;
    case "id_prefixed":
      fileName = `${node.id} - ${sanitizedTitle}.md`;
      break;
    case "title_only":
    default:
      fileName = `${sanitizedTitle}.md`;
      break;
  }

  // Add subdirectory if configured
  if (config.lkgcSubdirectory) {
    return `${config.lkgcSubdirectory}/${fileName}`;
  }

  return fileName;
}

/**
 * Sanitize a string for use as a file name
 */
function sanitizeFileName(title: string): string {
  return title
    .replace(/[<>:"/\\|?*]/g, "") // Remove invalid characters
    .replace(/\s+/g, " ") // Normalize whitespace
    .trim()
    .slice(0, 200); // Limit length
}

// =============================================================================
// MARKDOWN EXPORTER CLASS
// =============================================================================

/**
 * Result of an export operation
 */
export interface ExportResult {
  readonly success: boolean;
  readonly nodeId: NodeId;
  readonly filePath: string;
  readonly contentHash: ContentHash;
  readonly content: string;
  readonly error?: string;
  readonly warnings: readonly string[];
}

/**
 * Exporter dependencies
 */
export interface ExporterDependencies {
  /** Resolve node by ID */
  readonly getNode: (nodeId: NodeId) => LKGCNode | undefined;

  /** Get outgoing edges for a node */
  readonly getOutgoingEdges: (nodeId: NodeId) => readonly LKGCEdge[];

  /** Get mastery state for a node (optional) */
  readonly getMasteryState?: (nodeId: NodeId) => MasteryState | undefined;
}

/**
 * Markdown exporter for LKGC nodes
 */
export class MarkdownExporter {
  private readonly config: MarkdownMirrorConfig;
  private readonly deps: ExporterDependencies;

  constructor(config: MarkdownMirrorConfig, deps: ExporterDependencies) {
    this.config = config;
    this.deps = deps;
  }

  /**
   * Export a single node to Markdown
   */
  export(nodeId: NodeId): ExportResult {
    const warnings: string[] = [];

    // Get the node
    const node = this.deps.getNode(nodeId);
    if (!node) {
      return {
        success: false,
        nodeId,
        filePath: "",
        contentHash: "" as ContentHash,
        content: "",
        error: `Node not found: ${nodeId}`,
        warnings,
      };
    }

    // Check if exportable
    if (!isExportableNodeType(node.nodeType)) {
      return {
        success: false,
        nodeId,
        filePath: "",
        contentHash: "" as ContentHash,
        content: "",
        error: `Node type not exportable: ${node.nodeType}`,
        warnings,
      };
    }

    // Check if archived
    if (
      node.archivedAt &&
      !this.config.exportableNodeTypes.includes(
        node.nodeType as ExportableNodeType,
      )
    ) {
      warnings.push(`Node is archived`);
    }

    // Get mastery state (optional)
    const masteryState = this.deps.getMasteryState?.(nodeId);

    // Generate frontmatter
    const frontmatter = generateFrontmatter(node, masteryState);
    const frontmatterYaml = serializeFrontmatter(frontmatter);

    // Get edges for wikilinks
    const edges = this.deps.getOutgoingEdges(nodeId);

    // Generate body content
    const body = generateBodyContent(node, edges, this.deps.getNode);

    // Combine
    const content = `${frontmatterYaml}\n\n${body}`;

    // Generate file path
    const filePath = generateFilePath(node, this.config);

    // Generate content hash
    const contentHash = generateContentHash(content);

    return {
      success: true,
      nodeId,
      filePath,
      contentHash,
      content,
      warnings,
    };
  }

  /**
   * Export multiple nodes
   */
  exportMany(nodeIds: readonly NodeId[]): readonly ExportResult[] {
    return nodeIds.map((id) => this.export(id));
  }

  /**
   * Get all exportable nodes
   */
  getExportableNodes(allNodeIds: readonly NodeId[]): readonly NodeId[] {
    return allNodeIds.filter((id) => {
      const node = this.deps.getNode(id);
      return node && isExportableNodeType(node.nodeType) && !node.archivedAt;
    });
  }
}

// =============================================================================
// FACTORY FUNCTION
// =============================================================================

/**
 * Create a Markdown exporter with dependencies
 */
export function createMarkdownExporter(
  config: Partial<MarkdownMirrorConfig>,
  deps: ExporterDependencies,
): MarkdownExporter {
  const fullConfig = { ...DEFAULT_MIRROR_CONFIG, ...config };
  return new MarkdownExporter(fullConfig, deps);
}
