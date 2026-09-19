/**
 * Instantiates a list template into a brand-new project: creates the project,
 * recreates the template's categories inside it, then adds a `pending` todo for
 * every item in the template (each mapped to its recreated category). Returns
 * the new project so the caller can switch the active scope to it.
 *
 * The project is created `temporary`: a list made from a template is a
 * one-off run of it (this week's chores, this trip's packing), so once every
 * item is checked off the list has served its purpose and is deleted rather
 * than lingering as an empty entry in the switcher. See `finishesList` and
 * `TodosHome`.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@rambleraptor/homestead-core/api/queryClient';
import { aepbase } from '@rambleraptor/homestead-core/api/aepbase';
import {
  CATEGORIES,
  LIST_TEMPLATES,
  PROJECTS,
  TEMPLATE_CATEGORIES,
  TEMPLATE_ITEMS,
  TODOS,
} from '../resources';
import type {
  Category,
  Project,
  TemplateCategory,
  TemplateItem,
  Todo,
} from '../types';
import { sortCategories } from './useCategories';

interface InstantiateTemplateParams {
  templateId: string;
  /** Name for the new project. Defaults to the template's name. */
  name: string;
}

export function useInstantiateTemplate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      templateId,
      name,
    }: InstantiateTemplateParams): Promise<Project> => {
      const [items, templateCategories] = await Promise.all([
        aepbase.list<TemplateItem>(TEMPLATE_ITEMS, {
          parent: [LIST_TEMPLATES, templateId],
          orderBy: 'create_time',
        }),
        aepbase.list<TemplateCategory>(TEMPLATE_CATEGORIES, {
          parent: [LIST_TEMPLATES, templateId],
        }),
      ]);

      const project = await aepbase.create<Project>(PROJECTS, {
        name,
        temporary: true,
      });
      const projectRef = `projects/${project.id}`;

      // Recreate categories in the new project, preserving order, and map each
      // template-category id to its freshly-created project-category id.
      const categoryIdMap = new Map<string, string>();
      for (const tc of sortCategories(templateCategories)) {
        const created = await aepbase.create<Category>(
          CATEGORIES,
          { name: tc.name, position: tc.position ?? 0 },
          { parent: [PROJECTS, project.id] },
        );
        categoryIdMap.set(tc.id, created.id);
      }

      // Create sequentially so the todos keep the template's item order
      // (create_time is the list sort key).
      for (const item of items) {
        const mappedCategory = item.template_category
          ? categoryIdMap.get(item.template_category)
          : undefined;
        await aepbase.create<Todo>(TODOS, {
          title: item.title,
          status: 'pending',
          project: projectRef,
          ...(mappedCategory ? { category: mappedCategory } : {}),
        });
      }
      return project;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.app('todos').all(),
      });
    },
  });
}
