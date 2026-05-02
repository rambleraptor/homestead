/**
 * Pictionary Bulk Import — Game Preview Card.
 *
 * Renders one parsed CSV row: game-level fields on top, team rosters
 * below, with the winner highlighted. Mirrors the visual treatment used
 * by gift cards / people previews.
 */

import {
  Pencil,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Trophy,
} from 'lucide-react';
import { Card } from '@rambleraptor/homestead-core/shared/components/Card';
import { Checkbox } from '@rambleraptor/homestead-core/shared/components/Checkbox';
import type { ParsedItem } from '@rambleraptor/homestead-core/shared/bulk-import';
import type { PictionaryGameCSVData } from './types';

interface GamePreviewProps {
  item: ParsedItem<PictionaryGameCSVData>;
  isSelected: boolean;
  onToggle: () => void;
}

function formatDate(iso: string | undefined): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function GamePreview({ item, isSelected, onToggle }: GamePreviewProps) {
  const game = item.data;
  const statusIcon = item.isValid ? (
    <CheckCircle2 className="h-5 w-5 text-green-600" />
  ) : (
    <XCircle className="h-5 w-5 text-destructive" />
  );

  return (
    <Card
      className={`p-4 transition-colors ${
        item.isValid
          ? isSelected
            ? 'border-primary bg-primary/5'
            : 'hover:border-primary/50'
          : 'border-destructive/50 bg-destructive/5 opacity-75'
      }`}
    >
      <div className="flex items-start gap-4">
        <div className="flex items-center pt-1">
          {item.isValid ? (
            <Checkbox
              checked={isSelected}
              onCheckedChange={onToggle}
              aria-label={`Select game on ${formatDate(game.played_at)}`}
            />
          ) : (
            <div className="w-4 h-4" />
          )}
        </div>

        <div className="flex-shrink-0 pt-1">
          <Pencil className="h-5 w-5" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-4 mb-2">
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-lg mb-1 break-words">
                {game.location || 'Pictionary game'}
              </h3>
              <p className="text-sm text-muted-foreground">
                {formatDate(game.played_at)}
              </p>
              {game.winning_word && (
                <p className="text-sm text-muted-foreground">
                  Winning word:{' '}
                  <span className="font-medium">{game.winning_word}</span>
                </p>
              )}
              {game.notes && (
                <p className="text-sm text-muted-foreground italic mt-1">
                  {game.notes}
                </p>
              )}
            </div>
            <div className="flex-shrink-0">{statusIcon}</div>
          </div>

          {item.isValid && game.teams.length > 0 && (
            <div className="mt-3 space-y-1">
              {game.teams.map((team) => (
                <div
                  key={team.position}
                  className={`flex items-center gap-2 text-sm rounded-md px-2 py-1 ${
                    team.won
                      ? 'bg-amber-50 border border-amber-200'
                      : 'bg-muted'
                  }`}
                >
                  {team.won && (
                    <Trophy className="h-4 w-4 text-amber-500 flex-shrink-0" />
                  )}
                  <span className="font-medium">Team {team.position}</span>
                  <span className="text-muted-foreground">
                    — {team.playerNames.join(', ')}
                  </span>
                </div>
              ))}
            </div>
          )}

          {item.errors.length > 0 && (
            <div className="mt-2 space-y-1">
              {item.errors.map((error, index) => (
                <div
                  key={index}
                  className="flex items-start gap-2 text-sm text-destructive"
                >
                  <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
