/**
 * The upload surface. The dropzone is the upload button — there is no second
 * one — and the two specialised paths live behind a menu that has to open,
 * fire, and close.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DocumentDropzone } from '../components/DocumentDropzone';

function setup(overrides: Partial<Parameters<typeof DocumentDropzone>[0]> = {}) {
  const props = {
    onFiles: vi.fn(),
    onBrowseUpload: vi.fn(),
    onTakePhoto: vi.fn(),
    onBrowseRedact: vi.fn(),
    onBrowseBundle: vi.fn(),
    uploading: false,
    bundleBusy: false,
    ...overrides,
  };
  render(<DocumentDropzone {...props} />);
  return props;
}

describe('DocumentDropzone', () => {
  it('opens the camera from "Take a photo", shown on touch screens only', () => {
    const props = setup();
    const button = screen.getByTestId('document-camera-button');
    expect(button).toHaveClass('hidden', 'pointer-coarse:inline-flex');
    button.click();
    expect(props.onTakePhoto).toHaveBeenCalledOnce();
    expect(props.onBrowseUpload).not.toHaveBeenCalled();
  });

  it("won't open the camera mid-upload", () => {
    setup({ uploading: true });
    expect(screen.getByTestId('document-camera-button')).toBeDisabled();
  });

  it('browses from the dropzone itself, with no separate upload button', () => {
    const props = setup();
    expect(screen.queryByTestId('document-upload-button')).not.toBeInTheDocument();
    screen.getByTestId('document-dropzone').click();
    expect(props.onBrowseUpload).toHaveBeenCalledOnce();
  });

  it('keeps the specialised paths behind a closed menu', () => {
    setup();
    expect(screen.queryByTestId('document-redact-button')).not.toBeInTheDocument();
    expect(screen.getByTestId('document-upload-menu')).toHaveAttribute(
      'aria-expanded',
      'false',
    );
  });

  it('opens the menu and offers both specialised paths', async () => {
    setup();
    await userEvent.click(screen.getByTestId('document-upload-menu'));
    expect(screen.getByTestId('document-redact-button')).toBeInTheDocument();
    expect(screen.getByTestId('document-bundle-button')).toBeInTheDocument();
  });

  it('explains each path in the menu, so no separate help toggle is needed', async () => {
    setup();
    await userEvent.click(screen.getByTestId('document-upload-menu'));
    expect(screen.getByTestId('document-redact-button')).toHaveTextContent(
      /before the file leaves your device/i,
    );
    expect(screen.queryByTestId('document-upload-help-toggle')).not.toBeInTheDocument();
  });

  it('fires the chosen path and closes the menu', async () => {
    const props = setup();
    await userEvent.click(screen.getByTestId('document-upload-menu'));
    await userEvent.click(screen.getByTestId('document-bundle-button'));
    expect(props.onBrowseBundle).toHaveBeenCalledOnce();
    expect(screen.queryByTestId('document-upload-menu-items')).not.toBeInTheDocument();
  });

  it('closes the menu on Escape', async () => {
    setup();
    await userEvent.click(screen.getByTestId('document-upload-menu'));
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByTestId('document-upload-menu-items')).not.toBeInTheDocument();
  });

  it('reports the upload in flight on the dropzone', () => {
    setup({ uploading: true });
    expect(screen.getByTestId('document-dropzone')).toHaveTextContent(/uploading/i);
  });
});
