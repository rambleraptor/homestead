/**
 * Tests for GiftCardForm component
 */

import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { GiftCardForm } from '../components/GiftCardForm';
import { ToastProvider } from '@/shared/components/ToastProvider';
import type { GiftCard } from '../types';

// Mock pb.files.getURL
vi.mock('@/core/api/pocketbase', () => ({
  pb: {
    files: {
      getURL: vi.fn((_record, filename) => `http://test.com/${filename}`),
    },
  },
}));

// Helper to render with ToastProvider
const renderWithToast = (ui: React.ReactElement) => {
  return render(<ToastProvider>{ui}</ToastProvider>);
};

describe('GiftCardForm', () => {
  it('should render form fields correctly', () => {
    const onSubmit = vi.fn();
    const onCancel = vi.fn();

    renderWithToast(<GiftCardForm onSubmit={onSubmit} onCancel={onCancel} />);

    expect(screen.getByLabelText(/Merchant/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Card Number/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/PIN/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Amount/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Notes/i)).toBeInTheDocument();
    expect(screen.getByText('Front Image')).toBeInTheDocument();
    expect(screen.getByText('Back Image')).toBeInTheDocument();
  });

  it('should populate form with initial data', () => {
    const onSubmit = vi.fn();
    const onCancel = vi.fn();
    const initialData: GiftCard = {
      id: '1',
      merchant: 'Amazon',
      card_number: '1234-5678',
      pin: '1234',
      amount: 50.0,
      notes: 'Test notes',
      created: '2024-01-01',
      updated: '2024-01-01',
    };

    renderWithToast(<GiftCardForm onSubmit={onSubmit} onCancel={onCancel} initialData={initialData} />);

    expect(screen.getByLabelText(/Merchant/i)).toHaveValue('Amazon');
    expect(screen.getByLabelText(/Card Number/i)).toHaveValue('1234-5678');
    expect(screen.getByLabelText(/PIN/i)).toHaveValue('1234');
    expect(screen.getByLabelText(/Amount/i)).toHaveValue(50);
    expect(screen.getByLabelText(/Notes/i)).toHaveValue('Test notes');
  });

  it('should submit form with correct data', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    const onCancel = vi.fn();

    renderWithToast(<GiftCardForm onSubmit={onSubmit} onCancel={onCancel} />);

    await user.type(screen.getByLabelText(/Merchant/i), 'Target');
    await user.type(screen.getByLabelText(/Card Number/i), '9876-5432');
    await user.type(screen.getByLabelText(/PIN/i), '5678');
    await user.type(screen.getByLabelText(/Amount/i), '25.50');
    await user.type(screen.getByLabelText(/Notes/i), 'Gift from mom');

    await user.click(screen.getByRole('button', { name: /Add Card/i }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith({
        merchant: 'Target',
        card_number: '9876-5432',
        pin: '5678',
        amount: 25.5,
        notes: 'Gift from mom',
        front_image: null,
        back_image: null,
      });
    });
  });

  it('should call onCancel when cancel button is clicked', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    const onCancel = vi.fn();

    renderWithToast(<GiftCardForm onSubmit={onSubmit} onCancel={onCancel} />);

    const cancelButton = screen.getByRole('button', { name: '' }); // Cancel button has X icon, no text
    await user.click(cancelButton);

    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('should handle file upload for front image', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    const onCancel = vi.fn();

    renderWithToast(<GiftCardForm onSubmit={onSubmit} onCancel={onCancel} />);

    // Create a mock file
    const file = new File(['image content'], 'front.png', { type: 'image/png' });

    // Find the file input
    const fileInputs = screen.getAllByLabelText(/Upload front image/i);
    const frontImageInput = fileInputs[0];

    // Upload the file
    await user.upload(frontImageInput, file);

    // Check that the image preview is shown
    await waitFor(() => {
      const frontImage = screen.getByAltText('Front of gift card');
      expect(frontImage).toBeInTheDocument();
    });
  });

  it('should handle file upload for back image', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    const onCancel = vi.fn();

    renderWithToast(<GiftCardForm onSubmit={onSubmit} onCancel={onCancel} />);

    // Create a mock file
    const file = new File(['image content'], 'back.png', { type: 'image/png' });

    // Find the file input
    const fileInputs = screen.getAllByLabelText(/Upload back image/i);
    const backImageInput = fileInputs[0];

    // Upload the file
    await user.upload(backImageInput, file);

    // Check that the image preview is shown
    await waitFor(() => {
      const backImage = screen.getByAltText('Back of gift card');
      expect(backImage).toBeInTheDocument();
    });
  });

  it('should remove image when trash button is clicked', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    const onCancel = vi.fn();

    renderWithToast(<GiftCardForm onSubmit={onSubmit} onCancel={onCancel} />);

    // Upload a front image
    const file = new File(['image content'], 'front.png', { type: 'image/png' });
    const fileInputs = screen.getAllByLabelText(/Upload front image/i);
    const frontImageInput = fileInputs[0];
    await user.upload(frontImageInput, file);

    // Wait for image to appear
    await waitFor(() => {
      expect(screen.getByAltText('Front of gift card')).toBeInTheDocument();
    });

    // Click the remove button
    const removeButtons = screen.getAllByTitle('Remove image');
    await user.click(removeButtons[0]);

    // Image should be removed
    await waitFor(() => {
      expect(screen.queryByAltText('Front of gift card')).not.toBeInTheDocument();
    });
  });

  it('should show existing images when editing', () => {
    const onSubmit = vi.fn();
    const onCancel = vi.fn();
    const initialData: GiftCard = {
      id: '1',
      merchant: 'Amazon',
      card_number: '1234-5678',
      amount: 50.0,
      front_image: 'front_abc123.png',
      back_image: 'back_def456.png',
      created: '2024-01-01',
      updated: '2024-01-01',
    };

    renderWithToast(<GiftCardForm onSubmit={onSubmit} onCancel={onCancel} initialData={initialData} />);

    expect(screen.getByAltText('Front of gift card')).toBeInTheDocument();
    expect(screen.getByAltText('Back of gift card')).toBeInTheDocument();
  });

  it('should disable submit button when submitting', () => {
    const onSubmit = vi.fn();
    const onCancel = vi.fn();

    renderWithToast(<GiftCardForm onSubmit={onSubmit} onCancel={onCancel} isSubmitting={true} />);

    const submitButton = screen.getByRole('button', { name: /Saving.../i });
    expect(submitButton).toBeDisabled();
  });
});
