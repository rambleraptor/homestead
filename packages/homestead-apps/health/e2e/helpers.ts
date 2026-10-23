/**
 * Health E2E helpers — seed vaccine series and dose records via the aepbase
 * REST API. Doses are children: `/vaccines/{id}/vaccinations/{id}`.
 */

import { e2eClient } from '../../../../tests/e2e/utils/aepbase-helpers';

export interface VaccineRecord {
  id: string;
  name: string;
  next_due?: string;
  notes?: string;
}

export type VaccineSeed = Omit<VaccineRecord, 'id'>;

export interface VaccinationRecord {
  id: string;
  date_administered: string;
  dose?: string;
  provider?: string;
  lot_number?: string;
  document?: string;
  notes?: string;
}

export type VaccinationSeed = Omit<VaccinationRecord, 'id'>;

export const testVaccines: VaccineSeed[] = [
  { name: 'Tdap', next_due: '2034-05-12' },
  { name: 'COVID-19' },
  { name: 'Influenza', notes: 'Yearly' },
];

export const testVaccinations: VaccinationSeed[] = [
  {
    date_administered: '2024-05-12',
    dose: 'booster',
    provider: 'CVS Pharmacy',
  },
  {
    date_administered: '2025-10-01',
    dose: '1 of 1',
    provider: 'Walgreens',
  },
];

export async function createVaccine(
  token: string,
  data: VaccineSeed,
): Promise<VaccineRecord> {
  return e2eClient(token).collection<VaccineRecord>('vaccines').create(data);
}

export async function listVaccines(token: string): Promise<VaccineRecord[]> {
  return e2eClient(token).collection<VaccineRecord>('vaccines').listAll();
}

export async function getVaccine(token: string, id: string): Promise<VaccineRecord> {
  return e2eClient(token).collection<VaccineRecord>('vaccines').get(id);
}

/** Doses live under `/vaccines/{vaccineId}/vaccinations`. */
function doses(token: string, vaccineId: string) {
  return e2eClient(token)
    .collection('vaccines')
    .record(vaccineId)
    .collection<VaccinationRecord>('vaccinations');
}

export async function createVaccination(
  token: string,
  vaccineId: string,
  data: VaccinationSeed,
): Promise<VaccinationRecord> {
  return doses(token, vaccineId).create(data);
}

export async function listVaccinations(
  token: string,
  vaccineId: string,
): Promise<VaccinationRecord[]> {
  return doses(token, vaccineId).listAll();
}

export async function getVaccination(
  token: string,
  vaccineId: string,
  id: string,
): Promise<VaccinationRecord> {
  return doses(token, vaccineId).get(id);
}

