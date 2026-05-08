/**
 * /lessons/[examSlug]/[subjectSlug]/[topicSlug] — public topic lesson.
 *
 * Sprint 7 Phase 6 ships the route + render. Lesson generation lands
 * once the syllabus pipeline (Phase 3) populates `topics` with real
 * data — until then this route returns 404 for all paths because
 * `topic_lessons` will be empty.
 *
 * SEO: indexable. Title includes exam + subject + topic for
 * keyword-targeted long-tail traffic. Schema.org Article + LearningResource
 * structured data emitted at the bottom of the JSX tree.
 */
import { exams, subjects, topicLessons, topics } from '@examready/db/schema';
import { and, eq } from 'drizzle-orm';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { db } from '@/lib/db';

type Params = { examSlug: string; subjectSlug: string; topicSlug: string };

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const lesson = await loadLesson(params);
  if (!lesson) return { title: 'Topic lesson — ExamReady' };
  return {
    title: `${lesson.title} | ExamReady`,
    description:
      lesson.contentMarkdown
        .slice(0, 200)
        .replace(/\s+/g, ' ')
        .replace(/[*#_>`]/g, '') + '…',
  };
}

async function loadLesson(p: Params) {
  const exam = await db.query.exams.findFirst({ where: eq(exams.slug, p.examSlug) });
  if (!exam) return null;
  const subject = await db.query.subjects.findFirst({
    where: and(eq(subjects.examId, exam.id), eq(subjects.slug, p.subjectSlug)),
  });
  if (!subject) return null;
  const topic = await db.query.topics.findFirst({
    where: and(eq(topics.subjectId, subject.id), eq(topics.slug, p.topicSlug)),
  });
  if (!topic) return null;
  const lesson = await db.query.topicLessons.findFirst({
    where: and(eq(topicLessons.topicId, topic.id), eq(topicLessons.status, 'published')),
  });
  if (!lesson) return null;
  return { ...lesson, exam, subject, topic };
}

export default async function LessonPage({ params }: { params: Params }) {
  const data = await loadLesson(params);
  if (!data) notFound();

  // Phase 6 ships the page render path; the actual markdown → HTML
  // transformation already exists in lib/blog.ts (Sprint 6). The
  // generator pipeline writes both contentMarkdown and contentHtml,
  // so we render the cached HTML when available, falling back to
  // a minimal pre-formatted block when not.
  const html = data.contentHtml;

  return (
    <article className="mx-auto max-w-3xl px-4 py-12">
      <nav className="text-muted-foreground mb-4 flex flex-wrap items-center gap-2 text-xs">
        <Link href="/lessons" className="hover:underline">
          Lessons
        </Link>{' '}
        ›{' '}
        <Link href={`/lessons/${data.exam.slug}`} className="hover:underline">
          {data.exam.name}
        </Link>{' '}
        ›{' '}
        <Link href={`/lessons/${data.exam.slug}/${data.subject.slug}`} className="hover:underline">
          {data.subject.name}
        </Link>
      </nav>
      <h1 className="mb-2 text-3xl font-bold">{data.title}</h1>
      <p className="text-muted-foreground mb-6 text-sm">
        {data.readingTimeMinutes} min read · {data.workedExamplesCount} worked examples
      </p>

      {html ? (
        <div
          className="prose prose-slate dark:prose-invert max-w-none"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      ) : (
        <pre className="whitespace-pre-wrap text-sm leading-7">{data.contentMarkdown}</pre>
      )}

      <div className="bg-muted mt-12 rounded-md border p-4 text-sm">
        Ready to test what you just read?{' '}
        <Link
          href={`/practice/${data.exam.id}?topic=${data.topic.id}`}
          className="text-blue-600 underline"
        >
          Practice this topic →
        </Link>
      </div>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@graph': [
              {
                '@type': 'Article',
                headline: data.title,
                articleBody: data.contentMarkdown.slice(0, 5000),
                wordCount: data.contentMarkdown.split(/\s+/).length,
              },
              {
                '@type': 'LearningResource',
                name: data.title,
                educationalLevel: 'Secondary',
                educationalUse: 'Exam preparation',
                inLanguage: 'en-NG',
                about: data.subject.name,
              },
            ],
          }),
        }}
      />
    </article>
  );
}
