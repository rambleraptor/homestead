# Homestead Project Structure

```
homestead/
├── .github/
│   └── workflows/
│       └── code-review.yml          # Claude Code review automation
├── pocketbase/
│   ├── pb_data/                     # PocketBase data directory (gitignored)
│   ├── pb_migrations/               # Database migrations
│   └── pocketbase                   # PocketBase executable
├── frontend/
│   ├── public/
│   │   └── vite.svg
│   ├── src/
│   │   ├── core/
│   │   │   ├── auth/
│   │   │   │   ├── AuthContext.tsx           # Authentication context provider
│   │   │   │   ├── AuthGuard.tsx             # Route protection component
│   │   │   │   ├── useAuth.ts                # Authentication hook
│   │   │   │   └── types.ts                  # Auth types (User, Role, etc.)
│   │   │   ├── permissions/
│   │   │   │   ├── PermissionGuard.tsx       # Component-level permissions
│   │   │   │   ├── usePermissions.ts         # Permission checking hook
│   │   │   │   └── rbac.ts                   # RBAC configuration
│   │   │   ├── layout/
│   │   │   │   ├── AppShell.tsx              # Main layout wrapper
│   │   │   │   ├── Sidebar.tsx               # Navigation sidebar
│   │   │   │   ├── Header.tsx                # Top header bar
│   │   │   │   └── Footer.tsx                # Footer component
│   │   │   ├── api/
│   │   │   │   ├── pocketbase.ts             # PocketBase client instance
│   │   │   │   ├── queryClient.ts            # React Query configuration
│   │   │   │   └── hooks.ts                  # Common API hooks
│   │   │   └── router/
│   │   │       ├── Router.tsx                # Main router component
│   │   │       └── routes.tsx                # Route definitions
│   │   ├── modules/
│   │   │   ├── registry.ts                   # MODULE REGISTRY - Register all modules here
│   │   │   ├── types.ts                      # Module interface definition
│   │   │   ├── dashboard/
│   │   │   │   ├── index.ts                  # Module export
│   │   │   │   ├── module.config.ts          # Module configuration
│   │   │   │   ├── routes.tsx                # Module routes
│   │   │   │   ├── components/
│   │   │   │   │   ├── DashboardHome.tsx
│   │   │   │   │   └── WidgetGrid.tsx
│   │   │   │   ├── hooks/
│   │   │   │   │   └── useDashboardData.ts
│   │   │   │   └── types.ts                  # Module-specific types
│   │   │   ├── chores/                       # Example future module
│   │   │   │   ├── index.ts
│   │   │   │   ├── module.config.ts
│   │   │   │   ├── routes.tsx
│   │   │   │   ├── components/
│   │   │   │   ├── hooks/
│   │   │   │   └── types.ts
│   │   │   └── meals/                        # Example future module
│   │   │       ├── index.ts
│   │   │       ├── module.config.ts
│   │   │       └── ...
│   │   ├── shared/
│   │   │   ├── components/
│   │   │   │   ├── Button.tsx
│   │   │   │   ├── Card.tsx
│   │   │   │   ├── Input.tsx
│   │   │   │   ├── Modal.tsx
│   │   │   │   └── Spinner.tsx
│   │   │   ├── hooks/
│   │   │   │   ├── useLocalStorage.ts
│   │   │   │   └── useDebounce.ts
│   │   │   └── utils/
│   │   │       ├── date.ts
│   │   │       └── format.ts
│   │   ├── App.tsx                           # Root App component
│   │   ├── main.tsx                          # Entry point
│   │   ├── index.css                         # Global styles + Tailwind
│   │   └── next-env.d.ts
│   ├── package.json
│   ├── tsconfig.json
│   ├── next.config.ts
│   ├── vitest.config.ts
│   ├── tailwind.config.js
│   ├── postcss.config.js
│   └── .env.example
├── docs/
│   ├── ARCHITECTURE.md                       # Architecture decisions
│   ├── MODULE_GUIDE.md                       # How to create new modules
│   └── POCKETBASE_SCHEMA.md                  # Database schema documentation
├── .gitignore
└── README.md
```

## Key Architecture Concepts

### 1. Module Registry Pattern
- **Single Source of Truth**: All modules register in `src/modules/registry.ts`
- **Auto-Discovery**: Navigation and routing automatically generated from registry
- **Permission-Based**: Modules specify required roles; system handles access control

### 2. Self-Contained Modules
Each module is a mini-app with:
- `module.config.ts` - Configuration (id, name, icon, required role)
- `routes.tsx` - Module-specific routes
- `components/` - UI components
- `hooks/` - Data fetching & business logic
- `types.ts` - TypeScript definitions

### 3. Core vs Module Separation
- **Core** (`frontend/src/core/`) - Shared infrastructure (auth, layout, API)
- **In-tree modules** (`frontend/src/modules/`) - Module registry, contract
  types, and the `settings` + `superuser` modules (core experience)
- **Feature modules package** (`packages/homestead-modules/`) - Workspace
  package `@rambleraptor/homestead-modules` housing every user-facing
  feature module (gift-cards, credit-cards, groceries, recipes, todos, etc.)
- **Shared** (`frontend/src/shared/`) - Reusable UI components and utilities

### 4. Adding a New Module
1. Create folder in `packages/homestead-modules/my-module/`
2. Define module configuration in `module.config.ts` (import `HomeModule`
   from `@/modules/types`)
3. Re-export the module from `packages/homestead-modules/index.ts`
4. Import and register it in `frontend/src/modules/registry.ts`
5. Module automatically appears in navigation (if user has permission)
