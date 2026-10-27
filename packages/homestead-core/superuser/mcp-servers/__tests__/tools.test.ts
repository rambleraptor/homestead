import { describe, expect, it } from 'vitest';
import { mcpToolName, mergeTools, type McpTool } from '../tools';

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

describe('mergeTools and input schemas', () => {
  it('stores the schema the server reports now, replacing the one from the last check', () => {
    const schema = { type: 'object', properties: { entity: { type: 'string' } } };
    const [tool] = mergeTools([{ name: 'get_state', policy: 'read', input_schema: { type: 'object' } }], [
      { name: 'get_state', inputSchema: schema },
    ]);
    expect(tool).toEqual({ name: 'get_state', policy: 'read', input_schema: schema });
  });
});

describe('mcpToolName', () => {
  it('names a tool by its server and itself, in the characters providers accept', () => {
    expect(mcpToolName('18a2f3', 'get_state')).toBe('mcp_18a2f3__get_state');
    expect(mcpToolName('ha', 'calendar.list events')).toBe('mcp_ha__calendar_list_events');
  });

  it('stays within 64 characters', () => {
    expect(mcpToolName('ha', 'x'.repeat(100))).toHaveLength(64);
  });
});
