/**
 * Blog content loader (Sprint 6).
 *
 * Reads markdown files from apps/web/content/blog/*.md, parses
 * gray-matter frontmatter, and renders the body to HTML via marked.
 *
 * Runs at build time (Server Components) so the marketing pages get
 * fully-static HTML — no client-side fetch, fully cacheable, indexable
 * by Googlebot from the first byte.
 *
 * Frontmatter shape (validated below — invalid files throw at build):
 *   title: string
 *   slug: string
 *   publishedAt: ISO date string
 *   excerpt: string (1-2 sentence preview)
 *   exam: 'jamb' | 'waec' | 'neco' | 'post-utme'
 *   readTimeMinutes: number
 *   author: string
 *   tags: string[]
 *   featured?: boolean
 */
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import matter from 'gray-matter';
import { marked } from 'marked';

export type BlogPost = {
  slug: string;
  title: string;
  publishedAt: string;
  excerpt: string;
  exam: 'jamb' | 'waec' | 'neco' | 'post-utme';
  readTimeMinutes: number;
  author: string;
  tags: string[];
  featured: boolean;
  bodyHtml: string;
};

const CONTENT_DIR = resolve(process.cwd(), 'content', 'blog');

let cachedPosts: BlogPost[] | null = null;

function loadAllPosts(): BlogPost[] {
  if (cachedPosts) return cachedPosts;

  const files = readdirSync(CONTENT_DIR).filter((f) => f.endsWith('.md'));
  const posts: BlogPost[] = files.map((filename) => {
    const raw = readFileSync(resolve(CONTENT_DIR, filename), 'utf8');
    const parsed = matter(raw);
    const fm = parsed.data as Partial<Omit<BlogPost, 'bodyHtml'>>;

    if (!fm.title || !fm.slug || !fm.publishedAt || !fm.exam || !fm.author) {
      throw new Error(`Blog post ${filename} missing required frontmatter`);
    }

    const bodyHtml = marked.parse(parsed.content, { async: false }) as string;

    return {
      slug: fm.slug,
      title: fm.title,
      publishedAt: fm.publishedAt,
      excerpt: fm.excerpt ?? '',
      exam: fm.exam as BlogPost['exam'],
      readTimeMinutes: fm.readTimeMinutes ?? 5,
      author: fm.author,
      tags: fm.tags ?? [],
      featured: fm.featured ?? false,
      bodyHtml,
    };
  });

  posts.sort((a, b) => (a.publishedAt < b.publishedAt ? 1 : -1));
  cachedPosts = posts;
  return posts;
}

export function getAllBlogPosts(): BlogPost[] {
  return loadAllPosts();
}

export function getBlogPostBySlug(slug: string): BlogPost | undefined {
  return loadAllPosts().find((p) => p.slug === slug);
}

export function getRelatedBlogPosts(slug: string, limit = 3): BlogPost[] {
  const all = loadAllPosts();
  const current = all.find((p) => p.slug === slug);
  if (!current) return [];
  // Same exam first, then same tag overlap, then anything-else.
  return all
    .filter((p) => p.slug !== slug)
    .map((p) => {
      const sameExam = p.exam === current.exam ? 2 : 0;
      const tagOverlap = p.tags.filter((t) => current.tags.includes(t)).length;
      return { post: p, score: sameExam + tagOverlap };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ post }) => post);
}
