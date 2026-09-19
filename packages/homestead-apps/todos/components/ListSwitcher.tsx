/**
 * The "which list am I looking at" control.
 *
 * It replaced a wrapping row of pills plus three sibling controls (add, "From
 * template", "Templates"). Pills are fine for three lists and unusable for
 * fifteen: the row reflows as lists are added, the page below it shifts down a
 * line at a time, and the selected list is only findable by reading every chip.
 * A household accumulates lists, so the bar was always going to get there.
 *
 * One trigger, one menu instead. The trigger names the list you're on and how
 * much is left in it — the two things you'd otherwise scan the bar for — and
 * the menu holds the lists (with their open counts), the ways to make a new
 * one, and the actions on the list you're in. Height is fixed no matter how
 * many lists exist.
 */

import { useMemo, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import {
  Check,
  ChevronDown,
  LayoutTemplate,
  Loader2,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import { cn } from '@rambleraptor/homestead-core/shared/lib/utils';
import { Modal } from '@rambleraptor/homestead-core/shared/components/Modal';
import { Button } from '@rambleraptor/homestead-core/shared/components/Button';
import { useDismissOnOutside } from '@rambleraptor/homestead-core/shared/hooks/useDismissOnOutside';
import { useProjects } from '../hooks/useProjects';
import { useCreateProject } from '../hooks/useCreateProject';
import { useDeleteProject } from '../hooks/useDeleteProject';
import { useListTemplates } from '../hooks/useListTemplates';
import { useInstantiateTemplate } from '../hooks/useInstantiateTemplate';
import { useTodos, usePersonalTodos, mergeTodosForScope } from '../hooks/useTodos';
import { MAIN_PROJECT_ID, type ProjectScope } from '../types';

interface ListSwitcherProps {
  scope: ProjectScope;
  onChange: (scope: ProjectScope) => void;
}

const MENU_ITEM =
  'flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-body text-text-main transition-colors hover:bg-bg-pearl';

const MENU_HEADING =
  'px-3 pb-1 pt-2 font-body text-xs font-semibold uppercase tracking-wide text-text-muted';

export function ListSwitcher({ scope, onChange }: ListSwitcherProps) {
  const projectsQuery = useProjects();
  const templatesQuery = useListTemplates();
  const family = useTodos();
  const personal = usePersonalTodos();
  const createProject = useCreateProject();
  const deleteProject = useDeleteProject();
  const instantiate = useInstantiateTemplate();

  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [draftName, setDraftName] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  // When true, the delete removes the list's todos instead of moving them to
  // the main list. Reset each time the dialog opens.
  const [deleteTodos, setDeleteTodos] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const projects = useMemo(
    () => projectsQuery.data ?? [],
    [projectsQuery.data],
  );
  const templates = templatesQuery.data ?? [];
  const activeProject = projects.find((p) => p.id === scope) ?? null;
  const activeName = activeProject?.name ?? 'Main';

  // Open (pending) count per list, so the menu answers "where is there work
  // left" without switching to each one. Both queries are already mounted by
  // the list itself, so this reads from cache rather than fetching.
  const openCounts = useMemo(() => {
    const knownIds = projectsQuery.data
      ? new Set(projectsQuery.data.map((p) => p.id))
      : undefined;
    const countFor = (s: ProjectScope) =>
      mergeTodosForScope(
        family.data ?? [],
        personal.data ?? [],
        s,
        knownIds,
      ).filter((t) => t.status === 'pending').length;
    const counts = new Map<string, number>();
    counts.set(MAIN_PROJECT_ID, countFor(MAIN_PROJECT_ID));
    for (const p of projects) counts.set(p.id, countFor(p.id));
    return counts;
  }, [family.data, personal.data, projects, projectsQuery.data]);

  const closeMenu = () => {
    setOpen(false);
    setAdding(false);
    setDraftName('');
  };
  useDismissOnOutside(menuRef, open, closeMenu);

  const select = (next: ProjectScope) => {
    closeMenu();
    onChange(next);
  };

  const handleAdd = async (event: FormEvent) => {
    event.preventDefault();
    const trimmed = draftName.trim();
    if (!trimmed) return;
    const created = await createProject.mutateAsync({ name: trimmed });
    select(created.id);
  };

  const handlePickTemplate = async (templateId: string, name: string) => {
    const project = await instantiate.mutateAsync({ templateId, name });
    select(project.id);
  };

  const openDeleteDialog = (id: string) => {
    setDeleteTodos(false);
    setConfirmDeleteId(id);
    closeMenu();
  };

  const closeDeleteDialog = () => {
    setConfirmDeleteId(null);
    setDeleteTodos(false);
  };

  const handleDelete = async () => {
    if (!confirmDeleteId) return;
    const wasActive = confirmDeleteId === scope;
    await deleteProject.mutateAsync({ projectId: confirmDeleteId, deleteTodos });
    closeDeleteDialog();
    if (wasActive) onChange(MAIN_PROJECT_ID);
  };

  const deletingProject =
    projects.find((p) => p.id === confirmDeleteId) ?? null;
  const activeOpen = openCounts.get(scope) ?? 0;

  return (
    <div data-testid="todos-list-switcher" className="flex items-center gap-2">
      <div className="relative" ref={menuRef}>
        <button
          type="button"
          onClick={() => (open ? closeMenu() : setOpen(true))}
          aria-haspopup="menu"
          aria-expanded={open}
          data-testid="todos-list-selector"
          className={cn(
            'flex items-center gap-2 rounded-full border border-gray-200 bg-surface-white',
            'px-4 py-2 shadow-sm transition-colors hover:bg-bg-pearl',
            'focus:border-accent-terracotta focus:outline-none',
          )}
        >
          <span className="font-display text-base font-semibold text-brand-navy">
            {activeName}
          </span>
          {activeProject?.temporary && (
            // Says up front that this list is a one-off: it deletes itself
            // once every item is checked off, so nobody is surprised when it
            // does.
            <span
              title="Deleted once every item is checked off"
              data-testid="todos-list-temporary"
              className="rounded-full bg-bg-pearl px-2 py-0.5 font-body text-xs font-medium text-text-muted"
            >
              Temporary
            </span>
          )}
          <span className="font-body text-sm text-text-muted">
            {activeOpen} open
          </span>
          <ChevronDown
            className={cn(
              'h-4 w-4 text-text-muted transition-transform',
              open && 'rotate-180',
            )}
          />
        </button>

        {open && (
          <div
            role="menu"
            data-testid="todos-list-menu"
            className={cn(
              'animate-menu-in absolute left-0 top-full z-20 mt-1 w-72 origin-top-left',
              'rounded-xl border border-gray-200 bg-surface-white p-1 shadow-md',
            )}
          >
            <div className="max-h-64 overflow-y-auto">
              <ListOption
                label="Main"
                count={openCounts.get(MAIN_PROJECT_ID) ?? 0}
                active={scope === MAIN_PROJECT_ID}
                onSelect={() => select(MAIN_PROJECT_ID)}
                testId="todos-list-option-main"
              />
              {projects.map((p) => (
                <ListOption
                  key={p.id}
                  label={p.name}
                  count={openCounts.get(p.id) ?? 0}
                  active={scope === p.id}
                  onSelect={() => select(p.id)}
                  testId={`todos-list-option-${p.id}`}
                />
              ))}
            </div>

            <div className="my-1 border-t border-gray-100" />

            {adding ? (
              <form onSubmit={handleAdd} className="flex items-center gap-1 p-1">
                <input
                  type="text"
                  value={draftName}
                  onChange={(e) => setDraftName(e.target.value)}
                  onKeyDown={(e) => {
                    // Escape belongs to the input while it's focused, so it
                    // cancels the draft rather than closing the whole menu.
                    if (e.key === 'Escape') {
                      e.stopPropagation();
                      setAdding(false);
                      setDraftName('');
                    }
                  }}
                  placeholder="List name"
                  aria-label="New list name"
                  autoFocus
                  disabled={createProject.isPending}
                  data-testid="todos-project-name-input"
                  className={cn(
                    'h-8 min-w-0 flex-1 rounded-lg border border-gray-300 bg-white px-3 font-body text-sm',
                    'outline-none focus:border-accent-terracotta disabled:opacity-40',
                  )}
                />
                <button
                  type="submit"
                  disabled={createProject.isPending || draftName.trim() === ''}
                  aria-label="Create list"
                  data-testid="todos-project-create-submit"
                  className={cn(
                    'flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
                    'bg-accent-terracotta text-white transition-colors hover:bg-accent-terracotta-hover',
                    'disabled:cursor-not-allowed disabled:opacity-40',
                  )}
                >
                  <Plus className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAdding(false);
                    setDraftName('');
                  }}
                  aria-label="Cancel new list"
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-text-muted hover:bg-bg-pearl"
                >
                  <X className="h-4 w-4" />
                </button>
              </form>
            ) : (
              <button
                type="button"
                role="menuitem"
                onClick={() => setAdding(true)}
                data-testid="todos-project-add"
                className={MENU_ITEM}
              >
                <Plus className="h-4 w-4 shrink-0" aria-hidden="true" />
                New list
              </button>
            )}

            {templates.length > 0 && (
              <div data-testid="todos-template-menu">
                <p className={MENU_HEADING}>From a template</p>
                {templates.map((template) => (
                  <button
                    key={template.id}
                    type="button"
                    role="menuitem"
                    onClick={() => handlePickTemplate(template.id, template.name)}
                    disabled={instantiate.isPending}
                    data-testid={`todos-template-menu-item-${template.id}`}
                    className={cn(MENU_ITEM, 'disabled:opacity-40')}
                  >
                    {instantiate.isPending ? (
                      <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
                    ) : (
                      <LayoutTemplate className="h-4 w-4 shrink-0" aria-hidden="true" />
                    )}
                    <span className="truncate">{template.name}</span>
                  </button>
                ))}
              </div>
            )}

            <div className="my-1 border-t border-gray-100" />

            <Link
              to="/todos/templates"
              onClick={closeMenu}
              role="menuitem"
              data-testid="todos-templates-link"
              className={MENU_ITEM}
            >
              <LayoutTemplate className="h-4 w-4 shrink-0" aria-hidden="true" />
              Manage templates
            </Link>

            {activeProject && (
              <button
                type="button"
                role="menuitem"
                onClick={() => openDeleteDialog(activeProject.id)}
                aria-label={`Delete list ${activeProject.name}`}
                data-testid={`todos-project-delete-${activeProject.id}`}
                className={cn(MENU_ITEM, 'text-red-600 hover:bg-red-50')}
              >
                <Trash2 className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span className="truncate">Delete “{activeProject.name}”</span>
              </button>
            )}
          </div>
        )}
      </div>

      <Modal
        isOpen={confirmDeleteId !== null}
        onClose={closeDeleteDialog}
        title="Delete list"
      >
        <div className="space-y-6">
          <p className="text-gray-700">
            {deletingProject ? `“${deletingProject.name}” will be deleted. ` : ''}
            {deleteTodos
              ? 'Its todos will be deleted with it. Continue?'
              : 'Its todos will move to the main list. Continue?'}
          </p>
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={deleteTodos}
              onChange={(e) => setDeleteTodos(e.target.checked)}
              data-testid="todos-project-delete-todos"
              className="h-4 w-4 rounded border-gray-300 text-accent-terracotta focus:ring-accent-terracotta"
            />
            Delete this list&rsquo;s todos instead of moving them to Main
          </label>
          <div className="flex justify-end gap-3">
            <Button
              variant="secondary"
              onClick={closeDeleteDialog}
              disabled={deleteProject.isPending}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={handleDelete}
              disabled={deleteProject.isPending}
            >
              {deleteProject.isPending ? 'Processing...' : 'Delete'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

interface ListOptionProps {
  label: string;
  count: number;
  active: boolean;
  onSelect: () => void;
  testId: string;
}

function ListOption({ label, count, active, onSelect, testId }: ListOptionProps) {
  return (
    <button
      type="button"
      role="menuitemradio"
      aria-checked={active}
      onClick={onSelect}
      data-testid={testId}
      data-active={active ? 'true' : 'false'}
      className={cn(MENU_ITEM, active && 'bg-bg-pearl font-semibold')}
    >
      <Check
        className={cn(
          'h-4 w-4 shrink-0 text-accent-terracotta',
          !active && 'invisible',
        )}
        aria-hidden="true"
      />
      <span className="flex-1 truncate">{label}</span>
      {count > 0 && (
        <span className="shrink-0 font-body text-xs text-text-muted">{count}</span>
      )}
    </button>
  );
}
