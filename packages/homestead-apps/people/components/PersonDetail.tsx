/**
 * Person detail page: who they are, plus every document linked to them,
 * grouped by category (Tax, Medical, … then Other).
 *
 * Documents are ACL-private, so the list only ever shows what the current user
 * can already see. The link itself is the document's stored `people` field,
 * seeded on classify and editable from a document's own page.
 */

import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, FileText, Loader2, UserCheck, Users } from 'lucide-react';
import { PageHeader } from '@rambleraptor/homestead-core/shared/components/PageHeader';
import { Avatar } from '@rambleraptor/homestead-core/shared/components/Avatar';
import { Card } from '@rambleraptor/homestead-core/shared/components/Card';
import { EmptyState } from '@rambleraptor/homestead-core/shared/components/EmptyState';
import { QueryError } from '@rambleraptor/homestead-core/shared/components/QueryError';
import { viewTransitionName } from '@rambleraptor/homestead-core/shared/motion/viewTransition';
import { DocumentListItem } from '../../documents/components/DocumentListItem';
import { groupDocumentsByCategory } from '../../documents/categorize';
import { usePersonById } from '../hooks/usePersonById';
import { useDocumentsForPerson } from '../hooks/useDocumentsForPerson';
import type { RelatedPerson } from '../types';
import { HouseholdSummary } from './HouseholdSummary';

export function PersonDetail({ personId }: { personId: string }) {
  const { data: person, isLoading, isError, error, refetch } = usePersonById(personId);
  const docs = useDocumentsForPerson(personId);
  const { documents, isLoading: docsLoading } = docs;
  const groups = useMemo(() => groupDocumentsByCategory(documents), [documents]);

  if (isLoading) {
    return (
      <div className="flex justify-center py-12" data-testid="person-detail-loading">
        <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
      </div>
    );
  }

  if (isError || !person) {
    return (
      <div className="space-y-4">
        <BackLink />
        <QueryError
          error={isError ? error : 'They may have been deleted, or the link is wrong.'}
          onRetry={isError ? () => void refetch() : undefined}
          title={isError ? 'Failed to load this person' : 'This person could not be found'}
          data-testid="person-detail-not-found"
        />
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="person-detail">
      <BackLink />

      <div className="flex items-center gap-4">
        <Avatar
          name={person.name}
          size="lg"
          style={viewTransitionName('person', person.id)}
        />
        <PageHeader
          title={person.name}
          subtitle={person.aliases.length > 0 ? `aka ${person.aliases.join(', ')}` : undefined}
        />
      </div>

      {person.user && (
        <p
          className="inline-flex items-center gap-1.5 rounded-full bg-bg-pearl px-3 py-1 text-xs font-medium text-brand-navy"
          data-testid="person-has-account"
        >
          <UserCheck className="h-3.5 w-3.5" aria-hidden />
          Has a Homestead account
        </p>
      )}

      {(person.partner || person.households.length > 0) && (
        <Card>
          <div className="space-y-3" data-testid="person-households">
            {person.partner && (
              <div className="flex items-center gap-2 text-sm text-text-muted">
                <Users className="h-4 w-4 text-brand-navy" aria-label="Partner icon" />
                <Avatar name={person.partner.name} size="sm" />
                <Link to={`/people/${person.partner.id}`} className="hover:underline">
                  {person.partner.name}
                </Link>
              </div>
            )}
            {person.households.map((household) => (
              <HouseholdSummary key={household.id} household={household} showName />
            ))}
          </div>
        </Card>
      )}

      <FamilyCard
        groups={[
          ['Parents', 'parents', person.parents],
          ['Children', 'children', person.children],
          ['Siblings', 'siblings', person.siblings],
        ]}
      />

      <section data-testid="person-documents">
        <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold text-brand-navy">
          <FileText className="h-5 w-5 text-text-muted" />
          Documents
        </h2>

        {docsLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
          </div>
        ) : docs.isError ? (
          <QueryError
            compact
            error={docs.error}
            onRetry={docs.refetch}
            title="Couldn’t load documents"
            data-testid="person-documents-error"
          />
        ) : groups.length === 0 ? (
          <EmptyState
            compact
            icon={FileText}
            title={`No documents are linked to ${person.name} yet`}
            description="A document is linked when it’s read, or from its own page in Documents."
            data-testid="person-documents-empty"
          />
        ) : (
          <div className="space-y-6">
            {groups.map((group) => (
              <div key={group.key} data-testid={`person-documents-group-${group.key}`}>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-muted">
                  {group.label}
                </h3>
                <div className="space-y-2">
                  {group.documents.map((doc) => (
                    <DocumentListItem key={doc.id} document={doc} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function FamilyCard({
  groups,
}: {
  groups: Array<[label: string, key: string, people: RelatedPerson[]]>;
}) {
  const shown = groups.filter(([, , people]) => people.length > 0);
  if (shown.length === 0) return null;

  return (
    <Card>
      <dl className="space-y-3" data-testid="person-family">
        {shown.map(([label, key, people]) => (
          <div key={key} data-testid={`person-family-${key}`}>
            <dt className="text-xs font-semibold uppercase tracking-wide text-text-muted">
              {label}
            </dt>
            <dd className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-sm">
              {people.map((p) => (
                <span key={p.id} className="inline-flex items-center gap-1.5">
                  <Avatar name={p.name} size="sm" />
                  <Link
                    to={`/people/${p.id}`}
                    className="text-brand-navy hover:underline"
                    title={p.inferred ? 'Shares a parent' : undefined}
                  >
                    {p.name}
                  </Link>
                </span>
              ))}
            </dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}

function BackLink() {
  return (
    <Link
      to="/people"
      className="inline-flex items-center gap-1 text-sm text-text-muted hover:text-gray-700"
      data-testid="person-detail-back"
    >
      <ArrowLeft className="h-4 w-4" />
      Back to People
    </Link>
  );
}
