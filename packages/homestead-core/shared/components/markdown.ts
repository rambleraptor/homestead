/**
 * Markdown rendering settings shared outside the chat.
 *
 * `MessageResponse` (Streamdown) renders Markdown, and by default also parses
 * any HTML written inside it (`rehype-raw`) before sanitizing the result. That
 * suits a model's reply. It does not suit text that came from somewhere else —
 * a saved web page — where HTML in the text should never become elements at
 * all, sanitized or not.
 */

import { defaultRehypePlugins, type StreamdownProps } from 'streamdown';

type RehypePlugins = NonNullable<StreamdownProps['rehypePlugins']>;

/**
 * Streamdown's rehype plugins without the raw-HTML pass: Markdown becomes
 * elements, and any HTML in the text is dropped instead of parsed. Pass as
 * `rehypePlugins` to render text Homestead didn't write.
 */
export const markdownOnlyRehypePlugins: RehypePlugins = [
  defaultRehypePlugins.sanitize,
  defaultRehypePlugins.harden,
] as RehypePlugins;
