import { ID_PREFIXES } from '@noema/types';

const KNOWLEDGE_NODE_ID_PATTERN = new RegExp(`^${ID_PREFIXES.NodeId}[a-zA-Z0-9_-]{21}$`);

export const KNOWLEDGE_NODE_ID_FORMAT_HINT =
  'Expected format is node_ followed by 21 URL-safe NanoID characters (letters, numbers, "_" or "-").';

export function isValidKnowledgeNodeId(value: string): boolean {
  return KNOWLEDGE_NODE_ID_PATTERN.test(value);
}

export function validateKnowledgeNodeIds(ids: readonly string[]): string | null {
  const invalid = ids.find((id) => !isValidKnowledgeNodeId(id));
  return invalid === undefined
    ? null
    : `Invalid knowledge node ID: ${invalid}. ${KNOWLEDGE_NODE_ID_FORMAT_HINT}`;
}
