# HomeOS Frontend

This is the frontend application for HomeOS, built with Next.js, React, and TypeScript.

## Tech Stack

- **Framework**: Next.js 15
- **UI Library**: React 19
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **State Management**: TanStack Query (React Query)
- **Testing**: Vitest + React Testing Library
- **Icons**: Lucide React

## Development

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Build for production
npm run build

# Start production server
npm start

# Run tests
npm test

# Run linter
npm run lint

# Run type checker
npm run type-check
```

## Environment Variables

Copy `.env.example` to `.env` and configure:

```bash
NEXT_PUBLIC_POCKETBASE_URL=http://127.0.0.1:8090
NEXT_PUBLIC_APP_NAME=HomeOS
NEXT_PUBLIC_VAPID_PUBLIC_KEY=your_vapid_public_key
```

**Note**: Environment variables in Next.js must be prefixed with `NEXT_PUBLIC_` to be accessible in the browser.

## Project Structure

```
src/
├── app/              # Next.js App Router pages
├── core/             # Core infrastructure
│   ├── auth/         # Authentication
│   ├── api/          # PocketBase client
│   ├── layout/       # Layout components
│   └── router/       # Routing configuration
├── modules/          # Feature modules
│   ├── registry.ts   # Module registry
│   ├── dashboard/    # Dashboard module
│   ├── gift-cards/   # Gift cards module
│   └── ...           # Other modules
├── shared/           # Shared components and utilities
└── test/             # Test setup and utilities
```

## Adding a New Module

1. Create module folder in `src/modules/`
2. Define `module.config.ts` with metadata
3. Create routes and components
4. Register in `src/modules/registry.ts`

See the [Module Guide](../docs/MODULE_GUIDE.md) for detailed instructions.

## Testing

This project uses Vitest for unit and integration testing:

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage
```

## Code Quality

Before committing, ensure all checks pass:

```bash
# Run all checks
cd .. && make ci && make test
```

This runs:
- ESLint
- TypeScript type checking
- Build verification
- All tests

## Learn More

- [Next.js Documentation](https://nextjs.org/docs)
- [React Documentation](https://react.dev)
- [Tailwind CSS](https://tailwindcss.com)
- [TanStack Query](https://tanstack.com/query)
