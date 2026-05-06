'use client';

import { Badge, Button, Card, CardContent, useToast } from '@examready/ui';
import { FileUp, Upload } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';


import { api } from '@/lib/api';

type ImportResponse = {
  inserted: number;
  errors: Array<{ row: number; message: string }>;
};

export default function ImportQuestionsPage() {
  const { toast } = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<ImportResponse | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const handleFile = (f: File | null) => {
    if (!f) return;
    if (!f.name.endsWith('.csv')) {
      toast({ variant: 'destructive', title: 'Wrong file type', description: 'Upload a .csv file.' });
      return;
    }
    setFile(f);
    setResult(null);
  };

  const submit = async () => {
    if (!file) return;
    setSubmitting(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const r = await api<ImportResponse>('/api/admin/questions/import', {
        method: 'POST',
        body: form,
      });
      if (!r.ok) {
        toast({ variant: 'destructive', title: 'Import failed', description: r.error.message });
        return;
      }
      setResult(r.data);
      toast({
        title: 'Import complete',
        description: `${r.data.inserted} inserted, ${r.data.errors.length} errors`,
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Import questions from CSV</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Upload up to 1000 rows per file (5 MB max).{' '}
          <Link href="/questions" className="underline">Back to questions</Link>.
        </p>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              handleFile(e.dataTransfer.files[0] ?? null);
            }}
            className={`flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-12 text-center transition-colors ${
              dragOver ? 'border-primary bg-primary/5' : 'border-input'
            }`}
          >
            <FileUp className="mb-3 h-8 w-8 text-muted-foreground" />
            <p className="font-medium">Drag your CSV here</p>
            <p className="mb-4 text-sm text-muted-foreground">or click to browse</p>
            <input
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              id="csv-upload"
              onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
            />
            <Button variant="outline" asChild>
              <label htmlFor="csv-upload" className="cursor-pointer">
                <Upload className="h-4 w-4" /> Choose file
              </label>
            </Button>
            {file && (
              <p className="mt-4 text-sm">
                Selected: <strong>{file.name}</strong>{' '}
                <Badge variant="outline" className="ml-1">
                  {(file.size / 1024).toFixed(1)} KB
                </Badge>
              </p>
            )}
          </div>

          <div className="mt-6 flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              Format docs:{' '}
              <a
                href="https://github.com/eruo005-dev/EXAMREADY.NG/blob/main/apps/web/app/api/admin/questions/import/CSV_FORMAT.md"
                target="_blank"
                rel="noopener noreferrer"
                className="underline"
              >
                CSV_FORMAT.md
              </a>
            </p>
            <Button onClick={submit} disabled={!file || submitting}>
              {submitting ? 'Importing…' : 'Upload & import'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {result && (
        <Card>
          <CardContent className="space-y-4 pt-6">
            <div className="flex items-center gap-3">
              <Badge variant="success">{result.inserted} inserted</Badge>
              {result.errors.length > 0 && (
                <Badge variant="destructive">{result.errors.length} errors</Badge>
              )}
            </div>
            {result.errors.length > 0 && (
              <div>
                <p className="mb-2 font-medium">Errors</p>
                <ul className="space-y-1 text-sm">
                  {result.errors.slice(0, 50).map((e, i) => (
                    <li key={i} className="rounded-md border border-destructive/40 bg-destructive/5 p-2">
                      <Badge variant="outline" className="mr-2">
                        Row {e.row}
                      </Badge>
                      {e.message}
                    </li>
                  ))}
                  {result.errors.length > 50 && (
                    <li className="text-muted-foreground">
                      …and {result.errors.length - 50} more.
                    </li>
                  )}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
