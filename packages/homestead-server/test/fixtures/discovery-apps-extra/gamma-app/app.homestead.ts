import type { AppConfig } from '@rambleraptor/homestead-core/apps/types';

const gammaApp: AppConfig = {
  id: 'gamma',
  name: 'Gamma',
  description: 'Discovery fixture app in a second app directory.',
  web: {
    icon: () => import('lucide-react').then((m) => m.Package),
    routes: [],
  },
};

export default gammaApp;
