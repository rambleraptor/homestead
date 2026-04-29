import type { ComponentType } from 'react';
import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { Card } from './Card';
import { PageHeader } from './PageHeader';
import type { HomeModule } from '@/modules/types';

interface Props {
  module: HomeModule;
}

/**
 * Bind a parent module to the generic landing as a no-arg
 * `ComponentType`, suitable for wiring into
 * `OmniboxAdapter.listComponent` from a `.ts` config file. The
 * getter-of-module dance avoids the temporal-dead-zone error you'd
 * get from referencing the in-flight const directly inside its own
 * object literal.
 */
export function makeNestedModuleLanding(
  getModule: () => HomeModule,
): ComponentType {
  function NestedLanding() {
    return <NestedModuleLanding module={getModule()} />;
  }
  NestedLanding.displayName = 'NestedModuleLanding';
  return NestedLanding;
}

/**
 * Generic landing page for a parent module that declares `children`.
 * Renders one card per child, linking to the child's `basePath`. The
 * test-id convention `${parent.id}-link-${child.id}` matches the ids
 * used by the hand-written landings this component replaces.
 */
export function NestedModuleLanding({ module }: Props) {
  const children = module.children ?? [];

  return (
    <div className="space-y-6">
      <PageHeader title={module.name} subtitle={module.description} />

      <div className="grid gap-3 sm:grid-cols-2">
        {children.map((child) => {
          const Icon = child.icon;
          return (
            <Link
              key={child.id}
              href={child.basePath}
              data-testid={`${module.id}-link-${child.id}`}
              className="block"
            >
              <Card className="h-full transition-colors hover:bg-gray-50">
                <div className="flex items-start gap-4">
                  <Icon className="w-6 h-6 text-accent-terracotta mt-1 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-gray-900">{child.name}</h3>
                    <p className="mt-1 text-sm text-gray-600">
                      {child.description}
                    </p>
                  </div>
                  <ChevronRight className="w-5 h-5 text-gray-400 flex-shrink-0" />
                </div>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
