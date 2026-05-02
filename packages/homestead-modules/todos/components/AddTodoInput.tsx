'use client';

import { useState, type FormEvent } from 'react';
import { Plus } from 'lucide-react';
import { cn } from '@rambleraptor/homestead-core/shared/lib/utils';

interface AddTodoInputProps {
  onSubmit: (title: string) => Promise<void> | void;
  disabled?: boolean;
}

/**
 * Inline "Add new item" row matching the todometer screenshot. Submit on
 * Enter or by clicking the trailing plus button. Clears the field after a
 * successful submit.
 */
export function AddTodoInput({ onSubmit, disabled }: AddTodoInputProps) {
  const [value, setValue] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const trimmed = value.trim();
    if (!trimmed || submitting) return;
    setSubmitting(true);
    try {
      await onSubmit(trimmed);
      setValue('');
    } finally {
      setSubmitting(false);
    }
  };

  const isDisabled = disabled || submitting;

  return (
    <form
      onSubmit={handleSubmit}
      className={cn(
        'flex items-center gap-2 bg-surface-white rounded-2xl border border-gray-200 shadow-sm px-4 py-3',
        'focus-within:border-accent-terracotta focus-within:ring-2 focus-within:ring-accent-terracotta/20',
        'transition-colors',
      )}
    >
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Add new item"
        aria-label="Add new todo"
        disabled={isDisabled}
        data-testid="todos-add-input"
        className="flex-1 bg-transparent outline-none font-body text-base text-text-main placeholder:text-text-muted"
      />
      <button
        type="submit"
        disabled={isDisabled || value.trim() === ''}
        aria-label="Add todo"
        data-testid="todos-add-submit"
        className={cn(
          'flex h-9 w-9 items-center justify-center rounded-full',
          'bg-accent-terracotta text-white shadow-sm',
          'hover:bg-accent-terracotta-hover transition-colors',
          'disabled:opacity-40 disabled:cursor-not-allowed',
        )}
      >
        <Plus className="w-5 h-5" />
      </button>
    </form>
  );
}
