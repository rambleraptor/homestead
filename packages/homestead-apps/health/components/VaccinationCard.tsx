/**
 * One administered dose within a vaccine's history: date, series/provider/lot
 * details, document link, and the record image thumbnail when one is stored.
 * Edit links to the dose form's own address (`DoseFormRoute`).
 */

import { Link } from 'react-router-dom';
import { FileText, Pencil, Trash2 } from 'lucide-react';
import { useVaccinationImageUrl } from '../hooks/useVaccinationImageUrl';
import { HEALTH_HOME } from './HealthFormPage';
import type { Vaccination } from '../types';

interface VaccinationCardProps {
  vaccineId: string;
  vaccination: Vaccination;
  onDelete: (vaccination: Vaccination) => void;
}

export function formatDate(iso: string): string {
  const parsed = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return iso;
  return parsed.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function VaccinationCard({
  vaccineId,
  vaccination,
  onDelete,
}: VaccinationCardProps) {
  const imageUrl = useVaccinationImageUrl(
    vaccineId,
    vaccination.record_image ? vaccination : null,
  );

  const details: string[] = [
    ...(vaccination.dose ? [vaccination.dose] : []),
    ...(vaccination.provider ? [vaccination.provider] : []),
    ...(vaccination.lot_number ? [`Lot ${vaccination.lot_number}`] : []),
  ];

  return (
    <div
      data-testid="vaccination-card"
      className="bg-bg-pearl/60 rounded-md border border-gray-200 p-3 flex gap-3"
    >
      {imageUrl && (
        <img
          src={imageUrl}
          alt={`Record for dose on ${vaccination.date_administered}`}
          className="w-14 h-14 object-cover rounded-md border border-gray-200 flex-shrink-0"
        />
      )}

      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="font-medium text-brand-navy">
              {formatDate(vaccination.date_administered)}
            </p>
            {details.length > 0 && (
              <p className="text-sm text-brand-slate truncate">{details.join(' · ')}</p>
            )}
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            <Link
              to={`${HEALTH_HOME}/vaccines/${vaccineId}/doses/${vaccination.id}/edit`}
              aria-label={`Edit dose from ${vaccination.date_administered}`}
              className="p-1.5 text-text-muted hover:text-brand-navy rounded-md hover:bg-surface-white transition-colors"
            >
              <Pencil className="w-4 h-4" />
            </Link>
            <button
              type="button"
              onClick={() => onDelete(vaccination)}
              aria-label={`Delete dose from ${vaccination.date_administered}`}
              className="p-1.5 text-text-muted hover:text-red-600 rounded-md hover:bg-red-50 transition-colors"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>

        {vaccination.notes && (
          <p className="mt-1 text-sm text-text-muted line-clamp-2">{vaccination.notes}</p>
        )}

        {vaccination.document && (
          <Link
            to={`/documents/${vaccination.document}`}
            data-testid="vaccination-document-link"
            className="mt-1 inline-flex items-center gap-1 text-sm text-accent-terracotta hover:text-accent-terracotta-hover"
          >
            <FileText className="w-4 h-4" aria-hidden="true" />
            View source document
          </Link>
        )}
      </div>
    </div>
  );
}
