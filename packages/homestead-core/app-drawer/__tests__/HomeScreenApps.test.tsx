import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { AppConfig } from '../../apps/types';
import type { SidebarEntry } from '../../apps/sidebarPins';

vi.mock('@rambleraptor/homestead-core/shared/components/ToastProvider', () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn() }),
}));

const pwa = vi.hoisted(() => ({ standalone: false, ios: false }));
vi.mock('@rambleraptor/homestead-core/shared/pwa/install', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../shared/pwa/install')>()),
  isStandaloneDisplay: () => pwa.standalone,
  isIOS: () => pwa.ios,
}));

const { HomeScreenApps } = await import('../components/HomeScreenApps');

const app = (id: string, name: string, homeScreenIcon?: string): SidebarEntry => ({
  app: {
    id,
    name,
    description: '',
    web: {
      icon: () => Promise.reject(new Error('not rendered')),
      basePath: `/${id}`,
      ...(homeScreenIcon ? { homeScreenIcon } : {}),
      routes: [],
    },
  } as AppConfig,
});

const entries = [app('notes', 'Notes', '/app-icons/notes.png'), app('plain', 'No icon')];

let assign: ReturnType<typeof vi.fn>;
let hrefSet: ReturnType<typeof vi.fn>;

beforeEach(() => {
  assign = vi.fn();
  hrefSet = vi.fn();
  vi.stubGlobal('location', {
    origin: 'https://home.example',
    assign,
    set href(value: string) {
      hrefSet(value);
    },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  pwa.standalone = false;
  pwa.ios = false;
});

describe('HomeScreenApps', () => {
  it('lists only apps with their own Home Screen icon', () => {
    render(<HomeScreenApps entries={entries} />);
    expect(screen.getByTestId('home-screen-add-notes')).toBeTruthy();
    expect(screen.queryByTestId('home-screen-add-plain')).toBeNull();
  });

  it("in a browser, goes to the app's page with the guide", () => {
    render(<HomeScreenApps entries={entries} />);
    fireEvent.click(screen.getByTestId('home-screen-add-notes'));
    expect(assign).toHaveBeenCalledWith('https://home.example/notes?install');
  });

  it('from an installed app on iOS, hands the page to Safari and offers the link', () => {
    pwa.standalone = true;
    pwa.ios = true;
    render(<HomeScreenApps entries={entries} />);
    fireEvent.click(screen.getByTestId('home-screen-add-notes'));
    expect(hrefSet).toHaveBeenCalledWith('x-safari-https://home.example/notes?install');
    expect(screen.getByTestId('home-screen-handoff')).toBeTruthy();
    expect(screen.getByText('https://home.example/notes?install')).toBeTruthy();
  });

  it('follows the drawer search', () => {
    render(<HomeScreenApps entries={entries} query="zzz" />);
    expect(screen.queryByTestId('app-drawer-home-screen')).toBeNull();
  });
});
