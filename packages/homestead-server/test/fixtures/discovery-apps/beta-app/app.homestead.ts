import type { AppConfig } from '@rambleraptor/homestead-core/apps/types';

const betaApp: AppConfig = {
  id: 'beta',
  name: 'Beta',
  description: 'Discovery fixture app (sorts after alpha).',
  web: {
    icon: () => import('lucide-react').then((m) => m.Package),
    routes: [],
  },
};

export default betaApp;
