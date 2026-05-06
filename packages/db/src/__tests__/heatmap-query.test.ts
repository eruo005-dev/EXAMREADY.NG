/**
 * Locks in: the dashboard weak-topics heatmap query uses index scans,
 * not seq scans, on attempts and attempt_answers.
 *
 * Setup: 1 fake user, 50 attempts with 30 questions each = 1500
 * attempt_answers across 5 topics, all submitted within the last 30
 * days. Then run the same query the /api/me/dashboard route uses and
 * EXPLAIN ANALYZE the plan.
 *
 * The test fails if the planner falls back to "Seq Scan on attempts"
 * or "Seq Scan on attempt_answers" — that's the regression we're
 * defending against (someone drops or renames the partial indexes).
 *
 * Verified in CHECKPOINT 2 follow-up #4.
 */
import { afterAll, beforeAll, describe, expect, test } from 'vitest';

import { setupTestDb, skipIfNoDb, type TestDb } from './helpers';

const itOrSkip = skipIfNoDb() ? test.skip : test;

type ExplainRow = { 'QUERY PLAN': string };

describe('weak-topics heatmap query plan', () => {
  let ctx: TestDb;
  let userId: string;

  beforeAll(async () => {
    if (skipIfNoDb()) return;
    ctx = await setupTestDb();

    // Seed reference data: 1 exam, 1 subject, 5 topics.
    const examId = (await ctx.sql<{ id: string }[]>`
      INSERT INTO exams (name, slug) VALUES (${'Test Exam'}, ${'test-exam'}) RETURNING id
    `)[0]!.id;

    const subjectId = (await ctx.sql<{ id: string }[]>`
      INSERT INTO subjects (exam_id, name, slug)
      VALUES (${examId}, ${'Test Subject'}, ${'test-subject'}) RETURNING id
    `)[0]!.id;

    const topicIds: string[] = [];
    for (let i = 0; i < 5; i += 1) {
      const id = (await ctx.sql<{ id: string }[]>`
        INSERT INTO topics (subject_id, name, slug)
        VALUES (${subjectId}, ${`Topic ${i}`}, ${`topic-${i}`}) RETURNING id
      `)[0]!.id;
      topicIds.push(id);
    }

    // Seed 30 questions per topic = 150 questions total.
    const questionIdsByTopic: Record<string, string[]> = {};
    for (const topicId of topicIds) {
      questionIdsByTopic[topicId] = [];
      for (let q = 0; q < 30; q += 1) {
        const id = (await ctx.sql<{ id: string }[]>`
          INSERT INTO questions (
            exam_id, subject_id, topic_id, question_type, stem,
            difficulty, explanation
          ) VALUES (
            ${examId}, ${subjectId}, ${topicId}, ${'mcq_single'},
            ${`Stem ${topicId} ${q}`}, ${3}, ${'Explanation'}
          ) RETURNING id
        `)[0]!.id;
        questionIdsByTopic[topicId]!.push(id);
      }
    }

    // Create the test user via auth.users (trigger creates public.users).
    userId = (await ctx.sql<{ id: string }[]>`
      INSERT INTO auth.users (phone, email)
      VALUES (${'+2348099999999'}, ${'heatmap-test@example.com'})
      RETURNING id
    `)[0]!.id;

    // Seed 50 attempts (10 per topic) all submitted in the last 30 days.
    // Each attempt has 30 attempt_answers — 1500 rows total.
    for (let attemptIdx = 0; attemptIdx < 50; attemptIdx += 1) {
      const topicIdx = attemptIdx % 5;
      const topicId = topicIds[topicIdx]!;
      const submittedAt = new Date(Date.now() - attemptIdx * 60 * 60 * 1000); // 1h apart

      const attemptId = (await ctx.sql<{ id: string }[]>`
        INSERT INTO attempts (
          user_id, mode, exam_id, subject_id, topic_id,
          total_questions, started_at, submitted_at,
          correct_count, accuracy_percent
        ) VALUES (
          ${userId}, ${'topic_drill'}, ${examId}, ${subjectId}, ${topicId},
          ${30}, ${submittedAt.toISOString()}, ${submittedAt.toISOString()},
          ${15}, ${50.0}
        ) RETURNING id
      `)[0]!.id;

      // 30 answers per attempt with a topic-specific correctness rate.
      // Topic 0 = 30% correct, Topic 4 = 90% — gives clear "weak" topics.
      const correctRate = 0.3 + topicIdx * 0.15;
      const questionIds = questionIdsByTopic[topicId]!;
      const insertParts = questionIds.map((qid, q) => ({
        attempt_id: attemptId,
        question_id: qid,
        is_correct: q / 30 < correctRate,
        time_spent_seconds: 30,
      }));
      await ctx.sql`
        INSERT INTO attempt_answers ${ctx.sql(
          insertParts,
          'attempt_id',
          'question_id',
          'is_correct',
          'time_spent_seconds',
        )}
      `;
    }

    // ANALYZE so the planner has accurate statistics.
    await ctx.sql`ANALYZE`;
  }, 120_000);

  afterAll(async () => {
    if (ctx) await ctx.close();
  });

  itOrSkip('uses index scans on attempts and attempt_answers, not seq scans', async () => {
    const plan = await ctx.sql<ExplainRow[]>`
      EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
      SELECT
        q.topic_id,
        t.name AS topic_name,
        count(*)::int AS total,
        sum(case when aa.is_correct then 1 else 0 end)::int AS correct
      FROM attempt_answers aa
      JOIN attempts a   ON a.id = aa.attempt_id
      JOIN questions q  ON q.id = aa.question_id
      JOIN topics t     ON t.id = q.topic_id
      WHERE a.user_id = ${userId}
        AND a.submitted_at IS NOT NULL
        AND a.submitted_at >= now() - interval '30 days'
      GROUP BY q.topic_id, t.name
      ORDER BY (sum(case when aa.is_correct then 1 else 0 end)::float / count(*)) ASC
      LIMIT 20
    `;

    const planText = plan.map((r) => r['QUERY PLAN']).join('\n');

    // Hot tables MUST be index-scanned.
    expect(planText).not.toMatch(/Seq Scan on attempts\b/i);
    expect(planText).not.toMatch(/Seq Scan on attempt_answers\b/i);

    // Sanity: aggregate is reachable.
    expect(planText).toMatch(/HashAggregate|GroupAggregate/i);
  });

  itOrSkip('returns expected per-topic accuracy', async () => {
    const result = await ctx.sql<
      { topic_id: string; topic_name: string; total: number; correct: number }[]
    >`
      SELECT
        q.topic_id,
        t.name AS topic_name,
        count(*)::int AS total,
        sum(case when aa.is_correct then 1 else 0 end)::int AS correct
      FROM attempt_answers aa
      JOIN attempts a   ON a.id = aa.attempt_id
      JOIN questions q  ON q.id = aa.question_id
      JOIN topics t     ON t.id = q.topic_id
      WHERE a.user_id = ${userId}
        AND a.submitted_at IS NOT NULL
        AND a.submitted_at >= now() - interval '30 days'
      GROUP BY q.topic_id, t.name
      ORDER BY t.name
    `;

    expect(result).toHaveLength(5);
    // Topic 0 has 30% correct rate, Topic 4 has 90% — confirm spread.
    expect(result[0]!.correct / result[0]!.total).toBeLessThan(0.4);
    expect(result[4]!.correct / result[4]!.total).toBeGreaterThan(0.85);
  });
});
