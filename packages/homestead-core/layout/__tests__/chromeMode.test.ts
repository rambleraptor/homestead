import { beforeEach, describe, expect, it } from 'vitest';
import {
  chromeModeFromSearch,
  chromelessUrl,
  readChromeless,
  writeChromeless,
} from '../chromeMode';

describe('chromeModeFromSearch', () => {
  it('recognizes the two explicit modes and nothing else', () => {
    expect(chromeModeFromSearch('?chrome=none')).toBe('none');
    expect(chromeModeFromSearch('?x=1&chrome=full')).toBe('full');
    expect(chromeModeFromSearch('?chrome=maybe')).toBeNull();
    expect(chromeModeFromSearch('')).toBeNull();
  });
});

describe('chromelessUrl', () => {
  it('appends the parameter to a bare path', () => {
    expect(chromelessUrl('/todos')).toBe('/todos?chrome=none');
  });

  it('keeps an existing query string and hash', () => {
    expect(chromelessUrl('/todos?tab=done#top')).toBe('/todos?tab=done&chrome=none#top');
  });

  it('overrides a conflicting value', () => {
    expect(chromelessUrl('/todos?chrome=full')).toBe('/todos?chrome=none');
  });
});

describe('session persistence', () => {
  beforeEach(() => window.sessionStorage.clear());

  it('defaults to chrome on', () => {
    expect(readChromeless()).toBe(false);
  });

  it('round-trips', () => {
    writeChromeless(true);
    expect(readChromeless()).toBe(true);
    writeChromeless(false);
    expect(readChromeless()).toBe(false);
  });
});
