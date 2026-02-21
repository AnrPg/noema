/**
 * Trie (Prefix Tree) Data Structure
 *
 * Provides O(k) prefix-based search where k is the length of the query string.
 * Used for efficient typeahead/autocomplete in form selectors.
 */

interface TrieNode<T> {
  children: Map<string, TrieNode<T>>;
  values: T[];
  isEnd: boolean;
}

function createNode<T>(): TrieNode<T> {
  return { children: new Map(), values: [], isEnd: false };
}

export class Trie<T> {
  private readonly root: TrieNode<T>;

  constructor() {
    this.root = createNode<T>();
  }

  /**
   * Insert a value with one or more searchable keys.
   * Each key is normalized to lowercase for case-insensitive matching.
   */
  insert(keys: string[], value: T): void {
    for (const key of keys) {
      const normalized = key.toLowerCase();
      let node = this.root;

      for (const char of normalized) {
        if (!node.children.has(char)) {
          node.children.set(char, createNode<T>());
        }
        node = node.children.get(char)!;
      }

      node.isEnd = true;
      node.values.push(value);
    }
  }

  /**
   * Find all values whose keys start with the given prefix.
   * Returns results in insertion order, deduplicated.
   */
  search(prefix: string): T[] {
    const normalized = prefix.toLowerCase();
    let node = this.root;

    for (const char of normalized) {
      if (!node.children.has(char)) {
        return [];
      }
      node = node.children.get(char)!;
    }

    // Collect all values in the subtree
    const results: T[] = [];
    const seen = new Set<T>();
    this.collect(node, results, seen);
    return results;
  }

  /**
   * Recursively collect all values from a subtree.
   */
  private collect(node: TrieNode<T>, results: T[], seen: Set<T>): void {
    for (const value of node.values) {
      if (!seen.has(value)) {
        seen.add(value);
        results.push(value);
      }
    }

    // Sort children alphabetically for deterministic ordering
    const sortedEntries = [...node.children.entries()].sort(([a], [b]) => a.localeCompare(b));

    for (const [, child] of sortedEntries) {
      this.collect(child, results, seen);
    }
  }

  /**
   * Build a Trie from an array of items and a key extractor function.
   * The extractor returns an array of searchable strings for each item.
   */
  static from<T>(items: T[], keyExtractor: (item: T) => string[]): Trie<T> {
    const trie = new Trie<T>();
    for (const item of items) {
      trie.insert(keyExtractor(item), item);
    }
    return trie;
  }
}
