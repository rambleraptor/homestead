/**
 * The app's addresses, built in one place so a link and the route that
 * answers it can't drift apart. A merchant is named by the person, so its
 * segment is percent-encoded on the way out and decoded on the way in.
 */

export const GIFT_CARDS_HOME = '/gift-cards';

export function merchantHref(merchant: string): string {
  return `${GIFT_CARDS_HOME}/merchants/${encodeURIComponent(merchant)}`;
}

export function editCardHref(id: string): string {
  return `${GIFT_CARDS_HOME}/cards/${id}/edit`;
}

export const NEW_CARD_HREF = `${GIFT_CARDS_HOME}/new`;

/** The merchant a `:merchant` segment names; a malformed escape is kept as typed. */
export function decodeMerchantParam(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}
