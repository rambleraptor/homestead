# 🏠 HomeOS - Modular Home Management System

A self-hosted, modular web application for managing your home. Built with React, TypeScript, and PocketBase, HomeOS features a plugin-like architecture that makes it easy to add new functionality.

## ✨ Key Features

- **🧩 Modular Architecture** - Add new features by creating self-contained modules
- **🔐 Role-Based Access Control** - Admin, Member, and View-Only roles
- **⚡ Fast & Modern** - Built with Vite, React 19, and TypeScript
- **🎨 Beautiful UI** - Tailwind CSS with dark mode support
- **💾 Self-Hosted** - Your data stays on your server with PocketBase
- **📱 Responsive** - Works seamlessly on desktop and mobile devices

## 🏗️ Architecture Highlights

### Modular Design

Every feature is a **module** with its own:
- Components (`components/`)
- Routes (`routes.tsx`)
- Types (`types.ts`)
- Hooks (`hooks/`)
- Configuration (`module.config.ts`)

**Adding a new module is as simple as:**
1. Create your module folder in `src/modules/`
2. Define `module.config.ts`
3. Register in `src/modules/registry.ts`
4. Done! 🎉

### Tech Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Frontend** | React 19 + TypeScript | Type-safe UI components |
| **Build Tool** | Vite | Lightning-fast development |
| **Styling** | Tailwind CSS | Utility-first styling |
| **State** | TanStack Query | Async state & caching |
| **Routing** | React Router v7 | Client-side routing |
| **Backend** | PocketBase | SQLite database + Auth + API |
| **Icons** | Lucide React | Beautiful icons |

## 🚀 Quick Start

### Prerequisites

- Node.js 20+ and npm
- PocketBase (included in setup)

### Installation

1. **Clone the repository**

```bash
git clone <your-repo-url>
cd homeOS
```

2. **Set up PocketBase**

Download PocketBase for your OS from [pocketbase.io](https://pocketbase.io/docs/):

```bash
# Create pocketbase directory
mkdir -p pocketbase

# Download PocketBase (example for Linux)
cd pocketbase
wget https://github.com/pocketbase/pocketbase/releases/download/v0.22.0/pocketbase_0.22.0_linux_amd64.zip
unzip pocketbase_0.22.0_linux_amd64.zip
chmod +x pocketbase

# Start PocketBase
./pocketbase serve
```

PocketBase will be available at `http://127.0.0.1:8090`

3. **Configure PocketBase Collections**

Open `http://127.0.0.1:8090/_/` in your browser and:

- Create an admin account
- Go to **Collections**
- Follow the schema in `docs/POCKETBASE_SCHEMA.md` to create:
  - `users` (extend auth collection with `role` field)
  - `user_roles`
  - `module_permissions`

See detailed instructions in [`docs/POCKETBASE_SCHEMA.md`](docs/POCKETBASE_SCHEMA.md)

4. **Install frontend dependencies**

```bash
cd frontend
npm install
```

5. **Configure environment**

```bash
cp .env.example .env
```

Edit `.env` if needed (default PocketBase URL is already set).

6. **Start the development server**

```bash
npm run dev
```

Open `http://localhost:5173` in your browser.

7. **Create your first user**

In PocketBase Admin UI (`http://127.0.0.1:8090/_/`):
- Go to **Collections** > **users**
- Click **New record**
- Fill in:
  - Email: `admin@example.com`
  - Password: (your password)
  - Name: `Admin User`
  - Role: `admin`
  - Verified: ✓
- Save

Now you can log in!

## 📚 Documentation

- [**PocketBase Schema**](docs/POCKETBASE_SCHEMA.md) - Database structure and API rules
- [**Architecture**](PROJECT_STRUCTURE.md) - File structure and design decisions
- [**Module Guide**](docs/MODULE_GUIDE.md) - How to create new modules *(coming soon)*

## 🧩 Creating Your First Module

Let's create a "Chores" module as an example:

### 1. Create the module structure

```bash
cd frontend/src/modules
mkdir -p chores/{components,hooks}
```

### 2. Create `module.config.ts`

```typescript
// frontend/src/modules/chores/module.config.ts
import { HomeModule } from '../types';
import { ListTodo } from 'lucide-react';
import { choresRoutes } from './routes';

export const choresModule: HomeModule = {
  id: 'chores',
  name: 'Chores',
  description: 'Manage household chores and tasks',
  icon: ListTodo,
  requiredRole: 'member', // Members and Admins can access
  basePath: '/chores',
  routes: choresRoutes,
  showInNav: true,
  navOrder: 10,
  enabled: true,
};
```

### 3. Create routes

```typescript
// frontend/src/modules/chores/routes.tsx
import { RouteObject } from 'react-router-dom';
import { ChoresHome } from './components/ChoresHome';

export const choresRoutes: RouteObject[] = [
  {
    index: true,
    element: <ChoresHome />,
  },
];
```

### 4. Create component

```typescript
// frontend/src/modules/chores/components/ChoresHome.tsx
export function ChoresHome() {
  return (
    <div>
      <h1 className="text-3xl font-bold">Chores</h1>
      <p className="mt-2 text-gray-600">Manage your household tasks</p>
    </div>
  );
}
```

### 5. Register the module

```typescript
// frontend/src/modules/registry.ts
import { choresModule } from './chores/module.config';

const MODULES: HomeModule[] = [
  dashboardModule,
  choresModule, // ← Add your module here
];
```

**That's it!** Your module will now appear in the navigation sidebar for users with `member` or `admin` roles.

## 🔐 Role-Based Access Control

HomeOS has three built-in roles:

| Role | Level | Permissions |
|------|-------|-------------|
| **viewonly** | 1 | Read-only access to modules |
| **member** | 2 | Can view and edit most features |
| **admin** | 3 | Full access, can manage users and settings |

### Using Permissions in Components

```typescript
import { usePermissions } from '@/core/permissions/usePermissions';

function MyComponent() {
  const { canAccessModule, isAdmin } = usePermissions();

  if (!canAccessModule('chores', 'write')) {
    return <div>You don't have permission to edit chores</div>;
  }

  return <div>Chore editor...</div>;
}
```

### Protecting Routes

```typescript
import { PermissionGuard } from '@/core/permissions/PermissionGuard';

function AdminOnlyPage() {
  return (
    <PermissionGuard requiredRole="admin">
      <div>Admin content</div>
    </PermissionGuard>
  );
}
```

## 🛠️ Development

### Available Scripts

```bash
npm run dev        # Start dev server
npm run build      # Build for production
npm run preview    # Preview production build
npm run lint       # Run ESLint
npm run type-check # Run TypeScript compiler
```

### Project Structure

```
homeOS/
├── frontend/                 # React application
│   ├── src/
│   │   ├── core/            # Core infrastructure
│   │   │   ├── auth/        # Authentication
│   │   │   ├── permissions/ # RBAC system
│   │   │   ├── layout/      # App shell, sidebar, header
│   │   │   ├── api/         # PocketBase client, React Query
│   │   │   └── router/      # Routing setup
│   │   ├── modules/         # Feature modules
│   │   │   ├── registry.ts  # ⭐ Central module registration
│   │   │   ├── types.ts     # Module interfaces
│   │   │   └── dashboard/   # Example module
│   │   └── shared/          # Shared components & utils
│   └── ...
├── pocketbase/              # Backend
│   ├── pocketbase          # PocketBase binary
│   └── pb_data/            # Database & files
└── docs/                   # Documentation
```

## 🔒 Security

- ✅ HTTPS recommended for production
- ✅ Role-based access control
- ✅ PocketBase API rules for data security
- ✅ Authentication required for all routes
- ✅ JWT token-based sessions

## 🤝 Contributing

We welcome contributions! Here's how:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/my-module`)
3. Commit your changes (`git commit -m 'Add MyModule'`)
4. Push to the branch (`git push origin feature/my-module`)
5. Open a Pull Request

### Code Review

**Automated CI Checks** run on every PR:
- ✅ TypeScript type checking
- ✅ ESLint validation
- ✅ Build verification
- ✅ Security scanning (npm audit)
- ✅ **Claude AI Code Review** - Automated intelligent code reviews

**Setting up Claude Code Reviews:**

1. Go to your repository Settings → Secrets and variables → Actions
2. Add a new secret named `CLAUDE_CODE_OAUTH_TOKEN`
3. Get your token from [Claude Code OAuth setup](https://docs.anthropic.com/en/docs/claude-code/authentication)
4. Claude will now automatically review all PRs with detailed feedback on:
   - Modular architecture adherence
   - Security and RBAC implementation
   - TypeScript best practices
   - React patterns and performance
   - Code quality and maintainability

See [`.github/workflows/code-review.yml`](.github/workflows/code-review.yml) for the full configuration.

## 📝 License

MIT License - feel free to use this for your own home!

## 🙏 Acknowledgments

- [PocketBase](https://pocketbase.io/) - Amazing backend-as-a-service
- [Vite](https://vitejs.dev/) - Next-gen build tool
- [React](https://react.dev/) - UI library
- [Tailwind CSS](https://tailwindcss.com/) - Utility-first CSS
- [TanStack Query](https://tanstack.com/query/) - Async state management
- [Lucide](https://lucide.dev/) - Beautiful icons

## 🗺️ Roadmap

- [ ] Calendar/Events module
- [ ] Shopping list module
- [ ] Meal planner module
- [ ] Family calendar
- [ ] File storage module
- [ ] Mobile app (React Native)
- [ ] Docker deployment
- [ ] Multi-language support

## 📧 Support

For issues and questions:
- Open an issue on GitHub
- Check the [documentation](docs/)
- Review existing modules for examples

---

**Built with ❤️ for families who want control over their data**
