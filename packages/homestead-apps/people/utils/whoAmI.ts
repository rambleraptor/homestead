/**
 * Which person is probably the signed-in user, from their display name: an
 * exact match, else a first-name match — but only when exactly one person
 * fits, so a guess is never a coin toss.
 */

const normalize = (name: string) => name.trim().replace(/\s+/g, ' ').toLowerCase();
const firstName = (name: string) => normalize(name).split(' ')[0] ?? '';

export function suggestSelf<P extends { name: string }>(people: readonly P[], displayName: string): P | undefined {
  const wanted = normalize(displayName);
  if (!wanted) return undefined;
  const exact = people.filter((p) => normalize(p.name) === wanted);
  if (exact.length > 0) return exact.length === 1 ? exact[0] : undefined;
  const first = people.filter((p) => firstName(p.name) === firstName(wanted));
  return first.length === 1 ? first[0] : undefined;
}
