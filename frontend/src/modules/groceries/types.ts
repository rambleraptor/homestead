/**
 * Groceries Module Types
 */

import type { GroceryCategory } from '@/core/services/gemini';

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
  category?: GroceryCategory;
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
 * Grouped grocery items by category
 */
export interface GroupedGroceries {
  category: GroceryCategory | 'Uncategorized';
  items: GroceryItem[];
  checkedCount: number;
  totalCount: number;
}

/**
 * Grocery items grouped by category within a store
 */
export interface StoreGroupedGroceries {
  store: Store | null; // null for items without a store
  categories: GroupedGroceries[];
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
