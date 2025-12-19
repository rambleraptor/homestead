/**
 * Groceries Module Types
 */

import type { GroceryCategory } from '@/core/services/gemini';

/**
 * Grocery item record from PocketBase
 */
export interface GroceryItem {
  id: string;
  name: string;
  checked: boolean;
  category?: GroceryCategory;
  notes?: string;
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
 * Grocery list statistics
 */
export interface GroceryStats {
  totalItems: number;
  checkedItems: number;
  uncheckedItems: number;
  categories: GroupedGroceries[];
}
