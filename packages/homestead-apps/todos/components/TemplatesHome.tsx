import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, ClipboardList, ListPlus, Plus, Trash2, X } from 'lucide-react';
import { SkeletonList } from '@rambleraptor/homestead-core/shared/components/Skeleton';
import { EmptyState } from '@rambleraptor/homestead-core/shared/components/EmptyState';
import { QueryError } from '@rambleraptor/homestead-core/shared/components/QueryError';
import { cn } from '@rambleraptor/homestead-core/shared/lib/utils';
import { PageHeader } from '@rambleraptor/homestead-core/shared/components/PageHeader';
import { ConfirmDialog } from '@rambleraptor/homestead-core/shared/components/ConfirmDialog';
import { useListTemplates } from '../hooks/useListTemplates';
import { useCreateListTemplate } from '../hooks/useCreateListTemplate';
import { useDeleteListTemplate } from '../hooks/useDeleteListTemplate';
import { useTemplateItems } from '../hooks/useTemplateItems';
import { useCreateTemplateItem } from '../hooks/useCreateTemplateItem';
import { useDeleteTemplateItem } from '../hooks/useDeleteTemplateItem';
import { useTemplateCategories } from '../hooks/useTemplateCategories';
import { useCreateTemplateCategory } from '../hooks/useCreateTemplateCategory';
import { useDeleteTemplateCategory } from '../hooks/useDeleteTemplateCategory';
import { useInstantiateTemplate } from '../hooks/useInstantiateTemplate';
import { groupByCategory } from '../hooks/useCategories';
import type { ListTemplate, TemplateItem } from '../types';

export function TemplatesHome() {
  const templatesQuery = useListTemplates();
  const createTemplate = useCreateListTemplate();
  const [draftName, setDraftName] = useState('');

  const templates = templatesQuery.data ?? [];

  const handleCreate = async (event: FormEvent) => {
    event.preventDefault();
    const name = draftName.trim();
    if (!name) return;
    await createTemplate.mutateAsync({ name });
    setDraftName('');
  };

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6">
      <div className="space-y-4">
        <Link
          to="/todos"
          data-testid="templates-back"
          className="inline-flex items-center gap-1 text-sm font-body text-text-muted hover:text-accent-terracotta transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to todos
        </Link>
        <PageHeader
          title="List Templates"
          subtitle="Save a reusable checklist, then spin up a new list from it in one click."
        />
      </div>

      <form
        onSubmit={handleCreate}
        className={cn(
          'flex items-center gap-2 bg-surface-white rounded-2xl border border-gray-200 shadow-sm px-4 py-3',
          'focus-within:border-accent-terracotta focus-within:ring-2 focus-within:ring-accent-terracotta/20',
          'transition-colors',
        )}
      >
        <input
          type="text"
          value={draftName}
          onChange={(e) => setDraftName(e.target.value)}
          placeholder="New template name"
          aria-label="New template name"
          disabled={createTemplate.isPending}
          data-testid="templates-add-input"
          className="flex-1 bg-transparent outline-none font-body text-base text-text-main placeholder:text-text-muted"
        />
        <button
          type="submit"
          disabled={createTemplate.isPending || draftName.trim() === ''}
          aria-label="Add template"
          data-testid="templates-add-submit"
          className={cn(
            'flex h-9 w-9 items-center justify-center rounded-full',
            'bg-accent-terracotta text-white shadow-sm',
            'hover:bg-accent-terracotta-hover transition-colors',
            'disabled:opacity-40 disabled:cursor-not-allowed',
          )}
        >
          <Plus className="w-5 h-5" />
        </button>
      </form>

      {templatesQuery.isLoading && (
        <SkeletonList
          rows={4}
          label="Loading templates"
          data-testid="templates-loading"
        />
      )}

      {templatesQuery.isError && (
        <QueryError
          error={templatesQuery.error}
          onRetry={() => void templatesQuery.refetch()}
          title="Failed to load templates"
          data-testid="templates-error"
        />
      )}

      {!templatesQuery.isLoading && !templatesQuery.isError && (
        <div className="space-y-4" data-testid="templates-list">
          {templates.length === 0 ? (
            <EmptyState
              icon={ClipboardList}
              title="No templates yet"
              description="A template is a list you make again and again — a packing list, a weekly reset. Name one above to get started."
              data-testid="templates-empty"
            />
          ) : (
            templates.map((template) => (
              <TemplateCard key={template.id} template={template} />
            ))
          )}
        </div>
      )}
    </div>
  );
}

function TemplateCard({ template }: { template: ListTemplate }) {
  const navigate = useNavigate();
  const itemsQuery = useTemplateItems(template.id);
  const categoriesQuery = useTemplateCategories(template.id);
  const createItem = useCreateTemplateItem();
  const deleteItem = useDeleteTemplateItem();
  const createCategory = useCreateTemplateCategory();
  const deleteCategory = useDeleteTemplateCategory();
  const deleteTemplate = useDeleteListTemplate();
  const instantiate = useInstantiateTemplate();
  const [draftItem, setDraftItem] = useState('');
  const [draftItemCategory, setDraftItemCategory] = useState('');
  const [draftCategory, setDraftCategory] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);

  const items = itemsQuery.data ?? [];
  const categories = categoriesQuery.data ?? [];
  const hasCategories = categories.length > 0;
  const groups = groupByCategory(
    items,
    categories.map((c) => ({ id: c.id, name: c.name })),
    (it: TemplateItem) => it.template_category,
  );

  const handleAddItem = async (event: FormEvent) => {
    event.preventDefault();
    const title = draftItem.trim();
    if (!title) return;
    await createItem.mutateAsync({
      templateId: template.id,
      title,
      ...(draftItemCategory ? { templateCategory: draftItemCategory } : {}),
    });
    setDraftItem('');
  };

  const handleAddCategory = async (event: FormEvent) => {
    event.preventDefault();
    const name = draftCategory.trim();
    if (!name) return;
    await createCategory.mutateAsync({
      templateId: template.id,
      name,
      position: categories.length,
    });
    setDraftCategory('');
  };

  const handleCreateList = async () => {
    const project = await instantiate.mutateAsync({
      templateId: template.id,
      name: template.name,
    });
    navigate('/todos', { state: { scope: project.id } });
  };

  const renderItem = (item: TemplateItem) => (
    <li
      key={item.id}
      data-testid={`template-item-${item.id}`}
      className="flex items-center gap-3 px-4 py-2.5"
    >
      <span className="flex-1 font-body text-base text-text-main">
        {item.title}
      </span>
      <button
        type="button"
        onClick={() =>
          deleteItem.mutate({ templateId: template.id, itemId: item.id })
        }
        disabled={deleteItem.isPending}
        aria-label={`Remove ${item.title}`}
        data-testid={`template-item-${item.id}-delete`}
        className="p-1.5 rounded-lg text-text-muted hover:bg-red-500/10 hover:text-red-500 transition-colors disabled:opacity-40"
      >
        <X className="w-4 h-4" />
      </button>
    </li>
  );

  return (
    <div
      data-testid={`template-card-${template.id}`}
      className="bg-surface-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden"
    >
      <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100">
        <h2 className="flex-1 font-display text-lg text-brand-navy truncate">
          {template.name}
        </h2>
        <button
          type="button"
          onClick={handleCreateList}
          disabled={instantiate.isPending || items.length === 0}
          aria-label={`Create a list from ${template.name}`}
          data-testid={`template-card-${template.id}-instantiate`}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-body',
            'bg-accent-terracotta text-white hover:bg-accent-terracotta-hover transition-colors',
            'disabled:opacity-40 disabled:cursor-not-allowed',
          )}
        >
          <ListPlus className="w-4 h-4" />
          Create list
        </button>
        <button
          type="button"
          onClick={() => setConfirmDelete(true)}
          disabled={deleteTemplate.isPending}
          aria-label={`Delete template ${template.name}`}
          data-testid={`template-card-${template.id}-delete`}
          className="p-1.5 rounded-lg text-red-500 hover:bg-red-500/10 transition-colors disabled:opacity-40"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      <div
        data-testid={`template-card-${template.id}-categories`}
        className="space-y-2 border-b border-gray-100 bg-bg-pearl/30 px-4 py-2.5"
      >
        <div className="flex flex-wrap items-center gap-1.5">
          {categories.length === 0 ? (
            <span className="font-body text-xs italic text-text-muted">
              No categories — items land in one flat list.
            </span>
          ) : (
            categories.map((category) => (
              <span
                key={category.id}
                data-testid={`template-category-${category.id}`}
                className="inline-flex items-center gap-1 rounded-full border border-gray-200 bg-surface-white px-2 py-0.5 font-body text-xs text-text-main"
              >
                {category.name}
                <button
                  type="button"
                  onClick={() =>
                    deleteCategory.mutate({
                      templateId: template.id,
                      id: category.id,
                    })
                  }
                  disabled={deleteCategory.isPending}
                  aria-label={`Delete category ${category.name}`}
                  data-testid={`template-category-${category.id}-delete`}
                  className="text-text-muted hover:text-red-500 disabled:opacity-40"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))
          )}
        </div>
        <form onSubmit={handleAddCategory} className="flex items-center gap-2">
          <input
            type="text"
            value={draftCategory}
            onChange={(e) => setDraftCategory(e.target.value)}
            placeholder="Add a category"
            aria-label={`Add a category to ${template.name}`}
            disabled={createCategory.isPending}
            data-testid={`template-card-${template.id}-category-input`}
            className="flex-1 bg-transparent outline-none font-body text-sm text-text-main placeholder:text-text-muted"
          />
          <button
            type="submit"
            disabled={createCategory.isPending || draftCategory.trim() === ''}
            aria-label="Add category"
            data-testid={`template-card-${template.id}-category-submit`}
            className={cn(
              'flex h-7 w-7 items-center justify-center rounded-full',
              'bg-brand-navy text-white hover:bg-brand-navy/90 transition-colors',
              'disabled:opacity-40 disabled:cursor-not-allowed',
            )}
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </form>
      </div>

      <div data-testid={`template-card-${template.id}-items`}>
        {itemsQuery.isError || categoriesQuery.isError ? (
          <QueryError
            compact
            error={itemsQuery.error ?? categoriesQuery.error}
            onRetry={() => {
              void itemsQuery.refetch();
              void categoriesQuery.refetch();
            }}
            title="Couldn’t load this template’s items"
            className="m-4"
            data-testid={`template-card-${template.id}-error`}
          />
        ) : items.length === 0 && !hasCategories ? (
          <ul>
            <li className="px-4 py-3 text-sm text-text-muted font-body italic">
              No items yet — add one below.
            </li>
          </ul>
        ) : (
          groups.map((group) => (
            <div
              key={group.id}
              data-testid={`template-group-${group.id}`}
            >
              {hasCategories && (
                <div className="px-4 pt-2 pb-1 font-display text-xs font-semibold text-brand-navy">
                  {group.name ?? 'Uncategorized'}
                </div>
              )}
              <ul className="divide-y divide-gray-100">
                {group.items.length === 0 ? (
                  <li className="px-4 py-2 text-xs text-text-muted font-body italic">
                    No items in this category yet.
                  </li>
                ) : (
                  group.items.map(renderItem)
                )}
              </ul>
            </div>
          ))
        )}
      </div>

      <form
        onSubmit={handleAddItem}
        className="flex items-center gap-2 px-4 py-3 border-t border-gray-100 bg-bg-pearl/40"
      >
        {hasCategories && (
          <select
            value={draftItemCategory}
            onChange={(e) => setDraftItemCategory(e.target.value)}
            aria-label="Category for new item"
            data-testid={`template-card-${template.id}-item-category`}
            className="rounded-lg border border-gray-200 bg-surface-white px-2 py-1 font-body text-xs text-text-muted focus:border-accent-terracotta focus:outline-none"
          >
            <option value="">Uncategorized</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        )}
        <input
          type="text"
          value={draftItem}
          onChange={(e) => setDraftItem(e.target.value)}
          placeholder="Add an item"
          aria-label={`Add an item to ${template.name}`}
          disabled={createItem.isPending}
          data-testid={`template-card-${template.id}-item-input`}
          className="flex-1 bg-transparent outline-none font-body text-base text-text-main placeholder:text-text-muted"
        />
        <button
          type="submit"
          disabled={createItem.isPending || draftItem.trim() === ''}
          aria-label="Add item"
          data-testid={`template-card-${template.id}-item-submit`}
          className={cn(
            'flex h-8 w-8 items-center justify-center rounded-full',
            'bg-brand-navy text-white hover:bg-brand-navy/90 transition-colors',
            'disabled:opacity-40 disabled:cursor-not-allowed',
          )}
        >
          <Plus className="w-4 h-4" />
        </button>
      </form>

      <ConfirmDialog
        isOpen={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={async () => {
          await deleteTemplate.mutateAsync(template.id);
          setConfirmDelete(false);
        }}
        title="Delete template"
        message={`Delete "${template.name}" and its items? Lists already created from it are unaffected.`}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        variant="danger"
        isLoading={deleteTemplate.isPending}
      />
    </div>
  );
}
