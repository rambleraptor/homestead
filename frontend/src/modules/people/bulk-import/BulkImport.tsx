import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Upload, Download, FileText, CheckCircle2, XCircle, ArrowLeft } from 'lucide-react';
import { Button } from '@/shared/components/Button';
import { Card } from '@/shared/components/Card';
import { useToast } from '@/shared/components/ToastProvider';
import { parsePeopleCSV, downloadPeopleCSVTemplate } from '../utils/csvParser';
import type { ParsedPerson } from '../utils/csvParser';
import { PersonPreview } from './PersonPreview';
import { useBulkImportPeople } from '../hooks/useBulkImportPeople';

export function BulkImport() {
  const navigate = useNavigate();
  const toast = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [parsedPeople, setParsedPeople] = useState<ParsedPerson[]>([]);
  const [selectedPersonIds, setSelectedPersonIds] = useState<Set<number>>(new Set());
  const [parseError, setParseError] = useState<string | null>(null);
  const bulkImport = useBulkImportPeople();

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
        const result = parsePeopleCSV(content);

        if (result.people.length === 0) {
          setParseError('No people found in the CSV file');
          return;
        }

        setParsedPeople(result.people);

        // Select all valid people by default
        const validPersonIndices = result.people
          .map((person, index) => (person.isValid ? index : -1))
          .filter(index => index !== -1);

        setSelectedPersonIds(new Set(validPersonIndices));

        toast.success(`Parsed ${result.validCount} valid person(s) from CSV`);

        if (result.invalidCount > 0) {
          toast.warning(`${result.invalidCount} person(s) have errors and cannot be imported`);
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

  const handleTogglePerson = useCallback((index: number) => {
    setSelectedPersonIds(prev => {
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
    const validPersonIndices = parsedPeople
      .map((person, index) => (person.isValid ? index : -1))
      .filter(index => index !== -1);

    if (selectedPersonIds.size === validPersonIndices.length) {
      // Deselect all
      setSelectedPersonIds(new Set());
    } else {
      // Select all valid people
      setSelectedPersonIds(new Set(validPersonIndices));
    }
  }, [parsedPeople, selectedPersonIds.size]);

  const handleImport = useCallback(async () => {
    const peopleToImport = parsedPeople.filter((_, index) => selectedPersonIds.has(index));

    if (peopleToImport.length === 0) {
      toast.error('Please select at least one person to import');
      return;
    }

    try {
      await bulkImport.mutateAsync(peopleToImport.map(p => p.data));
      toast.success(`Successfully imported ${peopleToImport.length} person(s)`);
      navigate('/people');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to import people';
      toast.error(errorMessage);
    }
  }, [parsedPeople, selectedPersonIds, bulkImport, navigate, toast]);

  const validPeople = parsedPeople.filter(e => e.isValid);
  const invalidPeople = parsedPeople.filter(e => !e.isValid);
  const selectedCount = selectedPersonIds.size;

  return (
    <div className="container mx-auto max-w-6xl px-4 py-8">
      {/* Header */}
      <div className="mb-6">
        <Button
          variant="secondary"
          onClick={() => navigate('/people')}
          className="mb-4"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to People
        </Button>
        <h1 className="text-3xl font-bold">Bulk Import People</h1>
        <p className="text-muted-foreground mt-2">
          Import multiple people from a CSV file
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
                    <li><code className="bg-muted px-1 py-0.5 rounded">name</code> - Full name of the person (max 200 characters)</li>
                  </ul>
                </div>

                <div>
                  <h3 className="font-medium mb-2">Optional Headers:</h3>
                  <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
                    <li><code className="bg-muted px-1 py-0.5 rounded">address</code> - Street address line 1 (max 500 characters)</li>
                    <li><code className="bg-muted px-1 py-0.5 rounded">address_line2</code> - Apt, Suite, etc.</li>
                    <li><code className="bg-muted px-1 py-0.5 rounded">address_city</code> - City</li>
                    <li><code className="bg-muted px-1 py-0.5 rounded">address_state</code> - State/Province</li>
                    <li><code className="bg-muted px-1 py-0.5 rounded">address_postal_code</code> - Postal/ZIP code</li>
                    <li><code className="bg-muted px-1 py-0.5 rounded">address_country</code> - Country</li>
                    <li><code className="bg-muted px-1 py-0.5 rounded">wifi_network</code> - WiFi network name</li>
                    <li><code className="bg-muted px-1 py-0.5 rounded">wifi_password</code> - WiFi password</li>
                    <li><code className="bg-muted px-1 py-0.5 rounded">birthday</code> - Birthday (YYYY-MM-DD or MM/DD/YYYY)</li>
                    <li><code className="bg-muted px-1 py-0.5 rounded">anniversary</code> - Anniversary (YYYY-MM-DD or MM/DD/YYYY)</li>
                    <li><code className="bg-muted px-1 py-0.5 rounded">notification_preferences</code> - Comma-separated: "day_of", "day_before", "week_before"</li>
                    <li><code className="bg-muted px-1 py-0.5 rounded">partner_name</code> - Partner's name (matched with other people in import or existing database)</li>
                  </ul>
                </div>

                <div className="pt-4 border-t">
                  <Button
                    variant="secondary"
                    onClick={downloadPeopleCSVTemplate}
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
              Select a CSV file containing your people. Make sure it follows the format described above.
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
      {file && parsedPeople.length > 0 && (
        <>
          {/* Summary Stats */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <Card className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Total People</p>
                  <p className="text-2xl font-bold">{parsedPeople.length}</p>
                </div>
                <FileText className="h-8 w-8 text-muted-foreground" />
              </div>
            </Card>

            <Card className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Valid People</p>
                  <p className="text-2xl font-bold text-green-600">{validPeople.length}</p>
                </div>
                <CheckCircle2 className="h-8 w-8 text-green-600" />
              </div>
            </Card>

            <Card className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Invalid People</p>
                  <p className="text-2xl font-bold text-destructive">{invalidPeople.length}</p>
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
                  setParsedPeople([]);
                  setSelectedPersonIds(new Set());
                  setParseError(null);
                }}
              >
                Choose Different File
              </Button>
              {validPeople.length > 0 && (
                <Button
                  variant="secondary"
                  onClick={handleToggleAll}
                >
                  {selectedPersonIds.size === validPeople.length ? 'Deselect All' : 'Select All'}
                </Button>
              )}
            </div>

            <div className="flex items-center gap-4">
              <span className="text-sm text-muted-foreground">
                {selectedCount} of {validPeople.length} selected
              </span>
              <Button
                onClick={handleImport}
                disabled={selectedCount === 0 || bulkImport.isPending}
              >
                {bulkImport.isPending ? 'Importing...' : `Import ${selectedCount} Person(s)`}
              </Button>
            </div>
          </div>

          {/* People List */}
          <div className="space-y-4">
            {parsedPeople.map((item, index) => (
              <PersonPreview
                key={index}
                item={item}
                isSelected={selectedPersonIds.has(index)}
                onToggle={() => handleTogglePerson(index)}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
