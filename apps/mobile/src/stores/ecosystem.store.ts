// =============================================================================
// ECOSYSTEM STORE
// =============================================================================
// State management for Knowledge Ecosystem - Categories, Relationships, and Flows

import { create } from "zustand";
import { MMKV } from "react-native-mmkv";
import type {
  Category,
  CategoryId,
  CategorySummary,
  CategoryWithChildren,
  CategoryRelation,
  CategoryRelationType,
  CardCategoryParticipation,
  LearningMode,
  ViewLens,
  CategoryGraphNode,
  CategoryGraphEdge,
  TerritoryRegion,
  MaturityStage,
} from "@manthanein/shared";

const storage = new MMKV({ id: "ecosystem-storage" });

// =============================================================================
// TYPES
// =============================================================================

interface CategoryTreeNode extends CategorySummary {
  children: CategoryTreeNode[];
  isExpanded: boolean;
  isSelected: boolean;
}

interface NavigationState {
  mode: LearningMode;
  lens: ViewLens;
  focusedCategoryId?: CategoryId;
  selectedCategoryIds: CategoryId[];
  expandedCategoryIds: CategoryId[];
  breadcrumb: CategoryId[];
}

interface GraphVisualizationState {
  nodes: CategoryGraphNode[];
  edges: CategoryGraphEdge[];
  layout: "force" | "tree" | "radial" | "treemap";
  zoomLevel: number;
  panOffset: { x: number; y: number };
}

interface TerritoryMapState {
  regions: TerritoryRegion[];
  showFogOfWar: boolean;
  showMasteryHeatmap: boolean;
}

interface EcosystemState {
  // Data
  categories: Category[];
  categoryTree: CategoryTreeNode[];
  relations: CategoryRelation[];
  participations: Map<string, CardCategoryParticipation[]>; // cardId -> participations

  // Navigation
  navigation: NavigationState;

  // Visualization
  graph: GraphVisualizationState;
  territory: TerritoryMapState;

  // UI State
  isLoading: boolean;
  error: string | null;
  lastSyncedAt: Date | null;

  // Cache
  categorySummaryCache: Map<CategoryId, CategorySummary>;
}

interface EcosystemActions {
  // Data loading
  setCategories: (categories: Category[]) => void;
  setRelations: (relations: CategoryRelation[]) => void;
  addCategory: (category: Category) => void;
  updateCategory: (id: CategoryId, updates: Partial<Category>) => void;
  removeCategory: (id: CategoryId) => void;

  // Relations
  addRelation: (relation: CategoryRelation) => void;
  removeRelation: (relationId: string) => void;

  // Participations
  setCardParticipations: (
    cardId: string,
    participations: CardCategoryParticipation[],
  ) => void;
  addParticipation: (participation: CardCategoryParticipation) => void;
  removeParticipation: (participationId: string, cardId: string) => void;

  // Navigation
  setLearningMode: (mode: LearningMode) => void;
  setViewLens: (lens: ViewLens) => void;
  focusCategory: (categoryId: CategoryId | undefined) => void;
  selectCategory: (categoryId: CategoryId) => void;
  deselectCategory: (categoryId: CategoryId) => void;
  clearSelection: () => void;
  toggleCategoryExpanded: (categoryId: CategoryId) => void;
  navigateToCategory: (categoryId: CategoryId) => void;
  navigateUp: () => void;
  navigateToRoot: () => void;

  // Graph
  setGraphLayout: (layout: GraphVisualizationState["layout"]) => void;
  setGraphZoom: (zoom: number) => void;
  panGraph: (dx: number, dy: number) => void;
  resetGraphView: () => void;

  // Territory
  toggleFogOfWar: () => void;
  toggleMasteryHeatmap: () => void;

  // State
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setSyncedAt: (date: Date) => void;

  // Utilities
  getCategoryById: (id: CategoryId) => Category | undefined;
  getCategorySummary: (id: CategoryId) => CategorySummary | undefined;
  getChildCategories: (parentId?: CategoryId) => Category[];
  getCategoryPath: (id: CategoryId) => Category[];
  getRelatedCategories: (
    id: CategoryId,
    relationType?: CategoryRelationType,
  ) => Category[];
  getCardCategories: (cardId: string) => CardCategoryParticipation[];

  // Persistence
  persistState: () => void;
  loadPersistedState: () => void;
  clearPersistedState: () => void;
}

type EcosystemStore = EcosystemState & EcosystemActions;

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

function buildCategoryTree(
  categories: Category[],
  expandedIds: Set<CategoryId>,
  selectedIds: Set<CategoryId>,
): CategoryTreeNode[] {
  const categoryMap = new Map<CategoryId, Category>();
  categories.forEach((c) => categoryMap.set(c.id, c));

  const childrenMap = new Map<CategoryId | "root", Category[]>();
  childrenMap.set("root", []);

  categories.forEach((c) => {
    const parentKey = c.parentId || "root";
    if (!childrenMap.has(parentKey)) {
      childrenMap.set(parentKey, []);
    }
    childrenMap.get(parentKey)!.push(c);
  });

  function buildNode(category: Category): CategoryTreeNode {
    const children = (childrenMap.get(category.id) || [])
      .sort((a, b) => a.position - b.position)
      .map(buildNode);

    return {
      id: category.id,
      name: category.name,
      iconEmoji: category.iconEmoji,
      color: category.color,
      cardCount: category.cardCount,
      masteryScore: category.masteryScore,
      depth: category.depth,
      path: category.path,
      children,
      isExpanded: expandedIds.has(category.id),
      isSelected: selectedIds.has(category.id),
    };
  }

  return (childrenMap.get("root") || [])
    .sort((a, b) => a.position - b.position)
    .map(buildNode);
}

function categoryToSummary(category: Category): CategorySummary {
  return {
    id: category.id,
    name: category.name,
    iconEmoji: category.iconEmoji,
    color: category.color,
    cardCount: category.cardCount,
    masteryScore: category.masteryScore,
    depth: category.depth,
    path: category.path,
  };
}

function buildGraphData(
  categories: Category[],
  relations: CategoryRelation[],
): { nodes: CategoryGraphNode[]; edges: CategoryGraphEdge[] } {
  const nodes: CategoryGraphNode[] = categories.map((c) => ({
    id: c.id,
    name: c.name,
    iconEmoji: c.iconEmoji,
    color: c.color,
    cardCount: c.cardCount,
    masteryScore: c.masteryScore,
    maturityStage: c.maturityStage,
    depth: c.depth,
  }));

  const edges: CategoryGraphEdge[] = relations.map((r) => ({
    id: r.id,
    sourceId: r.sourceCategoryId,
    targetId: r.targetCategoryId,
    relationType: r.relationType,
    strength: r.strength,
    isDirectional: r.isDirectional,
  }));

  return { nodes, edges };
}

function buildTerritoryRegions(categories: Category[]): TerritoryRegion[] {
  // Simple treemap-like layout for territories
  const rootCategories = categories.filter((c) => !c.parentId);
  const childrenMap = new Map<CategoryId, Category[]>();

  categories.forEach((c) => {
    if (c.parentId) {
      if (!childrenMap.has(c.parentId)) {
        childrenMap.set(c.parentId, []);
      }
      childrenMap.get(c.parentId)!.push(c);
    }
  });

  function buildRegion(
    category: Category,
    x: number,
    y: number,
    width: number,
    height: number,
  ): TerritoryRegion {
    const children = childrenMap.get(category.id) || [];
    const childRegions: TerritoryRegion[] = [];

    if (children.length > 0) {
      // Simple horizontal split for children
      const childWidth = width / children.length;
      children.forEach((child, i) => {
        childRegions.push(
          buildRegion(
            child,
            x + i * childWidth,
            y + height * 0.2, // Offset for parent label
            childWidth,
            height * 0.8,
          ),
        );
      });
    }

    return {
      categoryId: category.id,
      name: category.name,
      color: category.color || "#6366f1",
      masteryScore: category.masteryScore,
      maturityStage: category.maturityStage,
      cardCount: category.cardCount,
      bounds: { x, y, width, height },
      children: childRegions,
      isCore:
        category.masteryScore > 0.8 &&
        category.maturityStage === "crystallization",
      isFrontier:
        category.masteryScore < 0.5 &&
        category.maturityStage !== "crystallization",
      isFogOfWar: category.cardCount === 0 && category.masteryScore === 0,
    };
  }

  // Layout root categories in a grid
  const cols = Math.ceil(Math.sqrt(rootCategories.length));
  const cellWidth = 100 / cols;
  const cellHeight = 100 / Math.ceil(rootCategories.length / cols);

  return rootCategories.map((cat, i) => {
    const row = Math.floor(i / cols);
    const col = i % cols;
    return buildRegion(
      cat,
      col * cellWidth,
      row * cellHeight,
      cellWidth,
      cellHeight,
    );
  });
}

// =============================================================================
// STORE
// =============================================================================

const initialState: EcosystemState = {
  categories: [],
  categoryTree: [],
  relations: [],
  participations: new Map(),

  navigation: {
    mode: "exploration",
    lens: "structure",
    focusedCategoryId: undefined,
    selectedCategoryIds: [],
    expandedCategoryIds: [],
    breadcrumb: [],
  },

  graph: {
    nodes: [],
    edges: [],
    layout: "force",
    zoomLevel: 1,
    panOffset: { x: 0, y: 0 },
  },

  territory: {
    regions: [],
    showFogOfWar: true,
    showMasteryHeatmap: true,
  },

  isLoading: false,
  error: null,
  lastSyncedAt: null,

  categorySummaryCache: new Map(),
};

export const useEcosystemStore = create<EcosystemStore>((set, get) => ({
  ...initialState,

  // =========================================================================
  // DATA LOADING
  // =========================================================================

  setCategories: (categories) => {
    const state = get();
    const expandedIds = new Set(state.navigation.expandedCategoryIds);
    const selectedIds = new Set(state.navigation.selectedCategoryIds);

    const categoryTree = buildCategoryTree(
      categories,
      expandedIds,
      selectedIds,
    );
    const { nodes, edges } = buildGraphData(categories, state.relations);
    const regions = buildTerritoryRegions(categories);

    // Build summary cache
    const summaryCache = new Map<CategoryId, CategorySummary>();
    categories.forEach((c) => summaryCache.set(c.id, categoryToSummary(c)));

    set({
      categories,
      categoryTree,
      graph: { ...state.graph, nodes, edges },
      territory: { ...state.territory, regions },
      categorySummaryCache: summaryCache,
    });
  },

  setRelations: (relations) => {
    const state = get();
    const { nodes, edges } = buildGraphData(state.categories, relations);

    set({
      relations,
      graph: { ...state.graph, nodes, edges },
    });
  },

  addCategory: (category) => {
    const state = get();
    const categories = [...state.categories, category];
    get().setCategories(categories);
  },

  updateCategory: (id, updates) => {
    const state = get();
    const categories = state.categories.map((c) =>
      c.id === id ? { ...c, ...updates } : c,
    );
    get().setCategories(categories);
  },

  removeCategory: (id) => {
    const state = get();
    const categories = state.categories.filter((c) => c.id !== id);
    const relations = state.relations.filter(
      (r) => r.sourceCategoryId !== id && r.targetCategoryId !== id,
    );
    get().setCategories(categories);
    get().setRelations(relations);
  },

  // =========================================================================
  // RELATIONS
  // =========================================================================

  addRelation: (relation) => {
    const state = get();
    const relations = [...state.relations, relation];
    get().setRelations(relations);
  },

  removeRelation: (relationId) => {
    const state = get();
    const relations = state.relations.filter((r) => r.id !== relationId);
    get().setRelations(relations);
  },

  // =========================================================================
  // PARTICIPATIONS
  // =========================================================================

  setCardParticipations: (cardId, participations) => {
    set((state) => {
      const newParticipations = new Map(state.participations);
      newParticipations.set(cardId, participations);
      return { participations: newParticipations };
    });
  },

  addParticipation: (participation) => {
    set((state) => {
      const newParticipations = new Map(state.participations);
      const existing = newParticipations.get(participation.cardId) || [];
      newParticipations.set(participation.cardId, [...existing, participation]);
      return { participations: newParticipations };
    });
  },

  removeParticipation: (participationId, cardId) => {
    set((state) => {
      const newParticipations = new Map(state.participations);
      const existing = newParticipations.get(cardId) || [];
      newParticipations.set(
        cardId,
        existing.filter((p) => p.id !== participationId),
      );
      return { participations: newParticipations };
    });
  },

  // =========================================================================
  // NAVIGATION
  // =========================================================================

  setLearningMode: (mode) => {
    set((state) => ({
      navigation: { ...state.navigation, mode },
    }));
  },

  setViewLens: (lens) => {
    set((state) => ({
      navigation: { ...state.navigation, lens },
    }));
  },

  focusCategory: (categoryId) => {
    set((state) => ({
      navigation: { ...state.navigation, focusedCategoryId: categoryId },
    }));
  },

  selectCategory: (categoryId) => {
    set((state) => {
      const selectedIds = state.navigation.selectedCategoryIds;
      if (selectedIds.includes(categoryId)) return state;

      return {
        navigation: {
          ...state.navigation,
          selectedCategoryIds: [...selectedIds, categoryId],
        },
      };
    });
  },

  deselectCategory: (categoryId) => {
    set((state) => ({
      navigation: {
        ...state.navigation,
        selectedCategoryIds: state.navigation.selectedCategoryIds.filter(
          (id) => id !== categoryId,
        ),
      },
    }));
  },

  clearSelection: () => {
    set((state) => ({
      navigation: {
        ...state.navigation,
        selectedCategoryIds: [],
      },
    }));
  },

  toggleCategoryExpanded: (categoryId) => {
    set((state) => {
      const expandedIds = new Set(state.navigation.expandedCategoryIds);
      if (expandedIds.has(categoryId)) {
        expandedIds.delete(categoryId);
      } else {
        expandedIds.add(categoryId);
      }

      const expandedArray = Array.from(expandedIds);
      const selectedIds = new Set(state.navigation.selectedCategoryIds);
      const categoryTree = buildCategoryTree(
        state.categories,
        expandedIds,
        selectedIds,
      );

      return {
        navigation: {
          ...state.navigation,
          expandedCategoryIds: expandedArray,
        },
        categoryTree,
      };
    });
  },

  navigateToCategory: (categoryId) => {
    const state = get();
    const category = state.categories.find((c) => c.id === categoryId);
    if (!category) return;

    // Build breadcrumb from path
    const breadcrumb = category.path.length > 0 ? category.path : [categoryId];

    set((state) => ({
      navigation: {
        ...state.navigation,
        focusedCategoryId: categoryId,
        breadcrumb,
      },
    }));
  },

  navigateUp: () => {
    const state = get();
    const { breadcrumb } = state.navigation;

    if (breadcrumb.length <= 1) {
      // At root, clear focus
      set((state) => ({
        navigation: {
          ...state.navigation,
          focusedCategoryId: undefined,
          breadcrumb: [],
        },
      }));
    } else {
      // Go up one level
      const newBreadcrumb = breadcrumb.slice(0, -1);
      set((state) => ({
        navigation: {
          ...state.navigation,
          focusedCategoryId: newBreadcrumb[newBreadcrumb.length - 1],
          breadcrumb: newBreadcrumb,
        },
      }));
    }
  },

  navigateToRoot: () => {
    set((state) => ({
      navigation: {
        ...state.navigation,
        focusedCategoryId: undefined,
        breadcrumb: [],
      },
    }));
  },

  // =========================================================================
  // GRAPH
  // =========================================================================

  setGraphLayout: (layout) => {
    set((state) => ({
      graph: { ...state.graph, layout },
    }));
  },

  setGraphZoom: (zoomLevel) => {
    set((state) => ({
      graph: {
        ...state.graph,
        zoomLevel: Math.max(0.1, Math.min(3, zoomLevel)),
      },
    }));
  },

  panGraph: (dx, dy) => {
    set((state) => ({
      graph: {
        ...state.graph,
        panOffset: {
          x: state.graph.panOffset.x + dx,
          y: state.graph.panOffset.y + dy,
        },
      },
    }));
  },

  resetGraphView: () => {
    set((state) => ({
      graph: {
        ...state.graph,
        zoomLevel: 1,
        panOffset: { x: 0, y: 0 },
      },
    }));
  },

  // =========================================================================
  // TERRITORY
  // =========================================================================

  toggleFogOfWar: () => {
    set((state) => ({
      territory: {
        ...state.territory,
        showFogOfWar: !state.territory.showFogOfWar,
      },
    }));
  },

  toggleMasteryHeatmap: () => {
    set((state) => ({
      territory: {
        ...state.territory,
        showMasteryHeatmap: !state.territory.showMasteryHeatmap,
      },
    }));
  },

  // =========================================================================
  // STATE
  // =========================================================================

  setLoading: (isLoading) => set({ isLoading }),

  setError: (error) => set({ error }),

  setSyncedAt: (date) => set({ lastSyncedAt: date }),

  // =========================================================================
  // UTILITIES
  // =========================================================================

  getCategoryById: (id) => {
    return get().categories.find((c) => c.id === id);
  },

  getCategorySummary: (id) => {
    return get().categorySummaryCache.get(id);
  },

  getChildCategories: (parentId) => {
    return get()
      .categories.filter((c) => c.parentId === parentId)
      .sort((a, b) => a.position - b.position);
  },

  getCategoryPath: (id) => {
    const state = get();
    const category = state.categories.find((c) => c.id === id);
    if (!category) return [];

    const path: Category[] = [];
    for (const pathId of category.path) {
      const cat = state.categories.find((c) => c.id === pathId);
      if (cat) path.push(cat);
    }
    return path;
  },

  getRelatedCategories: (id, relationType) => {
    const state = get();
    const relatedIds = new Set<CategoryId>();

    state.relations.forEach((r) => {
      if (relationType && r.relationType !== relationType) return;

      if (r.sourceCategoryId === id) {
        relatedIds.add(r.targetCategoryId);
      }
      if (r.targetCategoryId === id && !r.isDirectional) {
        relatedIds.add(r.sourceCategoryId);
      }
    });

    return state.categories.filter((c) => relatedIds.has(c.id));
  },

  getCardCategories: (cardId) => {
    return get().participations.get(cardId) || [];
  },

  // =========================================================================
  // PERSISTENCE
  // =========================================================================

  persistState: () => {
    const state = get();
    storage.set(
      "navigation",
      JSON.stringify({
        mode: state.navigation.mode,
        lens: state.navigation.lens,
        expandedCategoryIds: state.navigation.expandedCategoryIds,
      }),
    );
    storage.set(
      "graph",
      JSON.stringify({
        layout: state.graph.layout,
      }),
    );
    storage.set(
      "territory",
      JSON.stringify({
        showFogOfWar: state.territory.showFogOfWar,
        showMasteryHeatmap: state.territory.showMasteryHeatmap,
      }),
    );
  },

  loadPersistedState: () => {
    try {
      const navigationStr = storage.getString("navigation");
      const graphStr = storage.getString("graph");
      const territoryStr = storage.getString("territory");

      const updates: Partial<EcosystemState> = {};

      if (navigationStr) {
        const nav = JSON.parse(navigationStr);
        updates.navigation = {
          ...initialState.navigation,
          mode: nav.mode || "exploration",
          lens: nav.lens || "structure",
          expandedCategoryIds: nav.expandedCategoryIds || [],
        };
      }

      if (graphStr) {
        const graph = JSON.parse(graphStr);
        updates.graph = {
          ...initialState.graph,
          layout: graph.layout || "force",
        };
      }

      if (territoryStr) {
        const territory = JSON.parse(territoryStr);
        updates.territory = {
          ...initialState.territory,
          showFogOfWar: territory.showFogOfWar ?? true,
          showMasteryHeatmap: territory.showMasteryHeatmap ?? true,
        };
      }

      set(updates);
    } catch (e) {
      console.error("Failed to load ecosystem state:", e);
    }
  },

  clearPersistedState: () => {
    storage.delete("navigation");
    storage.delete("graph");
    storage.delete("territory");
    set(initialState);
  },
}));

// =============================================================================
// SELECTORS
// =============================================================================

export const selectCategories = (state: EcosystemStore) => state.categories;
export const selectCategoryTree = (state: EcosystemStore) => state.categoryTree;
export const selectRelations = (state: EcosystemStore) => state.relations;
export const selectNavigation = (state: EcosystemStore) => state.navigation;
export const selectGraph = (state: EcosystemStore) => state.graph;
export const selectTerritory = (state: EcosystemStore) => state.territory;
export const selectIsLoading = (state: EcosystemStore) => state.isLoading;
export const selectError = (state: EcosystemStore) => state.error;

export const selectFocusedCategory = (state: EcosystemStore) => {
  const { focusedCategoryId } = state.navigation;
  if (!focusedCategoryId) return undefined;
  return state.categories.find((c) => c.id === focusedCategoryId);
};

export const selectSelectedCategories = (state: EcosystemStore) => {
  const { selectedCategoryIds } = state.navigation;
  return state.categories.filter((c) => selectedCategoryIds.includes(c.id));
};

export const selectRootCategories = (state: EcosystemStore) => {
  return state.categories
    .filter((c) => !c.parentId)
    .sort((a, b) => a.position - b.position);
};

export const selectPinnedCategories = (state: EcosystemStore) => {
  return state.categories.filter((c) => c.isPinned);
};

export const selectRecentCategories = (state: EcosystemStore) => {
  return [...state.categories]
    .filter((c) => c.lastStudiedAt)
    .sort(
      (a, b) =>
        new Date(b.lastStudiedAt!).getTime() -
        new Date(a.lastStudiedAt!).getTime(),
    )
    .slice(0, 10);
};

// =============================================================================
// LENS FEATURE SELECTORS
// =============================================================================

/**
 * Select categories as interpretive lenses (with semantic intent)
 */
export const selectLenses = (state: EcosystemStore) => {
  return state.categories.map((c) => ({
    id: c.id,
    name: c.name,
    iconEmoji: c.iconEmoji,
    color: c.color,
    semanticIntent: (c as any).semanticIntent || "declarative",
    interpretationPriority: (c as any).interpretationPriority || "standard",
    primaryLearningGoals: (c as any).primaryLearningGoals || [],
    isActiveLens: state.navigation.focusedCategoryId === c.id,
  }));
};

/**
 * Select categories by semantic intent (for filtering)
 */
export const selectCategoriesByIntent = (
  state: EcosystemStore,
  intent:
    | "declarative"
    | "procedural"
    | "conditional"
    | "metacognitive"
    | "heuristic",
) => {
  return state.categories.filter((c) => (c as any).semanticIntent === intent);
};

/**
 * Select active emphasis rules for the focused category
 */
export const selectActiveEmphasisRules = (state: EcosystemStore) => {
  const { focusedCategoryId } = state.navigation;
  if (!focusedCategoryId) return [];

  // This would be populated from API call
  // Placeholder for now - actual rules stored elsewhere
  return [];
};

/**
 * Select cards that participate in multiple contexts
 */
export const selectMultiContextCards = (state: EcosystemStore) => {
  const multiContextCards: string[] = [];

  state.participations.forEach((participations, cardId) => {
    if (participations.length > 1) {
      multiContextCards.push(cardId);
    }
  });

  return multiContextCards;
};

/**
 * Select the learning path for the focused category
 */
export const selectLearningPath = (state: EcosystemStore) => {
  const { focusedCategoryId } = state.navigation;
  if (!focusedCategoryId) return [];

  const focused = state.categories.find((c) => c.id === focusedCategoryId);
  if (!focused) return [];

  // Build path from prerequisites to focused category
  const path: CategorySummary[] = [];

  // Find prerequisite relations
  const prerequisites = state.relations.filter(
    (r) =>
      r.targetCategoryId === focusedCategoryId &&
      r.relationType === "prepares_for",
  );

  prerequisites.forEach((rel) => {
    const prereq = state.categories.find((c) => c.id === rel.sourceCategoryId);
    if (prereq) {
      path.push(categoryToSummary(prereq));
    }
  });

  // Add focused category
  path.push(categoryToSummary(focused));

  // Find dependent categories
  const dependents = state.relations.filter(
    (r) =>
      r.sourceCategoryId === focusedCategoryId &&
      r.relationType === "prepares_for",
  );

  dependents.forEach((rel) => {
    const dep = state.categories.find((c) => c.id === rel.targetCategoryId);
    if (dep) {
      path.push(categoryToSummary(dep));
    }
  });

  return path;
};

/**
 * Lens node type for hierarchy representation
 */
export interface LensNode {
  id: string;
  name: string;
  semanticIntent: string;
  children: LensNode[];
  cardCount: number;
  masteryScore: number;
}

/**
 * Select lens hierarchy (categories as nested interpretation contexts)
 */
export const selectLensHierarchy = (state: EcosystemStore): LensNode[] => {
  const buildLensNode = (category: Category): LensNode => {
    const children = state.categories
      .filter((c) => c.parentId === category.id)
      .map(buildLensNode);

    return {
      id: category.id,
      name: category.name,
      semanticIntent: (category as any).semanticIntent || "declarative",
      children,
      cardCount: category.cardCount,
      masteryScore: category.masteryScore,
    };
  };

  return state.categories.filter((c) => !c.parentId).map(buildLensNode);
};

/**
 * Get the current lens context for card presentation
 */
export const selectCurrentLensContext = (state: EcosystemStore) => {
  const { focusedCategoryId, lens, mode } = state.navigation;

  if (!focusedCategoryId) {
    return null;
  }

  const category = state.categories.find((c) => c.id === focusedCategoryId);
  if (!category) return null;

  return {
    categoryId: category.id,
    categoryName: category.name,
    semanticIntent: (category as any).semanticIntent || "declarative",
    interpretationPriority:
      (category as any).interpretationPriority || "standard",
    visualIdentityLayer: (category as any).visualIdentityLayer || {},
    primaryLearningGoals: (category as any).primaryLearningGoals || [],
    viewLens: lens,
    learningMode: mode,
  };
};

// =============================================================================
// LENS-BASED SELECTORS (Category = Lens paradigm)
// =============================================================================

/**
 * Select categories grouped by their semantic intent
 * Useful for the Lens view to show categories by purpose
 */
export const selectCategoriesBySemanticIntent = (state: EcosystemStore) => {
  type SemanticIntent =
    | "mastery"
    | "reference"
    | "exploration"
    | "connection"
    | "application";

  const grouped: Record<SemanticIntent, Category[]> = {
    mastery: [],
    reference: [],
    exploration: [],
    connection: [],
    application: [],
  };

  state.categories.forEach((cat) => {
    const intent = ((cat as any).semanticIntent ||
      "exploration") as SemanticIntent;
    if (grouped[intent]) {
      grouped[intent].push(cat);
    }
  });

  return grouped;
};

/**
 * Select all lenses (categories) that a card participates in
 * Returns lens information including emphasis and annotations
 */
export const selectLensesForCard =
  (cardId: string) => (state: EcosystemStore) => {
    const participations = state.participations.get(cardId) || [];

    return participations.map((participation) => {
      const category = state.categories.find(
        (c) => c.id === participation.categoryId,
      );
      return {
        categoryId: participation.categoryId,
        categoryName: category?.name || "Unknown",
        categoryColor: category?.color || "#6366f1",
        categoryEmoji: category?.iconEmoji || "📚",
        semanticIntent: (category as any)?.semanticIntent || "exploration",
        semanticRole: participation.semanticRole,
        emphasis: participation.emphasisLevel || 1.0,
        contextMastery: participation.contextMastery,
        isPrimary: participation.isPrimary,
      };
    });
  };

/**
 * Select annotations for a category (placeholder - actual data from API)
 */
export const selectAnnotationsByCategory =
  (categoryId: string) => (_state: EcosystemStore) => {
    // This selector returns a placeholder - actual annotations come from API
    // The selector is here for store integration patterns
    return [] as Array<{
      id: string;
      cardId: string;
      type: string;
      content: string;
      createdAt: string;
    }>;
  };

/**
 * Select emphasis rules for a lens (placeholder - actual data from API)
 */
export const selectEmphasisRulesForLens =
  (categoryId: string) => (_state: EcosystemStore) => {
    // This selector returns a placeholder - actual rules come from API
    return [] as Array<{
      id: string;
      name: string;
      operation: string;
      multiplier: number;
      isActive: boolean;
    }>;
  };

/**
 * Select context performance data (placeholder - actual data from API)
 */
export const selectContextPerformance =
  (cardId: string, categoryId: string) => (_state: EcosystemStore) => {
    // This selector returns a placeholder - actual performance data from API
    return null as {
      reviewCount: number;
      successRate: number;
      averageResponseTime: number;
      lastReviewedAt: string | null;
    } | null;
  };

/**
 * Select metacognitive insights (placeholder - computed from API data)
 */
export const selectMetacognitiveInsights = (_state: EcosystemStore) => {
  // This selector returns a placeholder - actual insights come from AI API
  return [] as Array<{
    id: string;
    type: string;
    title: string;
    description: string;
    priority: "high" | "medium" | "low";
  }>;
};

/**
 * Select categories that need attention based on low mastery or staleness
 */
export const selectNeedsAttentionCategories = (state: EcosystemStore) => {
  const MASTERY_THRESHOLD = 0.4;
  const STALE_DAYS = 14;
  const now = new Date();

  return state.categories
    .filter((cat) => {
      // Low mastery
      if (cat.masteryScore < MASTERY_THRESHOLD && cat.cardCount > 0) {
        return true;
      }

      // Stale - not reviewed recently
      if (cat.lastStudiedAt) {
        const lastStudied = new Date(cat.lastStudiedAt);
        const daysSinceStudy = Math.floor(
          (now.getTime() - lastStudied.getTime()) / (1000 * 60 * 60 * 24),
        );
        if (daysSinceStudy > STALE_DAYS && cat.cardCount > 0) {
          return true;
        }
      }

      return false;
    })
    .sort((a, b) => a.masteryScore - b.masteryScore);
};

/**
 * Select categories by maturity stage
 */
export const selectCategoriesByMaturityStage = (state: EcosystemStore) => {
  const grouped: Record<MaturityStage, Category[]> = {
    acquisition: [],
    differentiation: [],
    crystallization: [],
  };

  state.categories.forEach((cat) => {
    const stage = cat.maturityStage || "acquisition";
    if (grouped[stage]) {
      grouped[stage].push(cat);
    }
  });

  return grouped;
};

/**
 * Select card's multi-context presence
 */
export const selectCardMultiContextPresence =
  (cardId: string) => (state: EcosystemStore) => {
    const participations = state.participations.get(cardId) || [];

    if (participations.length === 0) {
      return {
        isMultiContext: false,
        contextCount: 0,
        contexts: [],
      };
    }

    const contexts = participations.map((p) => {
      const category = state.categories.find((c) => c.id === p.categoryId);
      return {
        categoryId: p.categoryId,
        categoryName: category?.name || "Unknown",
        semanticRole: p.semanticRole,
        contextMastery: p.contextMastery,
      };
    });

    return {
      isMultiContext: participations.length > 1,
      contextCount: participations.length,
      contexts,
    };
  };
