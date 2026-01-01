import { Plus, Trash2 } from 'lucide-react';
import type { AddressFormData } from '../types';

interface AddressesInputProps {
  addresses: AddressFormData[];
  onChange: (addresses: AddressFormData[]) => void;
}

export function AddressesInput({ addresses, onChange }: AddressesInputProps) {
  const handleAddAddress = () => {
    onChange([
      ...addresses,
      {
        line1: '',
        line2: '',
        city: '',
        state: '',
        postal_code: '',
        country: '',
        wifi_network: '',
        wifi_password: '',
      },
    ]);
  };

  const handleRemoveAddress = (index: number) => {
    const newAddresses = addresses.filter((_, i) => i !== index);
    onChange(newAddresses);
  };

  const handleAddressChange = (index: number, field: keyof AddressFormData, value: string) => {
    const newAddresses = [...addresses];
    newAddresses[index] = {
      ...newAddresses[index],
      [field]: value,
    };
    onChange(newAddresses);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <label className="block text-sm font-medium text-gray-700">
          Addresses
        </label>
        <button
          type="button"
          onClick={handleAddAddress}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-md transition-colors"
        >
          <Plus className="w-4 h-4" />
          Add Address
        </button>
      </div>

      {addresses.length === 0 ? (
        <div className="text-sm text-gray-500 italic border border-dashed border-gray-300 rounded-lg p-4 text-center">
          No addresses added. Click &quot;Add Address&quot; to get started.
        </div>
      ) : (
        <div className="space-y-6">
          {addresses.map((address, index) => (
            <div
              key={index}
              className="border border-gray-200 rounded-lg p-4 bg-gray-50 space-y-3"
            >
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-sm font-medium text-gray-700">
                  Address {index + 1}
                </h4>
                <button
                  type="button"
                  onClick={() => handleRemoveAddress(index)}
                  className="inline-flex items-center gap-1.5 px-2 py-1 text-sm font-medium text-red-600 bg-red-50 hover:bg-red-100 rounded-md transition-colors"
                  aria-label={`Remove address ${index + 1}`}
                >
                  <Trash2 className="w-4 h-4" />
                  Remove
                </button>
              </div>

              {/* Address */}
              <div>
                <label
                  htmlFor={`address-${index}-line1`}
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  Address <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  id={`address-${index}-line1`}
                  value={address.line1}
                  onChange={(e) => handleAddressChange(index, 'line1', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="123 Main St, San Francisco, CA 94102"
                  required
                />
              </div>

              {/* WiFi Network */}
              <div>
                <label
                  htmlFor={`address-${index}-wifi-network`}
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  WiFi Network (optional)
                </label>
                <input
                  type="text"
                  id={`address-${index}-wifi-network`}
                  value={address.wifi_network || ''}
                  onChange={(e) => handleAddressChange(index, 'wifi_network', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="MyHomeNetwork"
                />
              </div>

              {/* WiFi Password */}
              {address.wifi_network && (
                <div>
                  <label
                    htmlFor={`address-${index}-wifi-password`}
                    className="block text-sm font-medium text-gray-700 mb-1"
                  >
                    WiFi Password (optional)
                  </label>
                  <input
                    type="password"
                    id={`address-${index}-wifi-password`}
                    value={address.wifi_password || ''}
                    onChange={(e) => handleAddressChange(index, 'wifi_password', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="••••••••"
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
