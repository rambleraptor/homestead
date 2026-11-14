/**
 * Groceries App Types
 */

/**
 * Store record from aepbase
 */
export interface Store {
  id: string;
  name: string;
  sort_order?: number;
  created_by?: string;
  created: string;
  updated: string;
}

/**
 * Grocery item record from aepbase
 */
export interface GroceryItem {
  id: string;
  name: string;
  checked: boolean;
  /** The store section it's shelved in (a `sections.ts` id); unset until the list is sorted. */
  category?: string;
  notes?: string;
  store?: string; // Store ID
  created_by?: string;
  created: string;
  updated: string;
}

/**
 * Form data for creating/updating grocery items
 */
export interface GroceryItemFormData {
  name: string;
  notes?: string;
  store?: string;
  /**
   * Normally left unset — a new item starts unchecked. Carried here so undoing
   * a delete can restore an already-checked item in the state it was in,
   * rather than resurrecting it as outstanding shopping.
   */
  checked?: boolean;
}

/**
 * Grocery items grouped by store
 */
export interface StoreGroupedGroceries {
  store: Store | null; // null for items without a store
  items: GroceryItem[];
  checkedCount: number;
  totalCount: number;
}

/**
 * Grocery list statistics
 */
export interface GroceryStats {
  totalItems: number;
  checkedItems: number;
  uncheckedItems: number;
  stores: StoreGroupedGroceries[];
}
