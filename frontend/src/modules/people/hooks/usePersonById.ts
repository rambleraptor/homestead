/**
 * Single person hook — branches on the `people` flag.
 */

import { useQuery } from '@tanstack/react-query';
import { aepbase, AepCollections } from '@/core/api/aepbase';
import { getCollection, Collections } from '@/core/api/pocketbase';
import { isAepbaseEnabled } from '@/core/api/backend';
import { queryKeys } from '@/core/api/queryClient';
import type { Person, NotificationPreference, Address } from '../types';
import { findSharedDataForPerson } from '../utils/sharedDataSync';

interface PersonRecord {
  id: string;
  name: string;
  birthday?: string;
  notification_preferences: NotificationPreference[];
  created_by: string;
  created?: string;
  updated?: string;
  create_time?: string;
  update_time?: string;
}

function normalizeTimestamps(rec: PersonRecord): PersonRecord {
  return {
    ...rec,
    created: rec.created || rec.create_time || '',
    updated: rec.updated || rec.update_time || '',
  };
}

async function getPerson(id: string): Promise<PersonRecord> {
  if (isAepbaseEnabled('people')) {
    const rec = await aepbase.get<PersonRecord>(AepCollections.PEOPLE, id);
    return normalizeTimestamps(rec);
  }
  return await getCollection<PersonRecord>(Collections.PEOPLE).getOne(id);
}

async function getAddress(id: string): Promise<Address | null> {
  try {
    if (isAepbaseEnabled('people')) {
      return await aepbase.get<Address>(AepCollections.ADDRESSES, id);
    }
    return await getCollection<Address>(Collections.ADDRESSES).getOne(id);
  } catch {
    return null;
  }
}

async function listAdditionalAddresses(sharedDataId: string): Promise<Address[]> {
  try {
    if (isAepbaseEnabled('people')) {
      const all = await aepbase.list<Address>(AepCollections.ADDRESSES);
      return all.filter((a) => a.shared_data_id === sharedDataId);
    }
    return await getCollection<Address>(Collections.ADDRESSES).getFullList({
      filter: `shared_data_id = "${sharedDataId}"`,
    });
  } catch {
    return [];
  }
}

export function usePersonById(id: string) {
  return useQuery({
    queryKey: queryKeys.module('people').detail(id),
    queryFn: async () => {
      const record = await getPerson(id);
      const sharedData = await findSharedDataForPerson(id);

      const addresses: Address[] = [];

      if (sharedData) {
        if (sharedData.address_id) {
          const primary = await getAddress(sharedData.address_id);
          if (primary) addresses.push(primary);
        }
        const additional = await listAdditionalAddresses(sharedData.id);
        for (const address of additional) {
          if (address.id !== sharedData.address_id) addresses.push(address);
        }
      }

      let partner: Person | undefined;
      if (sharedData) {
        const partnerId =
          sharedData.person_a === id ? sharedData.person_b : sharedData.person_a;
        if (partnerId) {
          const partnerRecord = await getPerson(partnerId);
          partner = {
            ...partnerRecord,
            created: partnerRecord.created || '',
            updated: partnerRecord.updated || '',
            addresses,
            anniversary: sharedData.anniversary,
            partner: undefined,
          };
        }
      }

      const person: Person = {
        ...record,
        created: record.created || '',
        updated: record.updated || '',
        addresses,
        anniversary: sharedData?.anniversary,
        partner,
      };

      return person;
    },
    enabled: !!id,
  });
}
