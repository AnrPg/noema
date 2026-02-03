// =============================================================================
// DECK QUERY BUILDER TYPES
// =============================================================================
// Type definitions for the visual deck query builder

// =============================================================================
// QUERY FILTER TYPES
// =============================================================================

/**
 * Filter operators for different field types
 */
export type StringOperator =
  | "equals"
  | "not_equals"
  | "contains"
  | "not_contains"
  | "starts_with"
  | "ends_with"
  | "matches_regex";

export type NumberOperator =
  | "equals"
  | "not_equals"
  | "greater_than"
  | "less_than"
  | "greater_or_equal"
  | "less_or_equal"
  | "between";

export type DateOperator =
  | "equals"
  | "before"
  | "after"
  | "between"
  | "within_days"
  | "older_than_days";

export type ArrayOperator =
  | "contains"
  | "not_contains"
  | "contains_all"
  | "contains_any"
  | "is_empty"
  | "is_not_empty";

export type BooleanOperator = "is_true" | "is_false";

/**
 * Filter field definitions
 */
export interface FilterField {
  id: string;
  label: string;
  description: string;
  type: "string" | "number" | "date" | "boolean" | "array" | "enum";
  operators: string[];
  enumValues?: { value: string; label: string }[];
  category: "card" | "face" | "scheduling" | "metadata" | "custom";
  icon: string;
}

/**
 * A single filter condition
 */
export interface FilterCondition {
  id: string;
  fieldId: string;
  operator: string;
  value: any;
  secondValue?: any; // For "between" operators
}

/**
 * Filter group with AND/OR logic
 */
export interface FilterGroup {
  id: string;
  logic: "and" | "or";
  conditions: FilterCondition[];
  groups: FilterGroup[];
}

/**
 * Sort configuration
 */
export interface SortConfig {
  fieldId: string;
  direction: "asc" | "desc";
}

/**
 * Complete deck query configuration
 */
export interface DeckQuery {
  id: string;
  name: string;
  description?: string;
  filters: FilterGroup;
  sorts: SortConfig[];
  limit?: number;
  includeSubdecks?: boolean;
  faceFilters?: FilterGroup; // Filters specific to face selection
}

// =============================================================================
// COMPONENT PROPS
// =============================================================================

/**
 * Query builder props
 */
export interface DeckQueryBuilderProps {
  /** Initial query to edit */
  initialQuery?: DeckQuery;
  /** Available decks for preview */
  deckIds?: string[];
  /** Callback when query is saved */
  onSave: (query: DeckQuery) => void;
  /** Callback when query builder is closed */
  onClose: () => void;
  /** Enable live preview */
  enablePreview?: boolean;
  /** Expertise level for progressive disclosure */
  expertiseLevel?: "novice" | "intermediate" | "advanced";
}

/**
 * Filter condition editor props
 */
export interface FilterConditionEditorProps {
  condition: FilterCondition;
  fields: FilterField[];
  onUpdate: (condition: FilterCondition) => void;
  onDelete: () => void;
}

/**
 * Filter group editor props
 */
export interface FilterGroupEditorProps {
  group: FilterGroup;
  fields: FilterField[];
  onUpdate: (group: FilterGroup) => void;
  onDelete?: () => void;
  isRoot?: boolean;
  depth?: number;
}

/**
 * Query preview props
 */
export interface QueryPreviewProps {
  query: DeckQuery;
  matchCount?: number;
  sampleCards?: QueryPreviewCard[];
  isLoading?: boolean;
  onRefresh?: () => void;
}

/**
 * Preview card data
 */
export interface QueryPreviewCard {
  id: string;
  title: string;
  faceCount: number;
  nextReview?: Date;
  stability?: number;
  difficulty?: number;
  tags: string[];
}

// =============================================================================
// FILTER FIELD DEFINITIONS
// =============================================================================

export const FILTER_FIELDS: FilterField[] = [
  // Card fields
  {
    id: "card.title",
    label: "Card Title",
    description: "The title/name of the card",
    type: "string",
    operators: ["contains", "not_contains", "equals", "starts_with", "ends_with"],
    category: "card",
    icon: "document-text-outline",
  },
  {
    id: "card.tags",
    label: "Tags",
    description: "Card tags",
    type: "array",
    operators: ["contains", "not_contains", "contains_all", "contains_any", "is_empty"],
    category: "card",
    icon: "pricetags-outline",
  },
  {
    id: "card.faceCount",
    label: "Face Count",
    description: "Number of faces on the card",
    type: "number",
    operators: ["equals", "greater_than", "less_than", "between"],
    category: "card",
    icon: "layers-outline",
  },
  {
    id: "card.createdAt",
    label: "Created Date",
    description: "When the card was created",
    type: "date",
    operators: ["before", "after", "between", "within_days"],
    category: "card",
    icon: "calendar-outline",
  },

  // Face fields
  {
    id: "face.type",
    label: "Face Type",
    description: "The type of card face",
    type: "enum",
    operators: ["equals", "not_equals"],
    enumValues: [
      { value: "recognition", label: "Recognition" },
      { value: "recall", label: "Recall" },
      { value: "cloze", label: "Cloze" },
      { value: "application", label: "Application" },
      { value: "synthesis", label: "Synthesis" },
      { value: "definition", label: "Definition" },
      { value: "true_false", label: "True/False" },
      { value: "problem_solving", label: "Problem Solving" },
    ],
    category: "face",
    icon: "shapes-outline",
  },
  {
    id: "face.depthLevel",
    label: "Cognitive Depth",
    description: "Bloom's taxonomy level",
    type: "enum",
    operators: ["equals", "not_equals", "greater_or_equal", "less_or_equal"],
    enumValues: [
      { value: "remember", label: "Remember" },
      { value: "understand", label: "Understand" },
      { value: "apply", label: "Apply" },
      { value: "analyze", label: "Analyze" },
      { value: "evaluate", label: "Evaluate" },
      { value: "create", label: "Create" },
    ],
    category: "face",
    icon: "trending-up-outline",
  },
  {
    id: "face.scaffolding",
    label: "Scaffolding Level",
    description: "Amount of scaffolding/hints",
    type: "number",
    operators: ["equals", "greater_than", "less_than"],
    category: "face",
    icon: "construct-outline",
  },
  {
    id: "face.hasHints",
    label: "Has Hints",
    description: "Whether the face has hints",
    type: "boolean",
    operators: ["is_true", "is_false"],
    category: "face",
    icon: "bulb-outline",
  },

  // Scheduling fields
  {
    id: "schedule.nextReview",
    label: "Next Review",
    description: "When the card is due for review",
    type: "date",
    operators: ["before", "after", "within_days", "older_than_days"],
    category: "scheduling",
    icon: "time-outline",
  },
  {
    id: "schedule.stability",
    label: "Stability",
    description: "Memory stability (FSRS)",
    type: "number",
    operators: ["greater_than", "less_than", "between"],
    category: "scheduling",
    icon: "shield-outline",
  },
  {
    id: "schedule.difficulty",
    label: "Difficulty",
    description: "Card difficulty rating",
    type: "number",
    operators: ["greater_than", "less_than", "between"],
    category: "scheduling",
    icon: "barbell-outline",
  },
  {
    id: "schedule.retrievability",
    label: "Retrievability",
    description: "Current memory strength",
    type: "number",
    operators: ["greater_than", "less_than", "between"],
    category: "scheduling",
    icon: "pulse-outline",
  },
  {
    id: "schedule.reviewCount",
    label: "Review Count",
    description: "Total number of reviews",
    type: "number",
    operators: ["equals", "greater_than", "less_than"],
    category: "scheduling",
    icon: "repeat-outline",
  },
  {
    id: "schedule.lapseCount",
    label: "Lapse Count",
    description: "Number of times forgotten",
    type: "number",
    operators: ["equals", "greater_than", "less_than"],
    category: "scheduling",
    icon: "alert-circle-outline",
  },
  {
    id: "schedule.state",
    label: "Card State",
    description: "Current learning state",
    type: "enum",
    operators: ["equals", "not_equals"],
    enumValues: [
      { value: "new", label: "New" },
      { value: "learning", label: "Learning" },
      { value: "review", label: "Review" },
      { value: "relearning", label: "Relearning" },
    ],
    category: "scheduling",
    icon: "flag-outline",
  },

  // Metadata fields
  {
    id: "meta.deck",
    label: "Deck",
    description: "Card's deck",
    type: "string",
    operators: ["equals", "not_equals", "contains"],
    category: "metadata",
    icon: "folder-outline",
  },
  {
    id: "meta.suspended",
    label: "Suspended",
    description: "Whether the card is suspended",
    type: "boolean",
    operators: ["is_true", "is_false"],
    category: "metadata",
    icon: "pause-circle-outline",
  },
  {
    id: "meta.buried",
    label: "Buried",
    description: "Whether the card is buried",
    type: "boolean",
    operators: ["is_true", "is_false"],
    category: "metadata",
    icon: "eye-off-outline",
  },
];

// =============================================================================
// OPERATOR METADATA
// =============================================================================

export const OPERATOR_METADATA: Record<
  string,
  { label: string; description: string; valueCount: number }
> = {
  // String operators
  equals: { label: "equals", description: "Exactly matches", valueCount: 1 },
  not_equals: { label: "does not equal", description: "Does not match", valueCount: 1 },
  contains: { label: "contains", description: "Contains the text", valueCount: 1 },
  not_contains: { label: "does not contain", description: "Does not contain", valueCount: 1 },
  starts_with: { label: "starts with", description: "Begins with", valueCount: 1 },
  ends_with: { label: "ends with", description: "Ends with", valueCount: 1 },
  matches_regex: { label: "matches pattern", description: "Matches regex", valueCount: 1 },

  // Number operators
  greater_than: { label: "greater than", description: ">", valueCount: 1 },
  less_than: { label: "less than", description: "<", valueCount: 1 },
  greater_or_equal: { label: "at least", description: ">=", valueCount: 1 },
  less_or_equal: { label: "at most", description: "<=", valueCount: 1 },
  between: { label: "between", description: "In range", valueCount: 2 },

  // Date operators
  before: { label: "before", description: "Earlier than", valueCount: 1 },
  after: { label: "after", description: "Later than", valueCount: 1 },
  within_days: { label: "within days", description: "In the next N days", valueCount: 1 },
  older_than_days: { label: "older than days", description: "More than N days ago", valueCount: 1 },

  // Array operators
  contains_all: { label: "contains all", description: "Has all of", valueCount: 1 },
  contains_any: { label: "contains any", description: "Has any of", valueCount: 1 },
  is_empty: { label: "is empty", description: "Has no items", valueCount: 0 },
  is_not_empty: { label: "is not empty", description: "Has items", valueCount: 0 },

  // Boolean operators
  is_true: { label: "is true", description: "Yes", valueCount: 0 },
  is_false: { label: "is false", description: "No", valueCount: 0 },
};

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Generate a unique ID for query elements
 */
export function generateQueryId(): string {
  return `q_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Create an empty filter condition
 */
export function createFilterCondition(fieldId?: string): FilterCondition {
  const field = FILTER_FIELDS.find((f) => f.id === fieldId) || FILTER_FIELDS[0];
  return {
    id: generateQueryId(),
    fieldId: field.id,
    operator: field.operators[0],
    value: field.type === "boolean" ? true : field.type === "number" ? 0 : "",
  };
}

/**
 * Create an empty filter group
 */
export function createFilterGroup(logic: "and" | "or" = "and"): FilterGroup {
  return {
    id: generateQueryId(),
    logic,
    conditions: [],
    groups: [],
  };
}

/**
 * Create an empty deck query
 */
export function createDeckQuery(): DeckQuery {
  return {
    id: generateQueryId(),
    name: "New Query",
    filters: createFilterGroup("and"),
    sorts: [],
    includeSubdecks: true,
  };
}

/**
 * Get filter fields by category
 */
export function getFieldsByCategory(
  category: FilterField["category"]
): FilterField[] {
  return FILTER_FIELDS.filter((f) => f.category === category);
}

/**
 * Validate a deck query
 */
export function validateDeckQuery(query: DeckQuery): string[] {
  const errors: string[] = [];

  if (!query.name.trim()) {
    errors.push("Query name is required");
  }

  const validateGroup = (group: FilterGroup, path: string) => {
    for (const condition of group.conditions) {
      const field = FILTER_FIELDS.find((f) => f.id === condition.fieldId);
      if (!field) {
        errors.push(`Invalid field in ${path}`);
      }
      const operatorMeta = OPERATOR_METADATA[condition.operator];
      if (
        operatorMeta?.valueCount > 0 &&
        (condition.value === undefined || condition.value === "")
      ) {
        errors.push(`Missing value for ${field?.label || "field"} in ${path}`);
      }
    }
    group.groups.forEach((g, i) => validateGroup(g, `${path}.group[${i}]`));
  };

  validateGroup(query.filters, "filters");

  return errors;
}
