/**
 * Board filter — a row of pills, one per board that has saved hands, that
 * chooses which board's hands the list below shows. Only boards that
 * actually hold a hand appear, so there's never an empty board to pick.
 */

import type { BoardFilterValue } from '../utils';

interface BoardFilterProps {
  boards: BoardFilterValue[];
  selected: BoardFilterValue;
  onSelect: (board: BoardFilterValue) => void;
}

function boardLabel(board: BoardFilterValue): string {
  return board === null ? 'No board' : `Board ${board}`;
}

function boardTestId(board: BoardFilterValue): string {
  return board === null ? 'board-filter-none' : `board-filter-${board}`;
}

export function BoardFilter({ boards, selected, onSelect }: BoardFilterProps) {
  if (boards.length === 0) return null;

  return (
    <div className="space-y-2" data-testid="board-filter">
      <div className="text-xs font-medium text-text-muted">Showing board</div>
      <div role="radiogroup" aria-label="Board" className="flex flex-wrap gap-1">
        {boards.map((board) => {
          const active = board === selected;
          return (
            <button
              key={boardTestId(board)}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onSelect(board)}
              data-testid={boardTestId(board)}
              className={`h-10 min-w-[3rem] rounded-md px-3 text-sm font-semibold border transition-colors ${
                active
                  ? 'bg-accent-terracotta border-accent-terracotta text-white'
                  : 'bg-surface-white border-gray-300 text-gray-700 hover:bg-gray-50'
              }`}
            >
              {boardLabel(board)}
            </button>
          );
        })}
      </div>
    </div>
  );
}
