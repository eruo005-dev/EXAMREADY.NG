'use client';

/**
 * /ai-quality-review — admin surface for spot-checking AI output.
 *
 * The Pidgin moat lives or dies on whether the model output stays in
 * authentic Nigerian Pidgin. This page is how we keep eyes on it after
 * launch:
 *  - top: 14-day per-feature summary (call volume, success, thumbs ratio)
 *  - bottom: list of redacted samples for the selected feature
 *
 * Samples are gated behind AI_LOG_SAMPLES=true. When sampling is OFF we
 * surface that prominently so the admin knows why the list is empty.
 */
import { Badge, Button, Card, CardContent, EmptyState, Skeleton } from '@examready/ui';
import { Sparkles, ThumbsDown, ThumbsUp } from 'lucide-react';
import { useEffect, useState } from 'react';

import { api } from '@/lib/api';

const FEATURES = [
  { id: 'explain_differently', label: 'Explain differently' },
  { id: 'tutor_chat', label: 'Tutor chat' },
  { id: 'study_plan', label: 'Study plan' },
  { id: 'generate_questions', label: 'Generate questions' },
] as const;

type Feature = (typeof FEATURES)[number]['id'];

type Provider = 'anthropic' | 'deepseek';

type Summary = {
  feature: Feature;
  calls: number;
  succeeded: number;
  withSample: number;
  fallbacks: number;
  byProvider: Array<{
    provider: Provider;
    calls: number;
    succeeded: number;
    fallbacks: number;
  }>;
  thumbsUp: number;
  thumbsDown: number;
  thumbsRatio: number | null;
};

type Sample = {
  id: string;
  feature: Feature;
  provider: Provider;
  model: string;
  wasFallback: boolean;
  createdAt: string;
  durationMs: number | null;
  inputTokens: number;
  outputTokens: number;
  outputSample: string | null;
  feedback: { rating: 'thumbs_up' | 'thumbs_down'; comment: string | null } | null;
};

type Response = {
  windowDays: number;
  samplingEnabled: boolean;
  summary: Summary[];
  samples: Sample[];
};

export default function AiQualityReviewPage() {
  const [feature, setFeature] = useState<Feature>('explain_differently');
  const [data, setData] = useState<Response | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void (async () => {
      const r = await api<Response>(`/api/admin/ai-quality?feature=${feature}&limit=30`);
      if (cancelled) return;
      if (r.ok) setData(r.data);
      else setData(null);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [feature]);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Sparkles className="text-accent h-5 w-5" />
        <h1 className="text-2xl font-bold">AI quality review</h1>
      </div>
      <p className="text-muted-foreground text-sm">
        Per-feature volume, thumbs ratio (last 14 days), and a window of redacted output samples for
        spot-checking register, accuracy, and Pidgin authenticity.
      </p>

      {data && !data.samplingEnabled && (
        <Card className="border-amber-500/40 bg-amber-50/50 dark:bg-amber-950/20">
          <CardContent className="space-y-1 pt-4 text-sm">
            <p className="font-medium">Sampling is OFF.</p>
            <p className="text-muted-foreground">
              Set <code className="bg-muted rounded px-1 py-0.5 text-xs">AI_LOG_SAMPLES=true</code>{' '}
              on the deployment to record a window of redacted outputs, then turn it back off.
              Existing samples (if any) are still shown below.
            </p>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {loading
          ? Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-32" />)
          : data?.summary.map((s) => (
              <Card key={s.feature} className={s.feature === feature ? 'ring-primary ring-2' : ''}>
                <CardContent className="space-y-2 pt-4">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium">
                      {FEATURES.find((f) => f.id === s.feature)?.label ?? s.feature}
                    </p>
                    <Button
                      variant={s.feature === feature ? 'default' : 'ghost'}
                      size="sm"
                      onClick={() => setFeature(s.feature)}
                    >
                      View samples
                    </Button>
                  </div>
                  <div className="text-muted-foreground flex flex-wrap gap-3 text-xs">
                    <span>
                      <span className="text-foreground font-mono">{s.calls}</span> calls
                    </span>
                    <span>
                      <span className="text-foreground font-mono">{s.succeeded}</span> ok
                    </span>
                    <span>
                      <span className="text-foreground font-mono">{s.withSample}</span> sampled
                    </span>
                    <span>
                      <span className="text-foreground font-mono">{s.fallbacks}</span> fallback
                    </span>
                  </div>
                  {s.byProvider.length > 0 && (
                    <div className="text-muted-foreground flex flex-wrap gap-1 text-[11px]">
                      {s.byProvider.map((p) => (
                        <Badge key={p.provider} variant="outline" className="font-mono">
                          {p.provider}: {p.calls}
                          {p.fallbacks > 0 && (
                            <span className="ml-1 text-amber-600">↩{p.fallbacks}</span>
                          )}
                        </Badge>
                      ))}
                    </div>
                  )}
                  <div className="flex items-center gap-3 text-xs">
                    <span className="text-success flex items-center gap-1">
                      <ThumbsUp className="h-3.5 w-3.5" />
                      {s.thumbsUp}
                    </span>
                    <span className="text-destructive flex items-center gap-1">
                      <ThumbsDown className="h-3.5 w-3.5" />
                      {s.thumbsDown}
                    </span>
                    <span className="text-muted-foreground">
                      Ratio:{' '}
                      <span className="text-foreground font-mono">
                        {s.thumbsRatio === null ? '—' : `${Math.round(s.thumbsRatio * 100)}%`}
                      </span>
                    </span>
                  </div>
                </CardContent>
              </Card>
            ))}
      </div>

      <div>
        <h2 className="mb-2 text-lg font-semibold">
          Recent samples — {FEATURES.find((f) => f.id === feature)?.label}
        </h2>
        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-40" />
            ))}
          </div>
        ) : !data || data.samples.length === 0 ? (
          <EmptyState
            title="No samples in the window"
            description={
              data?.samplingEnabled
                ? 'Sampling is on but no calls have produced samples yet for this feature in the last 14 days.'
                : 'Enable AI_LOG_SAMPLES=true on the deployment to capture redacted outputs.'
            }
          />
        ) : (
          <div className="space-y-3">
            {data.samples.map((s) => (
              <Card key={s.id}>
                <CardContent className="space-y-3 pt-4">
                  <div className="text-muted-foreground flex flex-wrap items-center gap-2 text-xs">
                    <Badge variant="outline" className="font-mono">
                      {s.provider}
                    </Badge>
                    <Badge variant="outline">{s.model}</Badge>
                    {s.wasFallback && (
                      <Badge variant="outline" className="border-amber-500/50 text-amber-700">
                        fallback
                      </Badge>
                    )}
                    <span>{new Date(s.createdAt).toLocaleString()}</span>
                    <span>·</span>
                    <span>
                      {s.inputTokens} in / {s.outputTokens} out
                    </span>
                    {s.durationMs !== null && (
                      <>
                        <span>·</span>
                        <span>{s.durationMs}ms</span>
                      </>
                    )}
                    {s.feedback && (
                      <Badge
                        variant={s.feedback.rating === 'thumbs_up' ? 'default' : 'destructive'}
                        className="ml-auto"
                      >
                        {s.feedback.rating === 'thumbs_up' ? '👍 user' : '👎 user'}
                      </Badge>
                    )}
                  </div>
                  <p className="text-reading-base whitespace-pre-wrap font-serif">
                    {s.outputSample}
                  </p>
                  {s.feedback?.comment && (
                    <p className="text-muted-foreground border-t pt-2 text-xs italic">
                      “{s.feedback.comment}”
                    </p>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
