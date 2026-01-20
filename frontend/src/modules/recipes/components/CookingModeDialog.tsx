'use client';

/**
 * Cooking Mode Dialog Component
 *
 * Full-screen cooking mode with feedback loop
 */

import { useState, useEffect } from 'react';
import { X, CheckCircle, XCircle, Star } from 'lucide-react';
import { useCreateCookingLog } from '../hooks/useCreateCookingLog';
import type { Recipe } from '../types';

interface CookingModeDialogProps {
  recipe: Recipe;
  isOpen: boolean;
  onClose: () => void;
}

export function CookingModeDialog({ recipe, isOpen, onClose }: CookingModeDialogProps) {
  
  const [showFeedback, setShowFeedback] = useState(false);
  const [feedbackData, setFeedbackData] = useState({
    rating: 0,
    success: true,
    deviated: false,
    notes: '',
    deviation_notes: '',
  });

  const createLogMutation = useCreateCookingLog();

  // Wake lock to prevent screen from sleeping
  useEffect(() => {
    let wakeLock: WakeLockSentinel | null = null;

    const requestWakeLock = async () => {
      try {
        if ('wakeLock' in navigator) {
          wakeLock = await navigator.wakeLock.request('screen');
        }
      } catch {
        // Wake lock not supported or failed
      }
    };

    requestWakeLock();

    return () => {
      if (wakeLock) {
        wakeLock.release();
      }
    };
  }, []);

  const handleFinish = () => {
    setShowFeedback(true);
  };

  const handleSubmitFeedback = async () => {
    try {
      await createLogMutation.mutateAsync({
        recipe: recipe.id,
        date: new Date().toISOString(),
        rating: feedbackData.rating > 0 ? feedbackData.rating : undefined,
        success: feedbackData.success,
        deviated: feedbackData.deviated,
        notes: feedbackData.notes,
        deviation_notes: feedbackData.deviated ? feedbackData.deviation_notes : undefined,
      });
      onClose();
    } catch {
      // Error handled by mutation
    }
  };

  if (!isOpen) return null;

  const isPhysical = recipe.source_type === 'physical';

  return (
    <div className="fixed inset-0 bg-white z-50 flex flex-col">
      {/* Header */}
      <div className="bg-blue-600 text-white p-4 flex items-center justify-between">
        <div className="flex-1 min-w-0">
          <h2 className="text-xl font-semibold truncate">{recipe.title}</h2>
          <p className="text-sm text-blue-100">Cooking Mode</p>
        </div>
        <button
          onClick={onClose}
          className="text-white hover:bg-blue-700 p-2 rounded-md"
          data-testid="exit-cooking-mode"
        >
          <X className="w-6 h-6" />
        </button>
      </div>

      {/* Content */}
      {!showFeedback ? (
        <div className="flex-1 overflow-y-auto p-6 max-w-4xl mx-auto w-full">
          {isPhysical ? (
            <div className="text-center py-12">
              <div className="bg-gradient-to-br from-amber-50 to-orange-50 rounded-lg p-12 border-2 border-amber-200">
                <p className="text-lg text-gray-700 mb-4">Follow the recipe in:</p>
                <p className="text-4xl font-bold text-amber-900">{recipe.source_reference}</p>
              </div>
            </div>
          ) : (
            <div className="space-y-8">
              {/* Ingredients */}
              {recipe.ingredients && recipe.ingredients.length > 0 && (
                <div>
                  <h3 className="text-2xl font-bold text-gray-900 mb-4">Ingredients</h3>
                  <ul className="space-y-3">
                    {recipe.ingredients.map((ing, index) => (
                      <li key={index} className="flex items-start gap-3 text-lg">
                        <input
                          type="checkbox"
                          className="mt-1.5 w-5 h-5 text-blue-600 rounded"
                          data-testid={`ingredient-check-${index}`}
                        />
                        <span>
                          <span className="font-semibold">
                            {ing.amount} {ing.unit}
                          </span>{' '}
                          {ing.item}
                          {ing.note && <span className="text-gray-500 italic"> ({ing.note})</span>}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Instructions */}
              {recipe.instructions && (
                <div>
                  <h3 className="text-2xl font-bold text-gray-900 mb-4">Instructions</h3>
                  <div className="prose prose-lg max-w-none">
                    <pre className="whitespace-pre-wrap font-sans text-lg leading-relaxed text-gray-700">
                      {recipe.instructions}
                    </pre>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Finish Button */}
          <div className="fixed bottom-0 left-0 right-0 p-6 bg-white border-t shadow-lg">
            <div className="max-w-4xl mx-auto">
              <button
                onClick={handleFinish}
                className="w-full bg-green-600 text-white py-4 rounded-lg hover:bg-green-700 text-lg font-semibold"
                data-testid="finish-cooking-button"
              >
                Finish Cooking
              </button>
            </div>
          </div>
        </div>
      ) : (
        /* Feedback Form */
        <div className="flex-1 overflow-y-auto p-6 max-w-2xl mx-auto w-full">
          <div className="space-y-6">
            <div className="text-center">
              <h3 className="text-2xl font-bold text-gray-900 mb-2">How did it go?</h3>
              <p className="text-gray-600">Share your feedback to improve this recipe</p>
            </div>

            {/* Success */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Was it successful?
              </label>
              <div className="flex gap-4">
                <button
                  onClick={() => setFeedbackData({ ...feedbackData, success: true })}
                  className={`flex-1 p-4 rounded-lg border-2 flex items-center justify-center gap-2 ${
                    feedbackData.success
                      ? 'border-green-600 bg-green-50 text-green-700'
                      : 'border-gray-300 hover:border-gray-400'
                  }`}
                  data-testid="success-yes"
                >
                  <CheckCircle className="w-6 h-6" />
                  Yes
                </button>
                <button
                  onClick={() => setFeedbackData({ ...feedbackData, success: false })}
                  className={`flex-1 p-4 rounded-lg border-2 flex items-center justify-center gap-2 ${
                    !feedbackData.success
                      ? 'border-red-600 bg-red-50 text-red-700'
                      : 'border-gray-300 hover:border-gray-400'
                  }`}
                  data-testid="success-no"
                >
                  <XCircle className="w-6 h-6" />
                  No
                </button>
              </div>
            </div>

            {/* Rating */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Rate this cooking session (1-5 stars)
              </label>
              <div className="flex gap-2 justify-center">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    onClick={() => setFeedbackData({ ...feedbackData, rating: star })}
                    className="p-2"
                    data-testid={`rating-${star}`}
                  >
                    <Star
                      className={`w-8 h-8 ${
                        star <= feedbackData.rating
                          ? 'fill-yellow-400 text-yellow-400'
                          : 'text-gray-300'
                      }`}
                    />
                  </button>
                ))}
              </div>
            </div>

            {/* Deviation */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Did you deviate from the recipe?
              </label>
              <div className="flex gap-4 mb-3">
                <button
                  onClick={() => setFeedbackData({ ...feedbackData, deviated: true })}
                  className={`flex-1 p-3 rounded-lg border-2 ${
                    feedbackData.deviated
                      ? 'border-blue-600 bg-blue-50 text-blue-700'
                      : 'border-gray-300 hover:border-gray-400'
                  }`}
                  data-testid="deviated-yes"
                >
                  Yes
                </button>
                <button
                  onClick={() => setFeedbackData({ ...feedbackData, deviated: false, deviation_notes: '' })}
                  className={`flex-1 p-3 rounded-lg border-2 ${
                    !feedbackData.deviated
                      ? 'border-blue-600 bg-blue-50 text-blue-700'
                      : 'border-gray-300 hover:border-gray-400'
                  }`}
                  data-testid="deviated-no"
                >
                  No
                </button>
              </div>
              {feedbackData.deviated && (
                <textarea
                  value={feedbackData.deviation_notes}
                  onChange={(e) => setFeedbackData({ ...feedbackData, deviation_notes: e.target.value })}
                  placeholder="What did you change? Would you keep this change?"
                  className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 h-24"
                  data-testid="deviation-notes"
                />
              )}
            </div>

            {/* General Notes */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Additional notes
              </label>
              <textarea
                value={feedbackData.notes}
                onChange={(e) => setFeedbackData({ ...feedbackData, notes: e.target.value })}
                placeholder="Any other thoughts or observations?"
                className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 h-24"
                data-testid="cooking-notes"
              />
            </div>

            {/* Submit */}
            <div className="flex gap-3 pt-4">
              <button
                onClick={() => setShowFeedback(false)}
                className="flex-1 px-4 py-3 text-gray-700 hover:bg-gray-100 rounded-lg"
              >
                Back
              </button>
              <button
                onClick={handleSubmitFeedback}
                disabled={createLogMutation.isPending}
                className="flex-1 bg-blue-600 text-white px-4 py-3 rounded-lg hover:bg-blue-700 disabled:opacity-50"
                data-testid="submit-cooking-log"
              >
                {createLogMutation.isPending ? 'Saving...' : 'Save Log'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
