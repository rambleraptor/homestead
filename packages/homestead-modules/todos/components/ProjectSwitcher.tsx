'use client';

import { useState, type FormEvent } from 'react';
import { Plus, Trash2, X } from 'lucide-react';
import { cn } from '@rambleraptor/homestead-core/shared/lib/utils';
import { ConfirmDialog } from '@rambleraptor/homestead-core/shared/components/ConfirmDialog';
import { useProjects } from '../hooks/useProjects';
import { useCreateProject } from '../hooks/useCreateProject';
import { useDeleteProject } from '../hooks/useDeleteProject';
import { MAIN_PROJECT_ID, type ProjectScope } from '../types';

interface ProjectSwitcherProps {
  scope: ProjectScope;
  onChange: (scope: ProjectScope) => void;
}

export function ProjectSwitcher({ scope, onChange }: ProjectSwitcherProps) {
  const projectsQuery = useProjects();
  const createProject = useCreateProject();
  const deleteProject = useDeleteProject();
  const [adding, setAdding] = useState(false);
  const [draftName, setDraftName] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const projects = projectsQuery.data ?? [];

  const handleAdd = async (event: FormEvent) => {
    event.preventDefault();
    const trimmed = draftName.trim();
    if (!trimmed) return;
    const created = await createProject.mutateAsync({ name: trimmed });
    setDraftName('');
    setAdding(false);
    onChange(created.id);
  };

  const handleDelete = async () => {
    if (!confirmDeleteId) return;
    const wasActive = confirmDeleteId === scope;
    await deleteProject.mutateAsync(confirmDeleteId);
    setConfirmDeleteId(null);
    if (wasActive) onChange(MAIN_PROJECT_ID);
  };

  return (
    <div data-testid="todos-project-switcher" className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Pill
          active={scope === MAIN_PROJECT_ID}
          onClick={() => onChange(MAIN_PROJECT_ID)}
          testId="todos-project-pill-main"
        >
          Main
        </Pill>
        {projects.map((p) => {
          const isActive = scope === p.id;
          return (
            <Pill
              key={p.id}
              active={isActive}
              onClick={() => onChange(p.id)}
              testId={`todos-project-pill-${p.id}`}
            >
              <span>{p.name}</span>
              {isActive && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setConfirmDeleteId(p.id);
                  }}
                  aria-label={`Delete project ${p.name}`}
                  data-testid={`todos-project-delete-${p.id}`}
                  className="ml-1 rounded-full p-0.5 hover:bg-white/30"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              )}
            </Pill>
          );
        })}
        {!adding && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            aria-label="Add project"
            data-testid="todos-project-add"
            className={cn(
              'flex h-7 w-7 items-center justify-center rounded-full',
              'border border-dashed border-text-muted text-text-muted',
              'hover:border-accent-terracotta hover:text-accent-terracotta transition-colors',
            )}
          >
            <Plus className="w-4 h-4" />
          </button>
        )}
        {adding && (
          <form onSubmit={handleAdd} className="flex items-center gap-1">
            <input
              type="text"
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              placeholder="Project name"
              autoFocus
              disabled={createProject.isPending}
              data-testid="todos-project-name-input"
              className={cn(
                'h-7 rounded-full border border-gray-300 bg-white px-3 text-sm font-body',
                'outline-none focus:border-accent-terracotta',
                'disabled:opacity-40',
              )}
            />
            <button
              type="submit"
              disabled={createProject.isPending || draftName.trim() === ''}
              aria-label="Create project"
              data-testid="todos-project-create-submit"
              className={cn(
                'flex h-7 w-7 items-center justify-center rounded-full',
                'bg-accent-terracotta text-white',
                'hover:bg-accent-terracotta-hover transition-colors',
                'disabled:opacity-40 disabled:cursor-not-allowed',
              )}
            >
              <Plus className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => {
                setAdding(false);
                setDraftName('');
              }}
              aria-label="Cancel new project"
              className="flex h-7 w-7 items-center justify-center rounded-full text-text-muted hover:bg-bg-pearl"
            >
              <X className="w-4 h-4" />
            </button>
          </form>
        )}
      </div>
      <ConfirmDialog
        isOpen={confirmDeleteId !== null}
        onClose={() => setConfirmDeleteId(null)}
        onConfirm={handleDelete}
        title="Delete project"
        message="Its todos will move to the main project. Continue?"
        confirmLabel="Delete"
        cancelLabel="Cancel"
        variant="danger"
        isLoading={deleteProject.isPending}
      />
    </div>
  );
}

interface PillProps {
  active: boolean;
  onClick: () => void;
  testId: string;
  children: React.ReactNode;
}

function Pill({ active, onClick, testId, children }: PillProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testId}
      data-active={active ? 'true' : 'false'}
      className={cn(
        'flex items-center gap-1 rounded-full px-3 py-1 text-sm font-body transition-colors',
        active
          ? 'bg-accent-terracotta text-white shadow-sm'
          : 'bg-white text-text-main border border-gray-200 hover:bg-bg-pearl',
      )}
    >
      {children}
    </button>
  );
}
