/**
 * The standardized bulk-import page.
 *
 * Every app that supports bulk import renders this and nothing else — the
 * formats, the parsing, the validation, and the writes all come from the
 * server's `bulkImport` declaration for the resource. An app supplies its
 * plural, some display names, and optionally a preview row.
 *
 * Flow: pick a format → upload/paste → the server parses (dry run) → review and
 * deselect → import the selection.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AepbaseError } from '@rambleraptor/homestead-core/api/aepbase';
import {
  ArrowLeft,
  CheckCircle2,
  Download,
  FileText,
  FileX,
  Upload,
  XCircle,
} from 'lucide-react';
import { Button } from '@rambleraptor/homestead-core/shared/components/Button';
import { Card } from '@rambleraptor/homestead-core/shared/components/Card';
import { EmptyState } from '@rambleraptor/homestead-core/shared/components/EmptyState';
import { QueryError } from '@rambleraptor/homestead-core/shared/components/QueryError';
import { useToast } from '@rambleraptor/homestead-core/shared/components/ToastProvider';
import type {
  BulkImportColumnInfo,
  BulkImportFormatInfo,
  ParsedItem,
} from '@rambleraptor/homestead-core/resources/bulk-import/types';
import {
  useBulkImportFormats,
  useBulkImportPreview,
  useBulkImportRun,
} from './useBulkImport';
import { DefaultItemPreview } from './DefaultItemPreview';
import type { BulkImportPageConfig } from './types';

interface BulkImportContainerProps<T> {
  config: BulkImportPageConfig<T>;
}

export function BulkImportContainer<T>({ config }: BulkImportContainerProps<T>) {
  const navigate = useNavigate();
  const toast = useToast();
  const { plural, appName, appNamePlural, backRoute } = config;

  const formatsQuery = useBulkImportFormats(plural);
  const preview = useBulkImportPreview(plural);
  const run = useBulkImportRun(plural, config.queryKey);

  const [formatId, setFormatId] = useState<string | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [text, setText] = useState('');
  const [items, setItems] = useState<ParsedItem<T>[] | null>(null);
  /** Names the shown preview; the import writes exactly its rows. */
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const formats = useMemo(() => formatsQuery.data ?? [], [formatsQuery.data]);
  const format = formats.find((f) => f.id === formatId) ?? null;

  // Default to the first format once discovery lands.
  useEffect(() => {
    if (!formatId && formats.length > 0) setFormatId(formats[0].id);
  }, [formats, formatId]);

  const PreviewRow = config.preview ?? DefaultItemPreview;

  const reset = useCallback(() => {
    setFiles([]);
    setText('');
    setItems(null);
    setPreviewId(null);
    setSelected(new Set());
    setError(null);
  }, []);

  const handleFormatChange = useCallback(
    (id: string) => {
      setFormatId(id);
      reset();
    },
    [reset],
  );

  const handleParse = useCallback(async () => {
    if (!format) return;
    setError(null);
    try {
      const result = await preview.mutateAsync(
        format.input_type === 'text'
          ? { format: format.id, text }
          : { format: format.id, files },
      );
      // Leave `items` null on an empty parse: the upload form only renders
      // while it's null, so setting it to [] would strand the user on an error
      // with nothing to retry from.
      if (result.summary.total === 0) {
        setError(`No ${appNamePlural} found in that input`);
        return;
      }

      setItems(result.items as ParsedItem<T>[]);
      setPreviewId(result.preview_id);
      // Pre-select everything importable — the common case is "import it all".
      setSelected(
        new Set(result.items.filter((i) => i.errors.length === 0).map((i) => i.index)),
      );

      if (result.summary.invalid > 0) {
        toast.warning(
          `${result.summary.invalid} of ${result.summary.total} ${appNamePlural} have errors and can't be imported`,
        );
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Could not read that input';
      setError(message);
      toast.error(message);
    }
  }, [format, files, text, preview, appNamePlural, toast]);

  const handleImport = useCallback(async () => {
    if (!format || !items || !previewId) return;
    const allValid = items.filter((i) => i.errors.length === 0);
    const selectedIndices =
      selected.size === allValid.length ? '*' : [...selected].sort((a, b) => a - b);

    try {
      const result = await run.mutateAsync({ format: format.id, previewId, selectedIndices });
      // Spent either way: a retry would import the rows that did succeed again.
      setPreviewId(null);

      if (result.created > 0) {
        toast.success(`Imported ${result.created} ${appNamePlural}`);
      }
      if (result.failed.length > 0) {
        // Partial success is the interesting case: say how many and why, and
        // stay on the page so the failures are still readable.
        toast.error(
          `${result.failed.length} ${appNamePlural} failed to import: ${result.failed[0].error}`,
        );
        return;
      }
      navigate(backRoute);
    } catch (e) {
      if (e instanceof AepbaseError && e.code === 410) {
        // The server no longer holds this preview (it expired, or the server
        // restarted). Back to the input — still filled in — to preview again.
        const message = 'This preview has expired. Preview it again to import.';
        setItems(null);
        setPreviewId(null);
        setError(message);
        toast.error(message);
        return;
      }
      const message = e instanceof Error ? e.message : `Could not import ${appNamePlural}`;
      toast.error(message);
    }
  }, [format, items, previewId, selected, run, toast, appNamePlural, navigate, backRoute]);

  const handleDownloadTemplate = useCallback(() => {
    if (!format) return;
    window.location.href = `/api/bulk-import/${plural}/template?format=${format.id}`;
  }, [format, plural]);

  const toggleItem = useCallback((index: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }, []);

  const validItems = items?.filter((i) => i.errors.length === 0) ?? [];
  const invalidCount = (items?.length ?? 0) - validItems.length;

  const toggleAll = useCallback(() => {
    setSelected((prev) =>
      prev.size === validItems.length
        ? new Set()
        : new Set(validItems.map((i) => i.index)),
    );
  }, [validItems]);

  const hasInput = format?.input_type === 'text' ? text.trim() !== '' : files.length > 0;

  return (
    <div className="container mx-auto max-w-6xl px-4 py-8">
      <div className="mb-6">
        <Button variant="secondary" onClick={() => navigate(backRoute)} className="mb-4">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to {appName}
        </Button>
        <h1 className="text-3xl font-bold">Bulk Import {appName}</h1>
        <p className="text-muted-foreground mt-2">Import multiple {appNamePlural} at once</p>
      </div>

      {formatsQuery.isLoading && (
        <Card className="p-6 text-muted-foreground">Loading import formats…</Card>
      )}

      {formatsQuery.isError && (
        <QueryError
          error={formatsQuery.error}
          onRetry={() => void formatsQuery.refetch()}
          title="Couldn’t load import formats"
          data-testid="bulk-import-formats-error"
        />
      )}

      {formatsQuery.isSuccess && formats.length === 0 && (
        <EmptyState
          icon={FileX}
          title={`${appName} doesn't support bulk import`}
          description="This app hasn’t declared any import formats."
          data-testid="bulk-import-unsupported"
        />
      )}

      {!items && format && (
        <Card className="p-6">
          {formats.length > 1 && (
            <FormatPicker
              formats={formats}
              selected={format}
              onSelect={handleFormatChange}
            />
          )}

          {format.description && (
            <p
              className="mb-4 text-sm text-muted-foreground"
              data-testid="bulk-import-format-description"
            >
              {format.description}
            </p>
          )}

          {format.columns && format.columns.length > 0 && (
            <ColumnReference columns={format.columns} label={format.label} />
          )}

          {format.input_type === 'text' ? (
            <div className="space-y-4">
              <label htmlFor="import-text" className="block font-medium">
                Paste your {appNamePlural}
              </label>
              <textarea
                id="import-text"
                data-testid="import-text-input"
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={14}
                className="w-full rounded-lg border bg-background p-3 font-mono text-sm"
              />
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-10">
              <Upload className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium mb-2">
                Upload {format.label} {format.multiple ? 'file(s)' : 'file'}
              </h3>
              <p className="text-sm text-muted-foreground mb-6 text-center max-w-md">
                {files.length > 0
                  ? files.map((f) => f.name).join(', ')
                  : format.description
                    ? 'No files chosen yet.'
                    : `Select a ${format.label} file containing your ${appNamePlural}.`}
              </p>
              <input
                type="file"
                accept={format.accept}
                multiple={format.multiple}
                onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
                className="hidden"
                id="bulk-import-upload"
                data-testid="bulk-import-file-input"
              />
              <label
                htmlFor="bulk-import-upload"
                className="inline-flex cursor-pointer items-center justify-center rounded-lg bg-accent-terracotta px-4 py-2 text-base font-medium text-white transition-colors hover:bg-accent-terracotta-hover"
              >
                Choose File
              </label>
              {format.has_template && (
                <Button variant="secondary" onClick={handleDownloadTemplate} className="mt-6">
                  <Download className="mr-2 h-4 w-4" />
                  Download Template
                </Button>
              )}
            </div>
          )}

          <div className="mt-6 flex justify-end border-t pt-4">
            <Button
              onClick={handleParse}
              disabled={!hasInput || preview.isPending}
              data-testid="bulk-import-preview-button"
            >
              {preview.isPending ? 'Reading…' : 'Preview Import'}
            </Button>
          </div>
        </Card>
      )}

      {error && (
        <Card className="border-destructive bg-destructive/10 mt-6 p-6">
          <div className="flex items-start gap-4">
            <XCircle className="text-destructive h-6 w-6 flex-shrink-0" />
            <div>
              <h3 className="text-destructive mb-1 font-semibold">Import Error</h3>
              <p className="text-sm">{error}</p>
            </div>
          </div>
        </Card>
      )}

      {items && items.length > 0 && (
        <>
          <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-3">
            <StatCard label={`Total ${appName}`} value={items.length} icon={FileText} />
            <StatCard
              label={`Valid ${appName}`}
              value={validItems.length}
              icon={CheckCircle2}
              tone="text-green-600"
            />
            <StatCard
              label={`Invalid ${appName}`}
              value={invalidCount}
              icon={XCircle}
              tone="text-destructive"
            />
          </div>

          <div className="mb-4 flex items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <Button variant="secondary" onClick={reset}>
                Start Over
              </Button>
              {validItems.length > 0 && (
                <Button variant="secondary" onClick={toggleAll}>
                  {selected.size === validItems.length ? 'Deselect All' : 'Select All'}
                </Button>
              )}
            </div>
            <div className="flex items-center gap-4">
              <span className="text-muted-foreground text-sm">
                {selected.size} of {validItems.length} selected
              </span>
              <Button
                onClick={handleImport}
                disabled={selected.size === 0 || run.isPending || !previewId}
                data-testid="import-button"
              >
                {run.isPending ? 'Importing…' : `Import ${selected.size} ${appName}`}
              </Button>
            </div>
          </div>

          <div className="space-y-4">
            {items.map((item) => (
              <PreviewRow
                key={item.index}
                item={item}
                isSelected={selected.has(item.index)}
                onToggle={() => toggleItem(item.index)}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/**
 * What the file should contain, from the parser's declared columns. The server
 * is the source of truth here — an app describes a column once, next to the
 * validator that enforces it.
 */
function ColumnReference({
  columns,
  label,
}: {
  columns: BulkImportColumnInfo[];
  label: string;
}) {
  const required = columns.filter((c) => c.required);
  const optional = columns.filter((c) => !c.required);

  return (
    <div className="mb-6 border-b pb-6">
      <div className="flex items-start gap-4">
        <FileText className="text-primary mt-1 h-6 w-6 flex-shrink-0" />
        <div className="flex-1 space-y-4">
          <h2 className="text-xl font-semibold">{label} Format</h2>
          {required.length > 0 && <ColumnList title="Required" columns={required} />}
          {optional.length > 0 && <ColumnList title="Optional" columns={optional} />}
        </div>
      </div>
    </div>
  );
}

function ColumnList({ title, columns }: { title: string; columns: BulkImportColumnInfo[] }) {
  return (
    <div>
      <h3 className="mb-2 font-medium">{title}:</h3>
      <ul className="text-muted-foreground list-inside list-disc space-y-1 text-sm">
        {columns.map((column) => (
          <li key={column.name}>
            <code className="bg-muted rounded px-1 py-0.5">{column.name}</code>
            {column.description && ` — ${column.description}`}
          </li>
        ))}
      </ul>
    </div>
  );
}

function FormatPicker({
  formats,
  selected,
  onSelect,
}: {
  formats: BulkImportFormatInfo[];
  selected: BulkImportFormatInfo;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="mb-6 border-b pb-6">
      <h2 className="mb-3 font-medium">Import from</h2>
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Import format">
        {formats.map((format) => (
          <button
            key={format.id}
            type="button"
            role="radio"
            aria-checked={format.id === selected.id}
            onClick={() => onSelect(format.id)}
            data-testid={`import-format-${format.id}`}
            className={`rounded-lg border px-4 py-2 text-sm transition-colors ${
              format.id === selected.id
                ? 'border-primary bg-primary/5 font-medium'
                : 'hover:border-primary/50'
            }`}
          >
            {format.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string;
  value: number;
  icon: typeof FileText;
  tone?: string;
}) {
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-muted-foreground text-sm">{label}</p>
          <p className={`text-2xl font-bold ${tone ?? ''}`}>{value}</p>
        </div>
        <Icon className={`h-8 w-8 ${tone ?? 'text-muted-foreground'}`} />
      </div>
    </Card>
  );
}
