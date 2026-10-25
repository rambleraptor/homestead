import { useQuery } from '@tanstack/react-query';

/**
 * Whether the server has an AI provider configured (`GET /api/chat`, no model
 * call). `undefined` while it's being asked; `false` when it can't be.
 */
export function useAiConfigured(): boolean | undefined {
  const { data } = useQuery({
    queryKey: ['chat', 'status'],
    queryFn: async () => {
      try {
        const res = await fetch('/api/chat');
        if (!res.ok) return false;
        const body = (await res.json()) as { configured?: boolean };
        return !!body.configured;
      } catch {
        return false;
      }
    },
    staleTime: 60_000,
  });
  return data;
}
