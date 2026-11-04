/**
 * The credit card form at its own address: `/credit-cards/new` creates a
 * card, `/credit-cards/:id/edit` changes one. A new card opens at its own
 * page once saved; an edit returns to the card it came from, and so does
 * Cancel.
 */

import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import type { AppRouteProps } from '@rambleraptor/homestead-core/apps/types';
import { SkeletonPage } from '@rambleraptor/homestead-core/shared/components/Skeleton';
import { QueryError } from '@rambleraptor/homestead-core/shared/components/QueryError';
import { useCreditCard } from '../hooks/useCreditCard';
import { useCreateCreditCard } from '../hooks/useCreateCreditCard';
import { useUpdateCreditCard } from '../hooks/useUpdateCreditCard';
import { CreditCardForm } from './CreditCardForm';
import type { CreditCardFormData } from '../types';

export function CreditCardFormRoute({ params }: AppRouteProps) {
  const id = params?.id ?? null;
  const navigate = useNavigate();
  const { data: card, isLoading, isError, error, refetch } = useCreditCard(id);
  const createMutation = useCreateCreditCard();
  const updateMutation = useUpdateCreditCard();

  const backHref = id ? `/credit-cards/${id}` : '/credit-cards';
  const backLabel = id ? 'Back to card' : 'Back to cards';

  if (id && isLoading) {
    return (
      <SkeletonPage
        body="list"
        bodyCount={4}
        label="Loading credit card"
        data-testid="credit-card-form-loading"
      />
    );
  }

  if (id && (isError || !card)) {
    return (
      <div className="space-y-4">
        <Link
          to="/credit-cards"
          className="inline-flex items-center gap-2 text-sm text-text-muted hover:text-gray-700 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to cards
        </Link>
        <QueryError
          error={isError ? error : 'It may have been deleted, or the link is wrong.'}
          onRetry={isError ? () => void refetch() : undefined}
          title={isError ? 'Failed to load this card' : 'This card could not be found'}
          data-testid="credit-card-form-error"
        />
      </div>
    );
  }

  const handleSubmit = async (data: CreditCardFormData) => {
    try {
      if (id) {
        await updateMutation.mutateAsync({ id, data });
        navigate(backHref);
      } else {
        const created = await createMutation.mutateAsync(data);
        navigate(`/credit-cards/${created.id}`);
      }
    } catch {
      // Error surfaced by the global mutation error toast (queryClient.ts).
    }
  };

  return (
    <div className="space-y-6">
      <Link
        to={backHref}
        className="inline-flex items-center gap-2 text-sm text-text-muted hover:text-gray-700 transition-colors"
        data-testid="credit-card-form-back"
      >
        <ArrowLeft className="w-4 h-4" />
        {backLabel}
      </Link>
      <div className="bg-surface-white rounded-2xl shadow-md p-6 border border-gray-100">
        <h2 className="text-xl font-bold text-brand-navy mb-4">
          {id ? 'Edit Credit Card' : 'Add Credit Card'}
        </h2>
        <CreditCardForm
          initialData={card}
          onSubmit={handleSubmit}
          onCancel={() => navigate(backHref)}
          isSubmitting={createMutation.isPending || updateMutation.isPending}
        />
      </div>
    </div>
  );
}
