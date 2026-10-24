/**
 * Update Person Mutation Hook.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { aepbase } from '@rambleraptor/homestead-core/api/aepbase';
import { PEOPLE } from '../resources';
import { queryKeys } from '@rambleraptor/homestead-core/api/queryClient';
import type { PersonFormData } from '../types';
import {
  findSharedDataForPerson,
  updateSharedData,
  createSharedData,
  setPartner,
  removePartner,
} from '../utils/sharedDataSync';
import { listRelationships, syncRelationships } from '../utils/relationshipSync';
import { personIdOf } from '../utils/relationships';
import { relativesFromForm } from './useCreatePerson';

interface UpdatePersonData {
  id: string;
  data: PersonFormData;
}

interface PersonRecord {
  id: string;
  name: string;
  created_by?: string;
  create_time?: string;
  update_time?: string;
}

async function currentPartnerId(id: string): Promise<string | undefined> {
  const rows = await listRelationships();
  const row = rows.find(
    (r) =>
      r.kind === 'partner' &&
      (personIdOf(r.person_a) === id || personIdOf(r.person_b) === id),
  );
  if (!row) return undefined;
  const a = personIdOf(row.person_a);
  return a === id ? personIdOf(row.person_b) : a;
}

export function useUpdatePerson() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, data }: UpdatePersonData) => {
      const oldSharedData = await findSharedDataForPerson(id);
      const oldPartnerId = await currentPartnerId(id);

      const personRecord = await aepbase.update<PersonRecord>(PEOPLE, id, {
        name: data.name,
        aliases: data.aliases,
      });

      // Choosing a partner in the form still merges the two address records,
      // and removing one splits them. Partnership itself is the relationship row.
      const newPartnerId = data.partner_id || undefined;
      if (oldPartnerId !== newPartnerId) {
        if (oldPartnerId) await removePartner(id, oldPartnerId);
        if (newPartnerId) {
          await setPartner(id, newPartnerId, { addresses: data.addresses });
        }
      } else if (oldSharedData) {
        await updateSharedData(oldSharedData.id, {
          addresses: data.addresses,
        });
      } else if (data.addresses.length > 0) {
        await createSharedData({
          personId: id,
          addresses: data.addresses,
        });
      }

      await syncRelationships(id, relativesFromForm(data));

      return personRecord;
    },
    onSuccess: () => {
      // Relatives show on the other side too, so every person's view is stale.
      queryClient.invalidateQueries({ queryKey: queryKeys.app('people').all() });
    },
  });
}
