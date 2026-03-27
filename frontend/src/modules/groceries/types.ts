/**
 * Groceries Module Types
 */

/**
 * Store record from PocketBase
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
 * Grocery item record from PocketBase
 */
export interface GroceryItem {
  id: string;
  name: string;
  checked: boolean;
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
