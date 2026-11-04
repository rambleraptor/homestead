/**
 * The recipe form at its own address: `/recipes/new` creates, and
 * `/recipes/:id/edit` edits. Giving the form a URL means a reload keeps it,
 * the back button leaves it, and a link can open it directly.
 *
 * Saving or cancelling a new recipe returns to the list. An edit returns to
 * where it was opened from: the list's pencil says so in the link's state
 * (`{ from: 'list' }`); the recipe page's Edit button, a pasted address or a
 * reload return to the recipe itself. While editing, the change feed watches
 * for someone else saving the same recipe (`useRemoteEdits`) and offers to
 * load their version.
 */

import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { QueryError } from '@rambleraptor/homestead-core/shared/components/QueryError';
import type { AppRouteProps } from '@rambleraptor/homestead-core/apps/types';
import { SkeletonPage } from '@rambleraptor/homestead-core/shared/components/Skeleton';
import { useRemoteEdits } from '@rambleraptor/homestead-core/api/remoteChanges';
import { RemoteEditNotice } from '@rambleraptor/homestead-core/shared/components/RemoteChange';
import { useRecipe } from '../hooks/useRecipe';
import { useCreateRecipe } from '../hooks/useCreateRecipe';
import { useUpdateRecipe } from '../hooks/useUpdateRecipe';
import { RecipeForm } from './RecipeForm';
import type { Recipe, RecipeFormData } from '../types';

export function RecipeFormRoute({ params }: AppRouteProps) {
  const id = params?.id;
  return id ? <EditRecipe recipeId={id} /> : <NewRecipe />;
}

function NewRecipe() {
  const navigate = useNavigate();
  const createMutation = useCreateRecipe();

  const handleSubmit = async (data: RecipeFormData) => {
    try {
      await createMutation.mutateAsync(data);
      navigate('/recipes');
    } catch {
      // Error surfaced by the global mutation error toast (queryClient.ts).
    }
  };

  return (
    <FormPage title="Add New Recipe" backTo="/recipes" backLabel="Back to recipes">
      <RecipeForm
        onSubmit={handleSubmit}
        onCancel={() => navigate('/recipes')}
        isSubmitting={createMutation.isPending}
      />
    </FormPage>
  );
}

/** Where an edit link came from, so the form can return there. */
export interface RecipeEditLinkState {
  from?: 'list';
}

function EditRecipe({ recipeId }: { recipeId: string }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { data: recipe, isLoading, isError, error, refetch } = useRecipe(recipeId);
  const updateMutation = useUpdateRecipe();
  // Bumped to remount the form on the latest saved recipe.
  const [formVersion, setFormVersion] = useState(0);
  const remoteEdit = useRemoteEdits('recipe', recipeId, { enabled: true });
  const fromList = (location.state as RecipeEditLinkState | null)?.from === 'list';
  const returnPath = fromList ? '/recipes' : `/recipes/${recipeId}`;

  const handleSubmit = async (data: RecipeFormData) => {
    try {
      await updateMutation.mutateAsync({ id: recipeId, data });
      navigate(returnPath);
    } catch {
      // Error surfaced by the global mutation error toast (queryClient.ts).
    }
  };

  if (isLoading) {
    return (
      <SkeletonPage
        body="list"
        bodyCount={6}
        label="Loading recipe"
        data-testid="recipe-loading"
      />
    );
  }

  if (isError || !recipe) {
    return (
      <div className="space-y-4">
        <BackLink to="/recipes" label="Back to recipes" />
        <QueryError
          error={isError ? error : 'It may have been deleted, or the link is wrong.'}
          onRetry={isError ? () => void refetch() : undefined}
          title={isError ? 'Failed to load recipe' : 'Recipe not found'}
          data-testid="recipe-error"
        />
      </div>
    );
  }

  return (
    <FormPage
      title="Edit Recipe"
      backTo={returnPath}
      backLabel={fromList ? 'Back to recipes' : 'Back to recipe'}
    >
      {remoteEdit.change && (
        <RemoteEditNotice
          change={remoteEdit.change}
          noun="recipe"
          onReload={() => {
            setFormVersion((v) => v + 1);
            remoteEdit.dismiss();
          }}
          onDismiss={remoteEdit.dismiss}
          className="mb-4"
        />
      )}
      <RecipeForm
        key={formVersion}
        onSubmit={handleSubmit}
        onCancel={() => navigate(returnPath)}
        initialData={recipe as Recipe}
        isSubmitting={updateMutation.isPending}
      />
    </FormPage>
  );
}

function BackLink({ to, label }: { to: string; label: string }) {
  return (
    <Link
      to={to}
      data-testid="recipe-form-back"
      className="inline-flex items-center gap-1 text-sm text-brand-slate hover:text-brand-navy"
    >
      <ArrowLeft className="w-4 h-4" />
      {label}
    </Link>
  );
}

function FormPage({
  title,
  backTo,
  backLabel,
  children,
}: {
  title: string;
  backTo: string;
  backLabel: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-6" data-testid="recipe-form-page">
      <BackLink to={backTo} label={backLabel} />
      <div className="max-w-2xl mx-auto">
        <h2 className="text-2xl font-bold text-brand-navy mb-6">{title}</h2>
        <div className="bg-surface-white rounded-2xl shadow-sm p-6 border border-gray-100">{children}</div>
      </div>
    </div>
  );
}
