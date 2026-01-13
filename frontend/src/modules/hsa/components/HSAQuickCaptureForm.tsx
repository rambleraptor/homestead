/**
 * HSA Quick Capture Form Component
 *
 * Form for adding new HSA receipts
 */

import { useState } from 'react';
import { Upload, X } from 'lucide-react';
import type { HSAReceiptFormData, ReceiptCategory } from '../types';

interface HSAQuickCaptureFormProps {
  onSubmit: (data: HSAReceiptFormData) => Promise<void>;
  onCancel: () => void;
  isSubmitting: boolean;
}

export function HSAQuickCaptureForm({
  onSubmit,
  onCancel,
  isSubmitting,
}: HSAQuickCaptureFormProps) {
  const [formData, setFormData] = useState<HSAReceiptFormData>({
    merchant: '',
    service_date: '',
    amount: 0,
    category: 'Medical',
    patient: '',
    status: 'Stored',
    notes: '',
  });
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!selectedFile) {
      setError('Please select a receipt file');
      return;
    }

    if (formData.amount <= 0) {
      setError('Amount must be greater than 0');
      return;
    }

    try {
      await onSubmit({
        ...formData,
        receipt_file: selectedFile,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save receipt');
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Validate file type
      const validTypes = [
        'image/jpeg',
        'image/png',
        'image/webp',
        'image/gif',
        'application/pdf',
      ];
      if (!validTypes.includes(file.type)) {
        setError('Invalid file type. Please upload an image or PDF.');
        setSelectedFile(null);
        return;
      }

      // Validate file size (10MB)
      if (file.size > 10485760) {
        setError('File size must be less than 10MB');
        setSelectedFile(null);
        return;
      }

      setError(null);
      setSelectedFile(file);
    }
  };

  const handleRemoveFile = () => {
    setSelectedFile(null);
    setError(null);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Merchant */}
        <div>
          <label htmlFor="merchant" className="block text-sm font-medium text-gray-700 mb-1">
            Merchant <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            id="merchant"
            required
            value={formData.merchant}
            onChange={(e) => setFormData({ ...formData, merchant: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            placeholder="Doctor's Office, Pharmacy, etc."
          />
        </div>

        {/* Service Date */}
        <div>
          <label htmlFor="service_date" className="block text-sm font-medium text-gray-700 mb-1">
            Service Date <span className="text-red-500">*</span>
          </label>
          <input
            type="date"
            id="service_date"
            required
            value={formData.service_date}
            onChange={(e) => setFormData({ ...formData, service_date: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
          />
        </div>

        {/* Amount */}
        <div>
          <label htmlFor="amount" className="block text-sm font-medium text-gray-700 mb-1">
            Amount <span className="text-red-500">*</span>
          </label>
          <div className="relative">
            <span className="absolute left-3 top-2 text-gray-500">$</span>
            <input
              type="number"
              id="amount"
              required
              min="0.01"
              step="0.01"
              value={formData.amount || ''}
              onChange={(e) => setFormData({ ...formData, amount: parseFloat(e.target.value) || 0 })}
              className="w-full pl-7 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              placeholder="0.00"
            />
          </div>
        </div>

        {/* Category */}
        <div>
          <label htmlFor="category" className="block text-sm font-medium text-gray-700 mb-1">
            Category <span className="text-red-500">*</span>
          </label>
          <select
            id="category"
            required
            value={formData.category}
            onChange={(e) => setFormData({ ...formData, category: e.target.value as ReceiptCategory })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
          >
            <option value="Medical">Medical</option>
            <option value="Dental">Dental</option>
            <option value="Vision">Vision</option>
            <option value="Rx">Rx (Prescription)</option>
          </select>
        </div>

        {/* Patient */}
        <div>
          <label htmlFor="patient" className="block text-sm font-medium text-gray-700 mb-1">
            Patient
          </label>
          <input
            type="text"
            id="patient"
            value={formData.patient}
            onChange={(e) => setFormData({ ...formData, patient: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            placeholder="Self, Spouse, Child, etc."
          />
        </div>
      </div>

      {/* Receipt File */}
      <div>
        <label htmlFor="receipt_file" className="block text-sm font-medium text-gray-700 mb-1">
          Receipt File <span className="text-red-500">*</span>
        </label>
        {!selectedFile ? (
          <label className="flex items-center justify-center w-full px-4 py-3 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-primary-500 transition-colors">
            <Upload className="w-5 h-5 text-gray-400 mr-2" />
            <span className="text-sm text-gray-600">
              Upload receipt (Image or PDF, max 10MB)
            </span>
            <input
              type="file"
              id="receipt_file"
              accept="image/jpeg,image/png,image/webp,image/gif,application/pdf"
              onChange={handleFileChange}
              className="hidden"
            />
          </label>
        ) : (
          <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border border-gray-300 rounded-lg">
            <span className="text-sm text-gray-700 truncate">{selectedFile.name}</span>
            <button
              type="button"
              onClick={handleRemoveFile}
              className="ml-2 text-red-500 hover:text-red-700"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        )}
      </div>

      {/* Notes */}
      <div>
        <label htmlFor="notes" className="block text-sm font-medium text-gray-700 mb-1">
          Notes
        </label>
        <textarea
          id="notes"
          value={formData.notes}
          onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
          rows={3}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
          placeholder="Additional notes about this expense..."
        />
      </div>

      {/* Actions */}
      <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-200">
        <button
          type="button"
          onClick={onCancel}
          disabled={isSubmitting}
          className="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={isSubmitting}
          className="px-4 py-2 bg-primary-500 hover:bg-primary-600 text-gray-900 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
        >
          {isSubmitting ? (
            <>
              <div className="w-4 h-4 border-2 border-gray-900 border-t-transparent rounded-full animate-spin" />
              Saving...
            </>
          ) : (
            'Save Receipt'
          )}
        </button>
      </div>
    </form>
  );
}
