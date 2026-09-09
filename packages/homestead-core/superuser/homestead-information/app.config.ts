import type { AppConfig } from '@rambleraptor/homestead-core/apps/types';

export const homesteadInformationApp: AppConfig = {
  id: 'homestead-information',
  name: 'Homestead Information',
  description: 'General instance information: build details and security status.',
  web: {
    icon: () => import('lucide-react').then((m) => m.Info),
    routes: [
      {
        path: '',
        index: true,
        component: () =>
          import('./components/HomesteadInformationHome').then(
            (m) => m.HomesteadInformationHome,
          ),
        gates: ['superuser'],
      },
    ],
  },
};
