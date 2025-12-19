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

export function ImageUploadDialog({ isOpen, onClose }: ImageUploadDialogProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [extractedItems, setExtractedItems] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const createMutation = useCreateGroceryItemsFromImage();

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      logger.error('Invalid file type. Please select an image.');
      return;
    }

    setSelectedFile(file);
    setExtractedItems([]);

    // Create preview URL
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
  };

  const handleUpload = async () => {
    if (!selectedFile) return;

    try {
      const result = await createMutation.mutateAsync(selectedFile);
      setExtractedItems(result.extractedItems);

      // Close dialog after successful upload
      setTimeout(() => {
        handleClose();
      }, 2000);
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
    setExtractedItems([]);
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
          {/* File Input */}
          {!previewUrl && (
            <div
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center cursor-pointer hover:border-blue-500 hover:bg-blue-50 transition-colors"
              data-testid="image-upload-dropzone"
            >
              <Upload className="w-12 h-12 mx-auto text-gray-400 mb-3" />
              <p className="text-gray-600 mb-1">Click to upload a grocery list image</p>
              <p className="text-sm text-gray-500">Supports JPG, PNG, and other image formats</p>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
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
                    <p className="text-sm text-blue-700">Extracting and categorizing items</p>
                  </div>
                </div>
              )}

              {/* Success Status */}
              {isSuccess && (
                <div className="space-y-3">
                  <div className="flex items-center gap-3 p-4 bg-green-50 rounded-lg">
                    <CheckCircle2 className="w-5 h-5 text-green-600" />
                    <div>
                      <p className="font-medium text-green-900">
                        Successfully added {extractedItems.length} items!
                      </p>
                      <p className="text-sm text-green-700">Items have been categorized and added to your list</p>
                    </div>
                  </div>

                  {/* Extracted Items List */}
                  {extractedItems.length > 0 && (
                    <div className="bg-gray-50 rounded-lg p-4">
                      <p className="font-medium text-gray-900 mb-2">Extracted Items:</p>
                      <ul className="space-y-1">
                        {extractedItems.map((item, index) => (
                          <li key={index} className="text-gray-700 flex items-center gap-2">
                            <CheckCircle2 className="w-4 h-4 text-green-600" />
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
