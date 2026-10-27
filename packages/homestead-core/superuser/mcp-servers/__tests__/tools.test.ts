import { describe, expect, it } from 'vitest';
import { mergeTools, type McpTool } from '../tools';

describe('mergeTools', () => {
  const existing: McpTool[] = [
    { name: 'turn_on', policy: 'ask', description: 'old text' },
    { name: 'get_state', policy: 'read', read_only: true },
    { name: 'retired', policy: 'allow' },
  ];

  it('keeps each tool’s policy, starts new tools off, and drops retired ones', () => {
    const merged = mergeTools(existing, [
      { name: 'turn_on', description: 'Turn on a device' },
      { name: 'get_state', annotations: { readOnlyHint: true } },
      { name: 'unlock_door', description: 'Unlock a door', annotations: { readOnlyHint: false } },
    ]);
    expect(merged).toEqual([
      { name: 'get_state', read_only: true, policy: 'read' },
      { name: 'turn_on', description: 'Turn on a device', policy: 'ask' },
      { name: 'unlock_door', description: 'Unlock a door', read_only: false, policy: 'off' },
    ]);
  });

  it('takes a title from the tool or its annotations, and ignores duplicates', () => {
    const merged = mergeTools(undefined, [
      { name: 'a', title: 'Tool A' },
      { name: 'b', annotations: { title: 'Tool B' } },
      { name: 'a', title: 'Again' },
    ]);
    expect(merged.map((t) => [t.name, t.title, t.policy])).toEqual([
      ['a', 'Tool A', 'off'],
      ['b', 'Tool B', 'off'],
    ]);
  });
});
