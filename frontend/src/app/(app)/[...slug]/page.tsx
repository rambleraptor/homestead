import { notFound } from 'next/navigation';
import { getAllModules } from '@/modules/registry';
import { buildRouteEntries, matchRoute } from '@/modules/router/match';
import { gateComponents } from '@/modules/router/gates';

export function generateStaticParams() {
  const entries = buildRouteEntries(getAllModules());
  return entries
    .filter((e) => !e.route.dynamic)
    .map((e) => ({ slug: e.segments }));
}

export default async function ModuleCatchAll({
  params,
}: {
  params: Promise<{ slug: string[] }>;
}) {
  const { slug } = await params;
  const entries = buildRouteEntries(getAllModules());
  const match = matchRoute(slug, entries);
  if (!match) notFound();

  const Component = match.route.component;
  let element = <Component params={match.params} />;

  for (const gateName of match.route.gates ?? []) {
    const Gate = gateComponents[gateName];
    element = <Gate moduleId={match.module.id}>{element}</Gate>;
  }

  return element;
}
