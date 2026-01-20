/**
 * Recipes Module Types
 *
 * Treating recipes like code with versioning, changelogs, and source control
 */

/**
 * Source type for recipes
 * - digital: From URLs or digitized content
 * - physical: From cookbooks or printed material
 * - family: Family recipes passed down
 */
export type RecipeSourceType = 'digital' | 'physical' | 'family';

/**
 * Ingredient with structured data for scaling and shopping integration
 */
export interface Ingredient {
  /** The ingredient item (e.g., "Onion", "Garlic") */
  item: string;
  /** Quantity amount (e.g., 1, 2.5) */
  amount: number;
  /** Unit of measurement (e.g., "cup", "tbsp", "large") */
  unit: string;
  /** Optional notes (e.g., "diced", "minced", "to taste") */
  note?: string;
}

/**
 * Changelog entry - like a git commit
 */
export interface ChangelogEntry {
  /** ISO date string when the change was made */
  date: string;
  /** Version number after this change */
  version: number;
  /** Description of what changed and why */
  message: string;
  /** Optional user who made the change */
  userId?: string;
}

/**
 * Recipe record from PocketBase
 */
export interface Recipe {
  id: string;
  /** Recipe title */
  title: string;
  /** Source type (digital, physical, family) */
  source_type: RecipeSourceType;
  /** URL for digital, page number for physical, person name for family */
  source_reference?: string;
  /** Structured ingredients for scaling and shopping */
  ingredients?: Ingredient[];
  /** Cooking instructions (markdown supported) */
  instructions?: string;
  /** Current version number (starts at 1) */
  version: number;
  /** History of changes made to this recipe */
  changelog?: ChangelogEntry[];
  /** Last time this recipe was cooked */
  last_cooked?: string;
  /** Internal rating (1-10) */
  rating?: number;
  /** Optional recipe image */
  image?: string;
  /** User who created the recipe */
  created_by?: string;
  created: string;
  updated: string;
}

/**
 * Cooking log entry - runtime data for a recipe execution
 */
export interface CookingLog {
  id: string;
  /** Recipe that was cooked */
  recipe: string; // Recipe ID
  /** When it was cooked */
  date: string;
  /** Notes about how it went */
  notes?: string;
  /** Was it successful? */
  success?: boolean;
  /** Star rating (1-5) */
  rating?: number;
  /** Did you deviate from the recipe? */
  deviated?: boolean;
  /** What was the deviation? */
  deviation_notes?: string;
  /** User who created the log */
  created_by?: string;
  created: string;
  updated: string;
}

/**
 * Form data for creating/updating recipes
 */
export interface RecipeFormData {
  title: string;
  source_type: RecipeSourceType;
  source_reference?: string;
  ingredients?: Ingredient[];
  instructions?: string;
  rating?: number;
  image?: File | string;
}

/**
 * Form data for creating cooking logs
 */
export interface CookingLogFormData {
  recipe: string;
  date: string;
  notes?: string;
  success?: boolean;
  rating?: number;
  deviated?: boolean;
  deviation_notes?: string;
}

/**
 * Commit change payload
 */
export interface RecipeCommitData {
  /** The updated recipe data */
  recipe: Partial<Recipe>;
  /** Commit message describing the change */
  message: string;
}

/**
 * Recipe statistics
 */
export interface RecipeStats {
  totalRecipes: number;
  digitalRecipes: number;
  physicalRecipes: number;
  familyRecipes: number;
  recentlyCooked: Recipe[];
  topRated: Recipe[];
}

/**
 * Cooking mode state
 */
export interface CookingModeState {
  recipe: Recipe;
  startTime: Date;
  isActive: boolean;
}
