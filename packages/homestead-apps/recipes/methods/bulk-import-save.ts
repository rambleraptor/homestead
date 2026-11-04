/**
 * Recipes bulk-import saver.
 *
 * Server-only (under `methods/`, so the client build stubs it out). Every
 * format writes one recipe per item exactly as the default saver would; the
 * social-post format then files the new recipes into the automatic "From
 * social" cookbook. The cookbook step is best-effort: the recipes are already
 * saved, so a failure there is logged rather than turned into a failed import.
 */

import type { BulkImportSaver } from '@rambleraptor/homestead-core/resources/bulk-import/types';
import { createOnePerItem } from '@rambleraptor/homestead-core/server/bulk-import/handler';
import { serverClient } from '@rambleraptor/homestead-core/server/client';
import { logger } from '@rambleraptor/homestead-core/utils/logger';
import { fileInSocialCookbook } from './social-cookbook';

export const SOCIAL_FORMAT = 'social';

export const save: BulkImportSaver = async ({ items, ctx }) => {
  const result = await createOnePerItem({ items, ctx });
  if (ctx.format !== SOCIAL_FORMAT) return result;

  try {
    await fileInSocialCookbook(
      serverClient(ctx.auth.token),
      result.createdIds ?? [],
      ctx.auth.user.path,
    );
  } catch (error) {
    logger.error('recipes: could not file social imports into the cookbook', error);
  }
  return result;
};
