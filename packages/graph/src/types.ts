/**
 * @noema/graph - Domain Types
 *
 * OverlayType and LayoutMode are defined here so both apps/web and
 * apps/web-admin can share them without a circular dependency through
 * apps/web/src/stores/graph-store.ts.
 */

export type OverlayType =
  | 'centrality'
  | 'frontier'
  | 'misconceptions'
  | 'bridges'
  | 'prerequisites'
  | 'pending_mutations'; // admin-only overlay for CKG graph browser

export type LayoutMode = 'force' | 'hierarchical' | 'radial';
