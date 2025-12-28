import { useMutation, useQueryClient } from '@tanstack/react-query';
import { getCollection, getCurrentUser, Collections } from '@/core/api/pocketbase';
import { queryKeys } from '@/core/api/queryClient';
import { logger } from '@/core/utils/logger';
import type { PersonFormData, NotificationPreference } from '../types';
import { createSharedData, setPartner } from '../utils/sharedDataSync';

interface PersonRecord {
  id: string;
  name: string;
  birthday?: string;
  notification_preferences: NotificationPreference[];
  created_by: string;
  created: string;
  updated: string;
}

export function useCreatePerson() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: PersonFormData) => {
      try {
        const currentUser = getCurrentUser();

        // Create person record (without address/anniversary - those go in shared_data)
        const personRecord = await getCollection<PersonRecord>(Collections.PEOPLE).create({
          name: data.name,
          birthday: data.birthday,
          notification_preferences: data.notification_preferences,
          created_by: currentUser?.id,
        });

        // Build address data from flat fields
        const hasAddressData = data.address || data.wifi_network;
        const addressData = hasAddressData ? {
          line1: data.address || '',
          wifi_network: data.wifi_network,
          wifi_password: data.wifi_password,
        } : undefined;

        // Handle shared data
        if (data.partner_id) {
          // Create shared data with partner
          await setPartner(personRecord.id, data.partner_id, {
            address: addressData,
            anniversary: data.anniversary,
          });
        } else if (addressData || data.anniversary) {
          // Create shared data for individual person
          await createSharedData({
            personId: personRecord.id,
            address: addressData,
            anniversary: data.anniversary,
          });
        }

        return personRecord;
      } catch (error) {
        logger.error('Failed to create person', error, { personData: data });
        throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.module('people').list(),
      });
    },
    onError: (error) => {
      logger.error('Person creation mutation error', error);
    },
  });
}
