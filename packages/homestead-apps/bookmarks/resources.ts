import type { ResourceDefinition } from '@rambleraptor/homestead-core/resources/types';

/**
 * Collection plurals — the URL segments. A page lives under its bookmark and
 * shares its id (`bookmarks/{id}/pages/{id}`): there is at most one, and the
 * shared id keeps each page's cache slot its own.
 */
export const BOOKMARKS = 'bookmarks' as const;
export const BOOKMARK_PAGES = 'pages' as const;
/** A person's drop-box inboxes: `users/{id}/bookmark-inboxes/{id}`. */
export const BOOKMARK_INBOXES = 'bookmark-inboxes' as const;

/** `saved_via` on a bookmark that came through the drop box. */
export const SAVED_VIA_DROP_BOX = 'drop-box' as const;

export const VISIBILITY_HOUSEHOLD = 'household' as const;
export const VISIBILITY_PRIVATE = 'private' as const;

export const bookmarksResources: ResourceDefinition[] = [
  {
    singular: 'bookmark',
    plural: BOOKMARKS,
    description:
      'A saved link: an article, video or page to come back to. Each one is either private to ' +
      'whoever saved it or shared with the whole household (visibility, fixed when it is saved). ' +
      'Homestead fetches the page after saving and fills in the title, site, excerpt and a ' +
      'readable copy (the bookmark\'s page).',
    user_settable_create: true,
    // One collection holds both kinds: a member reaches every household
    // bookmark plus their own private ones.
    access: {
      model: 'per-record',
      field: 'visibility',
      sharedValue: VISIBILITY_HOUSEHOLD,
      privateValue: VISIBILITY_PRIVATE,
    },
    // A reading list should be there with no signal.
    offline: 'keep',
    fields: {
      url: { type: 'string', required: true, description: 'The address that was saved (http or https).' },
      visibility: {
        type: 'string',
        enum: [VISIBILITY_HOUSEHOLD, VISIBILITY_PRIVATE],
        default: VISIBILITY_PRIVATE,
        immutable: true,
        description:
          'Who can see it: "private" (only whoever saved it) or "household" (everyone). ' +
          'Set when saving and never changed afterwards.',
      },
      title: { type: 'string', description: 'The page title. Filled in from the page when left out.' },
      site_name: { type: 'string', description: 'The site it is from (e.g. "The Verge"). Filled in from the page.' },
      author: { type: 'string', description: 'Who wrote it, when the page says. Filled in from the page.' },
      excerpt: { type: 'string', description: 'A sentence or two about the page. Filled in from the page.' },
      image_url: { type: 'string', description: 'The page\'s preview image. Filled in from the page.' },
      kind: {
        type: 'string',
        enum: ['article', 'video', 'pdf', 'page'],
        description: 'What the link is. Filled in from the page.',
      },
      tags: {
        type: 'array',
        items: { type: 'string' },
        description: 'Short lowercase labels for finding it later (e.g. "recipes", "travel").',
      },
      read: { type: 'boolean', description: 'Whether it has been read. Unset means unread.' },
      favorite: { type: 'boolean', description: 'Marked as a favorite.' },
      saved_at: {
        type: 'string',
        format: 'date-time',
        stamp: 'create',
        description: 'When it was saved, by the saver\'s clock. The list is ordered by it. Leave it out to mean now.',
      },
      status: {
        type: 'string',
        enum: ['pending', 'ready', 'failed'],
        default: 'pending',
        description:
          'Where fetching the page stands: "pending" (waiting to be fetched — set it back to this to ' +
          'fetch again), "ready", or "failed" (the link still works). Leave it out when saving.',
      },
      fetch_error: { type: 'string', description: 'Why the page could not be fetched, when status is "failed".' },
      saved_via: {
        type: 'string',
        enum: [SAVED_VIA_DROP_BOX],
        description:
          'Set by Homestead on a bookmark it collected from the drop box (a link shared from a phone). ' +
          'Unset for one saved any other way. Leave it out.',
      },
      created_by: { type: 'string', reference: { resource: 'user' } },
    },
  },
  {
    singular: 'bookmark-page',
    plural: BOOKMARK_PAGES,
    parents: ['bookmark'],
    description:
      'The readable copy of a bookmark\'s page, as Markdown — what the reader shows. Written by ' +
      'Homestead when it fetches the page; there is at most one per bookmark, with the same id as the bookmark.',
    // The text is whatever a web page said, at length. Until model tools can
    // hand it over marked as untrusted (as the MCP broker does for outside
    // tools), it stays out of them: a saved page must not be able to instruct
    // an assistant that can write to the household's data.
    modelTools: { chat: false, mcp: false },
    fields: {
      content: { type: 'string', description: 'The page\'s main text, as Markdown.' },
      word_count: { type: 'number', description: 'How many words the text has.' },
      source_url: { type: 'string', description: 'The address the text was fetched from, after redirects.' },
    },
  },
  {
    singular: 'bookmark-inbox',
    plural: BOOKMARK_INBOXES,
    // Under the user root: an inbox is its owner's alone, and the links
    // collected from it are filed as theirs.
    parents: ['user'],
    description:
      'A place links shared from a phone arrive: one per shortcut. The shortcut sends links to the ' +
      'drop box (a separate public server) under a key; Homestead collects them from there into ' +
      'the owner\'s bookmarks. Deleting an inbox stops its key working.',
    user_settable_create: true,
    // Plumbing for a phone's shortcut, not something to ask the assistant about.
    modelTools: { chat: false, mcp: false },
    fields: {
      name: { type: 'string', required: true, description: 'What it is for, e.g. "iPhone shortcut".' },
      box: {
        type: 'string',
        required: true,
        immutable: true,
        description:
          'The SHA-256 (hex) of the key the shortcut sends. The key itself is never stored: it is ' +
          'made in the browser and shown once.',
      },
      visibility: {
        type: 'string',
        enum: [VISIBILITY_HOUSEHOLD, VISIBILITY_PRIVATE],
        default: VISIBILITY_PRIVATE,
        description: 'Who sees the bookmarks collected from it: "private" (its owner) or "household".',
      },
    },
  },
];
