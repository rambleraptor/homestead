import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Upload, Download, FileText, CheckCircle2, XCircle, ArrowLeft } from 'lucide-react';
import { Button } from '@/shared/components/Button';
import { Card } from '@/shared/components/Card';
import { useToast } from '@/shared/components/ToastProvider';
import { parseEventsCSV, downloadCSVTemplate } from '../utils/csvParser';
import type { ParsedEvent } from '../utils/csvParser';
import { EventPreview } from './EventPreview';
import { useBulkImportEvents } from '../hooks/useBulkImportEvents';

export function BulkImport() {
  const navigate = useNavigate();
  const toast = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [parsedEvents, setParsedEvents] = useState<ParsedEvent[]>([]);
  const [selectedEventIds, setSelectedEventIds] = useState<Set<number>>(new Set());
  const [parseError, setParseError] = useState<string | null>(null);
  const bulkImport = useBulkImportEvents();

  const handleFileChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
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
        const result = parseEventsCSV(content);

        if (result.events.length === 0) {
          setParseError('No events found in the CSV file');
          return;
        }

        setParsedEvents(result.events);

        // Select all valid events by default
        const validEventIndices = result.events
          .map((event, index) => (event.isValid ? index : -1))
          .filter(index => index !== -1);

        setSelectedEventIds(new Set(validEventIndices));

        toast.success(`Parsed ${result.validCount} valid event(s) from CSV`);

        if (result.invalidCount > 0) {
          toast.warning(`${result.invalidCount} event(s) have errors and cannot be imported`);
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Failed to parse CSV';
        setParseError(errorMessage);
        toast.error(errorMessage);
      }
    };

    reader.onerror = () => {
      setParseError('Failed to read file');
      toast.error('Failed to read file');
    };

    reader.readAsText(selectedFile);
  }, [toast]);

  const handleToggleEvent = useCallback((index: number) => {
    setSelectedEventIds(prev => {
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
    const validEventIndices = parsedEvents
      .map((event, index) => (event.isValid ? index : -1))
      .filter(index => index !== -1);

    if (selectedEventIds.size === validEventIndices.length) {
      // Deselect all
      setSelectedEventIds(new Set());
    } else {
      // Select all valid events
      setSelectedEventIds(new Set(validEventIndices));
    }
  }, [parsedEvents, selectedEventIds.size]);

  const handleImport = useCallback(async () => {
    const eventsToImport = parsedEvents.filter((_, index) => selectedEventIds.has(index));

    if (eventsToImport.length === 0) {
      toast.error('Please select at least one event to import');
      return;
    }

    try {
      await bulkImport.mutateAsync(eventsToImport);
      toast.success(`Successfully imported ${eventsToImport.length} event(s)`);
      navigate('/events');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to import events';
      toast.error(errorMessage);
    }
  }, [parsedEvents, selectedEventIds, bulkImport, navigate, toast]);

  const validEvents = parsedEvents.filter(e => e.isValid);
  const invalidEvents = parsedEvents.filter(e => !e.isValid);
  const selectedCount = selectedEventIds.size;

  return (
    <div className="container mx-auto max-w-6xl px-4 py-8">
      {/* Header */}
      <div className="mb-6">
        <Button
          variant="secondary"
          onClick={() => navigate('/events')}
          className="mb-4"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Events
        </Button>
        <h1 className="text-3xl font-bold">Bulk Import Events</h1>
        <p className="text-muted-foreground mt-2">
          Import multiple events from a CSV file
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
                <div>
                  <h3 className="font-medium mb-2">Required Headers:</h3>
                  <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
                    <li><code className="bg-muted px-1 py-0.5 rounded">event_type</code> - Type of event: "birthday" or "anniversary"</li>
                    <li><code className="bg-muted px-1 py-0.5 rounded">title</code> - Event title (max 200 characters)</li>
                    <li><code className="bg-muted px-1 py-0.5 rounded">people_involved</code> - People involved (max 500 characters)</li>
                    <li><code className="bg-muted px-1 py-0.5 rounded">event_date</code> - Event date in YYYY-MM-DD format</li>
                  </ul>
                </div>

                <div>
                  <h3 className="font-medium mb-2">Optional Headers:</h3>
                  <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
                    <li><code className="bg-muted px-1 py-0.5 rounded">recurring_yearly</code> - Whether event recurs yearly: "true" or "false" (default: true)</li>
                    <li><code className="bg-muted px-1 py-0.5 rounded">details</code> - Additional details (max 2000 characters)</li>
                    <li><code className="bg-muted px-1 py-0.5 rounded">notification_preferences</code> - Comma-separated: "day_of", "day_before", "week_before" (default: "day_of")</li>
                  </ul>
                </div>

                <div className="pt-4 border-t">
                  <Button
                    variant="secondary"
                    onClick={downloadCSVTemplate}
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
              Select a CSV file containing your events. Make sure it follows the format described above.
            </p>
            <input
              type="file"
              accept=".csv"
              onChange={handleFileChange}
              className="hidden"
              id="csv-upload"
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
      {file && parsedEvents.length > 0 && (
        <>
          {/* Summary Stats */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <Card className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Total Events</p>
                  <p className="text-2xl font-bold">{parsedEvents.length}</p>
                </div>
                <FileText className="h-8 w-8 text-muted-foreground" />
              </div>
            </Card>

            <Card className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Valid Events</p>
                  <p className="text-2xl font-bold text-green-600">{validEvents.length}</p>
                </div>
                <CheckCircle2 className="h-8 w-8 text-green-600" />
              </div>
            </Card>

            <Card className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Invalid Events</p>
                  <p className="text-2xl font-bold text-destructive">{invalidEvents.length}</p>
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
                  setParsedEvents([]);
                  setSelectedEventIds(new Set());
                  setParseError(null);
                }}
              >
                Choose Different File
              </Button>
              {validEvents.length > 0 && (
                <Button
                  variant="secondary"
                  onClick={handleToggleAll}
                >
                  {selectedEventIds.size === validEvents.length ? 'Deselect All' : 'Select All'}
                </Button>
              )}
            </div>

            <div className="flex items-center gap-4">
              <span className="text-sm text-muted-foreground">
                {selectedCount} of {validEvents.length} selected
              </span>
              <Button
                onClick={handleImport}
                disabled={selectedCount === 0 || bulkImport.isPending}
              >
                {bulkImport.isPending ? 'Importing...' : `Import ${selectedCount} Event(s)`}
              </Button>
            </div>
          </div>

          {/* Event List */}
          <div className="space-y-4">
            {parsedEvents.map((event, index) => (
              <EventPreview
                key={index}
                event={event}
                isSelected={selectedEventIds.has(index)}
                onToggle={() => handleToggleEvent(index)}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
