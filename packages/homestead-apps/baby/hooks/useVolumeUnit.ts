import { useAppFlag } from '@rambleraptor/homestead-core/settings';
import type { VolumeUnit } from '../types';

/** The household's unit for bottle amounts (the `volume_unit` flag). */
export function useVolumeUnit(): VolumeUnit {
  const { value } = useAppFlag<string>('baby', 'volume_unit');
  return value === 'ml' ? 'ml' : 'oz';
}
