/**
 * Baby App Configuration
 *
 * A shared log of a baby's feeds, diapers and sleep: one tap to log, live
 * between everyone at home, and answerable by the assistant.
 */

import type { AppConfig } from '@rambleraptor/homestead-core/apps/types';
import { babyResources, VOLUME_UNITS } from './resources';

export const babyApp: AppConfig = {
  id: 'baby',
  name: 'Baby',
  description: 'Log feeds, diapers and sleep with one tap, shared with everyone at home.',
  resources: babyResources,
  flags: {
    volume_unit: {
      type: 'enum',
      label: 'Bottle unit',
      description:
        'The unit bottle amounts are entered and totalled in. Each entry keeps the unit it was logged with.',
      options: VOLUME_UNITS,
      default: 'oz',
    },
  },
  chat: {
    instructions: [
      'The baby log records feeds, diapers and sleep as baby-events under a baby (kind: feed, diaper or sleep). ' +
        'To log one, create a baby-event under the baby with started_at left out for "now", or set to the time the person gave.',
      'A bottle feed has feed_method "bottle" with amount and amount_unit exactly as the person said them ' +
        '(never convert between oz and ml) and, if said, contents; a breast feed has feed_method "breast" and a side. ' +
        'A diaper has diaper wet, dirty or both.',
      'A sleep with no ended_at means the baby is asleep now. When the baby wakes, update that sleep event\'s ' +
        'ended_at rather than creating a new one; when the baby falls asleep, create a sleep event with no ended_at.',
      'For questions about a day ("how many feeds today?"), list the baby\'s events with a started_at filter ' +
        'covering that day in the person\'s timezone and count them; say times in their local time.',
    ],
    context: () => import('./chat/context'),
  },
  web: {
    icon: () => import('lucide-react').then((m) => m.Baby),
    basePath: '/baby',
    homeScreenIcon: '/app-icons/baby.png',
    routes: [
      {
        path: '',
        index: true,
        component: () => import('./components/BabyHome').then((m) => m.BabyHome),
      },
    ],
    // Long-press the installed icon → logged before the app has finished opening.
    shortcuts: [
      { name: 'Wet diaper', path: '?log=wet' },
      { name: 'Dirty diaper', path: '?log=dirty' },
      { name: 'Bottle', path: '?log=bottle' },
      { name: 'Asleep / awake', path: '?log=sleep' },
    ],
    showInNav: true,
    navOrder: 9,
    section: 'Health',
    widgets: [
      {
        id: 'baby-log',
        label: 'Baby',
        summary: () => import('./hooks/useBabySummary'),
        component: () => import('./components/BabyWidget').then((m) => m.BabyWidget),
        order: 2,
      },
    ],
  },
};
