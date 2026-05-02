/**
 * Bulk import people from a parsed CSV.
 *
 * Creates each person, attaches address/anniversary via shared_data, and
 * in a second pass resolves partner-by-name references.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { aepbase, AepCollections } from '@/core/api/aepbase';
import { queryKeys } from '@/core/api/queryClient';
import type { PersonCSVData } from '../types';
import { createSharedData, setPartner } from '../utils/sharedDataSync';
import { logger } from '@/core/utils/logger';
import type { ParsedItem, BulkImportResult } from '@/shared/bulk-import/types';

interface PersonRecord {
  id: string;
  name: string;
  birthday?: string;
  created_by?: string;
  create_time?: string;
  update_time?: string;
}

interface CreatedPersonInfo {
  record: PersonRecord;
  partnerName?: string;
}

export function useBulkImportPeople() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (items: ParsedItem<PersonCSVData>[]): Promise<BulkImportResult> => {
      const userId = aepbase.getCurrentUser()?.id;
      const createdBy = userId ? `users/${userId}` : undefined;

      const results: BulkImportResult = {
        successful: 0,
        failed: 0,
        errors: [],
      };

      const validItems = items.filter((item) => item.isValid);
      const createdPeople: CreatedPersonInfo[] = [];

      // Pass 1: create people + shared data (no partners yet).
      for (const item of validItems) {
        const personData = item.data;
        try {
          const personRecord = await aepbase.create<PersonRecord>(
            AepCollections.PEOPLE,
            {
              name: personData.name,
              birthday: personData.birthday,
              created_by: createdBy,
            },
          );

          const hasAddressData = personData.address || personData.wifi_network;
          const addresses = hasAddressData
            ? [
                {
                  line1: personData.address || '',
                  wifi_network: personData.wifi_network,
                  wifi_password: personData.wifi_password,
                },
              ]
            : [];

          if (addresses.length > 0 || personData.anniversary) {
            await createSharedData({
              personId: personRecord.id,
              addresses: addresses,
              anniversary: personData.anniversary,
            });
          }

          createdPeople.push({
            record: personRecord,
            partnerName: personData.partner_name,
          });
          results.successful++;
        } catch (error) {
          results.failed++;
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          results.errors.push({ rowNumber: item.rowNumber, error: errorMessage });
        }
      }

      // Pass 2: resolve partner relationships by name.
      const nameToIdMap = new Map<string, string>();
      for (const { record } of createdPeople) {
        nameToIdMap.set(record.name.toLowerCase(), record.id);
      }

      try {
        const existingPeople = await aepbase.list<PersonRecord>(AepCollections.PEOPLE);
        for (const person of existingPeople) {
          if (!nameToIdMap.has(person.name.toLowerCase())) {
            nameToIdMap.set(person.name.toLowerCase(), person.id);
          }
        }
      } catch (error) {
        logger.warn('Failed to fetch existing people for partner matching', { error });
      }

      const processedPartners = new Set<string>();
      for (const { record, partnerName } of createdPeople) {
        if (!partnerName) continue;
        const partnerKey = [record.name.toLowerCase(), partnerName.toLowerCase()]
          .sort()
          .join('|');
        if (processedPartners.has(partnerKey)) continue;

        const partnerId = nameToIdMap.get(partnerName.toLowerCase());
        if (partnerId) {
          try {
            await setPartner(record.id, partnerId);
            processedPartners.add(partnerKey);
            logger.info('Partner relationship established', {
              person: record.name,
              partner: partnerName,
            });
          } catch (error) {
            logger.warn('Failed to establish partner relationship', {
              person: record.name,
              partner: partnerName,
              error,
            });
          }
        } else {
          logger.warn('Partner not found', { person: record.name, partnerName });
        }
      }

      if (results.failed > 0) {
        logger.error('Bulk import errors', { errors: results.errors });
      }
      return results;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.module('people').list() });
    },
  });
}
