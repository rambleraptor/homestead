import { ACCEPTED_IMAGE_TYPES, MAX_IMAGE_SIZE, MAX_IMAGE_SIZE_MB } from '../constants/validation';

export interface FileValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Validates an image file for type and size constraints
 * @param file - The file to validate
 * @returns ValidationResult indicating if file is valid and any error message
 */
export function validateImageFile(file: File): FileValidationResult {
  // Check file type
  const acceptedTypes: readonly string[] = ACCEPTED_IMAGE_TYPES;
  if (!acceptedTypes.includes(file.type)) {
    return {
      valid: false,
      error: 'Please upload a valid image file (JPEG, PNG, WebP, or GIF)',
    };
  }

  // Check file size
  if (file.size > MAX_IMAGE_SIZE) {
    return {
      valid: false,
      error: `Image size must be less than ${MAX_IMAGE_SIZE_MB}MB`,
    };
  }

  return { valid: true };
}
