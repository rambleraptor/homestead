import { useMutation, useQueryClient } from '@tanstack/react-query';
import { getCollection, getCurrentUser, Collections } from '@/core/api/pocketbase';
import { queryKeys } from '@/core/api/queryClient';
import type { PersonCSVData, NotificationPreference } from '../types';
import { createSharedData, setPartner } from '../utils/sharedDataSync';
import { logger } from '@/core/utils/logger';
import type { ParsedItem, BulkImportResult } from '@/shared/bulk-import/types';

interface PersonRecord {
  id: string;
  name: string;
  birthday?: string;
  notification_preferences: NotificationPreference[];
  created_by: string;
  created: string;
  updated: string;
}

interface CreatedPersonInfo {
  record: PersonRecord;
  partnerName?: string;
}

/**
 * Custom bulk import hook for people that handles:
 * - Creating person records
 * - Creating shared_data with address and anniversary
 * - Establishing partner relationships by name matching
 */
export function useBulkImportPeople() {
  const queryClient = useQueryClient();
  const currentUser = getCurrentUser();

  return useMutation({
    mutationFn: async (items: ParsedItem<PersonCSVData>[]): Promise<BulkImportResult> => {
      const results: BulkImportResult = {
        successful: 0,
        failed: 0,
        errors: [],
      };

      // Filter to only valid items
      const validItems = items.filter(item => item.isValid);

      // First pass: Create all people and their shared data (without partner relationships)
      const createdPeople: CreatedPersonInfo[] = [];

      for (const item of validItems) {
        const personData = item.data;

        try {
          // Create person record (without address/anniversary - those go in shared_data)
          const personRecord = await getCollection<PersonRecord>(Collections.PEOPLE).create({
            name: personData.name,
            birthday: personData.birthday,
            notification_preferences: personData.notification_preferences ?? ['day_of'],
            created_by: currentUser?.id,
          });

          // Build address data from flat fields
          const hasAddressData = personData.address || personData.wifi_network;
          const addressData = hasAddressData ? {
            line1: personData.address || '',
            wifi_network: personData.wifi_network,
            wifi_password: personData.wifi_password,
          } : undefined;

          // Create shared data if address or anniversary provided (without partner for now)
          if (addressData || personData.anniversary) {
            await createSharedData({
              personId: personRecord.id,
              address: addressData,
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
          results.errors.push({
            rowNumber: item.rowNumber,
            error: errorMessage,
          });
        }
      }

      // Second pass: Resolve partner relationships by name
      // Build a map of name -> person ID for quick lookups
      const nameToIdMap = new Map<string, string>();
      for (const { record } of createdPeople) {
        // Use lowercase for case-insensitive matching
        nameToIdMap.set(record.name.toLowerCase(), record.id);
      }

      // Also fetch existing people from the database for matching
      try {
        const existingPeople = await getCollection<PersonRecord>(Collections.PEOPLE).getFullList();
        for (const person of existingPeople) {
          // Only add if not already in the map (newly created people take precedence)
          if (!nameToIdMap.has(person.name.toLowerCase())) {
            nameToIdMap.set(person.name.toLowerCase(), person.id);
          }
        }
      } catch (error) {
        logger.warn('Failed to fetch existing people for partner matching', { error });
      }

      // Now resolve partner relationships
      const processedPartners = new Set<string>(); // Track to avoid duplicate processing
      for (const { record, partnerName } of createdPeople) {
        if (!partnerName) continue;

        const partnerKey = [record.name.toLowerCase(), partnerName.toLowerCase()].sort().join('|');
        if (processedPartners.has(partnerKey)) {
          // Already processed this pair from the other side
          continue;
        }

        const partnerId = nameToIdMap.get(partnerName.toLowerCase());
        if (partnerId) {
          try {
            // Use setPartner to establish the relationship
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
            // Continue with import even if partner linking fails
          }
        } else {
          logger.warn('Partner not found', {
            person: record.name,
            partnerName,
          });
          // Continue with import - partner just won't be linked
        }
      }

      if (results.failed > 0) {
        logger.error('Bulk import errors', { errors: results.errors });
      }

      return results;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.module('people').list(),
      });
    },
  });
}