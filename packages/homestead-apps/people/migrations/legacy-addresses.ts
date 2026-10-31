/**
 * The legacy `person-shared-data` + `address` shapes, and the rule the
 * household backfills share for which addresses belong to which people.
 *
 * Server-only (under `migrations/`): the resources are being retired, so
 * nothing else reads them.
 */

import { personIdOf } from '../utils/relationships';

export interface LegacySharedData {
  id: string;
  person_a: string;
  person_b?: string;
  address_id?: string;
  created_by?: string;
}

export interface LegacyAddress {
  id: string;
  line1?: string;
  line2?: string;
  city?: string;
  state?: string;
  postal_code?: string;
  country?: string;
  wifi_network?: string;
  wifi_password?: string;
  shared_data_id?: string;
  created_by?: string;
}

export const ADDRESS_FIELDS = [
  'line1',
  'line2',
  'city',
  'state',
  'postal_code',
  'country',
  'wifi_network',
  'wifi_password',
] as const;

export type AddressFields = Partial<Record<(typeof ADDRESS_FIELDS)[number], string>>;

/** An address's household fields, trimmed, with blanks left out. */
export function addressFields(address: AddressFields): AddressFields {
  return Object.fromEntries(
    ADDRESS_FIELDS.map((f) => [f, address[f]?.trim() || undefined]),
  ) as AddressFields;
}

export function addressKey(fields: AddressFields): string {
  return ADDRESS_FIELDS.map((f) => fields[f]?.trim() ?? '').join('|');
}

/** Members + address: what makes two households the same one. */
export function householdKey(members: string[], fields: AddressFields): string {
  return `${[...members].sort().join(',')}#${addressKey(fields)}`;
}

/** A shared-data row's people that still exist, deduplicated, as bare ids. */
export function sharedDataMembers(sd: LegacySharedData, personIds: Set<string>): string[] {
  return [
    ...new Set([sd.person_a, sd.person_b].filter(Boolean).map((id) => personIdOf(id!))),
  ].filter((id) => personIds.has(id));
}

/**
 * A shared-data row's addresses: its primary (`address_id`) first, then every
 * address whose `shared_data_id` points back at it.
 */
export function sharedDataAddresses(
  sd: LegacySharedData,
  addresses: LegacyAddress[],
  addressById: Map<string, LegacyAddress>,
): LegacyAddress[] {
  const primary = sd.address_id ? addressById.get(sd.address_id) : undefined;
  const extras = addresses.filter((a) => a.shared_data_id === sd.id && a.id !== sd.address_id);
  return primary ? [primary, ...extras] : extras;
}
