import { asc, eq } from 'drizzle-orm';

import { topics, type Topic } from '@examready/db/schema';

import { defineRoute, NotFoundError, ok } from '@/lib/api/handler';
import { db } from '@/lib/db';

export const revalidate = 3600;

type TopicTree = {
  id: string;
  name: string;
  slug: string;
  frequencyScore: number;
  children: TopicTree[];
};

function buildTree(rows: Topic[]): TopicTree[] {
  const byId = new Map<string, TopicTree>();
  rows.forEach((r) => {
    byId.set(r.id, {
      id: r.id,
      name: r.name,
      slug: r.slug,
      frequencyScore: r.frequencyScore,
      children: [],
    });
  });
  const roots: TopicTree[] = [];
  rows.forEach((r) => {
    const node = byId.get(r.id)!;
    if (r.parentTopicId) {
      const parent = byId.get(r.parentTopicId);
      if (parent) parent.children.push(node);
      else roots.push(node);
    } else {
      roots.push(node);
    }
  });
  return roots;
}

export const GET = defineRoute<{ subjectId: string }>({ auth: 'public' })(async ({ req, params }) => {
  if (!/^[0-9a-f-]{36}$/i.test(params.subjectId)) {
    throw new NotFoundError('Subject not found');
  }

  const includeChildren = new URL(req.url).searchParams.get('includeChildren') !== 'false';

  const rows = await db
    .select()
    .from(topics)
    .where(eq(topics.subjectId, params.subjectId))
    .orderBy(asc(topics.sortOrder));

  const result = includeChildren ? buildTree(rows) : rows.map((r) => ({
    id: r.id,
    name: r.name,
    slug: r.slug,
    frequencyScore: r.frequencyScore,
    children: [],
  }));

  return ok(
    { topics: result },
    { headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400' } },
  );
});
