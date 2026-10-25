import { Phone } from 'lucide-react';
import type { ChatValueProps } from '@rambleraptor/homestead-core/apps/types';
import { ValueLink } from './ValueLink';

/** Digits (and a leading +) a dialer takes, or null when there aren't enough. */
export function dialable(text: string): string | null {
  const plus = text.trim().startsWith('+') ? '+' : '';
  const digits = text.replace(/\D/g, '');
  return digits.length >= 3 && digits.length <= 20 ? `${plus}${digits}` : null;
}

/** A phone number in a reply: tap to call. */
export default function PhoneValue({ text }: ChatValueProps) {
  const number = dialable(text);
  if (!number) return <>{text}</>;
  return <ValueLink type="phone" href={`tel:${number}`} text={text} icon={Phone} label="Call" />;
}
