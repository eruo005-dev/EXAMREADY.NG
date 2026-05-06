import { Badge, Card, CardContent } from '@examready/ui';
import type { Metadata } from 'next';
import Link from 'next/link';

import { getAllBlogPosts } from '@/lib/blog';

export const metadata: Metadata = {
  title: 'ExamReady Blog — JAMB, WAEC, NECO, Post-UTME guides',
  description:
    'Practical guides on JAMB UTME 2026, WAEC SSCE timetable, NECO June 2026, Post-UTME, and study strategies that actually work for Nigerian students.',
};

export default function BlogIndexPage() {
  const posts = getAllBlogPosts();
  const featured = posts.find((p) => p.featured) ?? posts[0];
  const recent = posts.filter((p) => p.slug !== featured?.slug);

  return (
    <div className="container py-12 md:py-16">
      <div className="mx-auto max-w-4xl">
        <div className="mb-10">
          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">ExamReady Blog</h1>
          <p className="text-muted-foreground mt-3 text-lg">
            Practical, no-fluff guides on Nigerian exams — written for students who don&apos;t have
            time for filler.
          </p>
        </div>

        {featured && (
          <Link href={`/blog/${featured.slug}`} className="block">
            <Card className="border-primary/20 bg-primary/5 hover:bg-primary/10 mb-12 transition-colors">
              <CardContent className="space-y-3 pt-6">
                <div className="flex items-center gap-2">
                  <Badge>FEATURED</Badge>
                  <Badge variant="outline" className="uppercase">
                    {featured.exam}
                  </Badge>
                  <span className="text-muted-foreground text-xs">
                    {featured.readTimeMinutes} min read
                  </span>
                </div>
                <h2 className="text-2xl font-semibold">{featured.title}</h2>
                <p className="text-muted-foreground">{featured.excerpt}</p>
                <p className="text-muted-foreground text-xs">
                  {new Date(featured.publishedAt).toLocaleDateString('en-NG', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                  })}{' '}
                  · {featured.author}
                </p>
              </CardContent>
            </Card>
          </Link>
        )}

        <h3 className="mb-4 text-xl font-semibold">Recent posts</h3>
        <div className="space-y-4">
          {recent.map((p) => (
            <Link key={p.slug} href={`/blog/${p.slug}`} className="block">
              <Card className="hover:border-primary/40 transition-colors">
                <CardContent className="space-y-2 pt-6">
                  <div className="text-muted-foreground flex items-center gap-2 text-xs">
                    <Badge variant="outline" className="uppercase">
                      {p.exam}
                    </Badge>
                    <span>·</span>
                    <span>{p.readTimeMinutes} min read</span>
                    <span>·</span>
                    <span>
                      {new Date(p.publishedAt).toLocaleDateString('en-NG', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })}
                    </span>
                  </div>
                  <h4 className="text-lg font-semibold">{p.title}</h4>
                  <p className="text-muted-foreground text-sm">{p.excerpt}</p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
