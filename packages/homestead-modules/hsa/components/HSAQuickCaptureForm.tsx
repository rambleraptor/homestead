/**
 * HSA Quick Capture Form Component
 *
 * Form for adding new HSA receipts with AI-powered receipt parsing
 */

import { useState } from 'react';
import { Upload, X, Sparkles, Loader2 } from 'lucide-react';
import { aepbase } from '@/core/api/aepbase';
import type { HSAReceiptFormData, ReceiptCategory } from '../types';

/**
 * Convert the first page of a PDF to a PNG image
 * Dynamically imports pdfjs-dist to avoid SSR issues
 */
async function convertPdfToImage(pdfFile: File): Promise<{ base64: string; mimeType: string }> {
  // Dynamic import to avoid SSR issues
  const pdfjsLib = await import('pdfjs-dist');

  // Configure PDF.js worker
  pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

  const arrayBuffer = await pdfFile.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const page = await pdf.getPage(1); // Get first page

  // Set up canvas with appropriate scale for good quality
  const viewport = page.getViewport({ scale: 2.0 });
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');

  if (!context) {
    throw new Error('Failed to get canvas context');
  }

  canvas.height = viewport.height;
  canvas.width = viewport.width;

  // Render PDF page to canvas
  const renderContext = {
    canvasContext: context,
    viewport: viewport,
    canvas: canvas,
  };
  await page.render(renderContext).promise;

  // Convert canvas to base64 PNG
  const base64 = canvas.toDataURL('image/png').split(',')[1];

  return {
    base64,
    mimeType: 'image/png',
  };
}

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
  const [isParsing, setIsParsing] = useState(false);
  const [parseSuccess, setParseSuccess] = useState(false);

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

  const parseReceipt = async () => {
    if (!selectedFile) return;

    setIsParsing(true);
    setError(null);
    setParseSuccess(false);

    try {
      let base64Data: string;
      let mimeType: string;

      // Handle PDF files by converting to image first
      if (selectedFile.type === 'application/pdf') {
        const converted = await convertPdfToImage(selectedFile);
        base64Data = converted.base64;
        mimeType = converted.mimeType;
      } else {
        // Handle image files directly
        const reader = new FileReader();
        const base64Promise = new Promise<string>((resolve, reject) => {
          reader.onload = () => {
            const base64 = reader.result as string;
            // Remove data URL prefix
            const base64DataPart = base64.split(',')[1];
            resolve(base64DataPart);
          };
          reader.onerror = reject;
        });

        reader.readAsDataURL(selectedFile);
        base64Data = await base64Promise;
        mimeType = selectedFile.type;
      }

      // Call API to parse receipt
      const token = aepbase.authStore.token;
      const userId = aepbase.getCurrentUser()?.id || '';
      const response = await fetch('/api/hsa/parse-receipt', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          'X-User-Id': userId,
        },
        body: JSON.stringify({
          image: base64Data,
          mimeType: mimeType,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to parse receipt');
      }

      const result = await response.json();

      // Auto-fill form with parsed data
      setFormData({
        ...formData,
        merchant: result.data.merchant,
        service_date: result.data.service_date,
        amount: result.data.amount,
        category: result.data.category,
        patient: result.data.patient || '',
      });

      setParseSuccess(true);
      setTimeout(() => setParseSuccess(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to parse receipt');
    } finally {
      setIsParsing(false);
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
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-accent-terracotta focus:border-accent-terracotta"
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
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-accent-terracotta focus:border-accent-terracotta"
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
              className="w-full pl-7 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-accent-terracotta focus:border-accent-terracotta"
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
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-accent-terracotta focus:border-accent-terracotta"
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
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-accent-terracotta focus:border-accent-terracotta"
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
          <label className="flex items-center justify-center w-full px-4 py-3 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-accent-terracotta transition-colors">
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
          <div className="space-y-2">
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
            {/* Parse Receipt Button - For images and PDFs */}
            <button
              type="button"
              onClick={parseReceipt}
              disabled={isParsing}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-purple-500 hover:bg-purple-600 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isParsing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {selectedFile.type === 'application/pdf' ? 'Converting PDF and parsing...' : 'Parsing receipt...'}
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  Parse Receipt with AI
                  {selectedFile.type === 'application/pdf' && ' (PDF will be converted)'}
                </>
              )}
            </button>
            {/* Success Message */}
            {parseSuccess && (
              <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                <p className="text-sm text-green-700 flex items-center gap-2">
                  <Sparkles className="w-4 h-4" />
                  Receipt parsed! Form fields have been auto-filled.
                </p>
              </div>
            )}
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
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-accent-terracotta focus:border-accent-terracotta"
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
          data-testid="hsa-receipt-form-submit"
          className="px-4 py-2 bg-accent-terracotta hover:bg-accent-terracotta-hover text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
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
