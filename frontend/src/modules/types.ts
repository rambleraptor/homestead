/**
 * Module System Types
 *
 * This file defines the contract that every module must follow.
 * All modules registered in the system must implement the HomeModule interface.
 */

import type { LucideIcon } from 'lucide-react';
import type { OmniboxAdapter } from '@/shared/omnibox/types';

/**
 * Route definition for Next.js App Router
 * Each route maps to a page under app/(app)/[basePath]/...
 */
export interface ModuleRoute {
  /**
   * Path relative to the module's basePath
   * Empty string for the index route
   */
  path: string;

  /**
   * Whether this is the index route
   */
  index?: boolean;
}

/**
 * Core Module Configuration
 * Every module must export a config object that implements this interface
 */
export interface HomeModule {
  /**
   * Unique identifier for the module (lowercase, no spaces)
   * Example: 'dashboard', 'chores', 'meal_planner'
   */
  id: string;

  /**
   * Display name shown in navigation and UI
   * Example: 'Dashboard', 'Chores', 'Meal Planner'
   */
  name: string;

  /**
   * Short description of module functionality
   */
  description: string;

  /**
   * Lucide icon component for navigation
   */
  icon: LucideIcon;

  /**
   * Base path for module routes (must start with /)
   * Example: '/dashboard', '/chores'
   */
  basePath: string;

  /**
   * Route definitions for this module
   * Routes are now defined by the Next.js App Router file structure
   */
  routes: ModuleRoute[];

  /**
   * Whether this module should appear in the main navigation
   * @default true
   */
  showInNav?: boolean;

  /**
   * Navigation order (lower numbers appear first)
   * @default 100
   */
  navOrder?: number;

  /**
   * Section/category for grouping modules in navigation
   * Modules without a section will be displayed at the end
   */
  section?: string;

  /**
   * Whether this module is enabled
   * Can be used for feature flags
   * @default true
   */
  enabled?: boolean;

  /**
   * Additional module-specific metadata
   */
  metadata?: Record<string, unknown>;

  /**
   * Optional declarative integration with the natural-language omnibox
   * (`/search`). When present, the module is discoverable + addressable
   * via the omnibox. See `@/shared/omnibox/types` for the shape.
   */
  omnibox?: OmniboxAdapter;

  /**
   * Optional module-scoped flags. Each entry declares a typed knob
   * that a household member can tweak from the settings UI.
   *
   * The registry flattens all declared flags across modules into a
   * single aepbase-backed singleton (`module-flags` resource) whose
   * field names are `${moduleId_snake}__${key}`.
   */
  flags?: Record<string, ModuleFlagDef>;
}

/**
 * Runtime value a flag can hold. Matches `ModuleFlagDef.type`
 * one-to-one — `enum` flags store their selected option as a string.
 */
export type ModuleFlagValue = string | number | boolean;

/**
 * Declarative description of a single module flag. The settings UI
 * renders the right input widget based on `type`; the aepbase schema
 * syncer converts `type` into a JSON-schema property.
 */
export type ModuleFlagDef =
  | {
      type: 'string';
      label: string;
      description?: string;
      default?: string;
    }
  | {
      type: 'number';
      label: string;
      description?: string;
      default?: number;
    }
  | {
      type: 'boolean';
      label: string;
      description?: string;
      default?: boolean;
    }
  | {
      type: 'enum';
      label: string;
      description?: string;
      options: readonly string[];
      default?: string;
    };

/**
 * Module Registry
 * Central registry of all available modules in the system
 */
export interface ModuleRegistry {
  modules: HomeModule[];
  getModule: (id: string) => HomeModule | undefined;
  getNavigationModules: () => HomeModule[];
}

/**
 * Helper type for module component props
 */
export interface ModuleComponentProps {
  moduleId?: string;
  [key: string]: unknown;
}

/**
 * Module initialization hook result
 */
export interface ModuleHook<T = unknown> {
  data: T | null;
  isLoading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}
