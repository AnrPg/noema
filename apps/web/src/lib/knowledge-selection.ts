export interface IKnowledgeMultiSelectResult {
  selectedNodeIds: Set<string>;
  primaryNodeId: string | null;
  isNodeDetailOpen: boolean;
}

export function resolveKnowledgeMultiSelect(
  currentSelectedNodeIds: Set<string>,
  clickedNodeId: string
): IKnowledgeMultiSelectResult {
  const selectedNodeIds = new Set(currentSelectedNodeIds);

  if (selectedNodeIds.has(clickedNodeId)) {
    selectedNodeIds.delete(clickedNodeId);
  } else {
    selectedNodeIds.add(clickedNodeId);
  }

  if (selectedNodeIds.size === 0) {
    return {
      selectedNodeIds,
      primaryNodeId: null,
      isNodeDetailOpen: false,
    };
  }

  const primaryNodeId = selectedNodeIds.has(clickedNodeId)
    ? clickedNodeId
    : (selectedNodeIds.values().next().value ?? null);

  return {
    selectedNodeIds,
    primaryNodeId,
    isNodeDetailOpen: selectedNodeIds.size === 1,
  };
}
