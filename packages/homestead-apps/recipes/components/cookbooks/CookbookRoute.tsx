import type { AppRouteProps } from '@rambleraptor/homestead-core/apps/types';
import { CookbookPage } from './CookbookPage';

export function CookbookRoute({ params }: AppRouteProps) {
  return <CookbookPage cookbookId={params?.id ?? ''} />;
}
