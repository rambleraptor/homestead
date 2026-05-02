'use client';

import { useState } from 'react';
import { ConfirmDialog } from '@rambleraptor/homestead-core/shared/components/ConfirmDialog';
import { useResetTodos } from '../hooks/useResetTodos';

interface ResetProgressButtonProps {
  disabled?: boolean;
}

export function ResetProgressButton({ disabled }: ResetProgressButtonProps) {
  const [open, setOpen] = useState(false);
  const reset = useResetTodos();

  const handleConfirm = async () => {
    await reset.mutateAsync();
    setOpen(false);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={disabled || reset.isPending}
        data-testid="todos-reset"
        className="text-sm font-body text-text-muted hover:text-accent-terracotta transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
      >
        reset progress
      </button>
      <ConfirmDialog
        isOpen={open}
        onClose={() => setOpen(false)}
        onConfirm={handleConfirm}
        title="Reset progress"
        message="This will return every todo to pending. Continue?"
        confirmLabel="Reset"
        cancelLabel="Cancel"
        variant="primary"
        isLoading={reset.isPending}
      />
    </>
  );
}
