'use client';

/**
 * Reusable Bulk Import Framework - Container Component
 */

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Upload,
  Download,
  FileText,
  CheckCircle2,
  XCircle,
  ArrowLeft,
} from 'lucide-react';
import { Button } from '@rambleraptor/homestead-core/shared/components/Button';
import { Card } from '@rambleraptor/homestead-core/shared/components/Card';
import { useToast } from '@rambleraptor/homestead-core/shared/components/ToastProvider';
import { parseCSV, downloadCSVTemplate } from './csvParser';
import { DefaultItemPreview } from './DefaultItemPreview';
import type { BulkImportConfig, ParsedItem } from './types';

interface BulkImportContainerProps<T> {
  config: BulkImportConfig<T>;
}

export function BulkImportContainer<T>({ config }: BulkImportContainerProps<T>) {
  const router = useRouter();
  const toast = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [parsedItems, setParsedItems] = useState<ParsedItem<T>[]>([]);
  const [selectedItemIds, setSelectedItemIds] = useState<Set<number>>(new Set());
  const [parseError, setParseError] = useState<string | null>(null);

  const PreviewComponent = config.schema.PreviewComponent || DefaultItemPreview;

  const handleFileChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const selectedFile = event.target.files?.[0];
      if (!selectedFile) return;

      if (!selectedFile.name.endsWith('.csv')) {
        setParseError('Please upload a CSV file');
        return;
      }

      setFile(selectedFile);
      setParseError(null);

      // Parse the file
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const content = e.target?.result as string;
          const result = parseCSV(content, config.schema);

          if (result.items.length === 0) {
            setParseError(`No ${config.moduleNamePlural} found in the CSV file`);
            return;
          }

          setParsedItems(result.items);

          // Select all valid items by default
          const validItemIndices = result.items
            .map((item, index) => (item.isValid ? index : -1))
            .filter((index) => index !== -1);

          setSelectedItemIds(new Set(validItemIndices));

          toast.success(
            `Parsed ${result.validCount} valid ${config.moduleNamePlural} from CSV`
          );

          if (result.invalidCount > 0) {
            toast.warning(
              `${result.invalidCount} ${config.moduleNamePlural} have errors and cannot be imported`
            );
          }
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : 'Failed to parse CSV';
          setParseError(errorMessage);
          toast.error(errorMessage);
        }
      };

      reader.onerror = () => {
        setParseError('Failed to read file');
        toast.error('Failed to read file');
      };

      reader.readAsText(selectedFile);
    },
    [config.schema, config.moduleNamePlural, toast]
  );

  const handleToggleItem = useCallback((index: number) => {
    setSelectedItemIds((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  }, []);

  const handleToggleAll = useCallback(() => {
    const validItemIndices = parsedItems
      .map((item, index) => (item.isValid ? index : -1))
      .filter((index) => index !== -1);

    if (selectedItemIds.size === validItemIndices.length) {
      // Deselect all
      setSelectedItemIds(new Set());
    } else {
      // Select all valid items
      setSelectedItemIds(new Set(validItemIndices));
    }
  }, [parsedItems, selectedItemIds.size]);

  const handleImport = useCallback(async () => {
    const itemsToImport = parsedItems.filter((_, index) =>
      selectedItemIds.has(index)
    );

    if (itemsToImport.length === 0) {
      toast.error(`Please select at least one ${config.moduleName.toLowerCase()} to import`);
      return;
    }

    try {
      await config.onImport(itemsToImport);
      toast.success(
        `Successfully imported ${itemsToImport.length} ${config.moduleNamePlural}`
      );
      router.push(config.backRoute);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : `Failed to import ${config.moduleNamePlural}`;
      toast.error(errorMessage);
    }
  }, [parsedItems, selectedItemIds, config, router, toast]);

  const handleDownloadTemplate = useCallback(() => {
    const template = config.schema.generateTemplate();
    const filename = `${config.moduleNamePlural.replace(/\s+/g, '_')}_import_template.csv`;
    downloadCSVTemplate(template, filename);
  }, [config.schema, config.moduleNamePlural]);

  const validItems = parsedItems.filter((i) => i.isValid);
  const invalidItems = parsedItems.filter((i) => !i.isValid);
  const selectedCount = selectedItemIds.size;

  return (
    <div className="container mx-auto max-w-6xl px-4 py-8">
      {/* Header */}
      <div className="mb-6">
        <Button
          variant="secondary"
          onClick={() => router.push(config.backRoute)}
          className="mb-4"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to {config.moduleName}
        </Button>
        <h1 className="text-3xl font-bold">Bulk Import {config.moduleName}</h1>
        <p className="text-muted-foreground mt-2">
          Import multiple {config.moduleNamePlural} from a CSV file
        </p>
      </div>

      {/* CSV Schema Documentation */}
      {!file && (
        <Card className="mb-6 p-6">
          <div className="flex items-start gap-4">
            <FileText className="h-6 w-6 text-primary flex-shrink-0 mt-1" />
            <div className="flex-1">
              <h2 className="text-xl font-semibold mb-4">CSV File Format</h2>

              <div className="space-y-4">
                {/* Required Fields */}
                <div>
                  <h3 className="font-medium mb-2">Required Headers:</h3>
                  <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
                    {config.schema.requiredFields.map((field) => (
                      <li key={field.name}>
                        <code className="bg-muted px-1 py-0.5 rounded">
                          {field.name}
                        </code>
                        {field.description && ` - ${field.description}`}
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Optional Fields */}
                {config.schema.optionalFields.length > 0 && (
                  <div>
                    <h3 className="font-medium mb-2">Optional Headers:</h3>
                    <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
                      {config.schema.optionalFields.map((field) => (
                        <li key={field.name}>
                          <code className="bg-muted px-1 py-0.5 rounded">
                            {field.name}
                          </code>
                          {field.description && ` - ${field.description}`}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="pt-4 border-t">
                  <Button
                    variant="secondary"
                    onClick={handleDownloadTemplate}
                    className="w-full sm:w-auto"
                  >
                    <Download className="mr-2 h-4 w-4" />
                    Download Template
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* Upload Section */}
      {!file && (
        <Card className="p-6">
          <div className="flex flex-col items-center justify-center py-12">
            <Upload className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">Upload CSV File</h3>
            <p className="text-sm text-muted-foreground mb-6 text-center max-w-md">
              Select a CSV file containing your {config.moduleNamePlural}. Make
              sure it follows the format described above.
            </p>
            <input
              type="file"
              accept=".csv"
              onChange={handleFileChange}
              className="hidden"
              id="csv-upload"
              data-testid="csv-upload-input"
            />
            <label
              htmlFor="csv-upload"
              className="inline-flex items-center justify-center font-medium transition-colors rounded-lg focus:outline-none focus:ring-2 focus:ring-offset-2 bg-blue-600 hover:bg-blue-700 text-white focus:ring-blue-500 px-4 py-2 text-base cursor-pointer"
            >
              Choose File
            </label>
          </div>
        </Card>
      )}

      {/* Parse Error */}
      {parseError && (
        <Card className="p-6 border-destructive bg-destructive/10">
          <div className="flex items-start gap-4">
            <XCircle className="h-6 w-6 text-destructive flex-shrink-0 mt-1" />
            <div>
              <h3 className="font-semibold text-destructive mb-2">Parse Error</h3>
              <p className="text-sm">{parseError}</p>
            </div>
          </div>
        </Card>
      )}

      {/* Preview Section */}
      {file && parsedItems.length > 0 && (
        <>
          {/* Summary Stats */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <Card className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Total {config.moduleName}</p>
                  <p className="text-2xl font-bold">{parsedItems.length}</p>
                </div>
                <FileText className="h-8 w-8 text-muted-foreground" />
              </div>
            </Card>

            <Card className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Valid {config.moduleName}</p>
                  <p className="text-2xl font-bold text-green-600">
                    {validItems.length}
                  </p>
                </div>
                <CheckCircle2 className="h-8 w-8 text-green-600" />
              </div>
            </Card>

            <Card className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Invalid {config.moduleName}</p>
                  <p className="text-2xl font-bold text-destructive">
                    {invalidItems.length}
                  </p>
                </div>
                <XCircle className="h-8 w-8 text-destructive" />
              </div>
            </Card>
          </div>

          {/* Action Bar */}
          <div className="flex items-center justify-between mb-4 gap-4">
            <div className="flex items-center gap-4">
              <Button
                variant="secondary"
                onClick={() => {
                  setFile(null);
                  setParsedItems([]);
                  setSelectedItemIds(new Set());
                  setParseError(null);
                }}
              >
                Choose Different File
              </Button>
              {validItems.length > 0 && (
                <Button variant="secondary" onClick={handleToggleAll}>
                  {selectedItemIds.size === validItems.length
                    ? 'Deselect All'
                    : 'Select All'}
                </Button>
              )}
            </div>

            <div className="flex items-center gap-4">
              <span className="text-sm text-muted-foreground">
                {selectedCount} of {validItems.length} selected
              </span>
              <Button
                onClick={handleImport}
                disabled={selectedCount === 0 || config.isImporting}
                data-testid="import-button"
              >
                {config.isImporting
                  ? 'Importing...'
                  : `Import ${selectedCount} ${selectedCount === 1 ? config.moduleName : config.moduleName + '(s)'}`}
              </Button>
            </div>
          </div>

          {/* Item List */}
          <div className="space-y-4">
            {parsedItems.map((item, index) => (
              <PreviewComponent
                key={index}
                item={item}
                isSelected={selectedItemIds.has(index)}
                onToggle={() => handleToggleItem(index)}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
