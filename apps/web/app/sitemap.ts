import type { MetadataRoute } from 'next';

import { getAllBlogPosts } from '@/lib/blog';

export default function sitemap(): MetadataRoute.Sitemap {
  const base = 'https://examready.ng';
  const lastModified = new Date();

  const staticPages: MetadataRoute.Sitemap = [
    { url: `${base}/`, lastModified, priority: 1 },
    { url: `${base}/pricing`, lastModified, priority: 0.8 },
    { url: `${base}/blog`, lastModified, priority: 0.8 },
    { url: `${base}/about`, lastModified, priority: 0.5 },
    { url: `${base}/contact`, lastModified, priority: 0.5 },
    { url: `${base}/faq`, lastModified, priority: 0.5 },
    { url: `${base}/coming-soon`, lastModified, priority: 0.5 },
    { url: `${base}/tools`, lastModified, priority: 0.5 },
    { url: `${base}/tools/cgpa-calculator`, lastModified, priority: 0.5 },
    { url: `${base}/tools/cutoff-marks`, lastModified, priority: 0.5 },
    { url: `${base}/tools/subject-combinations`, lastModified, priority: 0.5 },
    { url: `${base}/privacy`, lastModified, priority: 0.3 },
    { url: `${base}/terms`, lastModified, priority: 0.3 },
    { url: `${base}/cookies`, lastModified, priority: 0.3 },
  ];

  // Sprint 6: blog posts. Each gets its own sitemap entry with priority
  // 0.7 (high — these are SEO-targeted long-form content) and the
  // post's publishedAt as lastModified for proper crawl signaling.
  const blogPages: MetadataRoute.Sitemap = getAllBlogPosts().map((post) => ({
    url: `${base}/blog/${post.slug}`,
    lastModified: new Date(post.publishedAt),
    priority: post.featured ? 0.8 : 0.7,
  }));

  return [...staticPages, ...blogPages];
}
