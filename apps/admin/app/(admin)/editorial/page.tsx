/**
 * /admin/editorial — editorial factory operator console.
 *
 * Sprint 7 Phase 2.6 ships the page shell + cards. The live data feed
 * (extraction_jobs / ingestion_jobs / editorial_audit_log via Supabase
 * Realtime + REST) is the next layer once the first real factory run
 * lands rows in those tables.
 *
 * The CLI (`pnpm editorial-factory`) is the canonical way to run the
 * pipeline today; this page replaces it with point-and-click for the
 * non-technical content reviewer the user will hire (per
 * LAUNCH_CHECKLIST §3).
 */
'use client';

import { Badge, Button, Card, CardContent, EmptyState } from '@examready/ui';
import {
  CheckCircle2,
  FileText,
  FlaskConical,
  Hammer,
  ListChecks,
  Search,
  Sparkles,
} from 'lucide-react';

const PIPELINES = [
  {
    name: 'questions',
    label: 'Past questions',
    icon: FileText,
    target: 'questions + options + audit log',
  },
  { name: 'syllabus', label: 'Syllabus', icon: ListChecks, target: 'topics + audit log' },
  { name: 'university', label: 'Universities', icon: Hammer, target: 'universities + audit log' },
  {
    name: 'course-combinations',
    label: 'Course combinations',
    icon: Sparkles,
    target: 'courses + university_courses + audit log',
  },
  { name: 'cutoff', label: 'Cutoff marks', icon: CheckCircle2, target: 'cutoff_marks + audit log' },
  {
    name: 'reference',
    label: 'Reference content',
    icon: FlaskConical,
    target: 'reference_content + audit log',
  },
] as const;

export default function EditorialPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Editorial factory</h1>
        <p className="text-muted-foreground mt-1 max-w-2xl text-sm">
          Operator console for the materials → DeepSeek → audit pipeline. The CLI{' '}
          <code className="bg-muted rounded px-1">pnpm editorial-factory</code> is the canonical
          runner today; this page mirrors it as the live-feed dashboard once jobs start hitting the
          DB.
        </p>
      </div>

      <Card>
        <CardContent className="space-y-3 p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="font-semibold">Trigger actions</h2>
              <p className="text-muted-foreground mt-1 text-sm">
                Equivalent CLI commands — the buttons run them server-side once Phase 7 wires up the
                /api/admin/editorial/run endpoint.
              </p>
            </div>
            <Badge variant="secondary">Phase 7 wires execution</Badge>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <Button variant="outline" disabled className="justify-start">
              <Search className="mr-2 h-4 w-4" />
              Inventory materials/
            </Button>
            <Button variant="outline" disabled className="justify-start">
              <Hammer className="mr-2 h-4 w-4" />
              Process all materials
            </Button>
            <Button variant="outline" disabled className="justify-start">
              <FlaskConical className="mr-2 h-4 w-4" />
              Re-audit borderline
            </Button>
            <Button variant="outline" disabled className="justify-start">
              <Sparkles className="mr-2 h-4 w-4" />
              Re-enrich rejected
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        {PIPELINES.map(({ name, label, icon: Icon, target }) => (
          <Card key={name}>
            <CardContent className="space-y-3 p-6">
              <div className="flex items-start gap-3">
                <Icon className="text-primary h-5 w-5" />
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <h3 className="font-medium">{label}</h3>
                    <Badge variant="outline" className="text-xs">
                      {name}
                    </Badge>
                  </div>
                  <p className="text-muted-foreground mt-1 text-xs">Writes to: {target}</p>
                </div>
              </div>
              <EmptyState
                title="No runs yet"
                description="Once the editorial-factory CLI ships its first run, queue + audit counters appear here in real time (Supabase Realtime channel)."
              />
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardContent className="space-y-2 p-6">
          <h2 className="font-semibold">Audit verdict legend</h2>
          <ul className="text-muted-foreground space-y-1 text-sm">
            <li>
              <Badge className="mr-2 bg-green-100 text-green-900">auto_approved</Badge> Confidence ≥
              85, no critical flag — sweep-view skim.
            </li>
            <li>
              <Badge className="mr-2 bg-amber-100 text-amber-900">needs_review</Badge> Confidence
              70-84 — per-item decision queue (priority sort).
            </li>
            <li>
              <Badge className="mr-2 bg-red-100 text-red-900">rejected_by_audit</Badge> Confidence
              &lt; 70 OR critical flag — hidden by default; one-click restore + re-enrich.
            </li>
            <li>
              <Badge className="mr-2 bg-blue-100 text-blue-900">
                human_approved / human_rejected
              </Badge>{' '}
              Reviewer override of the audit verdict; final.
            </li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
