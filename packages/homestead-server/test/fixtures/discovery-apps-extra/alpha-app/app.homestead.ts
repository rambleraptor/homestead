import type { AppConfig } from '@rambleraptor/homestead-core/apps/types';

/**
 * Deliberately reuses the `alpha` id from discovery-apps/ so tests can cover
 * two app directories claiming the same app.
 */
const alphaApp: AppConfig = {
  id: 'alpha',
  name: 'Alpha (extra)',
  description: 'Duplicate-id discovery fixture app.',
  web: {
    icon: () => import('lucide-react').then((m) => m.Package),
    routes: [],
  },
};

export default alphaApp;
