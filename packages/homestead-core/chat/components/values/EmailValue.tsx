import { Mail } from 'lucide-react';
import type { ChatValueProps } from '@rambleraptor/homestead-core/apps/types';
import { ValueLink } from './ValueLink';

/**
 * A plain address and nothing else: no `?subject=`/`&body=`, no spaces, so a
 * reply can't hand the mail app a prefilled message.
 */
const EMAIL = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$/;

/** An email address in a reply: tap to write to it. */
export default function EmailValue({ text }: ChatValueProps) {
  const address = text.trim();
  if (!EMAIL.test(address)) return <>{text}</>;
  return <ValueLink type="email" href={`mailto:${address}`} text={text} icon={Mail} label="Send an email" />;
}
