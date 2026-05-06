'use client';

/**
 * Per-question explanation panel with two AI surfaces:
 *
 * 1. "Explain differently" dropdown — calls /api/ai/explain-differently
 *    on demand. Three levels: simpler / with-analogy / in-pidgin.
 *    Result replaces the original explanation; a "Show original" link
 *    lets the student toggle back.
 *
 * 2. Thumbs feedback — appears after an AI explanation has been
 *    generated. Posts to /api/ai/feedback referencing the
 *    aiUsageLogId returned with the explanation. The thumbs ratio
 *    across all student feedback is the launch-readiness quality
 *    signal for the Pidgin moat.
 */

import {
  Badge,
  Button,
  Card,
  CardContent,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  useToast,
} from '@examready/ui';
import { Loader2, Sparkles, ThumbsDown, ThumbsUp } from 'lucide-react';
import { useState } from 'react';

type Level = 'simpler' | 'with_analogy' | 'step_by_step' | 'pidgin';

const LEVEL_LABELS: Record<Level, string> = {
  simpler: 'Simpler English',
  with_analogy: 'With an analogy',
  step_by_step: 'Step-by-step',
  pidgin: 'In Pidgin',
};

// Sprint 6: Pidgin is feature-flagged off pending Nigerian-fluent human
// review of sample quality. The server gates the API endpoint on
// PIDGIN_ENABLED; this client mirror controls whether the UI option is
// even surfaced. Read from NEXT_PUBLIC_PIDGIN_ENABLED so it ships with
// the bundle and we don't need a fetch to know.
const PIDGIN_VISIBLE = process.env.NEXT_PUBLIC_PIDGIN_ENABLED === 'true';

type AiState =
  | { kind: 'idle' }
  | { kind: 'loading'; level: Level }
  | {
      kind: 'rendered';
      level: Level;
      text: string;
      aiUsageLogId: string | null;
    };

export type ExplanationCardProps = {
  questionId: string;
  /** Original explanation from the question's stored row. Always available. */
  originalExplanation: string;
  /** Heading slot — caller passes "Question N", isCorrect icon, topic badge etc. */
  header: React.ReactNode;
  /** Forwarded to the outer Card so callers can tint the border (success/destructive). */
  className?: string;
};

export function ExplanationCard({
  questionId,
  originalExplanation,
  header,
  className,
}: ExplanationCardProps) {
  const { toast } = useToast();
  const [ai, setAi] = useState<AiState>({ kind: 'idle' });
  const [feedback, setFeedback] = useState<'thumbs_up' | 'thumbs_down' | null>(null);
  const [feedbackBusy, setFeedbackBusy] = useState(false);

  const explainAt = async (level: Level) => {
    setAi({ kind: 'loading', level });
    setFeedback(null);
    try {
      const res = await fetch('/api/ai/explain-differently', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ questionId, level }),
      });
      const data = await res.json();
      if (!res.ok) {
        const code = data?.error?.code;
        const msg = data?.error?.message ?? 'Could not generate alternate explanation.';
        if (code === 'TIER_LIMIT_EXCEEDED') {
          toast({
            variant: 'destructive',
            title: "You've used today's AI re-explanations",
            description: msg,
          });
        } else if (code === 'RATE_LIMITED') {
          toast({ variant: 'destructive', title: 'Slow down', description: msg });
        } else {
          toast({ variant: 'destructive', title: 'AI unavailable', description: msg });
        }
        setAi({ kind: 'idle' });
        return;
      }
      setAi({
        kind: 'rendered',
        level,
        text: data.data.explanation,
        aiUsageLogId: data.data.aiUsageLogId,
      });
    } catch (err) {
      toast({ variant: 'destructive', title: 'Network error', description: String(err) });
      setAi({ kind: 'idle' });
    }
  };

  const submitFeedback = async (rating: 'thumbs_up' | 'thumbs_down') => {
    if (ai.kind !== 'rendered' || !ai.aiUsageLogId) return;
    setFeedbackBusy(true);
    try {
      const res = await fetch('/api/ai/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ aiUsageLogId: ai.aiUsageLogId, rating }),
      });
      if (res.ok) {
        setFeedback(rating);
        toast({ title: 'Thanks for the feedback' });
      }
    } finally {
      setFeedbackBusy(false);
    }
  };

  const showAi = ai.kind === 'rendered';
  const explanationText = showAi ? ai.text : originalExplanation;

  return (
    <Card className={className}>
      <CardContent className="space-y-3 pt-6">
        <div className="flex items-start justify-between gap-2">
          {header}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" disabled={ai.kind === 'loading'}>
                {ai.kind === 'loading' ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {LEVEL_LABELS[ai.level]}
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" />
                    Explain differently
                  </>
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => explainAt('simpler')}>
                Simpler English
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => explainAt('with_analogy')}>
                With an analogy
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => explainAt('step_by_step')}>
                Step-by-step
              </DropdownMenuItem>
              {PIDGIN_VISIBLE && (
                <DropdownMenuItem onClick={() => explainAt('pidgin')}>In Pidgin</DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {showAi && (
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="gap-1">
              <Sparkles className="h-3 w-3" />
              {LEVEL_LABELS[ai.level]}
            </Badge>
            <button
              type="button"
              onClick={() => setAi({ kind: 'idle' })}
              className="text-muted-foreground hover:text-foreground text-xs underline"
            >
              Show original
            </button>
          </div>
        )}

        <p className="text-reading-base text-muted-foreground whitespace-pre-wrap font-serif">
          {explanationText}
        </p>

        {showAi && ai.aiUsageLogId && (
          <div className="flex items-center gap-2 border-t pt-3 text-xs">
            <span className="text-muted-foreground">Was this helpful?</span>
            <Button
              variant={feedback === 'thumbs_up' ? 'default' : 'ghost'}
              size="sm"
              aria-label="Thumbs up"
              onClick={() => submitFeedback('thumbs_up')}
              disabled={feedbackBusy}
            >
              <ThumbsUp className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant={feedback === 'thumbs_down' ? 'destructive' : 'ghost'}
              size="sm"
              aria-label="Thumbs down"
              onClick={() => submitFeedback('thumbs_down')}
              disabled={feedbackBusy}
            >
              <ThumbsDown className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
