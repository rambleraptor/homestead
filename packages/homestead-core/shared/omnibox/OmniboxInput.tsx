'use client';

/**
 * Single-line search input for the natural-language omnibox. Submit via
 * Enter. The parent page owns the query state (so it can sync to `?q=`).
 */

import React, { useEffect, useRef, useState } from 'react';
import { Search, Loader2 } from 'lucide-react';

interface OmniboxInputProps {
  initialQuery?: string;
  isLoading?: boolean;
  onSubmit: (query: string) => void;
}

export function OmniboxInput({
  initialQuery = '',
  isLoading = false,
  onSubmit,
}: OmniboxInputProps) {
  const [value, setValue] = useState(initialQuery);
  const inputRef = useRef<HTMLInputElement>(null);

  // Keep local state in sync when the parent (e.g. back/forward nav)
  // changes the initial query.
  useEffect(() => {
    setValue(initialQuery);
  }, [initialQuery]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = value.trim();
    if (!trimmed) return;
    onSubmit(trimmed);
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="relative"
      data-testid="omnibox-form"
    >
      <Search
        className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 pointer-events-none"
        aria-hidden="true"
      />
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Ask anything — e.g. 'show me Sarah' or 'add milk to groceries'"
        disabled={isLoading}
        className="w-full pl-11 pr-12 py-3 text-base rounded-lg border border-gray-300 bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:opacity-50"
        data-testid="omnibox-input"
        aria-label="Natural language query"
        autoComplete="off"
        spellCheck={false}
      />
      {isLoading && (
        <Loader2
          className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-blue-600 animate-spin"
          aria-hidden="true"
        />
      )}
    </form>
  );
}
