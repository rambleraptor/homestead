import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import type { AppConfig } from '../../../apps/types';
import { installPageUrl, isIOS, safariUrl } from '../install';

const notesApp: AppConfig = {
  id: 'notes',
  name: 'Notes',
  description: 'Quick notes',
  web: {
    icon: () => Promise.reject(new Error('not rendered')),
    basePath: '/notes',
    homeScreenIcon: '/app-icons/notes.png',
    routes: [{ path: '', index: true, component: () => Promise.resolve(() => null) }],
  },
};

vi.mock('../../../apps/registry', () => ({ getAllApps: () => [notesApp] }));

const { InstallGuide } = await import('../components/InstallGuide');

function setUserAgent(ua: string, touchPoints = 0) {
  vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(ua);
  vi.spyOn(navigator, 'maxTouchPoints', 'get').mockReturnValue(touchPoints);
}

afterEach(() => vi.restoreAllMocks());

describe('install addresses', () => {
  it('opens the app page with the guide, and hands it to Safari', () => {
    const url = installPageUrl('/notes/', 'https://home.example');
    expect(url).toBe('https://home.example/notes?install');
    expect(safariUrl(url)).toBe('x-safari-https://home.example/notes?install');
    expect(safariUrl('http://box.local:3000/notes?install')).toBe(
      'x-safari-http://box.local:3000/notes?install',
    );
  });

  it('recognises iPhones and iPads, including an iPad that says it is a Mac', () => {
    setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)');
    expect(isIOS()).toBe(true);
    setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 5);
    expect(isIOS()).toBe(true);
    setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 0);
    expect(isIOS()).toBe(false);
  });
});

describe('InstallGuide', () => {
  function Address() {
    const { pathname, search } = useLocation();
    return <span data-testid="address">{`${pathname}${search}`}</span>;
  }

  function renderAt(path: string) {
    return render(
      <MemoryRouter initialEntries={[path]}>
        <InstallGuide />
        <Address />
      </MemoryRouter>,
    );
  }

  beforeEach(() => setUserAgent('Mozilla/5.0 (X11; Linux x86_64) Firefox/140.0'));

  it("shows this app's step and drops ?install from the address", async () => {
    renderAt('/notes?install&chrome=none');
    expect(await screen.findByTestId('install-guide')).toBeTruthy();
    expect(screen.getByText('Add Notes to your Home Screen')).toBeTruthy();
    expect(screen.getByTestId('install-guide-other')).toBeTruthy();
    await waitFor(() => expect(screen.getByTestId('address').textContent).toBe('/notes?chrome=none'));
  });

  it('walks iOS through Share → Add to Home Screen', async () => {
    setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)');
    renderAt('/notes?install');
    expect(await screen.findByTestId('install-guide-ios')).toBeTruthy();
  });

  it('stays closed without ?install', () => {
    renderAt('/notes');
    expect(screen.queryByTestId('install-guide')).toBeNull();
  });
});
