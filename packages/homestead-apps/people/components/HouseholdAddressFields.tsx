/**
 * Address + WiFi inputs for a household. Shared by the household form and the
 * person form's "New household" shortcut; `idPrefix` keeps their ids apart.
 */

import type { HouseholdFormData } from '../types';

type AddressField = 'line1' | 'wifi_network' | 'wifi_password';

interface HouseholdAddressFieldsProps {
  idPrefix: string;
  value: Pick<HouseholdFormData, AddressField>;
  onChange: (field: AddressField, value: string) => void;
}

const inputClass =
  'w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent';

export function HouseholdAddressFields({ idPrefix, value, onChange }: HouseholdAddressFieldsProps) {
  return (
    <div className="space-y-3">
      <div>
        <label htmlFor={`${idPrefix}-line1`} className="block text-sm font-medium text-gray-700 mb-1">
          Address
        </label>
        <input
          type="text"
          id={`${idPrefix}-line1`}
          value={value.line1 ?? ''}
          onChange={(e) => onChange('line1', e.target.value)}
          className={inputClass}
          placeholder="123 Main St, San Francisco, CA 94102"
        />
      </div>

      <div>
        <label
          htmlFor={`${idPrefix}-wifi-network`}
          className="block text-sm font-medium text-gray-700 mb-1"
        >
          WiFi Network (optional)
        </label>
        <input
          type="text"
          id={`${idPrefix}-wifi-network`}
          value={value.wifi_network ?? ''}
          onChange={(e) => onChange('wifi_network', e.target.value)}
          className={inputClass}
          placeholder="MyHomeNetwork"
        />
      </div>

      {value.wifi_network && (
        <div>
          <label
            htmlFor={`${idPrefix}-wifi-password`}
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            WiFi Password (optional)
          </label>
          <input
            type="password"
            id={`${idPrefix}-wifi-password`}
            value={value.wifi_password ?? ''}
            onChange={(e) => onChange('wifi_password', e.target.value)}
            className={inputClass}
            placeholder="••••••••"
          />
        </div>
      )}
    </div>
  );
}
