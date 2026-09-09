import type { AppConfig } from '@rambleraptor/homestead-core/apps/types';

const alphaApp: AppConfig = {
  id: 'alpha',
  name: 'Alpha',
  description: 'Discovery fixture app.',
  web: {
    icon: () => import('lucide-react').then((m) => m.Package),
    routes: [],
  },
};

export default alphaApp;
