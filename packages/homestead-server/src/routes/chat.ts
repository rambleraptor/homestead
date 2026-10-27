import { Hono } from 'hono';
import { isAiConfigured } from '@rambleraptor/homestead-core/server/ai/config';
import { handleChat } from '../app-registry';

export const chatRoute = new Hono();

// Cheap availability probe (no model call): reports whether AI is usable — an
// `ai` block and a key (from the config, AI_API_KEY, or Credentials). The home
// and the admin checklist use it, so a key set in Credentials shows at once.
chatRoute.get('/', (c) => c.json({ configured: isAiConfigured() }));

chatRoute.post('/', (c) => handleChat(c.req.raw));
