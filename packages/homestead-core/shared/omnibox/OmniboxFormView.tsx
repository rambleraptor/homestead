'use client';

/**
 * Renders a module's form inline as the confirmation step for an action
 * intent, with the LLM's parsed params pre-filled. The module's existing
 * form component supplies the UI; the submit handler calls the module's
 * mutation hook. Wired once here for every module.
 */

import React, { useState } from 'react';
import { Sparkles } from 'lucide-react';
import { Card } from '@rambleraptor/homestead-core/shared/components/Card';
import { useToast } from '@rambleraptor/homestead-core/shared/components/ToastProvider';
import { logger } from '@rambleraptor/homestead-core/utils/logger';
import type { OmniboxAdapter, OmniboxForm } from '@rambleraptor/homestead-core/shared/omnibox/types';

interface OmniboxFormViewProps {
  adapter: OmniboxAdapter;
  formId: string;
  prefill?: Record<string, unknown>;
  /** Called after a successful submit; dispatcher swaps to the list view. */
  onSuccess: () => void;
}

export function OmniboxFormView({
  adapter,
  formId,
  prefill,
  onSuccess,
}: OmniboxFormViewProps) {
  const toast = useToast();
  const form = adapter.forms?.find((f) => f.id === formId);

  // Call the mutation hook unconditionally when the form exists — React's
  // rules of hooks require a stable call. When no form is found (schema
  // drift?), we render an error state *instead* of calling the hook.
  if (!form) {
    return (
      <Card className="p-4">
        <p className="text-sm text-red-600">
          Unknown form &ldquo;{formId}&rdquo;. Try rephrasing your query.
        </p>
      </Card>
    );
  }

  return (
    <FormRunner form={form} prefill={prefill} onSuccess={onSuccess} toastSuccess={(msg) => toast.success(msg)} />
  );
}

interface FormRunnerProps {
  form: OmniboxForm;
  prefill?: Record<string, unknown>;
  onSuccess: () => void;
  toastSuccess: (msg: string) => void;
}

function FormRunner({ form, prefill, onSuccess, toastSuccess }: FormRunnerProps) {
  const mutation = form.useMutation();
  const [submitting, setSubmitting] = useState(false);

  // Validate the LLM's prefill against the form's zod schema. Invalid
  // fields are stripped; the user still sees a form they can correct.
  const parsed = form.paramSchema.safeParse(prefill ?? {});
  const safePrefill = parsed.success ? parsed.data : {};

  const handleSubmit = async (values: Record<string, unknown>) => {
    setSubmitting(true);
    try {
      await mutation.mutateAsync(values);
      if (form.successMessage) {
        toastSuccess(form.successMessage(values));
      } else {
        toastSuccess(`${form.label} — done.`);
      }
      onSuccess();
    } catch (err) {
      logger.error('Omnibox form submit failed', err, {
        formId: form.id,
      });
      throw err;
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = () => {
    onSuccess();
  };

  return (
    <div className="space-y-4">
      <Card className="p-4 bg-blue-50 border-blue-200 flex items-start gap-3">
        <Sparkles className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" aria-hidden="true" />
        <div>
          <p className="text-sm font-medium text-gray-900">
            {form.label}
          </p>
          <p className="text-xs text-gray-600 mt-1">
            Review the fields below and submit to confirm.
          </p>
        </div>
      </Card>
      <Card className="p-4">
        {form.render({
          initialValues: safePrefill as Record<string, unknown>,
          onSubmit: handleSubmit,
          onCancel: handleCancel,
          isSubmitting: submitting || mutation.isPending,
        })}
      </Card>
    </div>
  );
}
