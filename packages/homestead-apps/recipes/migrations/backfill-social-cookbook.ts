/**
 * File already-imported social recipes into the "From social" cookbook.
 *
 * The cookbook is new; recipes imported from TikTok, Instagram or YouTube
 * before it existed are recognisable by their `source_pointer`, which the
 * social importer sets to the post's URL. This seeds the cookbook once from
 * those, oldest first, so it isn't empty on day one. A recipe the importer
 * took from a blog page linked in a caption carries the blog's URL instead and
 * isn't caught — acceptable, since nothing marks it as social.
 *
 * Idempotent: recipes already in the cookbook are skipped, and when no recipe
 * qualifies no cookbook is created.
 */

import type { MigrationHandler } from '@rambleraptor/homestead-core/apps/migrations';
import { serverClient } from '@rambleraptor/homestead-core/server/client';
import { socialPlatform } from '../importers/socialPost';
import { fileInSocialCookbook } from '../methods/social-cookbook';
import { RECIPES } from '../resources';

interface RecipeRow {
  id: string;
  source_pointer?: string;
  create_time?: string;
}

const migrate: MigrationHandler = async ({ token, log }) => {
  const client = serverClient(token);
  const recipes = await client.collection<RecipeRow>(RECIPES).listAll();

  const social = recipes
    .filter((r) => r.source_pointer && socialPlatform(r.source_pointer) !== null)
    .sort((a, b) => (a.create_time ?? '').localeCompare(b.create_time ?? ''));

  const filed = await fileInSocialCookbook(
    client,
    social.map((r) => r.id),
  );
  if (filed > 0) await log(`filed ${filed} social recipes`);

  return { scanned: recipes.length, social: social.length, filed };
};

export default migrate;
