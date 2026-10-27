import { afterEach, describe, expect, test, vi } from 'vitest';
import { getAllCredentialSlots, initializeAppRegistry, resetAppRegistry } from '../registry';
import { logger } from '../../utils/logger';
import type { AppConfig } from '../types';

function app(id: string, credentials: AppConfig['credentials'], children?: AppConfig[]): AppConfig {
  return { id, name: `${id} app`, description: `${id} test app`, credentials, children };
}

afterEach(() => {
  resetAppRegistry();
  vi.restoreAllMocks();
});

describe('getAllCredentialSlots', () => {
  test('collects slots across apps and their children, with the app that declared each', () => {
    initializeAppRegistry([
      app('weather', [{ id: 'weather-api-key', label: 'Weather API key', env: 'WEATHER_API_KEY' }], [
        app('radar', [{ id: 'radar-token', label: 'Radar token' }]),
      ]),
    ]);
    expect(getAllCredentialSlots().map((s) => [s.appId, s.appName, s.id])).toEqual([
      ['weather', 'weather app', 'weather-api-key'],
      ['radar', 'radar app', 'radar-token'],
    ]);
  });

  test('drops a duplicate or non-kebab-case id with a warning', () => {
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => {});
    initializeAppRegistry([
      app('a', [
        { id: 'shared-key', label: 'A' },
        { id: 'Bad_Key', label: 'Bad' },
      ]),
      app('b', [{ id: 'shared-key', label: 'B' }]),
    ]);
    expect(getAllCredentialSlots().map((s) => [s.appId, s.id])).toEqual([['a', 'shared-key']]);
    expect(warn).toHaveBeenCalledTimes(2);
  });
});
