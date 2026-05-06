import { Badge, Card, CardContent } from '@examready/ui';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { getAllBlogPosts, getBlogPostBySlug, getRelatedBlogPosts } from '@/lib/blog';

type Params = { slug: string };

export function generateStaticParams(): Array<Params> {
  return getAllBlogPosts().map((p) => ({ slug: p.slug }));
}

export function generateMetadata({ params }: { params: Params }): Metadata {
  const post = getBlogPostBySlug(params.slug);
  if (!post) return { title: 'Post not found' };
  return {
    title: `${post.title} | ExamReady Blog`,
    description: post.excerpt,
    authors: [{ name: post.author }],
    openGraph: {
      type: 'article',
      title: post.title,
      description: post.excerpt,
      publishedTime: post.publishedAt,
      authors: [post.author],
      tags: post.tags,
    },
    other: {
      'article:published_time': post.publishedAt,
    },
  };
}

export default function BlogPostPage({ params }: { params: Params }) {
  const post = getBlogPostBySlug(params.slug);
  if (!post) notFound();
  const related = getRelatedBlogPosts(params.slug, 3);

  // JSON-LD Article schema for rich results.
  const articleLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: post.title,
    datePublished: post.publishedAt,
    author: { '@type': 'Person', name: post.author },
    publisher: { '@type': 'Organization', name: 'ExamReady', url: 'https://examready.ng' },
    description: post.excerpt,
    keywords: post.tags.join(', '),
  };

  return (
    <>
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: JSON.stringify(articleLd) }}
      />
      <article className="container py-12 md:py-16">
        <div className="mx-auto max-w-3xl">
          <header className="mb-10">
            <div className="text-muted-foreground mb-4 flex flex-wrap items-center gap-2 text-xs">
              <Link href="/blog" className="hover:text-primary underline">
                ← All posts
              </Link>
              <span>·</span>
              <Badge variant="outline" className="uppercase">
                {post.exam}
              </Badge>
              <span>·</span>
              <span>{post.readTimeMinutes} min read</span>
              <span>·</span>
              <span>
                {new Date(post.publishedAt).toLocaleDateString('en-NG', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                })}
              </span>
            </div>
            <h1 className="text-3xl font-bold tracking-tight sm:text-4xl md:text-5xl">
              {post.title}
            </h1>
            <p className="text-muted-foreground mt-3 text-lg">{post.excerpt}</p>
            <p className="text-muted-foreground mt-4 text-xs">By {post.author}</p>
          </header>

          <div
            className="prose prose-neutral dark:prose-invert prose-headings:tracking-tight prose-a:text-primary prose-a:no-underline hover:prose-a:underline max-w-none"
            // eslint-disable-next-line react/no-danger
            dangerouslySetInnerHTML={{ __html: post.bodyHtml }}
          />

          {post.tags.length > 0 && (
            <div className="mt-10 flex flex-wrap gap-2 border-t pt-6">
              {post.tags.map((t) => (
                <Badge key={t} variant="outline">
                  {t}
                </Badge>
              ))}
            </div>
          )}

          {related.length > 0 && (
            <section className="mt-12 border-t pt-8">
              <h3 className="mb-4 text-xl font-semibold">Related posts</h3>
              <div className="grid gap-4 md:grid-cols-3">
                {related.map((p) => (
                  <Link key={p.slug} href={`/blog/${p.slug}`} className="block">
                    <Card className="hover:border-primary/40 h-full transition-colors">
                      <CardContent className="space-y-2 pt-4">
                        <Badge variant="outline" className="text-[10px] uppercase">
                          {p.exam}
                        </Badge>
                        <p className="font-semibold leading-tight">{p.title}</p>
                        <p className="text-muted-foreground line-clamp-3 text-xs">{p.excerpt}</p>
                      </CardContent>
                    </Card>
                  </Link>
                ))}
              </div>
            </section>
          )}
        </div>
      </article>
    </>
  );
}
