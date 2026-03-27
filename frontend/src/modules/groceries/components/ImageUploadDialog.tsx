'use client';

/**
 * Image Upload Dialog Component
 *
 * Dialog for uploading grocery list images
 */

import { useState, useRef } from 'react';
import { X, Upload, Image as ImageIcon, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { useCreateGroceryItemsFromImage } from '../hooks/useCreateGroceryItemsFromImage';
import { logger } from '@/core/utils/logger';

interface ImageUploadDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

const SUCCESS_AUTO_CLOSE_DELAY_MS = 2000;

export function ImageUploadDialog({ isOpen, onClose }: ImageUploadDialogProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [extractedCount, setExtractedCount] = useState(0);
  const [createdCount, setCreatedCount] = useState(0);
  const [failedItems, setFailedItems] = useState<string[]>([]);
  const [fileError, setFileError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const createMutation = useCreateGroceryItemsFromImage();

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type - support standard image formats and HEIC/HEIF
    const validImageTypes = [
      'image/jpeg',
      'image/jpg',
      'image/png',
      'image/gif',
      'image/webp',
      'image/heic',
      'image/heif',
    ];

    const isValidType = file.type.startsWith('image/') || validImageTypes.includes(file.type.toLowerCase());
    if (!isValidType) {
      setFileError('Invalid file type. Please select an image.');
      return;
    }

    // Validate file size (max 20MB to support larger iPhone images)
    const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB
    if (file.size > MAX_FILE_SIZE) {
      setFileError('File too large. Maximum size is 20MB.');
      return;
    }

    setSelectedFile(file);
    setExtractedCount(0);
    setCreatedCount(0);
    setFailedItems([]);
    setFileError(null);

    // Create preview URL
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
  };

  const handleUpload = async () => {
    if (!selectedFile) return;

    try {
      const result = await createMutation.mutateAsync(selectedFile);
      setExtractedCount(result.extractedCount);
      setCreatedCount(result.createdItems.length);
      setFailedItems(result.failedItems);

      // Close dialog after successful upload (if all succeeded)
      if (result.failedItems.length === 0 && result.createdItems.length > 0) {
        setTimeout(() => {
          handleClose();
        }, SUCCESS_AUTO_CLOSE_DELAY_MS);
      }
    } catch (error) {
      logger.error('Failed to process image', error);
    }
  };

  const handleClose = () => {
    // Clean up preview URL
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
    setSelectedFile(null);
    setPreviewUrl(null);
    setExtractedCount(0);
    setCreatedCount(0);
    setFailedItems([]);
    setFileError(null);
    createMutation.reset();
    onClose();
  };

  if (!isOpen) return null;

  const isProcessing = createMutation.isPending;
  const isSuccess = createMutation.isSuccess;
  const isError = createMutation.isError;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-xl font-semibold text-gray-900 flex items-center gap-2">
            <ImageIcon className="w-6 h-6" />
            Upload Grocery List Image
          </h2>
          <button
            onClick={handleClose}
            className="text-gray-400 hover:text-gray-600"
            disabled={isProcessing}
            data-testid="image-upload-dialog-close"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* File Error */}
          {fileError && (
            <div className="flex items-center gap-3 p-4 bg-red-50 rounded-lg">
              <AlertCircle className="w-5 h-5 text-red-600" />
              <p className="text-red-900">{fileError}</p>
            </div>
          )}

          {/* File Input */}
          {!previewUrl && (
            <div
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center cursor-pointer hover:border-blue-500 hover:bg-blue-50 transition-colors"
              data-testid="image-upload-dropzone"
            >
              <Upload className="w-12 h-12 mx-auto text-gray-400 mb-3" />
              <p className="text-gray-600 mb-1">Click to upload a grocery list image</p>
              <p className="text-sm text-gray-500">Supports JPG, PNG, HEIC (max 20MB)</p>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,.heic,.heif"
                onChange={handleFileSelect}
                className="hidden"
                data-testid="image-upload-input"
              />
            </div>
          )}

          {/* Image Preview */}
          {previewUrl && (
            <div className="space-y-4">
              <div className="relative">
                <img
                  src={previewUrl}
                  alt="Grocery list preview"
                  className="w-full h-auto max-h-96 object-contain rounded-lg border border-gray-200"
                />
                {!isProcessing && !isSuccess && (
                  <button
                    onClick={() => {
                      if (previewUrl) {
                        URL.revokeObjectURL(previewUrl);
                      }
                      setPreviewUrl(null);
                      setSelectedFile(null);
                    }}
                    className="absolute top-2 right-2 bg-red-500 text-white p-2 rounded-full hover:bg-red-600"
                    data-testid="remove-image-button"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>

              {/* Processing Status */}
              {isProcessing && (
                <div className="flex items-center gap-3 p-4 bg-blue-50 rounded-lg">
                  <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
                  <div>
                    <p className="font-medium text-blue-900">Processing image...</p>
                    <p className="text-sm text-blue-700">Extracting items from image</p>
                  </div>
                </div>
              )}

              {/* Success Status */}
              {isSuccess && (
                <div className="space-y-3">
                  <div
                    className={`flex items-center gap-3 p-4 rounded-lg ${
                      failedItems.length > 0 ? 'bg-amber-50' : 'bg-green-50'
                    }`}
                  >
                    {failedItems.length > 0 ? (
                      <AlertCircle className="w-5 h-5 text-amber-600" />
                    ) : (
                      <CheckCircle2 className="w-5 h-5 text-green-600" />
                    )}
                    <div>
                      <p
                        className={`font-medium ${
                          failedItems.length > 0 ? 'text-amber-900' : 'text-green-900'
                        }`}
                      >
                        {failedItems.length > 0
                          ? `Added ${createdCount} of ${extractedCount} items`
                          : `Successfully added ${createdCount} items!`}
                      </p>
                      <p
                        className={`text-sm ${
                          failedItems.length > 0 ? 'text-amber-700' : 'text-green-700'
                        }`}
                      >
                        {failedItems.length > 0
                          ? `${failedItems.length} items could not be added`
                          : 'Items have been added to your list'}
                      </p>
                    </div>
                  </div>

                  {/* Failed Items List */}
                  {failedItems.length > 0 && (
                    <div className="bg-red-50 rounded-lg p-4">
                      <p className="font-medium text-red-900 mb-2">Failed to add:</p>
                      <ul className="space-y-1">
                        {failedItems.map((item, index) => (
                          <li key={index} className="text-red-700 flex items-center gap-2">
                            <AlertCircle className="w-4 h-4 text-red-600" />
                            {item}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              {/* Error Status */}
              {isError && (
                <div className="flex items-center gap-3 p-4 bg-red-50 rounded-lg">
                  <AlertCircle className="w-5 h-5 text-red-600" />
                  <div>
                    <p className="font-medium text-red-900">Failed to process image</p>
                    <p className="text-sm text-red-700">
                      {createMutation.error?.message || 'Please try again'}
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-3 p-4 border-t bg-gray-50">
          <button
            onClick={handleClose}
            className="flex-1 px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-100 disabled:opacity-50"
            disabled={isProcessing}
            data-testid="image-upload-dialog-cancel"
          >
            {isSuccess ? 'Close' : 'Cancel'}
          </button>
          {previewUrl && !isSuccess && (
            <button
              onClick={handleUpload}
              disabled={!selectedFile || isProcessing}
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              data-testid="image-upload-dialog-submit"
            >
              {isProcessing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4" />
                  Extract & Add Items
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
