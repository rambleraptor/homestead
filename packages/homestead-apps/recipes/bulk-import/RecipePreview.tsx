/**
 * Recipes bulk import — preview row.
 *
 * One parsed recipe: title, timings, and a count of what was found. The generic
 * preview would dump `parsed_ingredients` as raw JSON, which tells you nothing
 * about whether the parse was any good.
 */

import { AlertCircle, ChefHat, CheckCircle2, XCircle } from 'lucide-react';
import { Card } from '@rambleraptor/homestead-core/shared/components/Card';
import { Checkbox } from '@rambleraptor/homestead-core/shared/components/Checkbox';
import type { ItemPreviewProps } from '@rambleraptor/homestead-core/shared/bulk-import';
import { RecipeTags } from '../components/RecipeTags';
// Type-only: the parser itself is server-only and stubbed out of this bundle.
import type { RecipeImportData } from '../methods/recipe-import-adapter';

export function RecipePreview({
  item,
  isSelected,
  onToggle,
}: ItemPreviewProps<RecipeImportData>) {
  const recipe = item.data;
  const isValid = item.errors.length === 0;

  const facts = [
    recipe.parsed_ingredients?.length
      ? `${recipe.parsed_ingredients.length} ingredient${recipe.parsed_ingredients.length === 1 ? '' : 's'}`
      : null,
    recipe.steps?.length
      ? `${recipe.steps.length} step${recipe.steps.length === 1 ? '' : 's'}`
      : null,
    recipe.prep_time ? `prep ${recipe.prep_time}` : null,
    recipe.cook_time ? `cook ${recipe.cook_time}` : null,
    recipe.servings ? `serves ${recipe.servings}` : null,
  ].filter(Boolean);

  return (
    <Card
      className={`p-4 transition-colors ${
        isValid
          ? isSelected
            ? 'border-primary bg-primary/5'
            : 'hover:border-primary/50'
          : 'border-destructive/50 bg-destructive/5 opacity-75'
      }`}
      data-testid="recipe-import-preview-row"
    >
      <div className="flex items-start gap-4">
        <div className="flex items-center pt-1">
          {isValid ? (
            <Checkbox
              checked={isSelected}
              onCheckedChange={onToggle}
              aria-label={`Select ${recipe.title}`}
            />
          ) : (
            <div className="h-4 w-4" />
          )}
        </div>

        <div className="flex-shrink-0 pt-1">
          <ChefHat className="h-5 w-5" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="mb-2 flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <h3 className="mb-1 text-lg font-semibold break-words">
                {recipe.title || (
                  <span className="text-muted-foreground italic">Untitled recipe</span>
                )}
              </h3>
              {facts.length > 0 && (
                <p className="text-muted-foreground text-sm">{facts.join(' · ')}</p>
              )}
              <RecipeTags tags={recipe.tags} variant="inline" max={3} className="mt-1" />
            </div>
            <div className="flex-shrink-0">
              {isValid ? (
                <CheckCircle2 className="h-5 w-5 text-green-600" />
              ) : (
                <XCircle className="text-destructive h-5 w-5" />
              )}
            </div>
          </div>

          {!isValid && (
            <Notes tone="destructive" title="Cannot import:" messages={item.errors} />
          )}
          {item.warnings.length > 0 && (
            <Notes tone="warning" title="Warnings:" messages={item.warnings} />
          )}
        </div>
      </div>
    </Card>
  );
}

function Notes({
  tone,
  title,
  messages,
}: {
  tone: 'destructive' | 'warning';
  title: string;
  messages: string[];
}) {
  const styles =
    tone === 'destructive'
      ? { box: 'bg-destructive/10 border-destructive/20', text: 'text-destructive' }
      : { box: 'border-amber-500/20 bg-amber-500/10', text: 'text-amber-600' };

  return (
    <div className={`mt-3 rounded-md border p-3 ${styles.box}`}>
      <div className="flex items-start gap-2">
        <AlertCircle className={`mt-0.5 h-4 w-4 flex-shrink-0 ${styles.text}`} />
        <div className="min-w-0 flex-1">
          <p className={`mb-1 text-sm font-medium ${styles.text}`}>{title}</p>
          <ul className="list-inside list-disc space-y-1">
            {messages.map((message, i) => (
              <li key={i} className={`text-xs ${styles.text}/90`}>
                {message}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
