/**
 * Numbered steps for the recipe view: large step numbers in their own column
 * beside roomy, reading-size text. In cook mode tapping a step marks it as
 * the one you're on, so you can find your place again after looking away.
 */

interface RecipeStepsProps {
  steps: string[];
  cookMode: boolean;
  currentStep: number | null;
  onSelectStep: (index: number) => void;
}

export function RecipeSteps({ steps, cookMode, currentStep, onSelectStep }: RecipeStepsProps) {
  if (steps.length === 0) {
    return <p className="text-sm text-text-muted">No steps listed.</p>;
  }

  return (
    <ol data-testid="recipe-view-steps" className="space-y-8">
      {steps.map((step, idx) => {
        const isCurrent = cookMode && currentStep === idx;
        const body = (
          <>
            <span
              aria-hidden="true"
              className="font-display text-3xl font-semibold leading-none text-accent-terracotta tabular-nums"
            >
              {idx + 1}
            </span>
            <span className="sr-only">Step {idx + 1}: </span>
            <span
              className={`block whitespace-pre-wrap font-body leading-relaxed text-brand-navy ${
                cookMode ? 'text-xl' : 'text-lg'
              }`}
            >
              {step}
            </span>
          </>
        );
        const layout = 'grid grid-cols-[2.5rem_minmax(0,1fr)] gap-x-4 items-start';

        if (!cookMode) {
          return (
            <li key={idx} className={layout}>
              {body}
            </li>
          );
        }

        return (
          <li key={idx} aria-current={isCurrent ? 'step' : undefined}>
            <button
              type="button"
              onClick={() => onSelectStep(idx)}
              aria-pressed={isCurrent}
              data-testid={`recipe-view-step-${idx}`}
              className={`${layout} w-[calc(100%+1.5rem)] text-left rounded-lg p-3 -m-3 transition-colors ${
                isCurrent
                  ? 'bg-bg-pearl ring-2 ring-accent-terracotta'
                  : 'hover:bg-bg-pearl'
              }`}
            >
              {body}
            </button>
          </li>
        );
      })}
    </ol>
  );
}
